import { describe, expect, it } from 'bun:test'
import process from 'node:process'
import { normalize, resolve } from 'pathe'
import { cwd, formatDuration, resolveCwd } from '../src/utils.ts'

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
})
