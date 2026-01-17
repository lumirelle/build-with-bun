import type { BunPlugin } from 'bun'
import type { ResolvedDepFilesMap } from './types.ts'
import { dirname, isAbsolute, resolve as pathResolve } from 'node:path'
import { RE_RELATIVE, RE_TS, tryResolveTs } from './filename.ts'
import { absolute } from './utils.ts'

/**
 * Resolve the dependent files of the entrypoints. Each entrypoint tracks its own set of dependent files.
 */
export function resolve(
  absEntrypoints: string[],
  resolvedDepFilesMap: ResolvedDepFilesMap,
): BunPlugin {
  /**
   * Map from a file path to its entrypoint. Used to trace back the entrypoint of a file.
   */
  const pathToEntrypoint = new Map<string, string>()

  /**
   * Handle resolve event and track dependent files.
   */
  const handleResolve = (args: { path: string, importer: string }): undefined => {
    // Importer path is the file that is importing the current file.
    const importerPath = args.importer ? absolute(args.importer) : null
    if (!importerPath)
      return undefined

    // Find which entrypoint this importer belongs to.
    const entrypoint = pathToEntrypoint.get(importerPath)
    if (!entrypoint)
      return undefined

    const basePath = isAbsolute(args.path)
      ? args.path
      : pathResolve(dirname(importerPath), args.path)

    // Try to resolve to an actual TypeScript file
    const resolvedPath = tryResolveTs(basePath)
    if (!resolvedPath)
      return undefined

    // Add to the entrypoint's resolved files.
    const entrypointFiles = resolvedDepFilesMap.get(entrypoint)
    if (entrypointFiles)
      entrypointFiles.add(resolvedPath)
    else
      resolvedDepFilesMap.set(entrypoint, new Set([resolvedPath]))

    // Map the resolved file to its entrypoint.
    // Note: A file may be shared by multiple entrypoints, we keep the first mapping.
    if (!pathToEntrypoint.has(resolvedPath))
      pathToEntrypoint.set(resolvedPath, entrypoint)

    return undefined
  }

  return {
    name: 'resolve',
    setup(builder) {
      builder.onStart(() => {
        resolvedDepFilesMap.clear()
        pathToEntrypoint.clear()
        // Initialize each entrypoint with its own Set and map to itself.
        for (const entrypoint of absEntrypoints) {
          resolvedDepFilesMap.set(entrypoint, new Set([entrypoint]))
          pathToEntrypoint.set(entrypoint, entrypoint)
        }
      })

      // Handle imports with explicit .ts/.tsx extension
      builder.onResolve({ filter: RE_TS }, handleResolve)

      // Handle relative imports without extension (e.g., './command')
      builder.onResolve({ filter: RE_RELATIVE }, handleResolve)
    },
  }
}
