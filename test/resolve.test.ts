import type { ResolvedFilesMap } from '../src/resolve.ts'
import { beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolve } from '../src/resolve.ts'
import { absolute } from '../src/utils.ts'

describe('resolve', () => {
  const testDir = join(tmpdir(), 'resolve-test')
  let resolvedFilesMap: ResolvedFilesMap

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
    resolvedFilesMap = new Map()
  })

  it('should add entrypoints to resolvedFilesMap on start', async () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'export const hello = "world"')

    const entrypointPaths = [absolute(entryFile)]
    const plugin = resolve(resolvedFilesMap, entrypointPaths)

    const startCallbacks: Array<() => void> = []
    const builder = {
      config: {
        entrypoints: [entryFile],
      },
      onStart: (callback: () => void) => {
        startCallbacks.push(callback)
      },
      onResolve: () => {},
    } as any

    plugin.setup(builder)
    startCallbacks.forEach(cb => cb())

    const entrypointFiles = resolvedFilesMap.get(absolute(entryFile))
    expect(entrypointFiles).toBeDefined()
    expect(entrypointFiles?.has(absolute(entryFile))).toBe(true)
  })

  it('should resolve dependencies from entrypoints', () => {
    const entryFile = join(testDir, 'index.ts')
    const utilsFile = join(testDir, 'utils.ts')
    writeFileSync(entryFile, 'export { foo } from "./utils.ts"')
    writeFileSync(utilsFile, 'export const foo = "bar"')

    const entrypointPaths = [absolute(entryFile)]
    const plugin = resolve(resolvedFilesMap, entrypointPaths)

    const startCallbacks: Array<() => void> = []
    const resolveCallbacks: Array<(args: any) => any> = []
    const builder = {
      config: {
        entrypoints: [entryFile],
      },
      onStart: (callback: () => void) => {
        startCallbacks.push(callback)
      },
      onResolve: (options: any, callback: (args: any) => any) => {
        resolveCallbacks.push(callback)
      },
    } as any

    plugin.setup(builder)
    startCallbacks.forEach(cb => cb())

    const resolveCallback = resolveCallbacks[0]
    expect(resolveCallback).toBeDefined()
    if (resolveCallback) {
      const result = resolveCallback({
        path: './utils.ts',
        importer: entryFile,
      })

      expect(result).toBeUndefined()
      const entrypointFiles = resolvedFilesMap.get(absolute(entryFile))
      expect(entrypointFiles?.has(absolute(utilsFile))).toBe(true)
    }
  })

  it('should not resolve files from non-entrypoint imports', () => {
    const entryFile = join(testDir, 'index.ts')
    const otherFile = join(testDir, 'other.ts')
    writeFileSync(entryFile, 'export const hello = "world"')
    writeFileSync(otherFile, 'export const other = "value"')

    const entrypointPaths = [absolute(entryFile)]
    const plugin = resolve(resolvedFilesMap, entrypointPaths)

    const startCallbacks: Array<() => void> = []
    const resolveCallbacks: Array<(args: any) => any> = []
    const builder = {
      config: {
        entrypoints: [entryFile],
      },
      onStart: (callback: () => void) => {
        startCallbacks.push(callback)
      },
      onResolve: (options: any, callback: (args: any) => any) => {
        resolveCallbacks.push(callback)
      },
    } as any

    plugin.setup(builder)
    startCallbacks.forEach(cb => cb())

    const resolveCallback = resolveCallbacks[0]
    expect(resolveCallback).toBeDefined()
    if (resolveCallback) {
      const result = resolveCallback({
        path: './other.ts',
        importer: otherFile,
      })

      expect(result).toBeUndefined()
      const entrypointFiles = resolvedFilesMap.get(absolute(entryFile))
      expect(entrypointFiles?.has(absolute(otherFile))).toBe(false)
    }
  })

  it('should track dependencies separately for multiple entrypoints', () => {
    const entryFile1 = join(testDir, 'entry1.ts')
    const entryFile2 = join(testDir, 'entry2.ts')
    const utils1File = join(testDir, 'utils1.ts')
    const utils2File = join(testDir, 'utils2.ts')
    writeFileSync(entryFile1, 'export { foo } from "./utils1.ts"')
    writeFileSync(entryFile2, 'export { bar } from "./utils2.ts"')
    writeFileSync(utils1File, 'export const foo = "foo"')
    writeFileSync(utils2File, 'export const bar = "bar"')

    const entrypointPaths = [absolute(entryFile1), absolute(entryFile2)]
    const plugin = resolve(resolvedFilesMap, entrypointPaths)

    const startCallbacks: Array<() => void> = []
    const resolveCallbacks: Array<(args: any) => any> = []
    const builder = {
      config: {
        entrypoints: [entryFile1, entryFile2],
      },
      onStart: (callback: () => void) => {
        startCallbacks.push(callback)
      },
      onResolve: (options: any, callback: (args: any) => any) => {
        resolveCallbacks.push(callback)
      },
    } as any

    plugin.setup(builder)
    startCallbacks.forEach(cb => cb())

    const resolveCallback = resolveCallbacks[0]
    expect(resolveCallback).toBeDefined()
    if (resolveCallback) {
      // entry1 imports utils1
      resolveCallback({
        path: './utils1.ts',
        importer: entryFile1,
      })

      // entry2 imports utils2
      resolveCallback({
        path: './utils2.ts',
        importer: entryFile2,
      })

      // Check entry1's dependencies
      const entry1Files = resolvedFilesMap.get(absolute(entryFile1))
      expect(entry1Files?.has(absolute(utils1File))).toBe(true)
      expect(entry1Files?.has(absolute(utils2File))).toBe(false)

      // Check entry2's dependencies
      const entry2Files = resolvedFilesMap.get(absolute(entryFile2))
      expect(entry2Files?.has(absolute(utils2File))).toBe(true)
      expect(entry2Files?.has(absolute(utils1File))).toBe(false)
    }
  })
})
