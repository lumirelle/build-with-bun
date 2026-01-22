import type { build as srcBuild } from '../src/build'
import { describe, expect, expectTypeOf, it } from 'bun:test'
import { build } from '@lumirelle/build-with-bun'

describe('index', () => {
  it('should export build', () => {
    expect(build).toBeDefined()
    expectTypeOf(build).toExtend<typeof srcBuild>()
  })
})
