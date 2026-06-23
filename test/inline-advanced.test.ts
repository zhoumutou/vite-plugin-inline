import { resolve } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { buildFixture } from './helpers/build-fixture'
import VitePluginInline from '../src/index'

describe('vite-plugin-inline advanced output', () => {
  it('keeps dynamic chunks when inlineDynamicImports is false', async () => {
    const result = await buildFixture('dynamic-external')

    expect(result.files.some((file) => /\.(m?js)$/.test(file))).toBe(true)
    expect(result.html).not.toContain('__VITE_PRELOAD__')
    expect(result.html).toMatch(/import\((['`"])(\.\/)?assets\/lazy-.*?\.js\1\)/)
  })

  it('rewrites external dynamic import paths for nested HTML entries', async () => {
    const result = await buildFixture(
      'nested-dynamic-external',
      {},
      {
        rollupOptions: {
          input: resolve('test/fixtures/nested-dynamic-external/pages/demo.html'),
        },
      },
    )

    expect(result.files.some((file) => /assets\/lazy-.*?\.js$/.test(file))).toBe(true)
    expect(result.html).toMatch(/import\((['`"])(\.\.\/)+assets\/lazy-.*?\.js\1\)/)
    expect(result.html).not.toContain('__VITE_PRELOAD__')
  })

  it('keeps dynamic import helpers working when build.base is non-root', async () => {
    const result = await buildFixture('dynamic-external', {}, { base: '/demo/' })

    expect(result.files.some((file) => /assets\/lazy-.*?\.js$/.test(file))).toBe(true)
    expect(result.html).toContain('return`/demo/`+e')
    expect(result.html).toMatch(/import\((['`"])(\.\/)?assets\/lazy-.*?\.js\1\)/)
    expect(result.html).not.toContain('__VITE_PRELOAD__')
  })

  it('removes sourcemaps for inlined assets and preserves sourcemaps for remaining dynamic chunks', async () => {
    const fullyInlined = await buildFixture('basic', {}, { sourcemap: true })
    const dynamicExternal = await buildFixture('dynamic-external', {}, { sourcemap: true })

    expect(fullyInlined.files.some((file) => file.endsWith('.map'))).toBe(false)
    expect(dynamicExternal.files.some((file) => /assets\/lazy-.*?\.js\.map$/.test(file))).toBe(true)
    expect(dynamicExternal.files.some((file) => /index-.*?\.js\.map$/.test(file))).toBe(false)
  })

  it('keeps the original external entry when static and dynamic imports are mixed', async () => {
    const result = await buildFixture(
      'dynamic-static-external',
      {},
      {
        rollupOptions: {
          output: {
            manualChunks(id) {
              return id.endsWith('/message.ts') ? 'message' : undefined
            },
          },
        },
      },
    )

    expect(result.html).toContain('src="/assets/')
    expect(result.files.filter((file) => /\.(m?js)$/.test(file)).length).toBeGreaterThan(1)
  })

  it('flattens dynamic chunks when inlineDynamicImports is true', async () => {
    const result = await buildFixture('dynamic-inline', { inlineDynamicImports: true })

    expect(result.files.some((file) => /\.(m?js)$/.test(file))).toBe(false)
    expect(result.html).toContain('lazy payload')
  })

  it('preserves emitted HTML attributes and strips HTML leftovers', async () => {
    const result = await buildFixture('html-attrs')

    expect(result.html).toContain('<style')
    expect(result.html).toContain('nonce="demo-style-nonce"')
    expect(result.html).toContain('id="entry-style"')
    expect(result.html).toContain('media="screen"')
    expect(result.html).toContain('<script type="module"')
    expect(result.html).not.toContain('src="/assets/')
    expect(result.html).not.toContain('fixture css comment')
    expect(result.html).not.toContain('<link rel="stylesheet"')
    expect(result.html).not.toContain('<link rel="modulepreload"')
  })

  it('leaves external absolute URLs untouched while still inlining local resources and preserving local script attrs', async () => {
    const plugin = VitePluginInline()
    const generateBundle =
      typeof plugin.generateBundle === 'function'
        ? plugin.generateBundle
        : plugin.generateBundle?.handler

    if (!generateBundle) {
      throw new Error('Missing generateBundle hook')
    }

    const bundle = {
      'index.html': {
        type: 'asset',
        fileName: 'index.html',
        source:
          '<link rel="stylesheet" href="https://cdn.example.com/remote.css"><link rel="stylesheet" href="./assets/local.css" nonce="style-nonce" id="style-id" media="screen"><script type="module" src="https://cdn.example.com/remote.js" nonce="remote-nonce"></script><script type="module" src="./assets/local.js" nonce="local-nonce" id="entry-script"></script>',
      },
      'assets/local.css': {
        type: 'asset',
        fileName: 'assets/local.css',
        source: 'body{color:red}',
      },
      'assets/local.js': {
        type: 'chunk',
        fileName: 'assets/local.js',
        code: 'console.log("local")',
        imports: [],
        dynamicImports: [],
      },
    }

    const pluginContext = { warn() {} } as never

    await Reflect.apply(generateBundle as (...args: unknown[]) => unknown, pluginContext, [
      {} as never,
      bundle as never,
      false,
    ])

    const html = String(bundle['index.html'].source)
    expect(html).toContain('href="https://cdn.example.com/remote.css"')
    expect(html).toContain('src="https://cdn.example.com/remote.js" nonce="remote-nonce"')
    expect(html).toContain(
      '<style nonce="style-nonce" id="style-id" media="screen">body{color:red}</style>',
    )
    expect(html).toContain(
      '<script type="module" nonce="local-nonce" id="entry-script">console.log("local")</script>',
    )
  })

  it('resolves duplicate asset basenames using each html file path before falling back to basename matching', async () => {
    const plugin = VitePluginInline()
    const generateBundle =
      typeof plugin.generateBundle === 'function'
        ? plugin.generateBundle
        : plugin.generateBundle?.handler

    if (!generateBundle) {
      throw new Error('Missing generateBundle hook')
    }

    const bundle = {
      'pages/a/index.html': {
        type: 'asset',
        fileName: 'pages/a/index.html',
        source:
          '<link rel="stylesheet" href="assets/style.css"><script type="module" src="assets/main.js"></script>',
      },
      'pages/b/index.html': {
        type: 'asset',
        fileName: 'pages/b/index.html',
        source:
          '<link rel="stylesheet" href="assets/style.css"><script type="module" src="assets/main.js"></script>',
      },
      'pages/a/assets/style.css': {
        type: 'asset',
        fileName: 'pages/a/assets/style.css',
        source: 'body{color:red}',
      },
      'pages/b/assets/style.css': {
        type: 'asset',
        fileName: 'pages/b/assets/style.css',
        source: 'body{color:blue}',
      },
      'pages/a/assets/main.js': {
        type: 'chunk',
        fileName: 'pages/a/assets/main.js',
        code: 'console.log("page-a")',
        imports: [],
        dynamicImports: [],
      },
      'pages/b/assets/main.js': {
        type: 'chunk',
        fileName: 'pages/b/assets/main.js',
        code: 'console.log("page-b")',
        imports: [],
        dynamicImports: [],
      },
    }

    const pluginContext = { warn() {} } as never

    await Reflect.apply(generateBundle as (...args: unknown[]) => unknown, pluginContext, [
      {} as never,
      bundle as never,
      false,
    ])

    expect(String(bundle['pages/a/index.html'].source)).toContain('body{color:red}')
    expect(String(bundle['pages/a/index.html'].source)).toContain('console.log("page-a")')
    expect(String(bundle['pages/b/index.html'].source)).toContain('body{color:blue}')
    expect(String(bundle['pages/b/index.html'].source)).toContain('console.log("page-b")')
  })

  it('tracks static dependencies by chunk-relative path when duplicate dependency basenames exist', async () => {
    const plugin = VitePluginInline()
    const generateBundle =
      typeof plugin.generateBundle === 'function'
        ? plugin.generateBundle
        : plugin.generateBundle?.handler

    if (!generateBundle) {
      throw new Error('Missing generateBundle hook')
    }

    const bundle = {
      'pages/a/index.html': {
        type: 'asset',
        fileName: 'pages/a/index.html',
        source: '<script type="module" src="./assets/main.js"></script>',
      },
      'pages/b/index.html': {
        type: 'asset',
        fileName: 'pages/b/index.html',
        source: '<script type="module" src="./assets/main.js"></script>',
      },
      'pages/a/assets/main.js': {
        type: 'chunk',
        fileName: 'pages/a/assets/main.js',
        code: 'import "./dep.js"; console.log("page-a")',
        imports: ['pages/a/assets/dep.js'],
        dynamicImports: [],
      },
      'pages/b/assets/main.js': {
        type: 'chunk',
        fileName: 'pages/b/assets/main.js',
        code: 'import "./dep.js"; console.log("page-b")',
        imports: ['pages/b/assets/dep.js'],
        dynamicImports: [],
      },
      'pages/a/assets/dep.js': {
        type: 'chunk',
        fileName: 'pages/a/assets/dep.js',
        code: 'console.log("dep-a")',
        imports: [],
        dynamicImports: [],
      },
      'pages/b/assets/dep.js': {
        type: 'chunk',
        fileName: 'pages/b/assets/dep.js',
        code: 'console.log("dep-b")',
        imports: [],
        dynamicImports: [],
      },
    }

    const pluginContext = { warn() {} } as never

    await Reflect.apply(generateBundle as (...args: unknown[]) => unknown, pluginContext, [
      {} as never,
      bundle as never,
      false,
    ])

    expect(String(bundle['pages/a/index.html'].source)).toContain('dep-a')
    expect(String(bundle['pages/a/index.html'].source)).not.toContain('dep-b')
    expect(String(bundle['pages/b/index.html'].source)).toContain('dep-b')
    expect(String(bundle['pages/b/index.html'].source)).not.toContain('dep-a')
  })

  it('prefers the module script and leaves nomodule scripts alone', async () => {
    const result = await buildFixture('module-priority')

    expect(result.html).toContain('<script type="module">')
    expect(result.html).toContain('legacy.js')
    expect(result.html).toContain('nomodule')
    expect(result.html).not.toContain('src="/main.ts"')
  })
})
