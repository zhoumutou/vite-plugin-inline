# @zhoumutou/vite-plugin-inline

[![npm version](https://img.shields.io/npm/v/@zhoumutou/vite-plugin-inline.svg)](https://www.npmjs.com/package/@zhoumutou/vite-plugin-inline)
[![weekly downloads](https://img.shields.io/npm/dw/@zhoumutou/vite-plugin-inline)](https://www.npmjs.com/package/@zhoumutou/vite-plugin-inline)
[![license](https://img.shields.io/npm/l/@zhoumutou/vite-plugin-inline)](https://github.com/zhoumutou/vite-plugin-inline/blob/main/LICENSE)
[![unpacked size](https://img.shields.io/npm/unpacked-size/%40zhoumutou%2Fvite-plugin-inline)](https://www.npmjs.com/package/@zhoumutou/vite-plugin-inline)

A Vite plugin that inlines CSS and JavaScript assets into HTML files. In the common case it produces a single self-contained HTML file; when dynamic chunks stay external or a safe fallback is required, it preserves the necessary external JavaScript files.

English | [中文](./README.zh_CN.md)

## Features

- Inline all CSS `<link rel="stylesheet">` as `<style>` in HTML
- Inline the entry JS as a single `<script type="module">`
  - If the entry still has static imports, rebundle in-memory to eliminate them
  - Optionally flatten dynamic imports into the inline script via `inlineDynamicImports`
- Remove JS/CSS assets (and their source maps) that were successfully inlined from the bundle
- Strip `<link rel="modulepreload">` entries pointing to inlined chunks
- Preserve selected attributes from the emitted HTML tags being replaced (`style` keeps `nonce`/`id`/`media`; `script` keeps `nonce`/`id`)
- Escape `</script>` and `</style>` sequences inside inline content

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

## Development

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

This package is published as ESM-only.

## Options

```ts
interface Options {
  /**
   * Remove block comments in inlined CSS.
   * JS comments are not post-processed; when rebundling, upstream minification may still drop comments.
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
  - When dynamic imports stay external, rewrite the inline entry's import paths so they still point to the emitted chunks correctly
  - If the rebundle fails, keep the original external entry script and warn instead of emitting a broken inline module
- Replace the original tags with inline content, then:
  - Remove the JS/CSS assets that were actually inlined (and `.map` files) from the bundle
  - Strip `<link rel="modulepreload">` tags that point to inlined chunks

## Example

Input HTML:

```html
<link rel="stylesheet" href="style.css" />
<script type="module" src="main.js"></script>
```

Output HTML:

```html
<style>
  /* inlined CSS content */
</style>
<script type="module">
  /* inlined (optionally rebundled) JS content */
</script>
```

## Notes and Limitations

- Asset resolution:
  - The plugin first resolves asset references using each HTML file's relative path (and Vite `base` when available), then falls back to basename matching only when necessary.
  - Bare ambiguous basenames without path context can still resolve unpredictably.
- Dynamic imports:
  - If `inlineDynamicImports` is `false` (default), dynamic chunks remain external; the plugin does not delete them.
  - If an entry mixes static and dynamic imports while `inlineDynamicImports` is `false`, the plugin keeps the original external entry script and emits a warning instead of producing a broken inline module.
- Comment preservation:
  - `removeComments: false` disables this plugin's CSS comment stripping, but it does not disable Vite or Rolldown minification. If your build still minifies CSS, comments may already be gone before the plugin replaces the tag.
- Non-CSS/JS assets:
  - Images, fonts, JSON, etc., are not inlined by this plugin.
- External URLs:
  - Absolute or protocol-relative CSS/JS URLs that do not belong to the current bundle are left untouched.
- HTML parsing:
  - Replacement is regex-based; complex templating may need adjustments.
- Security/CSP:
  - Attributes are preserved from the emitted HTML tags that the plugin replaces. If Vite strips a source HTML script attribute during HTML transformation, the plugin cannot recover it later.
  - Inline content escapes closing tags to avoid early termination.

## Similar Plugins / Inspiration

- [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile)

Thanks to the authors for inspiration.

## License

MIT
