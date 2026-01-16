import type { BunPlugin } from 'bun'
import { dirname, isAbsolute, resolve as pathResolve } from 'node:path'
import { RE_TS } from './filename.ts'
import { absolute } from './utils.ts'

/**
 * Resolve the dependencies of the entrypoints.
 */
export function resolve(
  resolvedFiles: Set<string>,
  entrypointPaths: string[],
): BunPlugin {
  return {
    name: 'resolve',
    setup(builder) {
      builder.onStart(() => {
        resolvedFiles.clear()
        // Mark entrypoints as resolved.
        entrypointPaths.forEach(path => resolvedFiles.add(path))
      })

      builder.onResolve({ filter: RE_TS }, (args) => {
        // Importer path is the file that is importing the current file.
        const importerPath = args.importer ? absolute(args.importer) : null
        if (importerPath && (entrypointPaths.includes(importerPath) || resolvedFiles.has(importerPath))) {
          const resolvedPath = isAbsolute(args.path)
            ? args.path
            : pathResolve(dirname(importerPath), args.path)
          // Mark current file as resolved.
          resolvedFiles.add(resolvedPath)
        }
        return undefined
      })
    },
  }
}
