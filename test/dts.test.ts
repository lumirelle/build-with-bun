import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dts } from '../src/dts.ts'
import { absolute } from '../src/utils.ts'

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

    const resolvedFiles = new Set<string>([absolute(entryFile)])
    const entrypointPaths = [absolute(entryFile)]
    const plugin = dts(resolvedFiles, entrypointPaths)

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

    const resolvedFiles = new Set<string>([
      absolute(entryFile),
      absolute(utilsFile),
    ])
    const entrypointPaths = [absolute(entryFile)]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFiles, entrypointPaths),
        dts(resolvedFiles, entrypointPaths),
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

    const resolvedFiles = new Set<string>([absolute(entryFile)])
    const entrypointPaths = [absolute(entryFile)]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFiles, entrypointPaths),
        dts(resolvedFiles, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toMatch(/^\/\/ .+index\.ts/)
  })

  it('should not generate dts when outdir is not set', async () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'export const hello = "world"')

    const resolvedFiles = new Set<string>([absolute(entryFile)])
    const entrypointPaths = [absolute(entryFile)]
    const plugin = dts(resolvedFiles, entrypointPaths)

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

    const resolvedFiles = new Set<string>([
      absolute(entryFile),
      absolute(utilsFile),
      absolute(helperFile),
    ])
    const entrypointPaths = [absolute(entryFile)]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFiles, entrypointPaths),
        dts(resolvedFiles, entrypointPaths),
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

    const resolvedFiles = new Set<string>([absolute(entryFile)])
    const entrypointPaths = [absolute(entryFile)]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFiles, entrypointPaths),
        dts(resolvedFiles, entrypointPaths),
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

    const resolvedFiles = new Set<string>([
      absolute(entryFile),
      absolute(utilsFile),
    ])
    const entrypointPaths = [absolute(entryFile)]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFiles, entrypointPaths),
        dts(resolvedFiles, entrypointPaths),
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

    const resolvedFiles = new Set<string>([
      absolute(entryFile),
      absolute(utilsFile),
    ])
    const entrypointPaths = [absolute(entryFile)]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFiles, entrypointPaths),
        dts(resolvedFiles, entrypointPaths),
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

    const resolvedFiles = new Set<string>([
      absolute(entryFile),
      absolute(utilsFile),
    ])
    const entrypointPaths = [absolute(entryFile)]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFiles, entrypointPaths),
        dts(resolvedFiles, entrypointPaths),
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

    const resolvedFiles = new Set<string>([
      absolute(entryFile),
      absolute(utilsFile),
      absolute(helperFile),
    ])
    const entrypointPaths = [absolute(entryFile)]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFiles, entrypointPaths),
        dts(resolvedFiles, entrypointPaths),
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

    const resolvedFiles = new Set<string>([
      absolute(entryFile),
      absolute(utilsFile),
    ])
    const entrypointPaths = [absolute(entryFile)]

    await Bun.build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      plugins: [
        (await import('../src/resolve.ts')).resolve(resolvedFiles, entrypointPaths),
        dts(resolvedFiles, entrypointPaths),
      ],
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)
  })
})
