/**
 * vite-plugin-inline
 * A Vite (Rollup) plugin that inlines CSS and JavaScript assets into HTML files,
 * generating a single, self-contained HTML file with no external dependencies.
 *
 * How it works (JS):
 * - Detect the main <script src="..."> in HTML.
 * - For the main entry chunk, collect its imported chunks (import { ... } from "x.js").
 * - Build a dependency graph among chunks and topologically sort them.
 * - For each imported chunk, transform it to a namespace IIFE:
 *     const __chunk_x = (() => { ...; return { exported, ... } })();
 *   Inside the chunk, replace "import { a as b } from 'y.js'" with:
 *     const { a: b } = __chunk_y;
 * - For the entry chunk, also replace imports with namespace destructuring.
 * - Finally, output: <script type="module"> prelude(IIFEs) + transformed entry </script>
 */

import type { MinifyOptions } from 'oxc-minify'
import type { OutputAsset, OutputBundle, OutputChunk } from 'rollup'
import type { Plugin } from 'vite'

/**
 * Matches the main script tag with src attribute in HTML (supports " or ')
 */
const jsMainRe = /<script[^>]*src=["']([^"']+\.js)["'][^>]*><\/script>/

/**
 * Matches import statements for JS chunks (named imports only, as emitted by bundlers)
 * Example matched form:
 *   import { a as aa, b } from "chunkA.js";
 * - Supports single/double quotes and optional trailing semicolon.
 */
const jsChunkRe = /import\s*\{[\s\S]+?\}\s*from\s*["']([^"']+\.js)["']\s*;?/g

/**
 * Matches bare side-effect imports:
 *   import "chunkA.js";
 */
const jsBareImportRe = /import\s*["']([^"']+\.js)["']\s*;?/g

/**
 * Matches link tags for CSS stylesheets (supports " or ')
 */
const cssRe = /<link[^>]*href=["']([^"']+\.css)["'][^>]*>/g

/**
 * Matches CSS and JS block comments: /* ... *\/
 * Note: we intentionally do not remove // line comments to avoid edge cases.
 */
const commentRe = /\/\*[\s\S]*?\*\//g

/**
 * Matches export statements like: export { a as b, c };
 */
const exportsRe = /export\s*\{([\s\S]+?)\}\s*;?/

/**
 * Matches named exports with aliases (export { foo as bar })
 */
const exportAsRe = /([\w$]+)\s+as\s+([\w$]+)/g

/**
 * Matches named imports with aliases inside braces (import { foo as bar } from 'x')
 * We reuse the same pattern as exportAsRe.
 */
const importAsRe = exportAsRe

/**
 * Matches the named import object (left-hand side), robust to spacing and quotes
 * Example: import { a as aa, b } from "x.js";
 */
const importRe = /import\s*(\{[\s\S]+?\})\s*from\s*["'][^"']+["']\s*;?/

/**
 * Matches multiple empty lines to compress output
 */
const emptyLineRe = /(\r?\n)[\t\f\v ]*(\r?\n)+/g

const PLUGIN_NAME = 'vite-plugin-inline'

function warn(code: string, msg: string, advice?: string) {
  console.warn(`[${PLUGIN_NAME}] ${msg}${advice ? `\n  Hint: ${advice}` : ''}\n  (code: ${code})`,
  )
}

/** Return the basename of a path like "assets/chunkA-xxxx.js" -> "chunkA-xxxx.js" */
function baseName(p: string) {
  const i = p.lastIndexOf('/')
  return i >= 0 ? p.slice(i + 1) : p
}

/**
 * Turn "chunkA.js" into a short and stable namespace variable.
 * Examples:
 *  - runtime-dom.esm-bundler-DE7exXUM.js -> _DE7exXUM
 *  - chunkA-ABC123.js -> _ABC123
 *  - simple.js -> __simple
 */
function toNsVar(jsName: string) {
  const base = baseName(jsName).replace(/\.js$/, '')
  // Prefer the last token (commonly the hash) after "_" or "-"
  const parts = base.replace(/[^\w$-]/g, '_').split(/[_-]/)
  const last = parts[parts.length - 1] || 'ns'
  if (/^[A-Z_$][\w$]*$/i.test(last) && last.length >= 6) {
    return `_${last}`
  }
  // Fallback: short, sanitized prefix
  const sanitized = base.replace(/[^\w$]/g, '_') || 'ns'
  return `__${sanitized.slice(0, 16)}`
}

/** Find the bundle key that ends with the given js file name (e.g. chunkA-xxxx.js) */
function getJsKeyByName(jsName: string, jsKeys: string[]) {
  return jsKeys.find(it => it.endsWith(jsName))
}

/** Collect direct deps (named-import chunks) from a chunk's source */
function collectDepsFromSource(source: string) {
  const named = Array.from(source.matchAll(jsChunkRe)).map(m => baseName(m[1]!))
  const bare = Array.from(source.matchAll(jsBareImportRe)).map(m => baseName(m[1]!))
  return Array.from(new Set([...named, ...bare]))
}

/**
 * Build a dependency graph starting from entry's deps.
 * graph: Map<jsName, Set<depJsName>>
 */
function buildGraph(entryDeps: string[], jsKeys: string[], bundle: OutputBundle) {
  const graph = new Map<string, Set<string>>()
  const seen = new Set<string>()

  function dfs(jsName: string) {
    if (seen.has(jsName))
      return
    seen.add(jsName)

    const key = getJsKeyByName(jsName, jsKeys)
    if (!key) {
      warn(
        'MISSING_JS_CHUNK',
        `JS chunk not found in bundle: ${jsName}`,
        'Check if file naming / hashing changed or the chunk was tree-shaken',
      )
      return
    }

    const chunk = bundle[key] as OutputChunk
    let code = chunk.code
    // Cheap whitespace collapse to stabilize regex scanning
    code = code.replace(emptyLineRe, '').trim()
    const deps = collectDepsFromSource(code)
    graph.set(jsName, new Set(deps))
    deps.forEach(dfs)
  }

  entryDeps.forEach(dfs)
  return graph
}

/**
 * Topologically sort the graph (DFS-based).
 * If a cycle is detected (temp set hit), we simply skip the revisited node
 * to avoid infinite recursion. This is sufficient for the common case where
 * main imports A and B, and B imports A (no real mutual cycle between A and B).
 */
function topoSort(graph: Map<string, Set<string>>) {
  const temp = new Set<string>()
  const perm = new Set<string>()
  const out: string[] = []

  function visit(n: string) {
    if (perm.has(n))
      return
    if (temp.has(n)) {
      // Simple handling for cycles: skip the back-edge.
      // If you need full ESM live-binding semantics, a more complex runtime is required.
      return
    }
    temp.add(n)
    const deps = graph.get(n)
    if (deps)
      deps.forEach(visit)
    temp.delete(n)
    perm.add(n)
    out.push(n)
  }

  Array.from(graph.keys()).forEach(visit)
  return out
}

/**
 * Replace "import { ... } from 'x.js'" with "const { ... } = __chunk_x;"
 */
function replaceImportsWithNs(source: string, nsMap: Map<string, string>) {
  source = source.replace(jsChunkRe, (origin, p1: string) => {
    const jsName = baseName(p1)
    const ns = nsMap.get(jsName)
    if (!ns)
      return origin // Fallback: keep original import if not found
    const lhs = import2Const(origin) // e.g. "{ a: aa, b }"
    return `const ${lhs}=${ns};`
  })

  source = source.replace(jsBareImportRe, () => ';')

  return source
}

/**
 * Build a namespace IIFE for a chunk, replacing its internal imports by namespace destructuring.
 * Returns the namespace name, the IIFE code snippet, and the bundle key used.
 */
function buildChunkNamespace(
  jsName: string,
  jsKeys: string[],
  bundle: OutputBundle,
  removeComments: boolean,
  nsMap: Map<string, string>,
) {
  const key = getJsKeyByName(jsName, jsKeys)
  if (!key) {
    throw new Error(`[${PLUGIN_NAME}] Cannot find chunk key for ${jsName} (code: CHUNK_KEY_ERROR)`)
  }
  const jsBundle = bundle[key] as OutputChunk

  let code = jsBundle.code.replace(emptyLineRe, '').trim()
  if (removeComments)
    code = code.replace(commentRe, '')

  // Replace internal imports with namespace destructuring
  code = replaceImportsWithNs(code, nsMap)

  // Wrap as IIFE returning the export object
  const ns = nsMap.get(jsName)!
  const iife = `const ${ns}=(()=>{${export2Return(code)}})();`
  return { ns, iife, key }
}

/**
 * Convert "export { a as b, c }" to "return { b: a, c }"
 * Assumes the chunk has a single consolidated export statement (typical for bundlers).
 */
function export2Return(jsCode: string) {
  return jsCode.replace(exportsRe, (_match, exports: string) => {
    // Flip "x as y" to "y: x"
    return `return{${exports.replace(exportAsRe, '$2:$1')}};`
  })
}

/**
 * Convert import expression to object destructuring LHS.
 * From: import { a as aa, b } from "x.js"
 * To:   "{ a: aa, b }"
 */
function import2Const(importExpr: string) {
  const match = importExpr.match(importRe)
  // In a well-formed bundler output, this should always match.
  // Fallback to "{}" on mismatch to avoid crash (no-op).
  if (!match)
    return '{}'
  // Replace "a as aa" -> "a: aa" inside the braces
  return match[1]!.replace(importAsRe, '$1:$2')
}

/**
 * Extract CSS content from the bundle and wrap it in a <style> tag.
 */
function getCssData(
  origin: string,
  cssName: string,
  cssKeys: string[],
  bundle: OutputBundle,
  removeComments: boolean,
) {
  const key = cssKeys.find(it => it.endsWith(cssName))
  if (!key) {
    warn(
      'MISSING_CSS_ASSET',
      `CSS asset not found: ${cssName}`,
      'If the CSS was inlined / removed by other plugins you can ignore this',
    )
    return { origin, source: origin, key: '' }
  }

  const cssBundle = bundle[key] as OutputAsset
  let source = String(cssBundle.source)

  if (removeComments) {
    source = source.replace(commentRe, '')
  }

  source = `<style>${source.trim()}</style>`

  return {
    origin, // Original <link> to replace
    source, // New inlined <style> tag
    key, // Asset key to delete
  }
}

/**
 * Try to minify the final inlined JS by oxc-minify (optional).
 * Note: This is a post-pass; it cannot replace bundler-level tree-shaking.
 */
async function minifyCode(
  code: string,
  options?: Record<string, any>,
): Promise<string> {
  try {
    // Dynamically import, so it's optional
    const { minify } = await import('oxc-minify')
    const res = minify('', code, options)
    return res.code
  }
  catch (e: any) {
    const msg = e?.message || String(e)
    const needInstall = /cannot find module/i.test(msg)
    warn(
      'OXC_MINIFY_UNAVAILABLE',
      `Skip JS minification (oxc-minify unavailable): ${msg}`,
      needInstall
        ? 'Install dev dependency: pnpm add -D oxc-minify (or npm/yarn). Then re-run build.'
        : 'You can disable the plugin minify option or investigate the above error.',
    )
    return code
  }
}

function escapeNewlinesLiteral(str: string) {
  return str.replace(/\r?\n/g, '\\n')
}

/**
 * Process the main JS entry and all its imported chunks, returning a single <script> tag.
 * It also returns the keys of all consumed assets for deletion from the bundle.
 */
async function getJsData(
  origin: string,
  jsName: string,
  jsKeys: string[],
  bundle: OutputBundle,
  removeComments: boolean,
  minify: boolean | MinifyOptions,
  cdataJs: boolean,
) {
  const key = jsKeys.find(it => it.endsWith(jsName))
  if (!key) {
    warn(
      'ENTRY_JS_NOT_FOUND',
      `Entry JS not found in bundle: ${jsName}`,
      'Check if HTML still references the correct entry or if another plugin modified it',
    )
    return { origin, source: origin, keys: [] as string[] }
  }

  const jsBundle = bundle[key] as OutputChunk
  let source = jsBundle.code.replace(emptyLineRe, '').trim()
  if (removeComments)
    source = source.replace(commentRe, '')

  // Collect entry's direct deps
  const entryDeps = Array.from(source.matchAll(jsChunkRe)).map(m => baseName(m[1]!))
  // Build dependency graph and topo order ensuring A before B if B imports A
  const graph = buildGraph(entryDeps, jsKeys, bundle)
  const order = topoSort(graph)

  // Assign a namespace for each chunk
  const nsMap = new Map<string, string>()
  const used = new Set<string>()
  order.forEach((name) => {
    let ns = toNsVar(name)
    let i = 1
    while (used.has(ns)) {
      ns = `${ns}_${i++}`
    }
    used.add(ns)
    nsMap.set(name, ns)
  })

  // Build namespace IIFEs in topological order
  const preludeParts: string[] = []
  const usedKeys: string[] = []
  order.forEach((name) => {
    const { iife, key: k } = buildChunkNamespace(name, jsKeys, bundle, removeComments, nsMap)
    preludeParts.push(iife)
    usedKeys.push(k)
  })
  const prelude = preludeParts.join('')

  // Replace entry's imports with namespace destructuring
  source = replaceImportsWithNs(source, nsMap)

  // Final inline script (optionally minified by oxc)
  let combined = (prelude + source).trim()
  if (minify) {
    combined = await minifyCode(combined, minify === true ? {} : minify)
  }
  combined = escapeNewlinesLiteral(combined)

  if (cdataJs) {
    combined = `/*<![CDATA[*/${combined}/*]]>*/`
  }

  source = `<script type="module">${combined}</script>`

  // Keys of inlined JS assets (entry + imported chunks)
  const keys = [key].concat(usedKeys)

  return {
    origin, // Original <script> to replace
    source, // Inlined <script>
    keys, // Asset keys to delete
  }
}

/**
 * Plugin options.
 */
export interface Options {
  /**
   * Remove block comments in inlined CSS and JS.
   * Reduces size but makes debugging harder.
   * @default true
   */
  removeComments?: boolean
  /**
   * Use oxc-minify to post-minify the final inlined JS.
   * Note: This is not a replacement for bundler-level tree-shaking.
   * @default false
   */
  minify?: boolean | MinifyOptions
  /**
   * Wrap inlined JS code with <![CDATA[ ... ]]> for XML/XHTML compatibility.
   * @default false
   */
  cdataJs?: boolean
}

/**
 * Vite plugin that inlines CSS and JavaScript assets into HTML files.
 * Produces a single HTML with no external dependencies.
 */
export default function VitePluginInline(options: Options = {}): Plugin {
  const {
    removeComments = true,
    minify = false,
    cdataJs = false,
  } = options

  return {
    name: 'vite-plugin-inline',
    enforce: 'post', // Run after other plugins process assets

    // Ensure modulePreload is disabled to prevent extra <link rel="modulepreload">.
    config() {
      return {
        build: {
          modulePreload: false,
        },
      }
    },

    /**
     * After bundle is generated:
     * - For each HTML, inline all <link href="*.css"> and the main <script src="*.js">
     * - Remove the consumed assets from bundle outputs
     */
    async generateBundle(_, bundle) {
      const bundleKeys = Object.keys(bundle)
      const htmlKeys = bundleKeys.filter(key => key.endsWith('.html'))
      const cssKeys = bundleKeys.filter(key => key.endsWith('.css'))
      const jsKeys = bundleKeys.filter(key => key.endsWith('.js'))

      const toDeleteKeys: string[] = []

      for (const htmlKey of htmlKeys) {
        const htmlBundle = bundle[htmlKey] as OutputAsset
        let htmlSource = String(htmlBundle.source)

        // Collect CSS replacements
        const cssDatas = Array.from(htmlSource.matchAll(cssRe)).map((cssMatch) => {
          return getCssData(cssMatch[0], baseName(cssMatch[1]!), cssKeys, bundle, removeComments)
        })

        // Find the main <script src="...">
        const jsMatch = htmlSource.match(jsMainRe)
        if (!jsMatch) {
          warn(
            'NO_MAIN_SCRIPT',
            `No main <script src="*.js"> found in ${htmlKey}`,
            'Ensure the HTML still contains an external module script tag',
          )
        }

        // Process JS (if any)
        let jsData:
          | { origin: string, source: string, keys: string[] }
          | undefined

        if (jsMatch) {
          jsData = await getJsData(
            jsMatch[0],
            baseName(jsMatch[1]!),
            jsKeys,
            bundle,
            removeComments,
            minify,
            cdataJs,
          )
        }

        // Replace CSS links with <style>
        cssDatas.forEach((cssData) => {
          if (cssData.source && cssData.source !== cssData.origin) {
            htmlSource = htmlSource.replace(cssData.origin, () => cssData.source)
          }
        })

        // Replace the main script tag with inlined module script
        if (jsData && jsData.source && jsData.source !== jsData.origin) {
          htmlSource = htmlSource.replace(jsData.origin, () => jsData.source)
        }

        // Update HTML content
        htmlBundle.source = htmlSource

        // Collect deletion keys
        const keys = cssDatas.map(it => it.key).filter(Boolean)
        if (jsData)
          keys.push(...jsData.keys)
        toDeleteKeys.push(...keys)
      }

      // Delete inlined assets (de-duplicated)
      Array.from(new Set(toDeleteKeys)).forEach((key) => {
        if (key && bundle[key])
          delete bundle[key]
      })
    },
  }
}
