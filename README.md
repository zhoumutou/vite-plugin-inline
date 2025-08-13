# @zhoumutou/vite-plugin-inline

[![npm version](https://img.shields.io/npm/v/@zhoumutou/vite-plugin-inline.svg)](https://www.npmjs.com/package/@zhoumutou/vite-plugin-inline)
[![weekly downloads](https://img.shields.io/npm/dw/@zhoumutou/vite-plugin-inline)](https://www.npmjs.com/package/@zhoumutou/vite-plugin-inline)
[![license](https://img.shields.io/npm/l/@zhoumutou/vite-plugin-inline)](https://github.com/zhoumutou/vite-plugin-inline/blob/main/LICENSE)
[![install size](https://packagephobia.com/badge?p=@zhoumutou/vite-plugin-inline)](https://packagephobia.com/result?p=@zhoumutou/vite-plugin-inline)

A Vite plugin that inlines CSS and JavaScript assets into HTML files, generating a single, self-contained HTML file with no external dependencies.

English | [中文](./README.zh_CN.md)

## Features

- Inline all CSS `<link>` as `<style>` in HTML
- Inline entry JS and its imported chunks as a single `<script type="module">`
- Topologically ordered namespace IIFEs to preserve import order across chunks
- Optional post-minify/DCE via oxc-minify
- Optional removal of block comments to reduce size
- Remove original JS/CSS assets from the bundle
- Disables modulePreload for cleaner single-file output

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
    inline(),
  ],
})
```

## Options

```ts
interface Options {
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
```

## How It Works

- Replace CSS `<link href="*.css">` with `<style>` containing the file content.
- Find the main `<script src="*.js">`, read its code and imported chunks from the bundle.
- Build a dependency graph, topologically sort chunks, and wrap each chunk as a namespace IIFE that returns its exports.
- Replace `import { x as y } from 'chunk.js'` with `const { x: y } = __ns;` in both chunks and entry.
- Concatenate all IIFEs (in order) plus the transformed entry into one `<script type="module">`.
- Optionally run oxc-minify on the final script string.
- Remove the consumed JS/CSS assets from the output bundle.

## Example

Input HTML:

```html
<link rel="stylesheet" href="style.css">
<script type="module" src="main.js"></script>
```

Output HTML:

```html
<style>/* inlined CSS content */</style>
<script type="module">/* topo-sorted IIFEs + transformed entry (optionally minified) */</script>
```

## Notes and Limitations

- This approach does not fully emulate ESM live bindings in complex cyclic graphs; simple back-edges are tolerated.
- Dynamic imports are not bundled into the inline script by this plugin.

## Similar Plugins / Inspiration

- [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile)

Thanks to the authors for inspiration.

## License

MIT
