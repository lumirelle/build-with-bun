/* eslint-disable no-console */
import type { BunPlugin } from 'bun'
import { color } from 'bun' with { type: 'macro' }
import fs from 'node:fs'
import { dirname as pathDirname } from 'node:path'
import { absolute } from './utils.ts'

export interface WatchOptions {
  onRebuild?: () => Promise<void> | void
  debounce?: number
}

export function watch(
  options: WatchOptions = {},
  resolvedFiles: Set<string>,
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
          console.log(`${color('blue', 'ansi')}Rebuilding...${color('white', 'ansi')}`)
          await onRebuild?.()
          console.log(`${color('green', 'ansi')}Rebuild complete.${color('white', 'ansi')}`)
          console.log(`${color('white', 'ansi')}Watching for changes...${color('white', 'ansi')}`)
          pending = false
        }

        for (const watcher of watchers.values())
          watcher.close()
        watchers.clear()

        const watchedDirs = new Set<string>()

        for (const filePath of resolvedFiles) {
          const dir = pathDirname(absolute(filePath))
          if (!watchedDirs.has(dir)) {
            watchedDirs.add(dir)
            const watcher = fs.watch(dir, { recursive: false }, (event, filename) => {
              if (!filename)
                return
              const changedFile = absolute(`${dir}/${filename}`)
              if (!resolvedFiles.has(changedFile))
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

        console.log(`${color('white', 'ansi')}Watching for changes...${color('white', 'ansi')}`)
      })
    },
  }
}
