import { beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from '../src/build.ts'
import { resolve } from '../src/resolve.ts'
import { resolveCwd } from '../src/utils.ts'

describe('resolve', () => {
  const testDir = join(tmpdir(), 'resolve-test')
  const resolvedModules = new Set<string>()

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
    resolvedModules.clear()
  })

  it('should add entrypoints to resolvedModules on start', async () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'export const hello = "world"')

    const resolvedEntry = resolveCwd(entryFile)
    const entrypointPaths = [resolvedEntry]

    await build({
      entrypoints: [entryFile],
      dts: false,
      plugins: [
        resolve(entrypointPaths, resolvedModules),
      ],
    })

    expect(resolvedModules.has(resolvedEntry)).toBe(true)
  })

  it('should resolve dependent modules to resolvedModules from entrypoints', async () => {
    const entryFile = join(testDir, 'index.ts')
    const utilsFile = join(testDir, 'utils.ts')
    writeFileSync(entryFile, 'export { foo } from "./utils.ts"')
    writeFileSync(utilsFile, 'export const foo = "bar"')

    const resolvedEntry = resolveCwd(entryFile)
    const resolvedUtils = resolveCwd(utilsFile)
    const entrypointPaths = [resolvedEntry]

    await build({
      entrypoints: [entryFile],
      dts: false,
      plugins: [
        resolve(entrypointPaths, resolvedModules),
      ],
    })

    expect(resolvedModules.has(resolvedEntry)).toBe(true)
    expect(resolvedModules.has(resolvedUtils)).toBe(true)
  })

  it('should not resolve files from non-entrypoint imports', async () => {
    const entryFile = join(testDir, 'index.ts')
    const otherFile = join(testDir, 'other.ts')
    writeFileSync(entryFile, 'export const hello = "world"')
    writeFileSync(otherFile, 'export const other = "value"')

    const resolvedEntry = resolveCwd(entryFile)
    const resolvedOther = resolveCwd(otherFile)
    const entrypointPaths = [resolvedEntry]

    await build({
      entrypoints: [entryFile],
      dts: false,
      plugins: [
        resolve(entrypointPaths, resolvedModules),
      ],
    })

    expect(resolvedModules.has(resolvedEntry)).toBe(true)
    expect(resolvedModules.has(resolvedOther)).toBe(false)
  })

  it('should resolve ts imports without file extension', async () => {
    const entryFile = join(testDir, 'index.ts')
    const commandFile = join(testDir, 'command.ts')
    writeFileSync(entryFile, 'export * as cmd from "./command"')
    writeFileSync(commandFile, 'export const run = () => {}')

    const resolvedEntry = resolveCwd(entryFile)
    const resolvedCommand = resolveCwd(commandFile)
    const entrypointPaths = [resolvedEntry]

    await build({
      entrypoints: [entryFile],
      dts: false,
      plugins: [
        resolve(entrypointPaths, resolvedModules),
      ],
    })

    expect(resolvedModules.has(resolvedEntry)).toBe(true)
    expect(resolvedModules.has(resolvedCommand)).toBe(true)
  })

  it('should resolve tsx imports without file extension', async () => {
    const entryFile = join(testDir, 'index.ts')
    const componentFile = join(testDir, 'Component.tsx')
    writeFileSync(entryFile, 'export { Component } from "./Component"')
    writeFileSync(componentFile, 'export const Component = () => <div />')

    const resolvedEntry = resolveCwd(entryFile)
    const resolvedComponent = resolveCwd(componentFile)
    const entrypointPaths = [resolvedEntry]

    await build({
      entrypoints: [entryFile],
      dts: false,
      plugins: [
        resolve(entrypointPaths, resolvedModules),
      ],
    })

    expect(resolvedModules.has(resolvedEntry)).toBe(true)
    expect(resolvedModules.has(resolvedComponent)).toBe(true)
  })

  it('should track dependencies separately for multiple entrypoints', async () => {
    const entryFile1 = join(testDir, 'entry1.ts')
    const entryFile2 = join(testDir, 'entry2.ts')
    const utils1File = join(testDir, 'utils1.ts')
    const utils2File = join(testDir, 'utils2.ts')
    writeFileSync(entryFile1, 'export { foo } from "./utils1.ts"')
    writeFileSync(entryFile2, 'export { bar } from "./utils2.ts"')
    writeFileSync(utils1File, 'export const foo = "foo"')
    writeFileSync(utils2File, 'export const bar = "bar"')

    const resolvedEntry1 = resolveCwd(entryFile1)
    const resolvedEntry2 = resolveCwd(entryFile2)
    const resolvedUtils1 = resolveCwd(utils1File)
    const resolvedUtils2 = resolveCwd(utils2File)
    const entrypointPaths = [resolvedEntry1, resolvedEntry2]

    await build({
      entrypoints: [entryFile1, entryFile2],
      dts: false,
      plugins: [
        resolve(entrypointPaths, resolvedModules),
      ],
    })

    expect(resolvedModules.has(resolvedEntry1)).toBe(true)
    expect(resolvedModules.has(resolvedEntry2)).toBe(true)
    expect(resolvedModules.has(resolvedUtils1)).toBe(true)
    expect(resolvedModules.has(resolvedUtils2)).toBe(true)
  })
})
