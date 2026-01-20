import type { BunPlugin } from 'bun'
import type { ResolvedModuleMap } from './types.ts'
import fs from 'node:fs'

export interface WatchOptions {
  onRebuild?: () => Promise<void> | void
  debounce?: number
  test?: boolean
}

/**
 * Get all resolved dependent files from the map (union of all entrypoints' dependent files).
 */
function getAllAbsResolvedDepFiles(resolvedDepFilesMap: ResolvedModuleMap): Set<string> {
  const allFiles = new Set<string>()
  for (const files of resolvedDepFilesMap.values()) {
    for (const file of files)
      allFiles.add(file)
  }
  return allFiles
}

export function watch(
  options: WatchOptions = {},
  resolvedDepFilesMap: ResolvedModuleMap,
): BunPlugin {
  const { onRebuild, debounce = 50, test } = options
  let rebuildFn: (() => Promise<void>) | null = null
  let debounceTimer: Timer | null = null
  let pending = false
  const watchers = new Map<string, fs.FSWatcher>()

  return {
    name: 'watch',
    setup(builder) {
      builder.onEnd(async (result) => {
        if (test)
          return
        if (!result.success)
          return

        rebuildFn = async (): Promise<void> => {
          if (pending)
            return
          pending = true
          await onRebuild?.()
          pending = false
        }

        for (const watcher of watchers.values())
          watcher.close()
        watchers.clear()

        // Get all resolved dependent files from all entrypoints for watching.
        const allAbsResolvedDepFiles = getAllAbsResolvedDepFiles(resolvedDepFilesMap)

        for (const filePath of allAbsResolvedDepFiles) {
          const watcher = fs.watch(filePath, { recursive: false }, (_, filename) => {
            if (!filename)
              return
            if (debounceTimer)
              clearTimeout(debounceTimer)
            debounceTimer = setTimeout(() => {
              rebuildFn?.()
            }, debounce)
          })
          watchers.set(filePath, watcher)
        }
      })
    },
  }
}
