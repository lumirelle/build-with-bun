/* eslint-disable no-console */
import type { BuildArtifact, BuildOutput } from 'bun'
import { color } from 'bun' with { type: 'macro' }
import fs, { existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { absolute } from './utils.ts'

async function getArtifactSources(artifact: BuildArtifact): Promise<string[]> {
  const sourcemap = await artifact.sourcemap?.json() as { sources: string[] } | null
  const sources = sourcemap ? sourcemap.sources : []
  return sources.map(source => join(dirname(artifact.path), source))
}

async function getOutputSources(output: BuildOutput): Promise<Set<string>> {
  const sources = await Promise.all(output.outputs.map(getArtifactSources))
  return new Set(sources.flat().map(absolute))
}

type BuildConfig = Parameters<typeof Bun.build>[0] & {
  /**
   * Watch the specified directory for changes and rebuild on change.
   */
  watch?: string
  /**
   * Generate .d.ts files for TypeScript entrypoints (Using `oxc-transform`).
   */
  dts?: boolean
  onBuild?: (output: BuildOutput) => void
}

export async function build(config: BuildConfig): Promise<BuildOutput> {
  const { watch, onBuild, sourcemap, outdir, dts, plugins = [], ...rest } = config

  // Watch mode requires external sourcemap to map files correctly
  if (watch && config.sourcemap !== 'external')
    console.error('Watch requires external sourcemap, setting to external')

  // Clear outdir before building
  if (outdir && existsSync(outdir))
    rmSync(outdir, { recursive: true, force: true })

  // If dts is enabled, add the dts generate plugin
  if (dts)
    plugins.push((await import('./dts.ts')).dts())

  const newConfig = { outdir, sourcemap, plugins, ...rest }

  let output = await Bun.build(newConfig)

  if (watch) {
    let sources = await getOutputSources(output)
    let debounce: Timer | null = null
    let pending = false

    const rebuild = async (): Promise<void> => {
      if (pending)
        return
      pending = true
      console.log(`${color('blue', 'ansi')}Rebuilding...${color('white', 'ansi')}`)
      output = await Bun.build(newConfig)
      sources = await getOutputSources(output)
      onBuild && onBuild(output)
      console.log(`${color('green', 'ansi')}Rebuild complete.${color('white', 'ansi')}`)
      console.log(`${color('white', 'ansi')}Watching for changes...${color('white', 'ansi')}`)
      pending = false
    }

    fs.watch(watch, { recursive: true }, (event, filename) => {
      if (!filename)
        return
      const source = absolute(join(watch, filename))
      if (!sources.has(source))
        return
      if (debounce)
        clearTimeout(debounce)
      debounce = setTimeout(rebuild, 50)
    })
  }

  onBuild && onBuild(output)
  if (watch)
    console.log(`${color('white', 'ansi')}Watching for changes...${color('white', 'ansi')}`)
  return output
}
