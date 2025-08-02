# @zhoumutou/vite-plugin-inline

[![npm version](https://img.shields.io/npm/v/@zhoumutou/vite-plugin-inline.svg)](https://www.npmjs.com/package/@zhoumutou/vite-plugin-inline)
[![weekly downloads](https://img.shields.io/npm/dw/@zhoumutou/vite-plugin-inline)](https://www.npmjs.com/package/@zhoumutou/vite-plugin-inline)
[![license](https://img.shields.io/npm/l/@zhoumutou/vite-plugin-inline)](https://github.com/zhoumutou/vite-plugin-inline/blob/main/LICENSE)
[![install size](https://packagephobia.com/badge?p=@zhoumutou/vite-plugin-inline)](https://packagephobia.com/result?p=@zhoumutou/vite-plugin-inline)

A Vite plugin that inlines CSS and JavaScript assets into HTML files, generating a single, self-contained HTML file with no external dependencies.

English | [中文](./README.zh_CN.md)

## Features

- Inline all CSS referenced by `<link>` tags as `<style>`
- Inline the main JavaScript file and all its dependencies as `<script type="module">`
- Optionally remove comments to reduce file size
- Remove original external JS/CSS files from the build output

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

Add the plugin to your Vite or Rolldown config:

```typescript
import inline from '@zhoumutou/vite-plugin-inline'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    inline(),
  ],
})
```

## Options

The plugin accepts the following options:

```typescript
interface Options {
  /** Whether to remove comments in inlined CSS/JS (default: true) */
  removeComments?: boolean
}
```

## How It Works

- Inline all CSS referenced by `<link>` tags as `<style>` tags in HTML
- Merge the main JS file and all its dependencies into a single `<script type="module">` tag
- Optionally remove comments from inlined assets
- Remove original JS/CSS files from the build output

## Example

Suppose your HTML contains:

```html
<link rel="stylesheet" href="style.css">
<script type="module" src="main.js"></script>
```

After build, with this plugin enabled, your HTML will become:

```html
<style>/* inlined CSS content */</style>
<script type="module">/* inlined JS content */</script>
```

## Similar Plugins / Inspiration

This plugin was inspired by and references the following excellent projects:

- [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile) - This Vite build plugin allows you to inline all JavaScript and CSS resources directly into the final dist/index.html file.

Thanks to all these projects for providing valuable references and inspiration.
