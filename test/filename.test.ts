import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RE_RELATIVE, RE_TS, tryResolveTs, TS_EXTENSIONS } from '../src/filename.ts'

describe('filename', () => {
  const testDir = join(tmpdir(), 'filename-test')

  beforeEach(() => {
    if (existsSync(testDir))
      rmSync(testDir, { recursive: true, force: true })
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir))
      rmSync(testDir, { recursive: true, force: true })
  })

  describe('RE_TS', () => {
    it('should match .ts files', () => {
      expect(RE_TS.test('file.ts')).toBe(true)
      expect(RE_TS.test('/path/to/file.ts')).toBe(true)
    })

    it('should match .tsx files', () => {
      expect(RE_TS.test('file.tsx')).toBe(true)
      expect(RE_TS.test('/path/to/Component.tsx')).toBe(true)
    })

    it('should match .mts and .cts files', () => {
      expect(RE_TS.test('file.mts')).toBe(true)
      expect(RE_TS.test('file.cts')).toBe(true)
    })

    it('should not match .js files', () => {
      expect(RE_TS.test('file.js')).toBe(false)
      expect(RE_TS.test('file.jsx')).toBe(false)
    })

    it('should not match files without extension', () => {
      expect(RE_TS.test('file')).toBe(false)
      expect(RE_TS.test('./command')).toBe(false)
    })
  })

  describe('RE_RELATIVE', () => {
    it('should match paths starting with ./', () => {
      expect(RE_RELATIVE.test('./file')).toBe(true)
      expect(RE_RELATIVE.test('./path/to/file')).toBe(true)
    })

    it('should match paths starting with ../', () => {
      expect(RE_RELATIVE.test('../file')).toBe(true)
      expect(RE_RELATIVE.test('../path/to/file')).toBe(true)
    })

    it('should not match absolute paths', () => {
      expect(RE_RELATIVE.test('/path/to/file')).toBe(false)
      expect(RE_RELATIVE.test('C:/path/to/file')).toBe(false)
    })

    it('should not match package imports', () => {
      expect(RE_RELATIVE.test('lodash')).toBe(false)
      expect(RE_RELATIVE.test('@scope/package')).toBe(false)
      expect(RE_RELATIVE.test('node:fs')).toBe(false)
    })
  })

  describe('TS_EXTENSIONS', () => {
    it('should contain all TypeScript extensions', () => {
      expect(TS_EXTENSIONS).toContain('.ts')
      expect(TS_EXTENSIONS).toContain('.tsx')
      expect(TS_EXTENSIONS).toContain('.mts')
      expect(TS_EXTENSIONS).toContain('.cts')
    })

    it('should have correct length', () => {
      expect(TS_EXTENSIONS.length).toBe(4)
    })
  })

  describe('tryResolveTs', () => {
    it('should resolve existing .ts file with extension', () => {
      const filePath = join(testDir, 'file.ts')
      writeFileSync(filePath, 'export const foo = 1')

      expect(tryResolveTs(filePath)).toBe(filePath)
    })

    it('should resolve existing .tsx file with extension', () => {
      const filePath = join(testDir, 'Component.tsx')
      writeFileSync(filePath, 'export const Component = "test"')

      expect(tryResolveTs(filePath)).toBe(filePath)
    })

    it('should return null for non-existing file with extension', () => {
      const filePath = join(testDir, 'nonexistent.ts')

      expect(tryResolveTs(filePath)).toBeNull()
    })

    it('should resolve .ts file without extension', () => {
      const filePath = join(testDir, 'file.ts')
      writeFileSync(filePath, 'export const foo = 1')

      const basePath = join(testDir, 'file')
      expect(tryResolveTs(basePath)).toBe(filePath)
    })

    it('should resolve .tsx file without extension', () => {
      const filePath = join(testDir, 'Component.tsx')
      writeFileSync(filePath, 'export const Component = "test"')

      const basePath = join(testDir, 'Component')
      expect(tryResolveTs(basePath)).toBe(filePath)
    })

    it('should resolve .mts file without extension', () => {
      const filePath = join(testDir, 'module.mts')
      writeFileSync(filePath, 'export const mod = 1')

      const basePath = join(testDir, 'module')
      expect(tryResolveTs(basePath)).toBe(filePath)
    })

    it('should resolve index.ts in directory', () => {
      const subDir = join(testDir, 'subdir')
      mkdirSync(subDir, { recursive: true })
      const indexPath = join(subDir, 'index.ts')
      writeFileSync(indexPath, 'export const index = 1')

      expect(tryResolveTs(subDir)).toBe(indexPath)
    })

    it('should resolve index.tsx in directory', () => {
      const subDir = join(testDir, 'components')
      mkdirSync(subDir, { recursive: true })
      const indexPath = join(subDir, 'index.tsx')
      writeFileSync(indexPath, 'export const Index = "component"')

      expect(tryResolveTs(subDir)).toBe(indexPath)
    })

    it('should return null for non-existing path without extension', () => {
      const basePath = join(testDir, 'nonexistent')

      expect(tryResolveTs(basePath)).toBeNull()
    })

    it('should prefer .ts over .tsx when both exist', () => {
      const tsPath = join(testDir, 'file.ts')
      const tsxPath = join(testDir, 'file.tsx')
      writeFileSync(tsPath, 'export const ts = 1')
      writeFileSync(tsxPath, 'export const tsx = 1')

      const basePath = join(testDir, 'file')
      expect(tryResolveTs(basePath)).toBe(tsPath)
    })
  })
})
