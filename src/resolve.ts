/**
 * @file A Bun build plugin to record all resolved module paths from entrypoints.
 */

import type { BunPlugin } from 'bun'
import { dirname, isAbsolute, normalize } from 'pathe'
import { resolveCwd } from './utils.ts'

/**
 * Record all resolved module paths from entrypoints.
 *
 * This plugin ignores node_modules or built-in modules.
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

  return {
    name: 'resolve',
    setup(builder) {
      builder.onStart(() => {
        // Clear previous mappings in watch mode
        if (moduleToEntrypoint.size > 0)
          moduleToEntrypoint.clear()
        if (resolvedModules.size > 0)
          resolvedModules.clear()
        // Initialize mappings for entrypoints
        for (const entrypoint of resolvedEntrypoints) {
          moduleToEntrypoint.set(entrypoint, entrypoint)
          resolvedModules.add(entrypoint)
        }
      })

      builder.onResolve(
        { filter: /.*/ },
        (args) => {
          // For entrypoints, they are already recorded.
          if (args.importer === '')
            return

          // Check if importer is absolute path first, save some microseconds
          const importer = isAbsolute(args.importer) ? normalize(args.importer) : resolveCwd(args.importer)

          // Use Bun's internal resolver to resolve the module path
          const modulePath = normalize(Bun.resolveSync(args.path, dirname(importer)))
          if (modulePath.match(/^node|^bun/) || modulePath.includes('node_modules'))
            return undefined

          // Find which entrypoint this importer belongs to.
          const entrypoint = moduleToEntrypoint.get(importer)
          if (!entrypoint) {
            console.error(`Failed to find entrypoint for importer ${importer}, it looks like this file is not used by any entrypoints!`)
            return undefined
          }

          // Map the resolved file to its entrypoint.
          // Note: A file may be shared by multiple entrypoints, we keep the first mapping.
          if (!moduleToEntrypoint.has(modulePath))
            moduleToEntrypoint.set(modulePath, entrypoint)
          resolvedModules.add(modulePath)
          return undefined
        },
      )
    },
  }
}
