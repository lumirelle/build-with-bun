import type { mock } from 'bun:test'
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { existsSync, watch as fsWatch, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { build } from '../src/build.ts'

describe('watch', () => {
  const testDir = join(tmpdir(), 'watch-test')
  const testOutDir = join(testDir, 'dist')
  let spiedConsoleInfo: ReturnType<typeof mock<typeof console.info>>

  beforeEach(() => {
    if (existsSync(testDir))
      rmSync(testDir, { recursive: true, force: true })
    mkdirSync(testDir, { recursive: true })
    spiedConsoleInfo = spyOn(console, 'info')
  })

  afterEach(() => {
    if (existsSync(testDir))
      rmSync(testDir, { recursive: true, force: true })
    spiedConsoleInfo.mockRestore()
  })

  describe('fs watch', () => {
    it('should watch file changes and trigger callback', async () => {
      const filePath = join(testDir, 'file.txt')
      writeFileSync(filePath, 'initial content')

      let callbackCalled = false
      const watcher = fsWatch(filePath, () => {
        callbackCalled = true
      })

      // Simulate file change
      writeFileSync(filePath, 'updated content')
      // Wait a bit to ensure watcher picks up the change
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(callbackCalled).toBe(true)
      watcher.close()
    })
  })

  describe('watch plugin', () => {
    it('should call onRebuild when file changes', async () => {
      const entryFile = join(testDir, 'index.ts')
      writeFileSync(entryFile, 'export const hello = "world"')

      await build({
        entrypoints: [entryFile],
        outdir: testOutDir,
        dts: false,
        watch: true,
      })

      expect(spiedConsoleInfo).toHaveBeenCalledTimes(1)

      writeFileSync(entryFile, 'export const hello = "updated"')
      // Wait a bit to ensure rebuild is triggered
      await new Promise(resolve => setTimeout(resolve, 200))
      expect(spiedConsoleInfo).toHaveBeenCalledTimes(3)
    })
  })
})
