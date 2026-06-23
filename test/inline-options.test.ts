import { describe, expect, it } from 'vite-plus/test'
import { buildFixture } from './helpers/build-fixture'

describe('vite-plugin-inline option handling', () => {
  it('uses Vite minify defaults unless the harness overrides them', async () => {
    const result = await buildFixture('basic', { removeComments: false })

    expect(result.html).not.toContain('fixture css comment')
  })

  it('keeps CSS comments when removeComments is false and minify is disabled explicitly', async () => {
    const result = await buildFixture('basic', { removeComments: false }, { minify: false })

    expect(result.html).toContain('fixture css comment')
  })

  it('wraps inline JavaScript in CDATA markers when cdataJs is true', async () => {
    const result = await buildFixture('basic', { cdataJs: true })

    expect(result.html).toContain('/*<![CDATA[*/')
    expect(result.html).toContain('/*]]>*/')
  })

  it('escapes closing tags inside inline assets', async () => {
    const result = await buildFixture('escape-html')

    expect(result.html).toContain('<\\/script')
    expect(result.html).toContain('<\\!--')
    expect(result.html).toContain('<\\/style')
  })
})
