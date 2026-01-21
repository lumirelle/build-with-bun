/* eslint-disable no-console */
import type { BuildOutput } from 'bun'
import { existsSync, rmSync } from 'node:fs'
import { styleText } from 'node:util'
import { formatDuration, resolveCwd } from './utils.ts'

type BuildConfig = Bun.BuildConfig & {
  // Below are `Bun.BuildConfig` options with some modifications or clarifications

  /**
   * An array of paths corresponding to the entrypoints of our application. One bundle will be generated for each entrypoint.
   *
   * Relative paths are resolved based on `CWD`.
   */
  entrypoints: Bun.BuildConfig['entrypoints']
  /**
   * The root directory of the project.
   *
   * @default The common ancestor directory of all entrypoints
   * @see https://bun.com/docs/bundler#root
   */
  root?: Bun.BuildConfig['root']
  /**
   * The directory where output files will be written.
   *
   * If outdir is not passed to the JavaScript API, bundled code will not be written to disk. Bundled files are returned in an array of BuildArtifact objects. These objects are Blobs with extra properties; see Outputs for complete documentation.
   *
   * @see https://bun.com/docs/bundler#outdir
   * @see https://bun.com/docs/bundler#outputs
   */
  outdir?: Bun.BuildConfig['outdir']
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
   * @see {@link outdir} required for `"linked"` maps
   * @see {@link publicPath} to customize the base url of linked source maps
   */
  sourcemap?: Bun.BuildConfig['sourcemap']
  /**
   * Control whether package dependencies are included to bundle or not.
   * Bun treats any import which path do not start with `.`, `..` or `/` as package.
   *
   * @default "external"
   */
  packages?: Bun.BuildConfig['packages']

  // Below is additional options

  /**
   * Clean the output directory before building.
   *
   * @default true
   */
  clean?: boolean
  /**
   * Enable plugin to generate .d.ts files for entrypoints (Using `oxc-transform`).
   *
   * @default true
   */
  dts?: boolean
  /**
   * Enable plugin to watch for file changes and rebuild automatically.
   *
   * @default false
   */
  watch?: boolean
  /**
   * Callback function to be called after the build is complete.
   */
  afterBuild?: (output: BuildOutput) => Promise<void> | void
  /**
   * Suppress build output logs. E.g., "Build completed in XXms".
   *
   * @default false
   */
  silent?: boolean
  /**
   * Used for testing purposes only. When enabled, build will return some extra debug output, and watch mode will not take effect.
   *
   * @internal
   */
  test?: boolean
}

export async function build(config: BuildConfig): Promise<BuildOutput> {
  const startTime = performance.now()

  const {
    entrypoints,
    root,
    outdir,
    // Below is additional options
    clean = true,
    dts = true,
    afterBuild,
    watch,
    silent,
    test,
    // Above is additional options
    plugins = [],
    sourcemap = watch ? 'external' : 'none',
    packages = 'external',
    ...rest
  } = config

  if (clean && outdir && existsSync(outdir))
    rmSync(outdir, { recursive: true })

  /**
   * Resolved entrypoint paths based on CWD.
   */
  const resolvedEntrypoints = entrypoints.map(entry => resolveCwd(entry))
  /**
   * Set of paths for all resolved modules.
   */
  const resolvedModules = new Set<string>()

  if (dts || watch) {
    plugins.push((await import('./resolve.ts')).resolve(
      resolvedEntrypoints,
      resolvedModules,
    ))
  }

  if (dts) {
    plugins.push((await import('./dts.ts')).dts(
      root,
      resolvedEntrypoints,
      resolvedModules,
    ))
  }

  const bunConfig = {
    entrypoints,
    root,
    outdir,
    // We create `bunConfig` with plugins now, and add more plugins later
    // It's a reference type, so we can do this safely, all changes will take effect to `bunConfig`
    // The same to `entrypoints` and `rest`
    plugins,
    sourcemap,
    packages,
    ...rest,
  }

  if (watch) {
    plugins.push(
      (await import('./watch.ts')).watch({
        test,
        onRebuild: async () => {
          const rebuildStartTime = performance.now()
          if (!silent)
            console.info(styleText('yellow', '⭮ Rebuilding...'))

          const output = await Bun.build(bunConfig)
          await afterBuild?.(output)

          const rebuildEndTime = performance.now()
          const rebuildCostTime = rebuildEndTime - rebuildStartTime
          if (!silent)
            console.info(`${styleText('green', '✔')} Build completed in ${styleText('magenta', formatDuration(rebuildCostTime))}`)
        },
      }, resolvedModules),
    )
  }

  const output = await Bun.build(bunConfig)
  await afterBuild?.(output)

  const endTime = performance.now()
  const costTime = endTime - startTime
  if (!silent)
    console.info(`${styleText('green', '✔')} Build completed in ${styleText('magenta', formatDuration(costTime))}`)

  if (test) {
    // @ts-expect-error internal testing only
    output._sourcemap = sourcemap
    // @ts-expect-error internal testing only
    output._packages = packages
    // @ts-expect-error internal testing only
    output._absoluteEntrypoints = [...resolvedEntrypoints]
    // @ts-expect-error internal testing only
    output._pluginNames = plugins.map(plugin => plugin.name)
  }
  return output
}
