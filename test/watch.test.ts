import type { ResolvedFilesMap } from '../src/types.ts'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { absolute } from '../src/utils.ts'
import { watch } from '../src/watch.ts'

/**
 * Helper to create a ResolvedFilesMap from entrypoint and its files.
 */
function createResolvedFilesMap(entrypoint: string, files: string[]): ResolvedFilesMap {
  const map: ResolvedFilesMap = new Map()
  map.set(entrypoint, new Set(files))
  return map
}

describe('watch', () => {
  const testDir = join(tmpdir(), 'watch-test')

  beforeEach(() => {
    if (existsSync(testDir))
      rmSync(testDir, { recursive: true, force: true })
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir))
      rmSync(testDir, { recursive: true, force: true })
  })

  it('should create watch plugin', () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'export const hello = "world"')

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap = createResolvedFilesMap(entrypointPath, [entrypointPath])
    const plugin = watch({}, resolvedFilesMap)

    expect(plugin.name).toBe('watch')
    expect(plugin.setup).toBeDefined()
  })

  it('should call onRebuild when file changes', async () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'export const hello = "world"')

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap = createResolvedFilesMap(entrypointPath, [entrypointPath])
    let rebuildCalled = false

    const plugin = watch({
      onRebuild: async () => {
        rebuildCalled = true
      },
      debounce: 10,
    }, resolvedFilesMap)

    const endCallbacks: Array<(result: any) => Promise<void>> = []
    const builder = {
      config: {
        entrypoints: [entryFile],
      },
      onEnd: (callback: (result: any) => Promise<void>) => {
        endCallbacks.push(callback)
      },
    } as any

    plugin.setup(builder)

    expect(endCallbacks.length).toBe(1)
    await endCallbacks[0]!({ success: true })

    await new Promise(resolve => setTimeout(resolve, 20))

    writeFileSync(entryFile, 'export const hello = "updated"')

    await new Promise(resolve => setTimeout(resolve, 30))

    expect(rebuildCalled).toBe(true)
  })

  it('should not call onRebuild when build fails', async () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'export const hello = "world"')

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap = createResolvedFilesMap(entrypointPath, [entrypointPath])
    let rebuildCalled = false

    const plugin = watch({
      onRebuild: async () => {
        rebuildCalled = true
      },
    }, resolvedFilesMap)

    const builder = {
      config: {
        entrypoints: [entryFile],
      },
      onEnd: async (callback: (result: any) => Promise<void>) => {
        await callback({ success: false })
      },
    } as any

    plugin.setup(builder)
    await builder.onEnd(async (result: any) => {
      if (result.success) {
        // Watch plugin should not set up watchers on failed builds
      }
    })

    expect(rebuildCalled).toBe(false)
  })

  it('should use custom debounce value', () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'export const hello = "world"')

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap = createResolvedFilesMap(entrypointPath, [entrypointPath])
    const plugin = watch({
      debounce: 100,
    }, resolvedFilesMap)

    expect(plugin.name).toBe('watch')
  })

  it('should watch files from multiple entrypoints', () => {
    const entry1File = join(testDir, 'entry1.ts')
    const entry2File = join(testDir, 'entry2.ts')
    const utils1File = join(testDir, 'utils1.ts')
    const utils2File = join(testDir, 'utils2.ts')
    writeFileSync(entry1File, 'export { foo } from "./utils1.ts"')
    writeFileSync(entry2File, 'export { bar } from "./utils2.ts"')
    writeFileSync(utils1File, 'export const foo = "foo"')
    writeFileSync(utils2File, 'export const bar = "bar"')

    const entry1Path = absolute(entry1File)
    const entry2Path = absolute(entry2File)
    const resolvedFilesMap: ResolvedFilesMap = new Map()
    resolvedFilesMap.set(entry1Path, new Set([entry1Path, absolute(utils1File)]))
    resolvedFilesMap.set(entry2Path, new Set([entry2Path, absolute(utils2File)]))

    const plugin = watch({}, resolvedFilesMap)

    expect(plugin.name).toBe('watch')
    expect(plugin.setup).toBeDefined()
  })
})
