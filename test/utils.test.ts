import { describe, expect, it } from 'bun:test'
import { resolve } from 'node:path'
import process from 'node:process'
import { absolute, cwd, formatDuration } from '../src/utils.ts'

describe('utils', () => {
  describe('cwd', () => {
    it('should be the current working directory', () => {
      expect(cwd).toBe(process.cwd())
    })
  })

  describe('absolute', () => {
    it('should resolve relative path to absolute', () => {
      const relativePath = 'src/index.ts'
      const expected = resolve(process.cwd(), relativePath)
      expect(absolute(relativePath)).toBe(expected)
    })

    it('should return same path for already absolute path', () => {
      const absolutePath = process.platform === 'win32'
        ? 'C:\\Users\\test\\file.ts'
        : '/home/test/file.ts'
      expect(absolute(absolutePath)).toBe(absolutePath)
    })

    it('should handle path with dot notation', () => {
      const path = './src/index.ts'
      const expected = resolve(process.cwd(), path)
      expect(absolute(path)).toBe(expected)
    })

    it('should handle path with parent directory notation', () => {
      const path = '../other/file.ts'
      const expected = resolve(process.cwd(), path)
      expect(absolute(path)).toBe(expected)
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
