import { build } from '../src/index.ts'

await build({
  entrypoints: [
    './src/index.ts',
    './src/build.ts',
  ],
  outdir: './dist',
  dts: true,
  target: 'node',
})
