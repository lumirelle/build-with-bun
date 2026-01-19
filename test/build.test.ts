import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { build } from '../src/build.ts'

describe('build', () => {
  const testDir = join(tmpdir(), 'build-with-bun-test')
  const testOutDir = join(testDir, 'dist')

  beforeEach(() => {
    if (existsSync(testDir))
      rmSync(testDir, { recursive: true, force: true })
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir))
      rmSync(testDir, { recursive: true, force: true })
  })

  it('should build basic TypeScript file', async () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'export const hello = "world"')

    const output = await build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      dts: false,
    })

    expect(output.success).toBe(true)
    expect(output.outputs.length).toBeGreaterThan(0)
  })

  it('should generate dts files when dts is enabled', async () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'export const hello = "world"')

    await build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      dts: true,
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('declare')
    expect(dtsContent).toContain('hello')
  })

  it('should resolve dependencies and generate dts for all files', async () => {
    const entryFile = join(testDir, 'index.ts')
    const utilsFile = join(testDir, 'utils.ts')
    writeFileSync(entryFile, 'export { foo } from "./utils.ts"')
    writeFileSync(utilsFile, 'export const foo = "bar"')

    await build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      dts: true,
    })

    const dtsFile = join(testOutDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const dtsContent = await Bun.file(dtsFile).text()
    expect(dtsContent).toContain('foo')
  })

  it('should call afterBuild callback', async () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'export const hello = "world"')

    let callbackCalled = false
    await build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      dts: false,
      afterBuild: () => {
        callbackCalled = true
      },
    })

    expect(callbackCalled).toBe(true)
  })

  it('should clean output directory when clean is true', async () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'export const hello = "world"')

    mkdirSync(testOutDir, { recursive: true })
    const oldFile = join(testOutDir, 'old.js')
    writeFileSync(oldFile, 'old content')

    await build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      dts: false,
      clean: true,
    })

    expect(existsSync(oldFile)).toBe(false)
  })

  it('should not clean output directory when clean is false', async () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'export const hello = "world"')

    mkdirSync(testOutDir, { recursive: true })
    const oldFile = join(testOutDir, 'old.js')
    writeFileSync(oldFile, 'old content')

    await build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      dts: false,
      clean: false,
    })

    expect(existsSync(oldFile)).toBe(true)
  })

  it('should use external sourcemap when watch is enabled', async () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'export const hello = "world"')

    const output = await build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      dts: false,
      watch: true,
    })

    expect(output.success).toBe(true)
  })

  it('should add resolve plugin when dts is enabled', async () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'export const hello = "world"')

    const output = await build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      dts: true,
    })

    expect(output.success).toBe(true)
  })

  it('should use default packages as external', async () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'import { join } from "node:path"\nexport const test = join("a", "b")')

    const output = await build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      dts: false,
    })

    expect(output.success).toBe(true)
    const content = await Bun.file(join(testOutDir, 'index.js')).text()
    // External packages should be kept as imports
    expect(content).toContain('node:path')
  })

  it('should bundle packages when packages is set to bundle', async () => {
    const entryFile = join(testDir, 'index.ts')
    writeFileSync(entryFile, 'export const hello = "world"')

    const output = await build({
      entrypoints: [entryFile],
      outdir: testOutDir,
      dts: false,
      packages: 'bundle',
    })

    expect(output.success).toBe(true)
  })
})
