/**
 * @file A Bun build plugin to record all resolved module paths from entrypoints.
 */

import type { BunPlugin } from 'bun'
import { createDebug } from 'obug'
import { dirname, isAbsolute, normalize } from 'pathe'
import { resolveCwd } from './utils.ts'

const debug = createDebug('build-with-bun:resolve', { useColors: true })
const debugDetail = createDebug('build-with-bun:resolve-detail', { useColors: true })

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
        debug('Resolve plugin onStart triggered')

        if (moduleToEntrypoint.size > 0) {
          debug('Clearing previous module to entrypoint mappings')
          moduleToEntrypoint.clear()
        }
        if (resolvedModules.size > 0) {
          debug('Clearing previously resolved modules')
          resolvedModules.clear()
        }

        for (const entrypoint of resolvedEntrypoints) {
          moduleToEntrypoint.set(entrypoint, entrypoint)
          resolvedModules.add(entrypoint)
        }
        debug('Intialized `moduleToEntrypoint` map with entrypoints: %O', moduleToEntrypoint)
        debug('Intialized `resolvedModules` set with entrypoints: %O', resolvedModules)
      })

      builder.onResolve(
        { filter: /.*/ },
        (args) => {
          debug('Resolve plugin onResolve triggered')

          if (args.importer === '') {
            debug('Skipping resolution for entrypoint: %s', args.path)
            return
          }

          // Check if importer is absolute path first, save some microseconds
          const importer = isAbsolute(args.importer) ? normalize(args.importer) : resolveCwd(args.importer)

          // Use Bun's internal resolver to resolve the module path
          const modulePath = normalize(Bun.resolveSync(args.path, dirname(importer)))
          debugDetail('Resolved module path: %s imported by %s', modulePath, importer)
          if (modulePath.match(/^node|^bun/) || modulePath.includes('node_modules')) {
            debug('Skipping resolution for node or bun built-in modules or node_modules: %s', modulePath)
            return undefined
          }

          // Find which entrypoint this importer belongs to.
          const entrypoint = moduleToEntrypoint.get(importer)
          if (!entrypoint) {
            console.error(`Failed to find entrypoint for importer ${importer}, it looks like this file is not used by any entrypoints!`)
            return undefined
          }

          // Map the resolved file to its entrypoint.
          // Note: A file may be shared by multiple entrypoints, we keep the first mapping.
          if (!moduleToEntrypoint.has(modulePath)) {
            moduleToEntrypoint.set(modulePath, entrypoint)
            debug('Record new module to entrypoint mapping: %s -> %s', modulePath, entrypoint)
          }
          resolvedModules.add(modulePath)
          return undefined
        },
      )
    },
  }
}
