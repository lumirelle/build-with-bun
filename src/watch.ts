import type { BunPlugin } from 'bun'
import type { ResolvedFilesMap } from './types.ts'
import fs from 'node:fs'
import { dirname as pathDirname } from 'node:path'
import { absolute } from './utils.ts'

export interface WatchOptions {
  onRebuild?: () => Promise<void> | void
  debounce?: number
}

/**
 * Get all resolved files from the map (union of all entrypoints' dependencies).
 */
function getAllResolvedFiles(resolvedFilesMap: ResolvedFilesMap): Set<string> {
  const allFiles = new Set<string>()
  for (const files of resolvedFilesMap.values()) {
    for (const file of files) {
      allFiles.add(file)
    }
  }
  return allFiles
}

export function watch(
  options: WatchOptions = {},
  resolvedFilesMap: ResolvedFilesMap,
): BunPlugin {
  const { onRebuild, debounce = 50 } = options
  let rebuildFn: (() => Promise<void>) | null = null
  let debounceTimer: Timer | null = null
  let pending = false
  const watchers = new Map<string, fs.FSWatcher>()

  return {
    name: 'watch',
    setup(builder) {
      builder.onEnd(async (result) => {
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

        const watchedDirs = new Set<string>()
        // Get all resolved files from all entrypoints for watching.
        const allResolvedFiles = getAllResolvedFiles(resolvedFilesMap)

        for (const filePath of allResolvedFiles) {
          const dir = pathDirname(absolute(filePath))
          if (!watchedDirs.has(dir)) {
            watchedDirs.add(dir)
            const watcher = fs.watch(dir, { recursive: false }, (event, filename) => {
              if (!filename)
                return
              const changedFile = absolute(`${dir}/${filename}`)
              // Re-check against current resolved files (may have changed after rebuild).
              const currentResolvedFiles = getAllResolvedFiles(resolvedFilesMap)
              if (!currentResolvedFiles.has(changedFile))
                return
              if (debounceTimer)
                clearTimeout(debounceTimer)
              debounceTimer = setTimeout(() => {
                rebuildFn?.()
              }, debounce)
            })
            watchers.set(dir, watcher)
          }
        }
      })
    },
  }
}
