/* eslint-disable no-console */
import type { BuildOutput } from 'bun'
import type { ResolvedModuleMap } from './types.ts'
import { existsSync, rmSync } from 'node:fs'
import { styleText } from 'node:util'
import { resolve } from 'pathe'
import { cwd, formatDuration } from './utils.ts'

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
    root,
    outdir,
    clean = true,
    watch,
    afterBuild,
    dts = true,
    plugins = [],
    sourcemap = watch ? 'external' : 'none',
    packages = 'external',
    ...rest
  } = config

  if (clean && outdir && existsSync(outdir))
    rmSync(outdir, { recursive: true })

  /**
   * Entrypoint paths resolved based on the root directory.
   */
  const entrypoints = config.entrypoints.map(entry => root ? resolve(root, entry) : resolve(cwd, entry))
  /**
   * Map from entrypoint path to its dependent (relative) module paths. Resolved based on the root directory.
   */
  const resolvedModuleMap: ResolvedModuleMap = new Map<string, Set<string>>()
  /**
   * Set of all resolved module paths.
   */
  const resolvedModules = new Set<string>()

  if (dts || watch)
    plugins.push((await import('./resolve.ts')).resolve(root, entrypoints, resolvedModuleMap, resolvedModules))

  if (dts)
    plugins.push((await import('./dts.ts')).dts(root, entrypoints, resolvedModules))

  const bunConfig = {
    root,
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

          const output = await Bun.build(bunConfig)
          await afterBuild?.(output)

          const rebuildEndTime = performance.now()
          const rebuildCostTime = rebuildEndTime - rebuildStartTime
          console.info(`${styleText('green', '✔')} Build completed in ${styleText('magenta', formatDuration(rebuildCostTime))}`)
        },
      }, resolvedModuleMap),
    )
  }

  const output = await Bun.build(bunConfig)
  await afterBuild?.(output)

  const endTime = performance.now()
  const costTime = endTime - startTime
  console.info(`${styleText('green', '✔')} Build completed in ${styleText('magenta', formatDuration(costTime))}`)

  return output
}
