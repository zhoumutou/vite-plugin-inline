/**
 * VitePluginInline — Inline CSS and JavaScript assets into emitted HTML.
 *
 * What this plugin does
 * - After Vite has produced an output bundle (HTML + CSS + JS), this plugin:
 *   - Finds <link rel="stylesheet" href="*.css"> tags and inlines those CSS files into <style>...</style>.
 *   - Finds the "main" <script src="*.js|*.mjs"></script> tag that belongs to this bundle (prefers type="module")
 *     and replaces it with an inline <script type="module">...</script>.
 *   - Removes the now inlined .css and .js files from the final bundle so the build
 *     outputs a single self-contained HTML page (no external CSS/JS files).
 *
 * How JS inlining is implemented
 * - If the chosen entry chunk still has static imports, we will rebundle in-memory to eliminate them
 *   even when inlineDynamicImports=false. This avoids leaving `import ... from` in the inline <script>.
 * - When inlineDynamicImports=true, dynamic imports are also flattened into a single chunk for inlining.
 * - If the in-memory rebundle fails for any reason, we fallback to the original emitted chunk code to keep the build going.
 *
 * Important notes and limitations
 * - Basename matching: Assets are matched by file basename (e.g., "index-abc123.js").
 *   If your build produces two files with the same basename in different folders,
 *   the last one processed wins. Consider disambiguating names if necessary.
 * - Comment removal:
 *   - CSS: We remove block comments (/* ... *\/) when removeComments=true.
 *   - JS: We do not post-process comments on the emitted code directly. When rebundling, we minify and
 *     also attempt to drop legal comments via output.legalComments (if supported by the bundler). If the
 *     bundler ignores this option, JS comments may be retained.
 * - XML/XHTML: If you must embed JS in XHTML/XML, set cdataJs=true to wrap the inline
 *   script in /*<![CDATA[*\/ ... /*]]>*\/ markers. Note: In HTML parsing, CDATA is inert;
 *   always escape </script> in inline JS (we do).
 * - Regex-based HTML replacement:
 *   - We prefer the <script type="module" src="*.js"></script> that belongs to the bundle.
 *   - We target all <link rel="stylesheet" href="*.css"> occurrences.
 *   - We also remove <link rel="modulepreload" href="*.js"> entries that point to chunks that were inlined.
 *     Links pointing to still-external dynamic chunks are kept.
 * - Other static assets (images/fonts/json/etc.) are NOT inlined and will remain as separate files.
 *
 * Performance
 * - Inlining and (optional) rebundling/minification happen once per HTML in the generateBundle phase.
 *
 * Security / CSP
 * - We preserve nonce attribute from original tags to work with strict CSP (script/style also keep id; style keeps media).
 * - Inline content escapes </script> and </style> sequences to avoid early tag termination (and escapes <!-- in scripts).
 */

import type { RolldownPlugin } from 'rolldown'
import type { Plugin } from 'vite'
import { Buffer } from 'node:buffer'
import { basename } from 'node:path'
import { build } from 'rolldown'

/**
 * Matches <script ... src="*.js|*.mjs"></script> (global), excluding "nomodule".
 * Capture group 1 is the URL. We do not require type="module" here, but we will
 * prefer tags that explicitly have type="module" when multiple matches exist.
 */
const jsScriptRe = /<script\b(?![^>]+\bnomodule\b)[^>]+\bsrc=(?:"|')([^"'?#>]+\.m?js(?:[?#][^"'>]*)?)(?:"|')[^>]*>\s*<\/script>/gi

/**
 * Matches <link rel="stylesheet" href="*.css"> (global).
 * Capture group 1 is the URL.
 */
const cssLinkRe = /<link\b(?=[^>]+\brel=(?:"|')stylesheet(?:"|'))[^>]+\bhref=(?:"|')([^"'?#>]+\.css(?:[?#][^"'>]*)?)(?:"|')[^>]*>/gi

/**
 * Matches <link rel="modulepreload" href="*.js"> (global).
 * Used to strip preloads that point to chunks we inline.
 * Capture group 1 is the URL.
 */
const modulePreloadRe = /<link\b(?=[^>]+\brel=(?:"|')modulepreload(?:"|'))[^>]+\bhref=(?:"|')([^"'?#>]+\.m?js(?:[?#][^"'>]*)?)(?:"|')[^>]*>/gi

/**
 * Matches CSS block comments: \/* ... *\/
 */
const cssCommentRe = /\/\*[\s\S]*?\*\//g

interface ChunkData {
  origin: string
  source: string
}

interface OutputAsset {
  source: string | Uint8Array
}

interface OutputChunk {
  code: string
}

interface OutputBundle {
  [key: string]: {
    type: string
    fileName: string
    imports?: string[]
    dynamicImports?: string[]
  }
}

const PLUGIN_NAME = 'vite-plugin-inline'

/**
 * Extract basename from a URL (strip ?query and #hash first)
 */
function urlBaseName(url: string): string {
  const clean = url.split(/[?#]/)[0]
  return basename(clean)
}

/**
 * Extract a single attribute value from an HTML tag string.
 */
function getAttr(html: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  const m = html.match(re)
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : undefined
}

/**
 * Build an attribute string like: ' nonce="..." id="..." media="..."'
 * Only includes attributes present on the original tag.
 */
function buildAttrString(html: string, allow: string[]): string {
  const parts: string[] = []
  for (const name of allow) {
    const val = getAttr(html, name)
    if (val != null) {
      // Basic escaping of quotes inside attribute values
      const safe = String(val).replace(/"/g, '&quot;')
      parts.push(` ${name}="${safe}"`)
    }
  }
  return parts.join('')
}

/**
 * Escape HTML-sensitive sequences inside inline script/style content.
 */
function escapeForInlineScript(code: string): string {
  return code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')
}
function escapeForInlineStyle(code: string): string {
  return code.replace(/<\/style/gi, '<\\/style')
}

/**
 * Create a rolldown virtual plugin.
 * - Serves JS module contents from a provided Map<string, string> (key=basename).
 * - Provides empty stubs for ".css" side-effect imports to avoid build errors.
 */
function createVirtualPlugin(entryName: string, map: Map<string, string>) {
  const entry = `\0inline:entry:${entryName}`
  const prefix = '\0inline:'
  const EMPTY_CSS_ID = '\0inline:empty-css'

  const plugin: RolldownPlugin = {
    name: `${PLUGIN_NAME}:virtual`,
    resolveId(importee: string) {
      if (importee === entry)
        return entry
      if (importee?.startsWith(prefix))
        return importee

      const clean = importee.split(/[?#]/)[0]
      if (/\.css$/i.test(clean)) {
        return EMPTY_CSS_ID
      }

      const bn = basename(importee)
      return map.has(bn) ? `${prefix}${bn}` : null
    },
    load(id: string) {
      if (id === entry) {
        return `import "${prefix}${entryName}";`
      }
      if (id === EMPTY_CSS_ID) {
        // Side-effect CSS import stub
        return ''
      }
      if (id?.startsWith(prefix)) {
        const bn = id.slice(prefix.length)
        return map.get(bn) ?? null
      }
      return null
    },
  }

  return { entry, plugin }
}

/**
 * Build inline JS source for given basename.
 * - When rebundle=false: reuse existing chunk code (no re-bundle).
 * - When rebundle=true: re-bundle with rolldown to eliminate static imports; whether to also inline dynamic
 *   imports is controlled by inlineDynamicImports.
 * - The removeComments flag only toggles CSS comment stripping directly; for JS we attempt to drop legal
 *   comments during rebundle via output.legalComments if supported by the bundler.
 */
async function buildInlineJsSource(
  name: string,
  map: Map<string, string>,
  rebundle: boolean,
  inlineDynamicImports: boolean,
  removeComments: boolean,
): Promise<string> {
  if (!rebundle) {
    // Directly reuse code emitted by Vite for the entry chunk
    return (map.get(name) ?? '').trim()
  }

  try {
    const { entry, plugin } = createVirtualPlugin(name, map)
    const { output } = await build({
      input: entry,
      plugins: [plugin],
      treeshake: true,
      write: false,
      output: {
        format: 'es',
        sourcemap: false,
        minify: true,
        inlineDynamicImports,
        // Note: Some bundler versions may ignore legalComments; in that case comments may remain.
        legalComments: removeComments ? 'none' : undefined,
      },
    })

    const outChunk = output.find(o => o.type === 'chunk')
    return (outChunk?.code || '').trim()
  }
  catch (err) {
    // Fallback to original chunk to avoid build breakage
    console.warn(`[${PLUGIN_NAME}] Rebundle failed for ${name}, fallback to original chunk.`, err)
    return (map.get(name) ?? '').trim()
  }
}

/**
 * Produce a <style>...</style> replacement.
 * - Preserves nonce/id/media from original <link> when present.
 * - Escapes </style> sequence inside content.
 */
function getCssData(
  origin: string,
  source: string,
  removeComments: boolean,
): ChunkData {
  if (removeComments) {
    source = source.replace(cssCommentRe, '')
  }
  const attrs = buildAttrString(origin, ['nonce', 'id', 'media'])
  const body = escapeForInlineStyle(source.trim())
  return {
    origin,
    source: `<style${attrs}>${body}</style>`,
  }
}

/**
 * Normalize asset source (string | Uint8Array) to UTF-8 string.
 */
function toText(source: string | Uint8Array): string {
  return typeof source === 'string' ? source : Buffer.from(source).toString('utf8')
}

/**
 * Find a bundle key by exact match or basename match.
 * Helps mapping HTML-referenced assets (which usually use a relative URL) to bundle entries.
 */
function findBundleKey(bundle: OutputBundle, fileName: string): string | undefined {
  if (fileName in bundle)
    return fileName
  const bn = basename(fileName)
  return Object.keys(bundle).find(k => basename(k) === bn)
}

/**
 * Collect all (static) imported chunk keys starting from an entry chunk key.
 * Optionally include dynamic imports as well.
 */
function collectJsDeps(
  entryKey: string,
  bundle: OutputBundle,
  includeDynamic = false,
): Set<string> {
  const seen = new Set<string>()
  const q: string[] = []

  const start = bundle[entryKey]
  if (!start || start.type !== 'chunk')
    return seen
  q.push(entryKey)

  while (q.length) {
    const key = q.shift()!
    if (seen.has(key))
      continue
    seen.add(key)

    const cur = bundle[key]
    if (!cur || cur.type !== 'chunk')
      continue

    const nexts = [
      ...(cur.imports ?? []),
      ...(includeDynamic ? (cur.dynamicImports ?? []) : []),
    ]

    for (const n of nexts) {
      const depKey = findBundleKey(bundle, n)
      if (depKey && !seen.has(depKey))
        q.push(depKey)
    }
  }

  seen.delete(entryKey)
  return seen
}

export interface Options {
  /**
   * Remove block comments in inlined CSS.
   * For JS: we do not edit emitted code directly; when rebundling we minify and try to drop legal comments
   * using bundler options if available.
   * @default true
   */
  removeComments?: boolean
  /**
   * Wrap inlined JS code with <![CDATA[ ... ]]> for XML/XHTML compatibility.
   * @default false
   */
  cdataJs?: boolean
  /**
   * Inline dynamic imports into the main chunk when building the inline <script>.
   * If true, rolldown will flatten dynamic imports so no extra JS chunks are emitted.
   * @default false
   */
  inlineDynamicImports?: boolean
}

/**
 * Vite plugin that inlines CSS and JavaScript assets into HTML files.
 * Result: a single HTML file with no external CSS/JS dependencies (except dynamic imports if not flattened).
 * Note: We also strip <link rel="modulepreload"> entries that point to chunks that were inlined.
 */
export default function VitePluginInline(options: Options = {}): Plugin {
  const {
    removeComments = true,
    cdataJs = false,
    inlineDynamicImports = false,
  } = options

  return {
    name: PLUGIN_NAME,
    enforce: 'post',

    /**
     * Disable modulePreload generation in Vite since we may inline the referenced chunks anyway.
     */
    config() {
      return {
        build: {
          modulePreload: false,
        },
      }
    },

    /**
     * For each emitted HTML:
     * - inline <link rel="stylesheet"> into <style>.
     * - choose the main <script src="*.js|*.mjs"> (prefer type="module") that belongs to this bundle and inline it.
     * - rebundle in-memory when the entry still has static imports (and optionally flatten dynamic imports).
     * - remove inlined CSS/JS assets and related source maps from the bundle.
     * - remove <link rel="modulepreload"> entries pointing to inlined chunks.
     */
    async generateBundle(_, bundle) {
      const bundleKeys = Object.keys(bundle)

      const jsKeyRe = /\.(?:mjs|js)$/i
      const cssKeyRe = /\.css$/i

      const htmlKeys = bundleKeys.filter(key => key.endsWith('.html'))
      const cssKeys = bundleKeys.filter(key => cssKeyRe.test(key))
      const jsKeys = bundleKeys.filter(key => jsKeyRe.test(key))

      const inlinedKeys = new Set<string>()

      const cssMap = new Map<string, string>()
      const jsMap = new Map<string, string>()

      cssKeys.forEach((key) => {
        const name = basename(key)
        if (cssMap.has(name)) {
          this.warn?.(`[${PLUGIN_NAME}] Duplicate CSS basename detected: ${name} (${key})`)
        }
        cssMap.set(name, toText((bundle[key] as OutputAsset).source))
      })
      jsKeys.forEach((key) => {
        const name = basename(key)
        if (jsMap.has(name)) {
          this.warn?.(`[${PLUGIN_NAME}] Duplicate JS basename detected: ${name} (${key})`)
        }
        jsMap.set(name, (bundle[key] as OutputChunk).code)
      })

      // Cache built inline JS SOURCE (string) per (basename + flags)
      const jsBuildCache = new Map<string, Promise<string>>()

      for (const htmlKey of htmlKeys) {
        const htmlBundle = bundle[htmlKey] as OutputAsset
        let htmlSource = toText(htmlBundle.source)

        const chunkDatas: ChunkData[] = []

        // Inline CSS: only <link rel="stylesheet" href="*.css">
        Array.from(htmlSource.matchAll(cssLinkRe)).forEach((match) => {
          const cssHref = match[1]!
          const cssName = urlBaseName(cssHref)
          const cssKey = cssKeys.find(k => basename(k) === cssName)
          const cssCode = cssKey ? cssMap.get(cssName) : ''
          if (cssKey && cssCode != null) {
            const cssData = getCssData(match[0], cssCode, removeComments)
            chunkDatas.push(cssData)
            inlinedKeys.add(cssKey)
          }
        })

        // Find all candidate JS <script src="*.js"> that belong to this bundle
        const candidates: { match: RegExpMatchArray, jsName: string, jsKey: string | undefined, isModule: boolean }[] = []
        Array.from(htmlSource.matchAll(jsScriptRe)).forEach((m) => {
          const src = m[1]!
          const jsName = urlBaseName(src)
          const jsKey = jsKeys.find(k => basename(k) === jsName)
          if (jsMap.has(jsName) && jsKey) {
            const isModule = /type\s*=\s*(?:"|')module(?:"|')/i.test(m[0])
            candidates.push({ match: m, jsName, jsKey, isModule })
          }
        })

        // Names of chunks whose modulepreload should be removed (filled when entry is chosen)
        const removePreloadNames = new Set<string>()

        if (candidates.length) {
          // Prefer type="module"
          const chosen = candidates.find(c => c.isModule) ?? candidates[0]
          const { match: jsMatch, jsName, jsKey } = chosen

          const entryMeta = bundle[jsKey!] as { imports?: string[], dynamicImports?: string[], type: string }
          const hasStaticImports = Array.isArray(entryMeta?.imports) && entryMeta.imports.length > 0
          const needRebundle = hasStaticImports || inlineDynamicImports

          // Build or reuse inline JS source
          const cacheKey = `${jsName}|rb=${needRebundle}|di=${inlineDynamicImports}`
          let p = jsBuildCache.get(cacheKey)
          if (!p) {
            p = buildInlineJsSource(jsName, jsMap, needRebundle, inlineDynamicImports, removeComments)
            jsBuildCache.set(cacheKey, p)
          }
          const codeRaw = await p

          // Preserve nonce/id (CSP/identification)
          const attrs = buildAttrString(jsMatch[0], ['nonce', 'id'])
          const body = escapeForInlineScript(cdataJs ? `/*<![CDATA[*/${codeRaw}/*]]>*/` : codeRaw)

          const jsData: ChunkData = {
            origin: jsMatch[0],
            source: `<script type="module"${attrs}>${body}</script>`,
          }
          chunkDatas.push(jsData)

          // Mark entry and its deps as inlined; optionally include dynamic deps
          inlinedKeys.add(jsKey!)
          removePreloadNames.add(basename(jsKey!))

          const deps = collectJsDeps(jsKey!, bundle, inlineDynamicImports)
          deps.forEach((k) => {
            inlinedKeys.add(k)
            removePreloadNames.add(basename(k))
          })

          if (!inlineDynamicImports) {
            // Dynamic imports remain external; we warn but keep related preloads intact.
            const withDynamic = collectJsDeps(jsKey!, bundle, /* includeDynamic */ true)
            for (const k of withDynamic) {
              if (!deps.has(k)) {
                this.warn?.(
                  `[${PLUGIN_NAME}] Dynamic import detected from "${jsKey}" -> "${k}". `
                  + `Dynamic chunks are not inlined and will remain as separate files.`,
                )
              }
              else {
                removePreloadNames.add(basename(k))
              }
            }
          }
        }

        // Strip modulepreload links that point to chunks we just inlined
        if (removePreloadNames.size) {
          htmlSource = htmlSource.replace(modulePreloadRe, (full, href) => {
            const name = urlBaseName(href)
            return removePreloadNames.has(name) ? '' : full
          })
        }

        // Apply replacements (use function form to avoid $-replacement pitfalls)
        chunkDatas.forEach((chunkData) => {
          htmlSource = htmlSource.replace(chunkData.origin, () => chunkData.source)
        })

        htmlBundle.source = htmlSource
      }

      // Remove inlined JS (entry + static deps) and CSS assets (+ sourcemaps)
      inlinedKeys.forEach((key) => {
        delete bundle[key]
        const mapKey = `${key}.map`
        if (mapKey in bundle)
          delete bundle[mapKey]
      })
    },
  }
}
