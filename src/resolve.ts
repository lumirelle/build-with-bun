/**
 * @file A Bun build plugin to record all resolved module paths from entrypoints.
 */

import type { BunPlugin } from 'bun'
import { dirname, resolve as pathResolve } from 'pathe'
import { RE_RELATIVE } from './constants.ts'
import { resolveCwd, tryResolveTs } from './utils.ts'

/**
 * Resolve the dependent (relative) module paths of each entrypoint.
 *
 * @param resolvedEntrypoints The entrypoints to resolve.
 * @param resolvedModules The set to store all resolved module paths.
 */
export function resolve(
  resolvedEntrypoints: string[],
  resolvedModules: Set<string>,
): BunPlugin {
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
    const importer = resolveCwd(args.importer)

    // Find which entrypoint this importer belongs to.
    const entrypoint = moduleToEntrypoint.get(importer)
    if (!entrypoint) {
      console.error(`Failed to find entrypoint for importer ${importer}, it looks like this file is not used by any entrypoints!`)
      console.error(`All entrypoints: ${resolvedEntrypoints.join(', ')}`)
      return undefined
    }

    const basePath = pathResolve(dirname(importer), args.path)

    // Try to resolve to an actual TypeScript file
    const resolvedPath = tryResolveTs(basePath)
    if (!resolvedPath)
      return undefined

    // Map the resolved file to its entrypoint.
    // Note: A file may be shared by multiple entrypoints, we keep the first mapping.
    if (!moduleToEntrypoint.has(resolvedPath))
      moduleToEntrypoint.set(resolvedPath, entrypoint)
    resolvedModules.add(resolvedPath)

    return undefined
  }

  return {
    name: 'resolve',
    setup(builder) {
      builder.onStart(() => {
        moduleToEntrypoint.clear()
        resolvedModules.clear()
        for (const entrypoint of resolvedEntrypoints) {
          moduleToEntrypoint.set(entrypoint, entrypoint)
          resolvedModules.add(entrypoint)
        }
      })

      // Handle all possible imports (E.g., './command', './command.ts', './command.tsx', etc.).
      // TODO(Lumirelle): Path alias in `tsconfig.json` is not supported yet.
      builder.onResolve({ filter: RE_RELATIVE }, handleResolve)
    },
  }
}
