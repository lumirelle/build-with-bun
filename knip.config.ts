import type { KnipConfig } from 'knip'

export default {
  // @keep-sorted
  ignoreDependencies: [
    '@antfu/utils',
  ],
  // @keep-sorted
  ignoreFiles: [
    'test/helper.ts',
  ],
} satisfies KnipConfig
