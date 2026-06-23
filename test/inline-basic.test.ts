import { describe, expect, it } from 'vite-plus/test'
import { buildFixture } from './helpers/build-fixture'

describe('vite-plugin-inline basic output', () => {
  it('inlines css and entry js and removes external assets', async () => {
    const result = await buildFixture('basic')

    expect(result.html).toContain('<style')
    expect(result.html).toContain('<script type="module">')
    expect(result.files.some((file) => file.endsWith('.css'))).toBe(false)
    expect(result.files.some((file) => file.endsWith('.js'))).toBe(false)
  })

  it('rebundles static imports before inlining', async () => {
    const result = await buildFixture(
      'static-import',
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

    expect(result.html).toContain('hello from dependency')
    expect(result.html).not.toMatch(/import\s+\{/)
    expect(result.files.some((file) => file.endsWith('.js'))).toBe(false)
  })
})
