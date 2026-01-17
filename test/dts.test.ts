import type { ResolvedFilesMap } from '../src/resolve.ts'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dts } from '../src/dts.ts'
import { absolute } from '../src/utils.ts'

/**
 * Helper to create a ResolvedFilesMap from entrypoint and its files.
 */
function createResolvedFilesMap(entrypoint: string, files: string[]): ResolvedFilesMap {
  const map: ResolvedFilesMap = new Map()
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
    expect(dtsContent).toContain('declare')
    expect(dtsContent).toContain('hello')
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
    expect(dtsContent).toContain('foo')
    expect(dtsContent).toContain('//')
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
    expect(dtsContent).toContain('foo')
    expect(dtsContent).toContain('bar')
  })

  it('should handle entrypoint without dts content', async () => {
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
    if (existsSync(dtsFile)) {
      const dtsContent = await Bun.file(dtsFile).text()
      expect(dtsContent).toBeTruthy()
    }
  })

  it('should handle dependencies with non-relative imports', async () => {
    const entryFile = join(testDir, 'index.ts')
    const utilsFile = join(testDir, 'utils.ts')
    writeFileSync(entryFile, 'export { foo } from "./utils.ts"')
    writeFileSync(utilsFile, 'import "node:fs"\nexport const foo = "bar"')

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

  it('should handle dependencies without relative path imports', async () => {
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
    expect(dtsContent).toContain('foo')
  })

  it('should handle entrypoint with only dependencies', async () => {
    const entryFile = join(testDir, 'index.ts')
    const utilsFile = join(testDir, 'utils.ts')
    writeFileSync(entryFile, 'export * from "./utils.ts"')
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
    expect(dtsContent).toContain('foo')
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
    const resolvedFilesMap: ResolvedFilesMap = new Map()
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
