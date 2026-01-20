import { describe, expect, it } from 'bun:test'
import { build } from '@lumirelle/build-with-bun'

describe('index', () => {
  it('should export build', () => {
    expect(build).toBeDefined()
  })
})
