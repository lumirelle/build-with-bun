/* eslint-disable no-console */
import type { BuildOutput } from 'bun'
import { existsSync, rmSync, statSync } from 'node:fs'
import { styleText } from 'node:util'
import { isAbsolute, normalize } from 'pathe'
import { formatDuration, resolveCwd } from './utils.ts'

export type BuildConfig = Bun.BuildConfig & {
  // Below are `Bun.BuildConfig` options with some modifications or clarifications

  /**
   * An array of paths corresponding to the entrypoints of our application. One bundle will be generated for each entrypoint.
   *
   * This can only accept file paths. Relative paths are resolved based on `CWD`.
   *
   * What's more, we does not automatically resolve file extensions for entrypoints.
   *
   * @example
   * ```ts
   * // If exists:
   * // - (cwd)
   * //   - /src
   * //     - index.ts
   * //     - cli.ts
   * // Valid entrypoints:
   * [
   *   './src/index.ts',
   *   './src/cli.ts',
   * ]
   * // Invalid entrypoints:
   * [
   *  './src/index',      // Missing file extension
   *  './src',            // Directory path
   *  './src/missing.ts', // Non-existing file
   * ]
   * ```
   *
   * @example
   * ```ts
   * // If exists:
   * // - (cwd)
   * //   - /lib
   * //     - main.jsx
   * //     - helper    // No extension file
   * // Valid entrypoints:
   * [
   *   './lib/main.jsx',
   *   './lib/helper',
   * ]
   * ```
   */
  entrypoints: Bun.BuildConfig['entrypoints']
  /**
   * The root directory of the project.
   *
   * This affects how output `.js` & `.d.ts` files are structured in `outdir`.
   *
   * @example
   * ```ts
   * // If we set:
   * {
   *   entrypoints: ['./src/index.ts'],
   *   root: './src'
   *   outdir: './dist'
   * }
   * // The output file will be:
   * // - (cwd)
   * //   - /dist
   * //     - index.js
   * ```
   *
   * @example
   * ```ts
   * // If we set:
   * {
   *   entrypoints: ['./src/index.ts'],
   *   root: './'
   *   outdir: './dist'
   * }
   * // The output file will be:
   * // - (cwd)
   * //   - /dist
   * //     - /src
   * //       - index.js
   * ```
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
   * Also, `dts` plugin will not work without `outdir` specified.
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
   * @default "none", or "external" when `watch` is `true`
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
   * Clean `outdir` before building.
   *
   * @default true
   */
  clean?: boolean
  /**
   * Enable plugin to generate isolated declaration for each resolved TypeScript module (Using `oxc-transform`).
   *
   * @default true
   */
  dts?: boolean
  /**
   * Enable plugin to watch for source file changes and rebuild automatically.
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
   * Used for testing purposes only. When enabled, build function will return some extra debug data, and watch mode will not take effect.
   *
   * @internal
   */
  test?: boolean
}

/**
 * Build the project with given configuration using Bun.
 *
 * @param config Build configuration
 * @returns Build output
 */
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

  // Validate entrypoints, entrypoints must be files with extensions
  for (const entry of entrypoints) {
    if (!existsSync(entry) || statSync(entry).isDirectory())
      throw new Error(`Entrypoint file not found: ${entry}`)
  }

  if (outdir && clean && existsSync(outdir))
    rmSync(outdir, { recursive: true })

  /**
   * Resolved entrypoint paths based on CWD.
   */
  const resolvedEntrypoints = entrypoints.map(
    // Check if entry is absolute path first, save some microseconds
    entry => isAbsolute(entry) ? normalize(entry) : resolveCwd(entry),
  )
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
        test,
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
    output._resolvedEntrypoints = [...resolvedEntrypoints]
    // @ts-expect-error internal testing only
    output._pluginNames = plugins.map(plugin => plugin.name)
  }
  return output
}
