import { describe, expect, it } from 'bun:test'
import { RE_RELATIVE, RE_TS, TS_EXTENSIONS } from '../src/constants.ts'

describe('constants', () => {
  describe('RE_TS', () => {
    it('should match .ts files', () => {
      expect(RE_TS.exec('file.ts')).toBeTruthy()
      expect(RE_TS.exec('/path/to/file.ts')).toBeTruthy()
    })

    it('should match .tsx files', () => {
      expect(RE_TS.exec('file.tsx')).toBeTruthy()
      expect(RE_TS.exec('/path/to/Component.tsx')).toBeTruthy()
    })

    it('should match .mts and .cts files', () => {
      expect(RE_TS.exec('file.mts')).toBeTruthy()
      expect(RE_TS.exec('file.cts')).toBeTruthy()
    })

    it('should not match .js files', () => {
      expect(RE_TS.exec('file.js')).toBeFalsy()
      expect(RE_TS.exec('file.jsx')).toBeFalsy()
    })

    it('should not match files without extension', () => {
      expect(RE_TS.exec('file')).toBeFalsy()
      expect(RE_TS.exec('./command')).toBeFalsy()
    })
  })

  describe('RE_RELATIVE', () => {
    it('should match paths starting with ./', () => {
      expect(RE_RELATIVE.exec('./file')).toBeTruthy()
      expect(RE_RELATIVE.exec('./path/to/file')).toBeTruthy()
    })

    it('should match paths starting with ../', () => {
      expect(RE_RELATIVE.exec('../file')).toBeTruthy()
      expect(RE_RELATIVE.exec('../path/to/file')).toBeTruthy()
    })

    it('should not match absolute paths', () => {
      expect(RE_RELATIVE.exec('/path/to/file')).toBeFalsy()
      expect(RE_RELATIVE.exec('C:/path/to/file')).toBeFalsy()
    })

    it('should not match package imports', () => {
      expect(RE_RELATIVE.exec('lodash')).toBeFalsy()
      expect(RE_RELATIVE.exec('@scope/package')).toBeFalsy()
      expect(RE_RELATIVE.exec('node:fs')).toBeFalsy()
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
})
