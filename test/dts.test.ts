import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'pathe'
import { build } from '../src/build.ts'
import { resolveCwd } from '../src/utils.ts'

describe('dts', () => {
  const testDir = resolveCwd(join('.temp', 'dts-test'))
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

  describe('dts file generation', () => {
    it('should generate dts file for entrypoint if outdir is provided', async () => {
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

    it('should not generate dts when outdir is not provided', async () => {
      const entryFile = join(testDir, 'index.ts')
      await Bun.write(entryFile, 'export const hello = "world"')

      await build({
        entrypoints: [entryFile],
        dts: true,
      })

      const dtsFile = join(testDir, 'index.d.ts')
      expect(existsSync(dtsFile)).toBe(false)
    })

    it('should generate dts file and output base on automatically detected root', async () => {
      // `root` will be automatically set to `testDir/src`
      const srcDir = join(testDir, 'src')
      mkdirSync(srcDir, { recursive: true })
      const entryFile = join(srcDir, 'index.ts')
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

    it('should generate dts file and output base on specified root', async () => {
    // root will be automatically set to testDir/src
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

    it('should generate dts file for all entrypoints', async () => {
      const entryFile1 = join(testDir, 'index.ts')
      const entryFile2 = join(testDir, 'cli.ts')
      await Bun.write(entryFile1, 'export const hello = "world"')
      await Bun.write(entryFile2, 'export const cli = "command line interface"')

      await build({
        entrypoints: [entryFile1, entryFile2],
        outdir: testOutDir,
        dts: true,
      })

      const dtsFile1 = join(testOutDir, 'index.d.ts')
      expect(existsSync(dtsFile1)).toBe(true)
      const dtsContent1 = await Bun.file(dtsFile1).text()
      expect(dtsContent1).toMatchInlineSnapshot(`"export declare const hello = "world";"`)
      const dtsFile2 = join(testOutDir, 'cli.d.ts')
      expect(existsSync(dtsFile2)).toBe(true)
      const dtsContent2 = await Bun.file(dtsFile2).text()
      expect(dtsContent2).toMatchInlineSnapshot(`"export declare const cli = "command line interface";"`)
    })
  })

  describe('dts content generation', () => {
    it('should generate empty dts file for entrypoint with empty content', async () => {
      const entryFile = join(testDir, 'index.ts')
      await Bun.write(entryFile, '// empty file')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const dtsFile = join(testOutDir, 'index.d.ts')
      const dtsContent = await Bun.file(dtsFile).text()
      expect(dtsContent).toMatchInlineSnapshot(`""`)
    })

    it('should generate isolated dts file for each resolved module (export ts module)', async () => {
      const entryFile = join(testDir, 'index.ts')
      const utilsFile = join(testDir, 'utils.ts')
      await Bun.write(entryFile, 'export { foo } from "./utils.ts"')
      await Bun.write(utilsFile, 'export const foo = "bar"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const utilsDts = join(testOutDir, 'utils.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(utilsDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const utilsDtsContent = await Bun.file(utilsDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`"export { foo } from "./utils.ts";"`)
      expect(utilsDtsContent).toMatchInlineSnapshot(`"export declare const foo = "bar";"`)
    })

    it('should generate isolated dts file for each resolved module (export tsx module)', async () => {
      const entryFile = join(testDir, 'index.tsx')
      const componentFile = join(testDir, 'Component.tsx')
      await Bun.write(entryFile, 'export { Component } from "./Component.tsx"')
      await Bun.write(componentFile, 'export const Component = "tsx-component"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const componentDts = join(testOutDir, 'Component.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(componentDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const componentDtsContent = await Bun.file(componentDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`"export { Component } from "./Component.tsx";"`)
      expect(componentDtsContent).toMatchInlineSnapshot(`"export declare const Component = "tsx-component";"`)
    })

    it('should generate isolated dts file for each resolved module (export mts module)', async () => {
      const entryFile = join(testDir, 'index.mts')
      const moduleFile = join(testDir, 'module.mts')
      await Bun.write(entryFile, 'export { module } from "./module.mts"')
      await Bun.write(moduleFile, 'export const module = "mts-module"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const moduleDts = join(testOutDir, 'module.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(moduleDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const moduleDtsContent = await Bun.file(moduleDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`"export { module } from "./module.mts";"`)
      expect(moduleDtsContent).toMatchInlineSnapshot(`"export declare const module = "mts-module";"`)
    })

    it('should generate isolated dts file for each resolved module (export cts module)', async () => {
      const entryFile = join(testDir, 'index.cts')
      const moduleFile = join(testDir, 'module.cts')
      await Bun.write(entryFile, 'export { module } from "./module.cts"')
      await Bun.write(moduleFile, 'export const module = "cts-module"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const moduleDts = join(testOutDir, 'module.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(moduleDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const moduleDtsContent = await Bun.file(moduleDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`"export { module } from "./module.cts";"`)
      expect(moduleDtsContent).toMatchInlineSnapshot(`"export declare const module = "cts-module";"`)
    })

    it('should generate isolated dts file for each resolved module (export ts module without file extension)', async () => {
      const entryFile = join(testDir, 'index.ts')
      const commandFile = join(testDir, 'command.ts')
      await Bun.write(entryFile, 'export * as cmd from "./command"')
      await Bun.write(commandFile, 'export const run: () => void = () => {}')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const commandDts = join(testOutDir, 'command.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(commandDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const commandDtsContent = await Bun.file(commandDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`"export * as cmd from "./command";"`)
      expect(commandDtsContent).toMatchInlineSnapshot(`"export declare const run: () => void;"`)
    })

    it('should generate isolated dts file for each resolved module (export tsx module without file extension)', async () => {
      const entryFile = join(testDir, 'index.ts')
      const componentFile = join(testDir, 'Component.tsx')
      await Bun.write(entryFile, 'export { Component } from "./Component"')
      // Use a simple tsx file without JSX to avoid needing react runtime
      await Bun.write(componentFile, 'export const Component = "tsx-component"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const componentDts = join(testOutDir, 'Component.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(componentDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const componentDtsContent = await Bun.file(componentDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`"export { Component } from "./Component";"`)
      expect(componentDtsContent).toMatchInlineSnapshot(`"export declare const Component = "tsx-component";"`)
    })

    it('should generate isolated dts file for each resolved module (export mts module without file extension)', async () => {
      const entryFile = join(testDir, 'index.mts')
      const moduleFile = join(testDir, 'module.mts')
      await Bun.write(entryFile, 'export { module } from "./module"')
      await Bun.write(moduleFile, 'export const module = "mts-module"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const moduleDts = join(testOutDir, 'module.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(moduleDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const moduleDtsContent = await Bun.file(moduleDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`"export { module } from "./module";"`)
      expect(moduleDtsContent).toMatchInlineSnapshot(`"export declare const module = "mts-module";"`)
    })

    it('should generate isolated dts file for each resolved module (export cts module without file extension)', async () => {
      const entryFile = join(testDir, 'index.cts')
      const moduleFile = join(testDir, 'module.cts')
      await Bun.write(entryFile, 'export { module } from "./module"')
      await Bun.write(moduleFile, 'export const module = "cts-module"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const moduleDts = join(testOutDir, 'module.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(moduleDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const moduleDtsContent = await Bun.file(moduleDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`"export { module } from "./module";"`)
      expect(moduleDtsContent).toMatchInlineSnapshot(`"export declare const module = "cts-module";"`)
    })

    it('should generate isolated dts file for each resolved module (export multiple modules)', async () => {
      const entryFile = join(testDir, 'index.ts')
      const utilsFile = join(testDir, 'utils.ts')
      const helperFile = join(testDir, 'helper.ts')
      await Bun.write(entryFile, 'export { foo } from "./utils.ts";\nexport { bar } from "./helper.ts";')
      await Bun.write(utilsFile, 'export const foo = "bar"')
      await Bun.write(helperFile, 'export const bar = "baz"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const utilsDts = join(testOutDir, 'utils.d.ts')
      const helperDts = join(testOutDir, 'helper.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(utilsDts)).toBe(true)
      expect(existsSync(helperDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const utilsDtsContent = await Bun.file(utilsDts).text()
      const helperDtsContent = await Bun.file(helperDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`
        "export { foo } from "./utils.ts";
        export { bar } from "./helper.ts";"
      `)
      expect(utilsDtsContent).toMatchInlineSnapshot(`"export declare const foo = "bar";"`)
      expect(helperDtsContent).toMatchInlineSnapshot(`"export declare const bar = "baz";"`)
    })

    it('should generate isolated dts file for each resolved module (export nested modules)', async () => {
      const entryFile = join(testDir, 'index.ts')
      const utilsFile = join(testDir, 'utils.ts')
      const helperFile = join(testDir, 'helper.ts')
      await Bun.write(entryFile, 'export { foo } from "./utils.ts"')
      await Bun.write(utilsFile, 'export { bar } from "./helper.ts"\nexport const foo = "bar"')
      await Bun.write(helperFile, 'export const bar = "baz"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const utilsDts = join(testOutDir, 'utils.d.ts')
      const helperDts = join(testOutDir, 'helper.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(utilsDts)).toBe(true)
      expect(existsSync(helperDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const utilsDtsContent = await Bun.file(utilsDts).text()
      const helperDtsContent = await Bun.file(helperDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`"export { foo } from "./utils.ts";"`)
      expect(utilsDtsContent).toMatchInlineSnapshot(`
        "export { bar } from "./helper.ts";
        export declare const foo = "bar";"
      `)
      expect(helperDtsContent).toMatchInlineSnapshot(`"export declare const bar = "baz";"`)
    })

    it('should generate isolated dts file for each resolved module (export external module)', async () => {
      const entryFile = join(testDir, 'index.ts')
      const utilsFile = join(testDir, 'utils.ts')
      await Bun.write(entryFile, 'export { foo } from "./utils.ts";\nexport * as nodeprocess from "node:process";')
      await Bun.write(utilsFile, 'export const foo = "bar"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const utilsDts = join(testOutDir, 'utils.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(utilsDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const utilsDtsContent = await Bun.file(utilsDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`
        "export { foo } from "./utils.ts";
        export * as nodeprocess from "node:process";"
      `)
      expect(utilsDtsContent).toMatchInlineSnapshot(`"export declare const foo = "bar";"`)
    })

    it('should generate isolated dts file for each resolved module (import ts module)', async () => {
      const entryFile = join(testDir, 'index.ts')
      const utilsFile = join(testDir, 'utils.ts')
      await Bun.write(entryFile, 'import { foo } from "./utils.ts"; export { foo }')
      await Bun.write(utilsFile, 'export const foo = "bar"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const utilsDts = join(testOutDir, 'utils.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(utilsDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const utilsDtsContent = await Bun.file(utilsDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`
        "import { foo } from "./utils.ts";
        export { foo };"
      `)
      expect(utilsDtsContent).toMatchInlineSnapshot(`"export declare const foo = "bar";"`)
    })

    it('should generate isolated dts file for each resolved module (import tsx module)', async () => {
      const entryFile = join(testDir, 'index.tsx')
      const componentFile = join(testDir, 'Component.tsx')
      await Bun.write(entryFile, 'import { Component } from "./Component.tsx"; export { Component }')
      await Bun.write(componentFile, 'export const Component = "tsx-component"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const componentDts = join(testOutDir, 'Component.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(componentDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const componentDtsContent = await Bun.file(componentDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`
        "import { Component } from "./Component.tsx";
        export { Component };"
      `)
      expect(componentDtsContent).toMatchInlineSnapshot(`"export declare const Component = "tsx-component";"`)
    })

    it('should generate isolated dts file for each resolved module (import mts module)', async () => {
      const entryFile = join(testDir, 'index.mts')
      const moduleFile = join(testDir, 'module.mts')
      await Bun.write(entryFile, 'import { module } from "./module.mts"; export { module }')
      await Bun.write(moduleFile, 'export const module = "mts-module"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const moduleDts = join(testOutDir, 'module.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(moduleDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const moduleDtsContent = await Bun.file(moduleDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`
        "import { module } from "./module.mts";
        export { module };"
      `)
      expect(moduleDtsContent).toMatchInlineSnapshot(`"export declare const module = "mts-module";"`)
    })

    it('should generate isolated dts file for each resolved module (import cts module)', async () => {
      const entryFile = join(testDir, 'index.cts')
      const moduleFile = join(testDir, 'module.cts')
      await Bun.write(entryFile, 'import { module } from "./module.cts"; export { module }')
      await Bun.write(moduleFile, 'export const module = "cts-module"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const moduleDts = join(testOutDir, 'module.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(moduleDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const moduleDtsContent = await Bun.file(moduleDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`
        "import { module } from "./module.cts";
        export { module };"
      `)
      expect(moduleDtsContent).toMatchInlineSnapshot(`"export declare const module = "cts-module";"`)
    })

    it('should generate isolated dts file for each resolved module (import ts module with file extension)', async () => {
      const entryFile = join(testDir, 'index.ts')
      const utilsFile = join(testDir, 'utils.ts')
      await Bun.write(entryFile, 'import { foo } from "./utils.ts"; export { foo }')
      await Bun.write(utilsFile, 'export const foo = "bar"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const utilsDts = join(testOutDir, 'utils.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(utilsDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const utilsDtsContent = await Bun.file(utilsDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`
        "import { foo } from "./utils.ts";
        export { foo };"
      `)
      expect(utilsDtsContent).toMatchInlineSnapshot(`"export declare const foo = "bar";"`)
    })

    it('should generate isolated dts file for each resolved module (import tsx module without file extension)', async () => {
      const entryFile = join(testDir, 'index.tsx')
      const componentFile = join(testDir, 'Component.tsx')
      await Bun.write(entryFile, 'import { Component } from "./Component"; export { Component }')
      await Bun.write(componentFile, 'export const Component = "tsx-component"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const componentDts = join(testOutDir, 'Component.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(componentDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const componentDtsContent = await Bun.file(componentDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`
        "import { Component } from "./Component";
        export { Component };"
      `)
      expect(componentDtsContent).toMatchInlineSnapshot(`"export declare const Component = "tsx-component";"`)
    })

    it('should generate isolated dts file for each resolved module (import mts module without file extension)', async () => {
      const entryFile = join(testDir, 'index.mts')
      const moduleFile = join(testDir, 'module.mts')
      await Bun.write(entryFile, 'import { module } from "./module"; export { module }')
      await Bun.write(moduleFile, 'export const module = "mts-module"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const moduleDts = join(testOutDir, 'module.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(moduleDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const moduleDtsContent = await Bun.file(moduleDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`
        "import { module } from "./module";
        export { module };"
      `)
      expect(moduleDtsContent).toMatchInlineSnapshot(`"export declare const module = "mts-module";"`)
    })

    it('should generate isolated dts file for each resolved module (import cts module without file extension)', async () => {
      const entryFile = join(testDir, 'index.cts')
      const moduleFile = join(testDir, 'module.cts')
      await Bun.write(entryFile, 'import { module } from "./module"; export { module }')
      await Bun.write(moduleFile, 'export const module = "cts-module"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const moduleDts = join(testOutDir, 'module.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(moduleDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const moduleDtsContent = await Bun.file(moduleDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`
        "import { module } from "./module";
        export { module };"
      `)
      expect(moduleDtsContent).toMatchInlineSnapshot(`"export declare const module = "cts-module";"`)
    })

    it('should generate isolated dts file for each resolved module (import multiple modules)', async () => {
      const entryFile = join(testDir, 'index.ts')
      const utilsFile = join(testDir, 'utils.ts')
      const helperFile = join(testDir, 'helper.ts')
      await Bun.write(entryFile, 'import { foo } from "./utils.ts"; import { bar } from "./helper.ts"; export { foo, bar }')
      await Bun.write(utilsFile, 'export const foo = "bar"')
      await Bun.write(helperFile, 'export const bar = "baz"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const utilsDts = join(testOutDir, 'utils.d.ts')
      const helperDts = join(testOutDir, 'helper.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(utilsDts)).toBe(true)
      expect(existsSync(helperDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const utilsDtsContent = await Bun.file(utilsDts).text()
      const helperDtsContent = await Bun.file(helperDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`
        "import { foo } from "./utils.ts";
        import { bar } from "./helper.ts";
        export { foo, bar };"
      `)
      expect(utilsDtsContent).toMatchInlineSnapshot(`"export declare const foo = "bar";"`)
      expect(helperDtsContent).toMatchInlineSnapshot(`"export declare const bar = "baz";"`)
    })

    it('should generate isolated dts file for each resolved module (import nested modules)', async () => {
      const entryFile = join(testDir, 'index.ts')
      const utilsFile = join(testDir, 'utils.ts')
      const helperFile = join(testDir, 'helper.ts')
      await Bun.write(entryFile, 'import { foo } from "./utils.ts"; import { bar } from "./helper.ts"; export { foo, bar }')
      await Bun.write(utilsFile, 'export { bar } from "./helper.ts"\nexport const foo = "bar"')
      await Bun.write(helperFile, 'export const bar = "baz"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      const utilsDts = join(testOutDir, 'utils.d.ts')
      const helperDts = join(testOutDir, 'helper.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      expect(existsSync(utilsDts)).toBe(true)
      expect(existsSync(helperDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      const utilsDtsContent = await Bun.file(utilsDts).text()
      const helperDtsContent = await Bun.file(helperDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`
        "import { foo } from "./utils.ts";
        import { bar } from "./helper.ts";
        export { foo, bar };"
      `)
      expect(utilsDtsContent).toMatchInlineSnapshot(`
        "export { bar } from "./helper.ts";
        export declare const foo = "bar";"
      `)
      expect(helperDtsContent).toMatchInlineSnapshot(`"export declare const bar = "baz";"`)
    })

    it('should generate isolated dts file for each resolved module (import external module)', async () => {
      const entryFile = join(testDir, 'index.ts')
      await Bun.write(entryFile, 'import * as fs from "node:fs"; export { fs }')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: true,
      })

      const entryDts = join(testOutDir, 'index.d.ts')
      expect(existsSync(entryDts)).toBe(true)
      const entryDtsContent = await Bun.file(entryDts).text()
      expect(entryDtsContent).toMatchInlineSnapshot(`
        "import * as fs from "node:fs";
        export { fs };"
      `)
    })
  })
})
