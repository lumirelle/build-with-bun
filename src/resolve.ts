import type { BunPlugin } from 'bun'
import { dirname, isAbsolute, resolve as pathResolve } from 'node:path'
import { RE_TS } from './filename.ts'
import { absolute } from './utils.ts'

/**
 * Map from entrypoint path to its resolved dependencies.
 */
export type ResolvedFilesMap = Map<string, Set<string>>

/**
 * Resolve the dependencies of the entrypoints.
 * Each entrypoint tracks its own set of dependencies.
 */
export function resolve(
  resolvedFilesMap: ResolvedFilesMap,
  entrypointPaths: string[],
): BunPlugin {
  /**
   * Map from file path to its entrypoint.
   * Used to trace back which entrypoint a file belongs to.
   */
  const fileToEntrypoint = new Map<string, string>()

  return {
    name: 'resolve',
    setup(builder) {
      builder.onStart(() => {
        resolvedFilesMap.clear()
        fileToEntrypoint.clear()
        // Initialize each entrypoint with its own Set and map to itself.
        for (const entrypoint of entrypointPaths) {
          resolvedFilesMap.set(entrypoint, new Set([entrypoint]))
          fileToEntrypoint.set(entrypoint, entrypoint)
        }
      })

      builder.onResolve({ filter: RE_TS }, (args) => {
        // Importer path is the file that is importing the current file.
        const importerPath = args.importer ? absolute(args.importer) : null
        if (!importerPath)
          return undefined

        // Find which entrypoint this importer belongs to.
        const entrypoint = fileToEntrypoint.get(importerPath)
        if (!entrypoint)
          return undefined

        const resolvedPath = isAbsolute(args.path)
          ? args.path
          : pathResolve(dirname(importerPath), args.path)

        // Add to the entrypoint's resolved files.
        const entrypointFiles = resolvedFilesMap.get(entrypoint)
        if (entrypointFiles) {
          entrypointFiles.add(resolvedPath)
        }

        // Map the resolved file to its entrypoint.
        // Note: A file may be shared by multiple entrypoints, we keep the first mapping.
        if (!fileToEntrypoint.has(resolvedPath)) {
          fileToEntrypoint.set(resolvedPath, entrypoint)
        }

        return undefined
      })
    },
  }
}
