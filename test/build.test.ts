import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'pathe'
import { build } from '../src/build.ts'
import { cwd, resolveCwd } from '../src/utils.ts'

describe('build', () => {
  const testDir = resolveCwd(join('.temp', 'build-with-bun-test'))
  const testOutDir = join(testDir, 'dist')

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir))
      rmSync(testDir, { recursive: true, force: true })
    if (existsSync(testOutDir))
      rmSync(testOutDir, { recursive: true, force: true })
  })

  describe('build options defaults', () => {
    it('should clean output directory by default', async () => {
      const entryFile = join(testDir, 'index.ts')
      await Bun.write(entryFile, 'export const hello = "world"')

      mkdirSync(testOutDir, { recursive: true })
      const oldFile = join(testOutDir, 'old.js')
      await Bun.write(oldFile, 'old content')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
      })

      expect(existsSync(oldFile)).toBe(false)
    })

    it('should generate dts files by default', async () => {
      const entryFile = join(testDir, 'index.ts')
      await Bun.write(entryFile, 'export const hello = "world"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
      })

      const dtsFile = join(testOutDir, 'index.d.ts')
      expect(existsSync(dtsFile)).toBe(true)

      const dtsContent = await Bun.file(dtsFile).text()
      expect(dtsContent).toMatchInlineSnapshot(`"export declare const hello = "world";"`)
    })

    it('should generate dts files and automatically detect root by default', async () => {
      const srcDir = join(testDir, 'src')
      mkdirSync(srcDir, { recursive: true })
      const entryFile = join(srcDir, 'index.ts')
      await Bun.write(entryFile, 'export const hello = "world"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
      })

      const dtsFile = join(testOutDir, 'index.d.ts')
      expect(existsSync(dtsFile)).toBe(true)

      const dtsContent = await Bun.file(dtsFile).text()
      expect(dtsContent).toMatchInlineSnapshot(`"export declare const hello = "world";"`)
    })

    it('should treat packages external by default', async () => {
      const entryFile = join(testDir, 'index.ts')
      await Bun.write(entryFile, 'import { join } from "node:path"\nexport const test = join("a", "b")')

      const output = await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        test: true,
      })

      expect(output.success).toBe(true)
      // @ts-expect-error internal testing only
      expect(output._packages).toBe('external')
    })
  })

  describe('build options', () => {
    it('should not output files when `outdir` is not specified', async () => {
      const entryFile = join(testDir, 'index.ts')
      await Bun.write(entryFile, 'export const hello = "world"')

      await build({
        entrypoints: [entryFile],
      })

      const jsFile = join(testDir, 'index.js')
      expect(existsSync(jsFile)).toBe(false)
      const dtsFile = join(testDir, 'index.d.ts')
      expect(existsSync(dtsFile)).toBe(false)
    })

    it('should use `external` sourcemap when `watch` is true', async () => {
      const entryFile = join(testDir, 'index.ts')
      await Bun.write(entryFile, 'export const hello = "world"')

      const output = await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        watch: true,
        test: true,
      })

      expect(output.success).toBe(true)
      // @ts-expect-error internal testing only
      expect(output._sourcemap).toBe('external')
    })

    it('should use `none` sourcemap when `watch` is false', async () => {
      const entryFile = join(testDir, 'index.ts')
      await Bun.write(entryFile, 'export const hello = "world"')

      const output = await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        watch: false,
        test: true,
      })

      expect(output.success).toBe(true)
      // @ts-expect-error internal testing only
      expect(output._sourcemap).toBe('none')
    })

    it('should clean output directory when `clean` is true', async () => {
      const entryFile = join(testDir, 'index.ts')
      await Bun.write(entryFile, 'export const hello = "world"')

      mkdirSync(testOutDir, { recursive: true })
      const oldFile = join(testOutDir, 'old.js')
      await Bun.write(oldFile, 'old content')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        clean: true,
      })

      expect(existsSync(oldFile)).toBe(false)
    })

    it('should not clean output directory when `clean` is false', async () => {
      const entryFile = join(testDir, 'index.ts')
      await Bun.write(entryFile, 'export const hello = "world"')

      mkdirSync(testOutDir, { recursive: true })
      const oldFile = join(testOutDir, 'old.js')
      await Bun.write(oldFile, 'old content')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        clean: false,
      })

      expect(existsSync(oldFile)).toBe(true)
    })

    it('should generate dts files when `dts` is true', async () => {
      const entryFile = join(testDir, 'index.ts')
      await Bun.write(entryFile, 'export const hello = "world"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const dtsFile = join(testOutDir, 'index.d.ts')
      expect(existsSync(dtsFile)).toBe(true)
      const dtsContent = await Bun.file(dtsFile).text()
      expect(dtsContent).toMatchInlineSnapshot(`"export declare const hello = "world";"`)
    })

    it('should generate dts files with correct root when `dts` is true and `root` is specified', async () => {
      const srcDir = join(testDir, 'src')
      mkdirSync(srcDir, { recursive: true })
      const entryFile = join(srcDir, 'index.ts')
      await Bun.write(entryFile, 'export const hello = "world"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        root: testDir,
        dts: true,
      })

      const dtsFile = join(testOutDir, 'src', 'index.d.ts')
      expect(existsSync(dtsFile)).toBe(true)
      const dtsContent = await Bun.file(dtsFile).text()
      expect(dtsContent).toMatchInlineSnapshot(`"export declare const hello = "world";"`)
    })

    it('should not generate dts files when `dts` is false', async () => {
      const entryFile = join(testDir, 'index.ts')
      await Bun.write(entryFile, 'export const hello = "world"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: false,
      })

      const dtsFile = join(testOutDir, 'index.d.ts')
      expect(existsSync(dtsFile)).toBe(false)
    })

    it('should call `afterBuild` callback', async () => {
      const entryFile = join(testDir, 'index.ts')
      await Bun.write(entryFile, 'export const hello = "world"')

      let callbackCalled = false
      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        afterBuild: () => {
          callbackCalled = true
        },
      })

      expect(callbackCalled).toBe(true)
    })

    it('should silently build when `silent` is true', async () => {
      const consoleInfo = spyOn(console, 'info')

      const entryFile = join(testDir, 'index.ts')
      await Bun.write(entryFile, 'export const hello = "world"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        silent: true,
      })

      expect(consoleInfo).not.toHaveBeenCalled()
      consoleInfo.mockRestore()
    })

    it('should not silently build when `silent` is false', async () => {
      const consoleInfo = spyOn(console, 'info')

      const entryFile = join(testDir, 'index.ts')
      await Bun.write(entryFile, 'export const hello = "world"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        silent: false,
      })

      expect(consoleInfo).toHaveBeenCalled()
      consoleInfo.mockRestore()
    })
  })

  describe('internal build behavior', () => {
    it('should throw error for entrypoints without extension', async () => {
      const entryFile = join(testDir, 'index.ts')
      await Bun.write(entryFile, 'export const hello = "world"')

      expect(
        build({
          entrypoints: [entryFile.replace('.ts', '')],
          outdir: testOutDir,
        }),
      ).rejects.toThrowError(/Entrypoint file not found:/)

      const jsFile = join(testOutDir, 'index.js')
      expect(existsSync(jsFile)).toBe(false)
      const dtsFile = join(testOutDir, 'index.d.ts')
      expect(existsSync(dtsFile)).toBe(false)
    })

    it('should throw error for directory entrypoints', async () => {
      const entryFile = join(testDir, 'index.ts')
      await Bun.write(entryFile, 'export const hello = "world"')

      expect(
        build({
          entrypoints: [dirname(entryFile)],
          outdir: testOutDir,
        }),
      ).rejects.toThrowError(/Entrypoint file not found:/)

      const jsFile = join(testOutDir, 'index.js')
      expect(existsSync(jsFile)).toBe(false)
      const dtsFile = join(testOutDir, 'index.d.ts')
      expect(existsSync(dtsFile)).toBe(false)
    })

    it('should found entrypoints based on cwd when they are relative paths', async () => {
      const srcDir = join(testDir, 'src')
      mkdirSync(srcDir, { recursive: true })
      const entryFile = join(srcDir, 'index.ts')
      await Bun.write(entryFile, 'export const hello = "world"')

      const relativeEntryFile = relative(cwd, entryFile)
      expect(isAbsolute(relativeEntryFile)).toBe(false)

      await build({
        entrypoints: [relativeEntryFile],
        outdir: testOutDir,
      })

      const jsFile = join(testOutDir, 'index.js')
      expect(existsSync(jsFile)).toBe(true)
      const jsContent = await Bun.file(jsFile).text()
      expect(jsContent).toMatchInlineSnapshot(`
        "// .temp/build-with-bun-test/src/index.ts
        var hello = "world";
        export {
          hello
        };
        "
      `)
      const dtsFile = join(testOutDir, 'index.d.ts')
      expect(existsSync(dtsFile)).toBe(true)
      const dtsContent = await Bun.file(dtsFile).text()
      expect(dtsContent).toMatchInlineSnapshot(`"export declare const hello = "world";"`)
    })

    it('should resolve entrypoints based on cwd when they are relative paths', async () => {
      const srcDir = join(testDir, 'src')
      mkdirSync(srcDir, { recursive: true })
      const entryFile = join(srcDir, 'index.ts')
      await Bun.write(entryFile, 'export const hello = "world"')

      const relativeEntryFile = relative(cwd, entryFile)
      expect(isAbsolute(relativeEntryFile)).toBe(false)

      const output = await build({
        entrypoints: [relativeEntryFile],
        test: true,
      })

      // @ts-expect-error internal testing only
      expect(output._resolvedEntrypoints).toContain(entryFile)
    })

    it('should using resolve plugin when dts is enabled', async () => {
      const entryFile = join(testDir, 'index.ts')
      const utilFile = join(testDir, 'util.ts')
      await Bun.write(entryFile, 'import { greet } from "./util"; export const hello = greet("world")')
      // eslint-disable-next-line no-template-curly-in-string
      await Bun.write(utilFile, 'export function greet(name: string) { return `Hello, ${name}!`; }')

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
      await Bun.write(entryFile, 'import { greet } from "./util"; export const hello = greet("world")')
      // eslint-disable-next-line no-template-curly-in-string
      await Bun.write(utilFile, 'export function greet(name: string) { return `Hello, ${name}!`; }')

      const output = await build({
        entrypoints: [entryFile],
        dts: true,
        test: true,
      })

      expect(output.success).toBe(true)
      // @ts-expect-error internal testing only
      expect(output._pluginNames).toContain('dts')
    })

    it('should using resolve plugin when watch is enabled', async () => {
      const entryFile = join(testDir, 'index.ts')
      const utilFile = join(testDir, 'util.ts')
      await Bun.write(entryFile, 'import { greet } from "./util"; export const hello = greet("world")')
      // eslint-disable-next-line no-template-curly-in-string
      await Bun.write(utilFile, 'export function greet(name: string) { return `Hello, ${name}!`; }')

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
      await Bun.write(entryFile, 'import { greet } from "./util"; export const hello = greet("world")')
      // eslint-disable-next-line no-template-curly-in-string
      await Bun.write(utilFile, 'export function greet(name: string) { return `Hello, ${name}!`; }')

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
      await Bun.write(entryFile, 'export const hello = "world"')

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

      await Bun.write(entryFile, 'export const hello = "bun"')
      await new Promise(resolve => setTimeout(resolve, 1000))

      expect(rebuildCalled).toBeGreaterThan(1)
    })
  })
})
