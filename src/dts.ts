import type { BunPlugin } from 'bun'
import type { ResolvedDepFilesMap } from './types.ts'
import { basename, join } from 'node:path'
import { isolatedDeclarationSync } from 'oxc-transform'
import { RE_TS } from './filename.ts'
import { absolute } from './utils.ts'

export function dts(
  absEntrypoints: string[],
  resolvedDepFilesMap: ResolvedDepFilesMap,
): BunPlugin {
  /**
   * A map from file path to its isolated declaration.
   */
  const dtsMap = new Map<string, string>()

  return {
    name: 'oxc-transform-dts',
    setup(builder) {
      if (!builder.config.outdir)
        return

      const outPath = absolute(builder.config.outdir)

      builder.onStart(() => {
        dtsMap.clear()
      })

      builder.onLoad({ filter: RE_TS }, async (args) => {
        // Check if this file belongs to any entrypoint's resolved files.
        let isRelevant = false
        for (const files of resolvedDepFilesMap.values()) {
          if (files.has(args.path)) {
            isRelevant = true
            break
          }
        }
        if (!isRelevant || dtsMap.has(args.path))
          return
        const { code } = isolatedDeclarationSync(
          args.path,
          await Bun.file(args.path).text(),
        )
        dtsMap.set(args.path, code)
      })

      builder.onEnd(async () => {
        for (const [filePath, code] of dtsMap.entries()) {
          const outFilePath = join(outPath, basename(filePath).replace(RE_TS, '.d.ts'))
          await Bun.write(outFilePath, code)
        }
      })
    },
  }
}
