# @zhoumutou/vite-plugin-inline

[![npm version](https://img.shields.io/npm/v/@zhoumutou/vite-plugin-inline.svg)](https://www.npmjs.com/package/@zhoumutou/vite-plugin-inline)
[![weekly downloads](https://img.shields.io/npm/dw/@zhoumutou/vite-plugin-inline)](https://www.npmjs.com/package/@zhoumutou/vite-plugin-inline)
[![license](https://img.shields.io/npm/l/@zhoumutou/vite-plugin-inline)](https://github.com/zhoumutou/vite-plugin-inline/blob/main/LICENSE)
[![unpacked size](https://img.shields.io/npm/unpacked-size/%40zhoumutou%2Fvite-plugin-inline)](https://www.npmjs.com/package/@zhoumutou/vite-plugin-inline)

A Vite plugin that inlines CSS and JavaScript assets into HTML files, generating a single, self-contained HTML file with no external dependencies.

English | [中文](./README.zh_CN.md)

## Features

- Inline all CSS `<link rel="stylesheet">` as `<style>` in HTML
- Inline the entry JS as a single `<script type="module">`
  - If the entry still has static imports, rebundle in-memory to eliminate them
  - Optionally flatten dynamic imports into the inline script via `inlineDynamicImports`
- Remove original JS/CSS assets (and their source maps) from the bundle
- Strip `<link rel="modulepreload">` entries pointing to inlined chunks
- Preserve CSP-related attributes (script/style keep `nonce` and `id`, style keeps `media`)
- Escape `</script>` and `</style>` sequences inside inline content
- Disables `modulePreload` in Vite for cleaner single-file output

## Installation

```bash
# npm
npm install @zhoumutou/vite-plugin-inline -D

# yarn
yarn add @zhoumutou/vite-plugin-inline -D

# pnpm
pnpm add @zhoumutou/vite-plugin-inline -D
```

## Usage

```ts
import inline from '@zhoumutou/vite-plugin-inline'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    inline({
      // Optional
      // removeComments: true,          // remove CSS block comments
      // cdataJs: false,                // wrap inline JS with <![CDATA[ ... ]]>
      // inlineDynamicImports: false,   // flatten dynamic imports into the inline script
    }),
  ],
})
```

## Options

```ts
interface Options {
  /**
   * Remove block comments in inlined CSS.
   * JS comments are not post-processed; when rebundling, minification may drop comments.
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
   * If true, the rebundle flattens dynamic imports so no extra JS chunks are emitted.
   * @default false
   */
  inlineDynamicImports?: boolean
}
```

## How It Works

- Scan emitted HTML:
  - Replace `<link rel="stylesheet" href="*.css">` with `<style>...</style>`
  - Find the main `<script src="*.mjs|*.js">` that belongs to the bundle (prefer `type="module"`)
- Build the inline JS:
  - If the entry has no static imports, reuse the emitted chunk code
  - If it has static imports, rebundle in-memory to eliminate them
  - When `inlineDynamicImports` is `true`, also flatten dynamic imports
  - If the rebundle fails, fall back to the original chunk to keep the build working
- Replace the original tags with inline content, then:
  - Remove the now-inlined JS/CSS assets (and `.map` files) from the bundle
  - Strip `<link rel="modulepreload">` tags that point to inlined chunks

## Example

Input HTML:

```html
<link rel="stylesheet" href="style.css">
<script type="module" src="main.js"></script>
```

Output HTML:

```html
<style>/* inlined CSS content */</style>
<script type="module">/* inlined (optionally rebundled) JS content */</script>
```

## Notes and Limitations

- Basename matching:
  - Assets are matched by file basename (e.g., `index-abc123.js`). Duplicate basenames across folders may be ambiguous.
- Dynamic imports:
  - If `inlineDynamicImports` is `false` (default), dynamic chunks remain external; the plugin does not delete them.
- Non-CSS/JS assets:
  - Images, fonts, JSON, etc., are not inlined by this plugin.
- HTML parsing:
  - Replacement is regex-based; complex templating may need adjustments.
- Security/CSP:
  - `nonce`/`id`/`media` are preserved; inline content escapes closing tags to avoid early termination.

## Similar Plugins / Inspiration

- [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile)

Thanks to the authors for inspiration.

## License

MIT
