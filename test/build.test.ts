import { $ } from 'bun'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'pathe'
import { build } from '../src/build.ts'
import { RE_TS } from '../src/constants.ts'

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
    if (existsSync(testOutDir))
      rmSync(testOutDir, { recursive: true, force: true })
  })

  describe('Bun build behavior', () => {
    it('should accept entrypoints without extension', async () => {
      const entryFile = join(testDir, 'index.ts')
      writeFileSync(entryFile, 'export const hello = "world"')

      await build({
        entrypoints: [entryFile.replace(RE_TS, '')],
        outdir: testOutDir,
        dts: false,
      })

      const jsFile = join(testOutDir, 'index.js')
      expect(existsSync(jsFile)).toBe(true)
      const jsContent = await Bun.file(jsFile).text()
      expect(jsContent).toContain('var hello = "world";')
    })

    it('should accept entrypoints without file name but output nothing', async () => {
      const entryFile = join(testDir, 'index.ts')
      writeFileSync(entryFile, 'export const hello = "world"')

      await build({
        entrypoints: [dirname(entryFile)],
        outdir: testOutDir,
        dts: false,
      })

      const jsFile = join(testOutDir, 'index.js')
      expect(existsSync(jsFile)).toBe(false)
    })
  })

  describe('build options defaults', () => {
    it('should clean output directory by default', async () => {
      const entryFile = join(testDir, 'index.ts')
      writeFileSync(entryFile, 'export const hello = "world"')

      mkdirSync(testOutDir, { recursive: true })
      const oldFile = join(testOutDir, 'old.js')
      writeFileSync(oldFile, 'old content')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: false,
      })

      expect(existsSync(oldFile)).toBe(false)
    })

    it('should generate dts files by default', async () => {
      const entryFile = join(testDir, 'index.ts')
      writeFileSync(entryFile, 'export const hello = "world"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
      })

      const dtsFile = join(testOutDir, 'index.d.ts')
      expect(existsSync(dtsFile)).toBe(true)

      const dtsContent = await Bun.file(dtsFile).text()
      expect(dtsContent).toContain('declare')
      expect(dtsContent).toContain('hello')
    })

    it('should generate dts files and automatically detect root by default', async () => {
      const srcDir = join(testDir, 'src')
      mkdirSync(srcDir, { recursive: true })
      const entryFile = join(srcDir, 'index.ts')
      writeFileSync(entryFile, 'export const hello = "world"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
      })

      const dtsFile = join(testOutDir, 'index.d.ts')
      expect(existsSync(dtsFile)).toBe(true)

      const dtsContent = await Bun.file(dtsFile).text()
      expect(dtsContent).toContain('declare')
      expect(dtsContent).toContain('hello')
    })

    it('should use external sourcemap when watch is enabled', async () => {
      const entryFile = join(testDir, 'index.ts')
      writeFileSync(entryFile, 'export const hello = "world"')

      const output = await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: false,
        watch: true,
        test: true,
      })

      expect(output.success).toBe(true)
      // @ts-expect-error internal testing only
      expect(output._sourcemap).toBe('external')
    })

    it('should treat packages external by default', async () => {
      const entryFile = join(testDir, 'index.ts')
      writeFileSync(entryFile, 'import { join } from "node:path"\nexport const test = join("a", "b")')

      const output = await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: false,
        test: true,
      })

      expect(output.success).toBe(true)
      // @ts-expect-error internal testing only
      expect(output._packages).toBe('external')
    })
  })

  describe('build options', () => {
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

    it('should generate dts files when dts is true', async () => {
      const entryFile = join(testDir, 'index.ts')
      writeFileSync(entryFile, 'export const hello = "world"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const dtsFile = join(testOutDir, 'index.d.ts')
      expect(existsSync(dtsFile)).toBe(true)
    })

    it('should not generate dts files when dts is false', async () => {
      const entryFile = join(testDir, 'index.ts')
      writeFileSync(entryFile, 'export const hello = "world"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: false,
      })

      const dtsFile = join(testOutDir, 'index.d.ts')
      expect(existsSync(dtsFile)).toBe(false)
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

    it('should silently build when silent is true', async () => {
      const entryFile = join(testDir, 'index.ts')
      writeFileSync(entryFile, 'export const hello = "world"')

      const result = await $`
      bun -e "
      import { build } from '${join(import.meta.dirname, '../src/build.ts')}';

      const output = await build({
        entrypoints: ['./index.ts'],
        outdir: './dist',
        dts: false,
        silent: true,
      });
      // Ensure to exit to end the process after build
      process.exit(0);"
    `.cwd(testDir).text()

      expect(result).toBe('')
    })
  })

  describe('build behavior', () => {
    it('should found entrypoints based on cwd when they are relative paths', async () => {
      const srcDir = join(testDir, 'src')
      mkdirSync(srcDir, { recursive: true })
      const entryFile = join(srcDir, 'index.ts')
      writeFileSync(entryFile, 'export const hello = "world"')

      expect(existsSync(entryFile)).toBe(true)
      expect(readFileSync(entryFile).toString()).toBe('export const hello = "world"')

      const result = await $`
      bun -e "
      import { build } from '${join(import.meta.dirname, '../src/build.ts')}';

      console.log(await build({
        entrypoints: ['./src/index.ts'],
        dts: false,
      }));
      // Ensure to exit to end the process after build
      process.exit(0);"
    `.cwd(testDir).text()

      expect(result).toContain('Build completed in')
    })

    it('should generate absolute entrypoints based on cwd correctly when they are relative paths', async () => {
      const srcDir = join(testDir, 'src')
      mkdirSync(srcDir, { recursive: true })
      const entryFile = join(srcDir, 'index.ts')
      writeFileSync(entryFile, 'export const hello = "world"')

      const result = await $`
      bun -e "
      import { build } from '${join(import.meta.dirname, '../src/build.ts')}';

      const output = await build({
        entrypoints: ['./src/index.ts'],
        outdir: './dist',
        dts: false,
        test: true,
        silent: true,
      });
      console.log(output._absoluteEntrypoints);
      // Ensure to exit to end the process after build
      process.exit(0);"
    `.cwd(testDir).text()

      expect(result).toContain(entryFile)
    })

    it('should using resolve plugin when dts is enabled', async () => {
      const entryFile = join(testDir, 'index.ts')
      const utilFile = join(testDir, 'util.ts')
      writeFileSync(entryFile, 'import { greet } from "./util"; export const hello = greet("world")')
      // eslint-disable-next-line no-template-curly-in-string
      writeFileSync(utilFile, 'export function greet(name: string) { return `Hello, ${name}!`; }')

      const output = await build({
        entrypoints: [entryFile],
        dts: true,
        test: true,
      })

      expect(output.success).toBe(true)
      // @ts-expect-error internal testing only
      expect(output._pluginNames).toContain('resolve')
    })

    it('should using dts plugin when dts is enabled', async () => {
      const entryFile = join(testDir, 'index.ts')
      const utilFile = join(testDir, 'util.ts')
      writeFileSync(entryFile, 'import { greet } from "./util"; export const hello = greet("world")')
      // eslint-disable-next-line no-template-curly-in-string
      writeFileSync(utilFile, 'export function greet(name: string) { return `Hello, ${name}!`; }')

      const output = await build({
        entrypoints: [entryFile],
        dts: true,
        test: true,
      })

      expect(output.success).toBe(true)
      // @ts-expect-error internal testing only
      expect(output._pluginNames).toContain('dts')
    })

    it('should generate dts for all entrypoints', async () => {
      const entryFile1 = join(testDir, 'index.ts')
      const entryFile2 = join(testDir, 'cli.ts')
      writeFileSync(entryFile1, 'export const hello = "world"')
      writeFileSync(entryFile2, 'export const cli = "command line interface"')

      await build({
        entrypoints: [entryFile1, entryFile2],
        outdir: testOutDir,
      })

      const dtsFile1 = join(testOutDir, 'index.d.ts')
      const dtsFile2 = join(testOutDir, 'cli.d.ts')
      expect(existsSync(dtsFile1)).toBe(true)
      expect(existsSync(dtsFile2)).toBe(true)
    })

    it('should using resolve plugin when watch is enabled', async () => {
      const entryFile = join(testDir, 'index.ts')
      const utilFile = join(testDir, 'util.ts')
      writeFileSync(entryFile, 'import { greet } from "./util"; export const hello = greet("world")')
      // eslint-disable-next-line no-template-curly-in-string
      writeFileSync(utilFile, 'export function greet(name: string) { return `Hello, ${name}!`; }')

      const output = await build({
        entrypoints: [entryFile],
        watch: true,
        test: true,
        afterBuild: async () => {
        // Simulate stopping the watch after the first build
          process.send?.('SIGINT')
        },
      })

      expect(output.success).toBe(true)
      // @ts-expect-error internal testing only
      expect(output._pluginNames).toContain('resolve')
    })

    it('should using watch plugin when watch is enabled', async () => {
      const entryFile = join(testDir, 'index.ts')
      const utilFile = join(testDir, 'util.ts')
      writeFileSync(entryFile, 'import { greet } from "./util"; export const hello = greet("world")')
      // eslint-disable-next-line no-template-curly-in-string
      writeFileSync(utilFile, 'export function greet(name: string) { return `Hello, ${name}!`; }')

      const output = await build({
        entrypoints: [entryFile],
        watch: true,
        test: true,
      })

      expect(output.success).toBe(true)
      // @ts-expect-error internal testing only
      expect(output._pluginNames).toContain('watch')
    })

    it.todo('should call afterBuild callback after rebuild in watch mode', async () => {
      const entryFile = join(testDir, 'index.ts')
      writeFileSync(entryFile, 'export const hello = "world"')

      let rebuildCalled = 0
      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: false,
        watch: true,
        afterBuild: () => {
          rebuildCalled++
        },
      })

      writeFileSync(entryFile, 'export const hello = "bun"')
      await new Promise(resolve => setTimeout(resolve, 1000))

      expect(rebuildCalled).toBeGreaterThan(1)
    })
  })
})
