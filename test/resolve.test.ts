import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'pathe'
import { build } from '../src/build.ts'
import { resolve } from '../src/resolve.ts'
import { resolveCwd } from '../src/utils.ts'

describe('resolve', () => {
  const testDir = resolveCwd(join('.temp', 'resolve-test'))
  const resolvedModules = new Set<string>()

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
    resolvedModules.clear()
  })

  afterEach(() => {
    if (existsSync(testDir))
      rmSync(testDir, { recursive: true, force: true })
  })

  it('should add entrypoints to resolvedModules on start', async () => {
    const entryFile = join(testDir, 'index.ts')
    await Bun.write(entryFile, 'export const hello = "world"')

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

  it.each(
    [
      ['ts', 'export const foo = "bar"'],
      ['tsx', 'export const Component = () => "<div />" // Mocked'],
      ['mts', 'export const foo = "bar"'],
      ['cts', 'exports.foo = "bar"'],
      ['js', 'exports.foo = "bar"'],
      ['jsx', 'exports.Component = () => "<div />" // Mocked'],
      ['mjs', 'export const foo = "bar"'],
      ['cjs', 'exports.foo = "bar"'],
    ],
  )('should resolve dependent %s modules', async (ext, content) => {
    const entryFile = join(testDir, 'index.ts')
    const utilsFile = join(testDir, `utils.${ext}`)
    await Bun.write(entryFile, `export { foo } from "./utils.${ext}"`)
    await Bun.write(utilsFile, content)

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

  it.each(
    [
      ['ts', 'export const run = () => {}'],
      ['tsx', 'export const Component = () => "<div />" // Mocked'],
      ['mts', 'export const run = () => {}'],
      ['cts', 'exports.run = () => {}'],
      ['js', 'exports.run = () => {}'],
      ['jsx', 'exports.Component = () => "<div />" // Mocked'],
      ['mjs', 'export const run = () => {}'],
      ['cjs', 'exports.run = () => {}'],
    ],
  )('should resolve dependent %s modules without file extension', async (ext, content) => {
    const entryFile = join(testDir, 'index.ts')
    const commandFile = join(testDir, `command.${ext}`)
    await Bun.write(entryFile, 'export * as cmd from "./command"')
    await Bun.write(commandFile, content)
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

  it('should resolve path alias from tsconfig.json', async () => {
    const entryFile = join(testDir, 'index.ts')
    await Bun.write(entryFile, 'import { createresolvedmodules } from "@test/helper.ts"; export const value = createresolvedmodules;')

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
    expect(resolvedModules.has(resolveCwd(join('test', 'helper.ts')))).toBe(true)
  })

  it('should not resolve files from non-entrypoint imports', async () => {
    const entryFile = join(testDir, 'index.ts')
    const otherFile = join(testDir, 'other.ts')
    await Bun.write(entryFile, 'export const hello = "world"')
    await Bun.write(otherFile, 'export const other = "value"')

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

  it('should not resolve external modules', async () => {
    const entryFile = join(testDir, 'index.ts')
    await Bun.write(entryFile, 'import fs from "bun"; export const hello = fs.existsSync;')

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
    expect([...resolvedModules].some(mod => mod.includes('node:fs') || mod.endsWith('fs.js'))).toBe(false)
  })
})
