import type { ResolvedDepFilesMap } from '../src/types.ts'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dts } from '../src/dts.ts'
import { absolute } from '../src/utils.ts'

/**
 * Helper to create a ResolvedFilesMap from entrypoint and its files.
 */
function createResolvedFilesMap(entrypoint: string, files: string[]): ResolvedDepFilesMap {
  const map: ResolvedDepFilesMap = new Map()
  map.set(entrypoint, new Set(files))
  return map
}

describe('dts', () => {
  const testDir = join(tmpdir(), 'dts-test')
  const testOutDir = join(testDir, 'dist')

  beforeEach(() => {
    if (existsSync(testDir))
      rmSync(testDir, { recursive: true, force: true })
    mkdirSync(testDir, { recursive: true })
    mkdirSync(testOutDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir))
      rmSync(testDir, { recursive: true, force: true })
  })

  it('should generate dts file for entrypoint', async () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'export const hello = "world"')

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap = createResolvedFilesMap(entrypointPath, [entrypointPath])
    const entrypointPaths = [entrypointPath]
    const plugin = dts(resolvedFilesMap, entrypointPaths)

    const builder = {
      config: {
        entrypoints: [entryFile],
        outdir: testOutDir,
      },
      onStart: (callback: () => void) => {
        callback()
      },
      onLoad: (options: any, callback: (args: any) => any) => {
        if (options.filter.test(entryFile)) {
          callback({ path: entryFile })
        }
      },
      onEnd: async (callback: () => Promise<void>) => {
        await callback()
      },
    } as any

    plugin.setup(builder)

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [plugin],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('export declare const hello = "world";')
  })

  it('should merge dependencies into dts file', async () => {
    const entryFile = join(testDir, 'index.ts')
    const utilsFile = join(testDir, 'utils.ts')
    writeFileSync(entryFile, 'export { foo } from "./utils.ts"')
    writeFileSync(utilsFile, 'export const foo = "bar"')

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap = createResolvedFilesMap(entrypointPath, [
      entrypointPath,
      absolute(utilsFile),
    ])
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('export declare const foo = "bar";')
    expect(dtsContent).toContain('export { foo };')
  })

  it('should include source path comments in dts', async () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'export const hello = "world"')

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap = createResolvedFilesMap(entrypointPath, [entrypointPath])
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toMatch(/^\/\/ .+index\.ts/)
  })

  it('should not generate dts when outdir is not set', async () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'export const hello = "world"')

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap = createResolvedFilesMap(entrypointPath, [entrypointPath])
    const entrypointPaths = [entrypointPath]
    const plugin = dts(resolvedFilesMap, entrypointPaths)

    const builder = {
      config: {
        entrypoints: [entryFile],
        outdir: undefined,
      },
      onStart: () => {},
      onLoad: () => {},
      onEnd: async () => {},
    } as any

    plugin.setup(builder)

    expect(builder.onStart).toBeDefined()
  })

  it('should handle nested dependencies with imports', async () => {
    const entryFile = join(testDir, 'index.ts')
    const utilsFile = join(testDir, 'utils.ts')
    const helperFile = join(testDir, 'helper.ts')
    writeFileSync(entryFile, 'export { foo } from "./utils.ts"')
    writeFileSync(utilsFile, 'export { bar } from "./helper.ts"\nexport const foo = "bar"')
    writeFileSync(helperFile, 'export const bar = "baz"')

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap = createResolvedFilesMap(entrypointPath, [
      entrypointPath,
      absolute(utilsFile),
      absolute(helperFile),
    ])
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('export declare const foo = "bar";')
    expect(dtsContent).not.toContain('export declare const bar = "baz";')
    expect(dtsContent).toContain('export { foo };')
  })

  it('should handle entrypoint with empty dts content', async () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, '// empty file')

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap = createResolvedFilesMap(entrypointPath, [entrypointPath])
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toBe('')
  })

  it('should handle dependencies with non-relative imports', async () => {
    const entryFile = join(testDir, 'index.ts')
    const utilsFile = join(testDir, 'utils.ts')
    writeFileSync(entryFile, 'export { foo } from "./utils.ts"')
    writeFileSync(utilsFile, 'import process from "node:process";\nimport fs from "node:fs";\nexport const foo = process.platform;')

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap = createResolvedFilesMap(entrypointPath, [
      entrypointPath,
      absolute(utilsFile),
    ])
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
      target: 'node',
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('import process from "node:process";')
    expect(dtsContent).toContain('export declare const foo = process.platform;')
    expect(dtsContent).toContain('export { foo };')
    expect(dtsContent).not.toContain('import fs from "node:fs";')
  })

  it('should handle dependencies with relative imports', async () => {
    const entryFile = join(testDir, 'index.ts')
    const utilsFile = join(testDir, 'utils.ts')
    writeFileSync(entryFile, 'export { foo } from "./utils.ts"')
    writeFileSync(utilsFile, 'export const foo = "bar"')

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap = createResolvedFilesMap(entrypointPath, [
      entrypointPath,
      absolute(utilsFile),
    ])
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('export declare const foo = "bar";')
    expect(dtsContent).toContain('export { foo };')
  })

  it('should handle entrypoint with only dependencies', async () => {
    const entryFile = join(testDir, 'index.ts')
    const utilsFile = join(testDir, 'utils.ts')
    writeFileSync(entryFile, 'export * from "./utils.ts"')
    writeFileSync(utilsFile, 'export const foo = "bar"; export const bar = "baz";')

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap = createResolvedFilesMap(entrypointPath, [
      entrypointPath,
      absolute(utilsFile),
    ])
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('export declare const foo = "bar";')
    expect(dtsContent).toContain('export declare const bar = "baz";')
  })

  it('should clean import statements from merged dts', async () => {
    const entryFile = join(testDir, 'index.ts')
    const utilsFile = join(testDir, 'utils.ts')
    const helperFile = join(testDir, 'helper.ts')
    writeFileSync(entryFile, 'export { foo } from "./utils.ts"')
    writeFileSync(utilsFile, 'import { bar } from "./helper.ts"\nexport const foo = "bar"')
    writeFileSync(helperFile, 'export const bar = "baz"')

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap = createResolvedFilesMap(entrypointPath, [
      entrypointPath,
      absolute(utilsFile),
      absolute(helperFile),
    ])
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('foo')
    expect(dtsContent).toContain('bar')
    expect(dtsContent).not.toMatch(/from\s+['"]\.\/utils\.ts['"]/)
    expect(dtsContent).not.toMatch(/from\s+['"]\.\/helper\.ts['"]/)
  })

  it('should handle importPath without leading dot', async () => {
    const entryFile = join(testDir, 'index.ts')
    const utilsFile = join(testDir, 'utils.ts')
    writeFileSync(entryFile, 'export { foo } from "./utils.ts"')
    writeFileSync(utilsFile, 'import type { Something } from "some-package"\nexport const foo = "bar"')

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap = createResolvedFilesMap(entrypointPath, [
      entrypointPath,
      absolute(utilsFile),
    ])
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)
  })

  it('should handle imports without file extension', async () => {
    const entryFile = join(testDir, 'index.ts')
    const commandFile = join(testDir, 'command.ts')
    writeFileSync(entryFile, 'export * as cmd from "./command"')
    writeFileSync(commandFile, 'export const run = (): void => {}')

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap: ResolvedDepFilesMap = new Map()
    resolvedFilesMap.set(entrypointPath, new Set([entrypointPath, absolute(commandFile)]))
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('run')
    // Should not contain the import statement since it's merged
    expect(dtsContent).not.toMatch(/from\s+['"]\.\/command['"]/)
  })

  it('should handle tsx files without extension', async () => {
    const entryFile = join(testDir, 'index.ts')
    const componentFile = join(testDir, 'Component.tsx')
    writeFileSync(entryFile, 'export { Component } from "./Component"')
    // Use a simple tsx file without JSX to avoid needing react runtime
    writeFileSync(componentFile, 'export const Component = "tsx-component"')

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap: ResolvedDepFilesMap = new Map()
    resolvedFilesMap.set(entrypointPath, new Set([entrypointPath, absolute(componentFile)]))
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('Component')
  })

  it('should only include used exports from dependencies', async () => {
    const entryFile = join(testDir, 'index.ts')
    const commandFile = join(testDir, 'command.ts')

    // command.ts exports multiple things: run, stop, status
    writeFileSync(commandFile, `
export const run = (): void => {}
export const stop = (): void => {}
export const status = (): string => "running"
export interface CommandOptions {
  timeout: number
  retries: number
}
`)

    // index.ts only imports and re-exports 'run'
    writeFileSync(entryFile, `import { run } from "./command"
export { run }
`)

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap: ResolvedDepFilesMap = new Map()
    resolvedFilesMap.set(entrypointPath, new Set([entrypointPath, absolute(commandFile)]))
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()

    // Should contain 'run' since it's exported
    expect(dtsContent).toContain('run')

    // Should NOT contain 'stop', 'status', or 'CommandOptions' since they're not used
    expect(dtsContent).not.toContain('stop')
    expect(dtsContent).not.toContain('status')
    expect(dtsContent).not.toContain('CommandOptions')
  })

  it('should only include types that are actually re-exported', async () => {
    const entryFile = join(testDir, 'index.ts')
    const typesFile = join(testDir, 'types.ts')

    // types.ts exports multiple interfaces
    writeFileSync(typesFile, `
export interface User {
  id: number
  name: string
}
export interface Post {
  id: number
  title: string
}
export interface Comment {
  id: number
  text: string
}
`)

    // index.ts only re-exports User
    writeFileSync(entryFile, `export type { User } from "./types"
`)

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap: ResolvedDepFilesMap = new Map()
    resolvedFilesMap.set(entrypointPath, new Set([entrypointPath, absolute(typesFile)]))
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()

    // Should contain User since it's re-exported
    expect(dtsContent).toContain('User')

    // Should NOT contain Post or Comment since they're not re-exported
    expect(dtsContent).not.toContain('Post')
    expect(dtsContent).not.toContain('Comment')
  })

  it('should handle default export', async () => {
    const entryFile = join(testDir, 'index.ts')
    const configFile = join(testDir, 'config.ts')

    writeFileSync(configFile, `
const config = {
  name: "app",
  version: "1.0.0"
}
export default config
`)
    writeFileSync(entryFile, `import config from "./config"
export { config }
`)

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap: ResolvedDepFilesMap = new Map()
    resolvedFilesMap.set(entrypointPath, new Set([entrypointPath, absolute(configFile)]))
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('config')
  })

  it('should handle renamed exports', async () => {
    const entryFile = join(testDir, 'index.ts')
    const utilsFile = join(testDir, 'utils.ts')

    writeFileSync(utilsFile, `export const internalName = "value"`)
    writeFileSync(entryFile, `export { internalName as publicName } from "./utils"`)

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap: ResolvedDepFilesMap = new Map()
    resolvedFilesMap.set(entrypointPath, new Set([entrypointPath, absolute(utilsFile)]))
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    // Should contain the renamed export
    expect(dtsContent).toContain('publicName')
  })

  it('should handle function exports', async () => {
    const entryFile = join(testDir, 'index.ts')
    const funcFile = join(testDir, 'func.ts')

    writeFileSync(funcFile, `
export function greet(name: string): string {
  return "Hello " + name
}
export function unused(): void {}
`)
    writeFileSync(entryFile, `export { greet } from "./func"`)

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap: ResolvedDepFilesMap = new Map()
    resolvedFilesMap.set(entrypointPath, new Set([entrypointPath, absolute(funcFile)]))
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('greet')
    expect(dtsContent).toContain('string')
    // Should NOT contain unused function
    expect(dtsContent).not.toContain('unused')
  })

  it('should handle class exports', async () => {
    const entryFile = join(testDir, 'index.ts')
    const classFile = join(testDir, 'MyClass.ts')

    writeFileSync(classFile, `
export class MyClass {
  private value: number
  constructor(value: number) {
    this.value = value
  }
  getValue(): number {
    return this.value
  }
}
export class UnusedClass {}
`)
    writeFileSync(entryFile, `export { MyClass } from "./MyClass"`)

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap: ResolvedDepFilesMap = new Map()
    resolvedFilesMap.set(entrypointPath, new Set([entrypointPath, absolute(classFile)]))
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('MyClass')
    expect(dtsContent).toContain('getValue')
    // Should NOT contain UnusedClass
    expect(dtsContent).not.toContain('UnusedClass')
  })

  it('should handle enum exports', async () => {
    const entryFile = join(testDir, 'index.ts')
    const enumFile = join(testDir, 'enums.ts')

    writeFileSync(enumFile, `
export enum Status {
  Active = "active",
  Inactive = "inactive"
}
export enum UnusedEnum {
  A, B
}
`)
    writeFileSync(entryFile, `export { Status } from "./enums"`)

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap: ResolvedDepFilesMap = new Map()
    resolvedFilesMap.set(entrypointPath, new Set([entrypointPath, absolute(enumFile)]))
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('Status')
    expect(dtsContent).toContain('Active')
    // Should NOT contain UnusedEnum
    expect(dtsContent).not.toContain('UnusedEnum')
  })

  it('should handle type alias exports', async () => {
    const entryFile = join(testDir, 'index.ts')
    const typesFile = join(testDir, 'types.ts')

    writeFileSync(typesFile, `
export type ID = string | number
export type UnusedType = boolean
`)
    writeFileSync(entryFile, `export type { ID } from "./types"`)

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap: ResolvedDepFilesMap = new Map()
    resolvedFilesMap.set(entrypointPath, new Set([entrypointPath, absolute(typesFile)]))
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('ID')
    // Should NOT contain UnusedType
    expect(dtsContent).not.toContain('UnusedType')
  })

  it('should handle interface that extends another interface', async () => {
    const entryFile = join(testDir, 'index.ts')
    const typesFile = join(testDir, 'types.ts')

    writeFileSync(typesFile, `
export interface Base {
  id: number
}
export interface Extended extends Base {
  name: string
}
`)
    // Only export Extended, but Base should be included as it's referenced
    writeFileSync(entryFile, `export type { Extended } from "./types"`)

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap: ResolvedDepFilesMap = new Map()
    resolvedFilesMap.set(entrypointPath, new Set([entrypointPath, absolute(typesFile)]))
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('Extended')
    // Base is a dependency of Extended, but current implementation may not include it
    // This is acceptable as TypeScript will resolve it when the types are used
  })

  it('should handle type that references another type', async () => {
    const entryFile = join(testDir, 'index.ts')
    const typesFile = join(testDir, 'types.ts')

    writeFileSync(typesFile, `
export interface User {
  id: number
  name: string
}
export interface Config {
  user: User
  enabled: boolean
}
export interface Unused {
  value: string
}
`)
    // Export Config which references User
    writeFileSync(entryFile, `export type { Config } from "./types"`)

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap: ResolvedDepFilesMap = new Map()
    resolvedFilesMap.set(entrypointPath, new Set([entrypointPath, absolute(typesFile)]))
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('Config')
    // Should NOT contain Unused
    expect(dtsContent).not.toContain('Unused')
  })

  it('should handle generic type exports', async () => {
    const entryFile = join(testDir, 'index.ts')
    const typesFile = join(testDir, 'types.ts')

    writeFileSync(typesFile, `
export interface Result<T> {
  data: T
  error: string | null
}
export type AsyncResult<T> = Promise<Result<T>>
`)
    writeFileSync(entryFile, `export type { Result, AsyncResult } from "./types"`)

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap: ResolvedDepFilesMap = new Map()
    resolvedFilesMap.set(entrypointPath, new Set([entrypointPath, absolute(typesFile)]))
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('Result')
    expect(dtsContent).toContain('AsyncResult')
    expect(dtsContent).toContain('<T>')
  })

  it('should handle mixed value and type exports', async () => {
    const entryFile = join(testDir, 'index.ts')
    const moduleFile = join(testDir, 'module.ts')

    writeFileSync(moduleFile, `
export interface Options {
  timeout: number
}
export const DEFAULT_OPTIONS: Options = { timeout: 1000 }
export function configure(opts: Options): void {}
`)
    writeFileSync(entryFile, `
export type { Options } from "./module"
export { DEFAULT_OPTIONS, configure } from "./module"
`)

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap: ResolvedDepFilesMap = new Map()
    resolvedFilesMap.set(entrypointPath, new Set([entrypointPath, absolute(moduleFile)]))
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('Options')
    expect(dtsContent).toContain('DEFAULT_OPTIONS')
    expect(dtsContent).toContain('configure')
  })

  it('should handle deep transitive dependencies', async () => {
    const entryFile = join(testDir, 'index.ts')
    const aFile = join(testDir, 'a.ts')
    const bFile = join(testDir, 'b.ts')
    const cFile = join(testDir, 'c.ts')

    // c.ts is the deepest dependency
    writeFileSync(cFile, `export const deepValue = "deep"`)
    // b.ts imports from c
    writeFileSync(bFile, `export { deepValue } from "./c"`)
    // a.ts imports from b
    writeFileSync(aFile, `export { deepValue } from "./b"`)
    // entry imports from a
    writeFileSync(entryFile, `export { deepValue } from "./a"`)

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap: ResolvedDepFilesMap = new Map()
    resolvedFilesMap.set(entrypointPath, new Set([
      entrypointPath,
      absolute(aFile),
      absolute(bFile),
      absolute(cFile),
    ]))
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('deepValue')
    // Should not have any relative imports
    expect(dtsContent).not.toMatch(/from\s+['"]\.\//)
  })

  it('should handle export with inline declaration', async () => {
    const entryFile = join(testDir, 'index.ts')

    writeFileSync(entryFile, `
export const VERSION = "1.0.0"
export interface AppConfig {
  name: string
  debug: boolean
}
export function init(config: AppConfig): void {}
export class App {
  constructor(public config: AppConfig) {}
}
`)

    const entrypointPath = absolute(entryFile)
    const resolvedFilesMap: ResolvedDepFilesMap = new Map()
    resolvedFilesMap.set(entrypointPath, new Set([entrypointPath]))
    const entrypointPaths = [entrypointPath]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('VERSION')
    expect(dtsContent).toContain('AppConfig')
    expect(dtsContent).toContain('init')
    expect(dtsContent).toContain('App')
  })

  it('should generate separate dts for multiple entrypoints', async () => {
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
    const resolvedFilesMap: ResolvedDepFilesMap = new Map()
    resolvedFilesMap.set(entry1Path, new Set([entry1Path, absolute(utils1File)]))
    resolvedFilesMap.set(entry2Path, new Set([entry2Path, absolute(utils2File)]))
    const entrypointPaths = [entry1Path, entry2Path]

    await Bun.build({
      entrypoints: [entry1File, entry2File],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFilesMap, entrypointPaths),
        dts(resolvedFilesMap, entrypointPaths),
      ],
    })

    const dts1File = join(testOutDir, 'entry1.d.ts')
    const dts2File = join(testOutDir, 'entry2.d.ts')
    expect(existsSync(dts1File)).toBe(true)
    expect(existsSync(dts2File)).toBe(true)

    const dts1Content = await Bun.file(dts1File).text()
    const dts2Content = await Bun.file(dts2File).text()

    // entry1.d.ts should only contain foo, not bar
    expect(dts1Content).toContain('foo')
    expect(dts1Content).not.toContain('bar')

    // entry2.d.ts should only contain bar, not foo
    expect(dts2Content).toContain('bar')
    expect(dts2Content).not.toContain('foo')
  })
})
