import { build } from '../src/index.ts'

await build({
  entrypoints: [
    './src/index.ts',
  ],
  outdir: './dist',
  dts: true,
  target: 'node',
})
