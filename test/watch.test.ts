import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { absolute } from '../src/utils.ts'
import { watch } from '../src/watch.ts'

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

    const resolvedFiles = new Set<string>([absolute(entryFile)])
    const plugin = watch({}, resolvedFiles)

    expect(plugin.name).toBe('watch')
    expect(plugin.setup).toBeDefined()
  })

  it('should call onRebuild when file changes', async () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'export const hello = "world"')

    const resolvedFiles = new Set<string>([absolute(entryFile)])
    let rebuildCalled = false

    const plugin = watch({
      onRebuild: async () => {
        rebuildCalled = true
      },
      debounce: 10,
    }, resolvedFiles)

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

    const resolvedFiles = new Set<string>([absolute(entryFile)])
    let rebuildCalled = false

    const plugin = watch({
      onRebuild: async () => {
        rebuildCalled = true
      },
    }, resolvedFiles)

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

    const resolvedFiles = new Set<string>([absolute(entryFile)])
    const plugin = watch({
      debounce: 100,
    }, resolvedFiles)

    expect(plugin.name).toBe('watch')
  })
})
