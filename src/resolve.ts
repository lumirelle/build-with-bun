/**
 * @file A bun build plugin to record dependent (relative) module paths of each entrypoint.
 */

import type { BunPlugin } from 'bun'
import type { ResolvedModuleMap } from './types.ts'
import { dirname, isAbsolute, resolve as pathResolve } from 'pathe'
import { RE_RELATIVE } from './constants.ts'
import { cwd, tryResolveTs } from './utils.ts'

/**
 * Resolve the dependent (relative) module paths of each entrypoint.
 *
 * @param entrypoints The entrypoints to resolve.
 * @param resolvedModuleMap The map to record the dependent (relative) module paths of each entrypoint.
 */
export function resolve(
  entrypoints: string[],
  resolvedModuleMap: ResolvedModuleMap,
  resolvedModules: Set<string>,
): BunPlugin {
  const root = cwd

  /**
   * Map from a module path to its entrypoint. Used to trace back the entrypoint of a module.
   */
  const moduleToEntrypoint = new Map<string, string>()

  /**
   * Handle resolve event and track dependent (relative) module paths.
   */
  const handleResolve = (args: { path: string, importer: string }): undefined => {
    if (!args.importer)
      return undefined
    const importer = root ? pathResolve(root, args.importer) : pathResolve(cwd, args.importer)

    // Find which entrypoint this importer belongs to.
    const entrypoint = moduleToEntrypoint.get(importer)
    if (!entrypoint) {
      console.error(`Failed to find entrypoint for importer ${importer}`)
      return undefined
    }

    const basePath = isAbsolute(args.path)
      ? args.path
      : pathResolve(dirname(importer), args.path)

    // Try to resolve to an actual TypeScript file
    const resolvedPath = tryResolveTs(basePath)
    if (!resolvedPath)
      return undefined

    // Map the resolved file to its entrypoint.
    // Note: A file may be shared by multiple entrypoints, we keep the first mapping.
    if (!moduleToEntrypoint.has(resolvedPath))
      moduleToEntrypoint.set(resolvedPath, entrypoint)

    // Add to the entrypoint's resolved files.
    // If `entrypoint` exists, then `resolvedModuleMap.get(entrypoint)` is guaranteed to be a Set.
    resolvedModuleMap.get(entrypoint)!.add(resolvedPath)

    resolvedModules.add(resolvedPath)

    return undefined
  }

  return {
    name: 'resolve',
    setup(builder) {
      builder.onStart(() => {
        moduleToEntrypoint.clear()
        resolvedModuleMap.clear()
        // Initialize each entrypoint with its own Set and map to itself.
        for (const entrypoint of entrypoints) {
          moduleToEntrypoint.set(entrypoint, entrypoint)
          resolvedModuleMap.set(entrypoint, new Set([entrypoint]))
        }
      })

      // Handle all relative imports (E.g., './command', './command.ts', './command.tsx', etc.).
      // TODO(Lumirelle): Path alias in `tsconfig.json` is not supported yet.
      builder.onResolve({ filter: RE_RELATIVE }, handleResolve)
    },
  }
}
