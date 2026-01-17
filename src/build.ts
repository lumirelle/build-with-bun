/* eslint-disable no-console */
import type { BuildOutput } from 'bun'
import type { ResolvedDepFilesMap } from './types.ts'
import { existsSync, rmSync } from 'node:fs'
import { styleText } from 'node:util'
import { absolute, formatDuration } from './utils.ts'

type BuildConfig = Parameters<typeof Bun.build>[0] & {
  /**
   * Watch for file changes and rebuild automatically.
   * Files to watch are automatically resolved from entrypoints.
   */
  watch?: boolean
  /**
   * Generate .d.ts files for entrypoints (Using `oxc-transform`).
   *
   * @default true
   */
  dts?: boolean
  /**
   * Callback function to be called after the build is complete.
   */
  afterBuild?: (output: BuildOutput) => Promise<void> | void
  /**
   * Specifies if and how to generate source maps.
   *
   * - `"none"` - No source maps are generated
   * - `"linked"` - A separate `*.ext.map` file is generated alongside each
   *   `*.ext` file. A `//# sourceMappingURL` comment is added to the output
   *   file to link the two. Requires `outdir` to be set.
   * - `"inline"` - an inline source map is appended to the output file.
   * - `"external"` - Generate a separate source map file for each input file.
   *   No `//# sourceMappingURL` comment is added to the output file.
   *
   * `true` and `false` are aliases for `"inline"` and `"none"`, respectively.
   *
   * @default "none" or "external" if `watch` is `true`
   *
   * @see {@link outdir} required for `"linked"` maps
   * @see {@link publicPath} to customize the base url of linked source maps
   */
  sourcemap?: 'none' | 'linked' | 'inline' | 'external' | boolean
  /**
   * Clean the output directory before building.
   *
   * @default true
   */
  clean?: boolean
  /**
   * Control whether package dependencies are included to bundle or not.
   * Bun treats any import which path do not start with `.`, `..` or `/` as package.
   *
   * @default "external"
   */
  packages?: 'bundle' | 'external'
}

export async function build(config: BuildConfig): Promise<BuildOutput> {
  const startTime = performance.now()

  const {
    watch,
    afterBuild,
    outdir,
    dts = true,
    plugins = [],
    sourcemap = watch ? 'external' : 'none',
    clean = true,
    packages = 'external',
    ...rest
  } = config

  if (clean && outdir && existsSync(outdir))
    rmSync(outdir, { recursive: true, force: true })

  const absEntrypoints = config.entrypoints.map(e => absolute(e))
  /**
   * Map from absolute entrypoint path to its resolved dependent files. Each entrypoint tracks its own set of dependent files.
   */
  const resolvedDepFilesMap: ResolvedDepFilesMap = new Map<string, Set<string>>()

  if (dts || watch)
    plugins.push((await import('./resolve.ts')).resolve(absEntrypoints, resolvedDepFilesMap))

  if (dts)
    plugins.push((await import('./dts.ts')).dts(absEntrypoints, resolvedDepFilesMap))

  const buildConfig = {
    outdir,
    plugins,
    sourcemap,
    packages,
    ...rest,
  }

  if (watch) {
    plugins.push(
      (await import('./watch.ts')).watch({
        onRebuild: async () => {
          const rebuildStartTime = performance.now()
          console.info('💤 File changed, rebuilding...')
          const output = await Bun.build(buildConfig)
          await afterBuild?.(output)
          const rebuildEndTime = performance.now()
          const rebuildDuration = rebuildEndTime - rebuildStartTime
          console.info(`${styleText('green', '✔')} Build completed in ${styleText('magenta', formatDuration(rebuildDuration))}`)
        },
      }, resolvedDepFilesMap),
    )
  }

  const output = await Bun.build(buildConfig)

  await afterBuild?.(output)

  const endTime = performance.now()
  const duration = endTime - startTime
  console.info(`${styleText('green', '✔')} Build completed in ${styleText('magenta', formatDuration(duration))}`)

  return output
}
