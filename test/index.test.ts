import { describe, expect, it } from 'bun:test'
import { build } from '@lumirelle/build-with-bun'

describe('test', () => {
  it('should export build', () => {
    expect(build).toBeDefined()
  })
})
