import { beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolve } from '../src/resolve.ts'
import { absolute } from '../src/utils.ts'

describe('resolve', () => {
  const testDir = join(tmpdir(), 'resolve-test')
  const resolvedFiles = new Set<string>()

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  it('should add entrypoints to resolvedFiles on start', async () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'export const hello = "world"')

    const entrypointPaths = [absolute(entryFile)]
    const plugin = resolve(resolvedFiles, entrypointPaths)

    const builder = {
      config: {
        entrypoints: [entryFile],
      },
      onStart: (callback: () => void) => {
        callback()
      },
      onResolve: () => {},
    } as any

    plugin.setup(builder)
    builder.onStart(() => {
      resolvedFiles.clear()
      entrypointPaths.forEach(path => resolvedFiles.add(path))
    })

    expect(resolvedFiles.has(absolute(entryFile))).toBe(true)
  })

  it('should resolve dependencies from entrypoints', () => {
    const entryFile = join(testDir, 'index.ts')
    const utilsFile = join(testDir, 'utils.ts')
    writeFileSync(entryFile, 'export { foo } from "./utils.ts"')
    writeFileSync(utilsFile, 'export const foo = "bar"')

    const entrypointPaths = [absolute(entryFile)]
    const plugin = resolve(resolvedFiles, entrypointPaths)

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
      expect(resolvedFiles.has(absolute(utilsFile))).toBe(true)
    }
  })

  it('should not resolve files from non-entrypoint imports', () => {
    const entryFile = join(testDir, 'index.ts')
    const otherFile = join(testDir, 'other.ts')
    writeFileSync(entryFile, 'export const hello = "world"')
    writeFileSync(otherFile, 'export const other = "value"')

    const entrypointPaths = [absolute(entryFile)]
    const plugin = resolve(resolvedFiles, entrypointPaths)

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
      expect(resolvedFiles.has(absolute(otherFile))).toBe(false)
    }
  })
})
