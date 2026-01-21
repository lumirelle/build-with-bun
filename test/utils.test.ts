import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { dirname, join, normalize, resolve } from 'pathe'
import { cwd, extractCommonAncestor, formatDuration, resolveCwd, tryResolveTs } from '../src/utils.ts'

describe('utils', () => {
  describe('cwd', () => {
    it('should be the current working directory', () => {
      expect(cwd).toBe(normalize(process.cwd()))
    })
  })

  describe('resolveCwd', () => {
    it('should resolve relative path based on current working directory', () => {
      const relativePath = 'src/index.ts'
      expect(resolveCwd(relativePath)).toBe(resolve(process.cwd(), relativePath))
    })

    it('should return normalized same path for already absolute path', () => {
      const absolutePath = process.platform === 'win32'
        ? 'C:\\Users\\test\\file.ts'
        : '/home/test/file.ts'
      expect(resolveCwd(absolutePath)).toBe(normalize(absolutePath))
    })

    it('should handle path with dot notation', () => {
      const path = './src/index.ts'
      expect(resolveCwd(path)).toBe(resolve(process.cwd(), path))
    })

    it('should handle path with parent directory notation', () => {
      const path = '../other/file.ts'
      expect(resolveCwd(path)).toBe(resolve(process.cwd(), path))
    })
  })

  describe('formatDuration', () => {
    it('should format milliseconds for duration less than 1000ms', () => {
      expect(formatDuration(500)).toBe('500.00ms')
      expect(formatDuration(0.5)).toBe('0.50ms')
      expect(formatDuration(999.99)).toBe('999.99ms')
    })

    it('should format seconds for duration 1000ms or more', () => {
      expect(formatDuration(1000)).toBe('1.00s')
      expect(formatDuration(2500)).toBe('2.50s')
      expect(formatDuration(10000)).toBe('10.00s')
    })

    it('should handle zero duration', () => {
      expect(formatDuration(0)).toBe('0.00ms')
    })

    it('should handle very small duration', () => {
      expect(formatDuration(0.01)).toBe('0.01ms')
    })

    it('should handle boundary value at 1000ms', () => {
      expect(formatDuration(999.99)).toBe('999.99ms')
      expect(formatDuration(1000)).toBe('1.00s')
    })
  })

  describe('tryResolveTs', () => {
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

    it('should resolve existing .mts file with extension', () => {
      const filePath = join(testDir, 'module.mts')
      writeFileSync(filePath, 'export const mod = 1')

      expect(tryResolveTs(filePath)).toBe(filePath)
    })

    it('should resolve existing .cts file with extension', () => {
      const filePath = join(testDir, 'module.cts')
      writeFileSync(filePath, 'export const mod = 1')

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

    it('should resolve .cts file without extension', () => {
      const filePath = join(testDir, 'module.cts')
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

    it('should resolve index.mts in directory', () => {
      const subDir = join(testDir, 'modules')
      mkdirSync(subDir, { recursive: true })
      const indexPath = join(subDir, 'index.mts')
      writeFileSync(indexPath, 'export const mod = 1')

      expect(tryResolveTs(subDir)).toBe(indexPath)
    })

    it('should resolve index.cts in directory', () => {
      const subDir = join(testDir, 'commonjs-modules')
      mkdirSync(subDir, { recursive: true })
      const indexPath = join(subDir, 'index.cts')
      writeFileSync(indexPath, 'export const mod = 1')

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

    it('should prefer file with extension over index file in directory', () => {
      const filePath = join(testDir, 'module.ts')
      writeFileSync(filePath, 'export const mod = 1')

      const subDir = join(testDir, 'module')
      mkdirSync(subDir, { recursive: true })
      const indexPath = join(subDir, 'index.ts')
      writeFileSync(indexPath, 'export const indexMod = 1')

      expect(tryResolveTs(join(testDir, 'module'))).toBe(filePath)
    })
  })

  describe('extractCommonAncestor', () => {
    it('should return "." for empty path list', () => {
      expect(extractCommonAncestor([])).toBe('.')
    })

    it('should return the directory of the single path', () => {
      const path = process.platform === 'win32'
        ? 'C:\\Users\\user\\project\\src\\index.ts'
        : '/home/user/project/src/index.ts'
      expect(extractCommonAncestor([path])).toBe(dirname(path))
    })

    it('should return absolute common ancestor for multiple paths not based on cwd', () => {
      const paths = process.platform === 'win32'
        ? [
            'C:\\Users\\user\\project\\src\\index.ts',
            'C:\\Users\\user\\project\\src\\utils\\helpers.ts',
            'C:\\Users\\user\\project\\src\\components\\Button.tsx',
          ]
        : [
            '/home/user/project/src/index.ts',
            '/home/user/project/src/utils/helpers.ts',
            '/home/user/project/src/components/Button.tsx',
          ]
      expect(extractCommonAncestor(paths)).toBe(process.platform === 'win32' ? 'C:/Users/user/project/src' : '/home/user/project/src')
    })

    it('should return absolute common ancestor for multiple paths based on cwd', () => {
      const paths = [
        `${cwd}/project/src/index.ts`,
        `${cwd}/project/src/utils/helpers.ts`,
        `${cwd}/project/src/components/Button.tsx`,
      ]
      expect(extractCommonAncestor(paths)).toBe('project/src')
    })

    it('should return relative common ancestor for multiple relative paths', () => {
      const paths = [
        'project/src/index.ts',
        'project/src/utils/helpers.ts',
        'project/src/components/Button.tsx',
      ]
      expect(extractCommonAncestor(paths)).toBe('project/src')
    })

    it('should return system root path when there is no common ancestor for multiple absolute paths', () => {
      const paths = process.platform === 'win32'
        ? [
            'C:\\Users\\user\\project\\src\\index.ts',
            'C:\\Windows\\System32\\drivers\\etc\\hosts',
            'C:\\Program Files\\App\\config.ini',
          ]
        : [
            '/home/user/project/src/index.ts',
            '/var/log/system.log',
            '/etc/config/settings.conf',
          ]
      expect(extractCommonAncestor(paths)).toBe(process.platform === 'win32' ? 'C:/' : '/')
    })

    it('should return "." when there is no common ancestor for multiple relative paths', () => {
      const paths = [
        'project/src/index.ts',
        'var/log/system.log',
        'etc/config/settings.conf',
      ]
      expect(extractCommonAncestor(paths)).toBe('.')
    })

    it('should handle absolute paths not based on cwd with different depths', () => {
      const paths = process.platform === 'win32'
        ? [
            'C:\\Users\\user\\project\\src\\index.ts',
            'C:\\Users\\user\\project\\src\\utils\\helpers.ts',
            'C:\\Users\\user\\project\\README.md',
          ]
        : [
            '/home/user/project/src/index.ts',
            '/home/user/project/src/utils/helpers.ts',
            '/home/user/project/README.md',
          ]
      expect(extractCommonAncestor(paths)).toBe(process.platform === 'win32' ? 'C:/Users/user/project' : '/home/user/project')
    })

    it('should handle absolute paths based on cwd with different depths', () => {
      const paths = [
        `${cwd}/project/src/index.ts`,
        `${cwd}/project/src/utils/helpers.ts`,
        `${cwd}/project/README.md`,
      ]
      expect(extractCommonAncestor(paths)).toBe('project')
    })

    it('should handle relative paths with different depths', () => {
      const paths = [
        'project/src/index.ts',
        'project/src/utils/helpers.ts',
        'project/src/components/Button.tsx',
      ]
      expect(extractCommonAncestor(paths)).toBe('project/src')
    })

    it('should handle mixed absolute (based on cwd) and relative paths and return relative path', async () => {
      const paths = [
        `${cwd}/project/src/index.ts`,
        'project/src/utils/helpers.ts',
      ]
      expect(extractCommonAncestor(paths)).toBe('project/src')
    })

    it('should handle mixed absolute (not based on cwd) and relative paths and return absolute path', async () => {
      const paths = process.platform === 'win32'
        ? [
            'C:\\Users\\user\\project\\src\\index.ts',
            'new-projects\\src\\utils\\helpers.ts',
          ]
        : [
            '/home/auser/project/src/index.ts',
            'new-projects/src/utils/helpers.ts',
          ]
      expect(extractCommonAncestor(paths)).toBe(
        process.platform === 'win32' ? 'C:/Users' : '/home/auser',
      )
    })
  })
})
