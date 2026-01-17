import type { BunPlugin } from 'bun'
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, resolve as pathResolve } from 'node:path'
import { RE_RELATIVE, RE_TS } from './filename.ts'
import { absolute } from './utils.ts'

/**
 * Map from entrypoint path to its resolved dependencies.
 */
export type ResolvedFilesMap = Map<string, Set<string>>

/**
 * TypeScript file extensions to try when resolving imports without extension.
 */
const TS_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts']

/**
 * Try to resolve a path to a TypeScript file by adding extensions.
 * Returns the resolved path if found, or null if not found.
 */
function tryResolveTs(basePath: string): string | null {
  // If already has a TS extension, check if it exists
  if (RE_TS.test(basePath)) {
    return existsSync(basePath) ? basePath : null
  }

  // Try adding each extension
  for (const ext of TS_EXTENSIONS) {
    const pathWithExt = `${basePath}${ext}`
    if (existsSync(pathWithExt)) {
      return pathWithExt
    }
  }

  // Try index files
  for (const ext of TS_EXTENSIONS) {
    const indexPath = pathResolve(basePath, `index${ext}`)
    if (existsSync(indexPath)) {
      return indexPath
    }
  }

  return null
}

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

  /**
   * Handle resolve event and track dependencies.
   */
  const handleResolve = (args: { path: string, importer: string }): undefined => {
    // Importer path is the file that is importing the current file.
    const importerPath = args.importer ? absolute(args.importer) : null
    if (!importerPath)
      return undefined

    // Find which entrypoint this importer belongs to.
    const entrypoint = fileToEntrypoint.get(importerPath)
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
  }

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

      // Handle imports with explicit .ts/.tsx extension
      builder.onResolve({ filter: RE_TS }, handleResolve)

      // Handle relative imports without extension (e.g., './command')
      builder.onResolve({ filter: RE_RELATIVE }, handleResolve)
    },
  }
}
