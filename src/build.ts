import type { BuildOutput } from 'bun'
import { existsSync, rmSync } from 'node:fs'
import { absolute } from './utils.ts'

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
}

export async function build(config: BuildConfig): Promise<BuildOutput> {
  const { watch, afterBuild, outdir, dts = true, plugins = [], sourcemap = watch ? 'external' : 'none', ...rest } = config

  // TODO(Lumirelle): Add a flag to keep the output directory.
  if (outdir && existsSync(outdir))
    rmSync(outdir, { recursive: true, force: true })

  const entrypointPaths = config.entrypoints.map(e => absolute(e))
  const resolvedPaths = new Set<string>()

  if (dts || watch)
    plugins.push((await import('./resolve.ts')).resolve(resolvedPaths, entrypointPaths))

  if (dts)
    plugins.push((await import('./dts.ts')).dts(resolvedPaths, entrypointPaths))

  const buildConfig = { outdir, plugins, sourcemap, ...rest }

  if (watch) {
    plugins.push(
      (await import('./watch.ts')).watch({
        onRebuild: async () => {
          const output = await Bun.build(buildConfig)
          await afterBuild?.(output)
        },
      }, resolvedPaths),
    )
  }

  const output = await Bun.build(buildConfig)
  await afterBuild?.(output)

  return output
}
