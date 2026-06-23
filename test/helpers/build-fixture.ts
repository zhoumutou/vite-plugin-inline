import type { Options } from '../../src/index'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { build } from 'vite'
import VitePluginInline from '../../src/index'

interface BuildFixtureConfig {
  minify?: boolean
}

async function listFiles(directory: string, root = directory): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directory, entry.name)

      if (entry.isDirectory()) {
        return listFiles(entryPath, root)
      }

      return [relative(root, entryPath)]
    }),
  )

  return files.flat()
}

export async function buildFixture(
  name: string,
  options: Options = {},
  config: BuildFixtureConfig = {},
) {
  const root = resolve('test/fixtures', name)
  const outDir = await mkdtemp(join(tmpdir(), `vite-plugin-inline-${name}-`))

  try {
    await build({
      configFile: false,
      root,
      logLevel: 'silent',
      build: {
        outDir,
        emptyOutDir: true,
        minify: config.minify,
      },
      plugins: [VitePluginInline(options)],
    })

    const files = await listFiles(outDir)
    const htmlFile = files.find((file) => file.endsWith('.html'))

    if (!htmlFile) {
      throw new Error(`Missing HTML output for fixture ${name}`)
    }

    const html = await readFile(join(outDir, htmlFile), 'utf8')

    return { files, html }
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
}
