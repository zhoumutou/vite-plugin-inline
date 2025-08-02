/**
 * vite-plugin-inline
 * A Vite plugin that inlines CSS and JavaScript assets into HTML files,
 * generating a single, self-contained HTML file with no external dependencies.
 */
import type { OutputAsset, OutputBundle, OutputChunk } from 'rollup'
import type { Plugin } from 'vite'

/**
 * Matches the main script tag with src attribute in HTML
 */
const jsMainRe = /<script[^>]*src="([^"]+\.js)"[^>]*><\/script>/

/**
 * Matches import statements for JS chunks
 */
const jsChunkRe = /import\s*\{[\s\S]+?\}\s*from\s*"([^"]+\.js)";/g

/**
 * Matches link tags for CSS stylesheets
 */
const cssRe = /<link[^>]*href="([^"]+\.css)"[^>]*>/g

/**
 * Matches CSS and JS comments
 */
const commentRe = /\/\*[\s\S]*?\*\//g

/**
 * Matches export statements in JS
 */
const exportsRe = /export\s*\{([\s\S]+?)\}\s*;?/

/**
 * Matches named exports with aliases (export { foo as bar })
 */
const exportAsRe = /([\w$]+)\s+as\s+([\w$]+)/g

/**
 * Matches import aliases (" as " pattern)
 */
const importAsRe = /\s+as\s+/g

/**
 * Matches import declarations
 */
const importRe = /import\s*(\{[\s\S]+?\})/

/**
 * Matches multiple empty lines to compress output
 */
const emptyLineRe = /(\r?\n)[\t\f\v ]*(\r?\n)+/g

/**
 * Converts ES module export statements to return statements for IIFE pattern.
 * @param jsCode JavaScript code containing export statements
 * @returns Transformed code with exports replaced by return statements
 */
function export2Return(jsCode: string) {
  return jsCode.replace(exportsRe, (_match, exports: string) => `return{${exports.replace(exportAsRe, '$2:$1')}};`)
}

/**
 * Converts import expressions to object destructuring patterns.
 * @param importExpr Import expression string
 * @returns Object destructuring pattern for use in const declaration
 */
function import2Const(importExpr: string) {
  const match = importExpr.match(importRe)!
  return match[1]!.replace(importAsRe, ':')
}

/**
 * Extracts CSS content from the bundle and wraps it in a style tag.
 * @param origin Original link tag in HTML
 * @param cssName Filename of the CSS to inline
 * @param cssKeys List of CSS asset keys in the bundle
 * @param bundle The Rollup output bundle
 * @param removeComments Whether to remove comments from CSS
 * @returns Object containing original tag, inlined CSS, and bundle key
 */
function getCssData(origin: string, cssName: string, cssKeys: string[], bundle: OutputBundle, removeComments: boolean) {
  // Find the CSS asset by filename in the bundle
  const key = cssKeys.find(it => it.endsWith(cssName))!

  const cssBundle = bundle[key] as OutputAsset
  let source = cssBundle.source as string

  // Optionally remove comments for smaller output
  if (removeComments) {
    source = source.replace(commentRe, '')
  }

  // Wrap CSS content in style tag
  source = `<style>${source.trim()}</style>`

  return {
    origin, // Original link tag to replace
    source, // New style tag with inlined CSS
    key, // Key of the asset to remove from bundle
  }
}

/**
 * Processes a JavaScript chunk import and converts it to an IIFE.
 * This handles dynamic imports and nested dependencies.
 * @param origin Original import statement
 * @param jsName Filename of the JS chunk
 * @param jsKeys List of JS asset keys in the bundle
 * @param bundle The Rollup output bundle
 * @param removeComments Whether to remove comments from JS
 * @returns Object containing original import, transformed code, and bundle key
 */
function getJsChunkData(origin: string, jsName: string, jsKeys: string[], bundle: OutputBundle, removeComments: boolean) {
  // Find the JS chunk by filename in the bundle
  const key = jsKeys.find(it => it.endsWith(jsName))!
  const jsBundle = bundle[key] as OutputChunk

  // Clean up the code by removing empty lines
  let source = jsBundle.code.replace(emptyLineRe, '').trim()

  // Optionally remove comments
  if (removeComments) {
    source = source.replace(commentRe, '')
  }

  // Convert to immediately invoked function expression (IIFE)
  // and assign to a const with the proper name
  source = `const ${import2Const(origin)}=(()=>{${export2Return(source)}})();`

  return {
    origin, // Original import statement to replace
    source, // Transformed IIFE code
    key, // Key of the asset to remove from bundle
  }
}

/**
 * Processes the main JavaScript entry file and all its imported chunks.
 * Recursively inlines all dependencies into a single script tag.
 * @param origin Original script tag in HTML
 * @param jsName Filename of the main JS entry
 * @param jsKeys List of JS asset keys in the bundle
 * @param bundle The Rollup output bundle
 * @param removeComments Whether to remove comments from JS
 * @returns Object containing original tag, inlined JS with dependencies, and all bundle keys
 */
function getJsData(origin: string, jsName: string, jsKeys: string[], bundle: OutputBundle, removeComments: boolean) {
  // Find the main JS entry by filename in the bundle
  const key = jsKeys.find(it => it.endsWith(jsName))!

  const jsBundle = bundle[key] as OutputChunk
  let source = jsBundle.code.replace(emptyLineRe, '').trim()

  if (removeComments) {
    source = source.replace(commentRe, '')
  }

  // Find and process all imported chunks recursively
  const jsChunkDatas = Array.from(source.matchAll(jsChunkRe)).map((jsChunkMatch) => {
    return getJsChunkData(jsChunkMatch[0], jsChunkMatch[1].split('/').pop()!, jsKeys, bundle, removeComments)
  })

  // Replace each import with its inlined version
  jsChunkDatas.forEach((jsChunkData) => {
    source = source.replace(jsChunkData.origin, () => jsChunkData.source)
  })

  // Wrap the final code in a module script tag
  source = `<script type="module">${source.trim()}</script>`

  // Collect all keys of JS assets that have been inlined
  const keys = [key].concat(jsChunkDatas.map(it => it.key))

  return {
    origin, // Original script tag to replace
    source, // New script tag with inlined JS
    keys, // All keys of assets to remove from bundle
  }
}

/**
 * Configuration options for the plugin.
 */
export interface Options {
  /**
   * Whether to remove comments from inlined CSS and JS.
   * Reduces file size but makes debugging harder.
   * @default true
   */
  removeComments?: boolean
}

/**
 * Vite plugin that inlines CSS and JavaScript assets into HTML files.
 * This creates a single self-contained HTML file with no external dependencies.
 *
 * Use this plugin when you need to:
 * - Create standalone HTML files that work without a server
 * - Reduce HTTP requests for better performance
 * - Package HTML applications for distribution as single files
 *
 * @param options Configuration options
 * @returns Vite plugin instance
 */
export default function VitePluginInline(options: Options = {}): Plugin {
  const { removeComments = true } = options

  return {
    name: 'vite-plugin-inline',
    enforce: 'post', // Run after other plugins have processed assets

    // Configure Vite build options that are required for this plugin.
    config() {
      return {
        build: {
          // Disable modulePreload to prevent additional script tags
          modulePreload: false,
        },
      }
    },

    /**
     * Main plugin hook that runs after bundle generation.
     * Processes HTML files and inlines their referenced assets.
     * @param _ Output options (unused)
     * @param bundle The generated output bundle
     */
    generateBundle(_, bundle) {
      // Get all keys from the bundle and categorize them by file extension
      const bundleKeys = Object.keys(bundle)
      const htmlKeys = bundleKeys.filter(key => key.endsWith('.html'))
      const cssKeys = bundleKeys.filter(key => key.endsWith('.css'))
      const jsKeys = bundleKeys.filter(key => key.endsWith('.js'))

      // Track which files should be removed from the bundle
      const toDeleteKeys: string[] = []

      // Process each HTML file
      htmlKeys.forEach((htmlKey) => {
        const htmlBundle = bundle[htmlKey] as OutputAsset
        let htmlSource = htmlBundle.source as string

        // Find and process all CSS link tags
        const cssDatas = Array.from(htmlSource.matchAll(cssRe)).map((cssMatch) => {
          return getCssData(cssMatch[0], cssMatch[1].split('/').pop()!, cssKeys, bundle, removeComments)
        })

        // Find the main JavaScript script tag
        const jsMatch = htmlSource.match(jsMainRe)
        if (!jsMatch) {
          console.warn(`No main found in ${htmlKey}`)
          return
        }

        // Process the main JS file and all its dependencies
        const jsData = getJsData(jsMatch[0], jsMatch[1].split('/').pop()!, jsKeys, bundle, removeComments)

        // Replace CSS link tags with inlined style tags
        cssDatas.forEach((cssData) => {
          htmlSource = htmlSource.replace(cssData.origin, () => cssData.source)
        })

        // Replace JS script tag with inlined script
        htmlSource = htmlSource.replace(jsData.origin, () => jsData.source)

        // Update the HTML file in the bundle
        htmlBundle.source = htmlSource

        // Mark all inlined assets for deletion
        const keys = cssDatas.map(it => it.key).concat(...jsData.keys)
        toDeleteKeys.push(...keys)
      })

      // Remove all inlined assets from the bundle (deduplicated)
      Array.from(new Set(toDeleteKeys)).forEach((key) => {
        delete bundle[key]
      })
    },
  }
}
