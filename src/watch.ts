import type { BunPlugin } from 'bun'
import fs from 'node:fs'

export interface WatchOptions {
  /**
   * The callback function to be called when a rebuild is triggered.
   */
  onRebuild?: () => Promise<void> | void
  /**
   * Debounce time in milliseconds for rebuild calls.
   *
   * @default 50
   */
  debounce?: number
  /**
   * Internal flag for testing purposes. If true, the watcher will not be set up.
   *
   * @internal
   */
  test?: boolean
}

export function watch(
  options: WatchOptions = {},
  resolvedModules: Set<string>,
): BunPlugin {
  const { onRebuild, debounce = 50, test } = options
  let rebuildFn: (() => Promise<void>) | null = null
  let debounceTimer: Timer | null = null
  let pending = false
  const watcherMap = new Map<string, fs.FSWatcher>()

  return {
    name: 'watch',
    setup(builder) {
      builder.onEnd(async () => {
        if (test)
          return

        rebuildFn = async (): Promise<void> => {
          // FIXME(Lumirelle): This may cause missed rebuilds if file changes happen during an ongoing rebuild.
          if (pending)
            return
          pending = true
          await onRebuild?.()
          pending = false
        }

        // Clean up watchers for removed modules
        for (const module of watcherMap.keys()) {
          if (resolvedModules.has(module))
            continue
          watcherMap.get(module)?.close()
          watcherMap.delete(module)
        }

        // Set up watchers for new modules
        for (const filePath of resolvedModules) {
          if (watcherMap.has(filePath))
            continue
          const watcher = fs.watch(filePath, { recursive: false }, (_, filename) => {
            if (!filename) {
              console.error(`Filename not provided for changed file: ${filePath}`)
              return
            }
            if (debounceTimer)
              clearTimeout(debounceTimer)
            debounceTimer = setTimeout(() => {
              rebuildFn?.()
            }, debounce)
          }).on('error', (error) => {
            console.error(`Watcher error for file ${filePath}:`, error)
          })
          watcherMap.set(filePath, watcher)
        }
      })

      // TODO(Lumirelle): Can we safely close watchers on exit?
    },
  }
}
