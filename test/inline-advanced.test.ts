import { describe, expect, it } from 'vite-plus/test'
import { buildFixture } from './helpers/build-fixture'

describe('vite-plugin-inline advanced output', () => {
  it('keeps dynamic chunks when inlineDynamicImports is false', async () => {
    const result = await buildFixture('dynamic-external')

    expect(result.files.some((file) => /\.(m?js)$/.test(file))).toBe(true)
  })

  it('flattens dynamic chunks when inlineDynamicImports is true', async () => {
    const result = await buildFixture('dynamic-inline', { inlineDynamicImports: true })

    expect(result.files.some((file) => /\.(m?js)$/.test(file))).toBe(false)
    expect(result.html).toContain('lazy payload')
  })

  it('preserves emitted HTML attributes and strips HTML leftovers', async () => {
    const result = await buildFixture('html-attrs')

    expect(result.html).toContain('nonce="demo-style-nonce"')
    expect(result.html).toContain('id="entry-style"')
    expect(result.html).toContain('media="screen"')
    expect(result.html).toContain('<script type="module">')
    expect(result.html).not.toContain('src="/assets/')
    expect(result.html).not.toContain('fixture css comment')
    expect(result.html).not.toContain('modulepreload')
  })

  it('prefers the module script and leaves nomodule scripts alone', async () => {
    const result = await buildFixture('module-priority')

    expect(result.html).toContain('<script type="module">')
    expect(result.html).toContain('legacy.js')
    expect(result.html).toContain('nomodule')
    expect(result.html).not.toContain('src="/main.ts"')
  })
})
