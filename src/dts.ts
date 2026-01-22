/**
 * @file A Bun build plugin to generate isolated declaration files for each resolved TypeScript module.
 */

import type { BunPlugin } from 'bun'
import { isolatedDeclarationSync } from 'oxc-transform'
import { isAbsolute, join, normalize, relative } from 'pathe'
import { extractCommonAncestor, resolveCwd } from './utils.ts'

/**
 * Generate isolated declaration files for each resolved TypeScript module.
 *
 * @param root The project root directory.
 * @param resolvedEntrypoints The resolved entrypoints.
 * @param resolvedModules The set of all resolved modules.
 */
export function dts(
  root: string | undefined,
  resolvedEntrypoints: string[],
  resolvedModules: Set<string>,
): BunPlugin {
  if (!root)
    root = extractCommonAncestor(resolvedEntrypoints)

  return {
    name: 'dts',
    setup(builder) {
      if (!builder.config.outdir)
        return

      // Check if outdir is absolute path first, save some microseconds
      const outPath = isAbsolute(builder.config.outdir) ? normalize(builder.config.outdir) : resolveCwd(builder.config.outdir)

      // Write the isolated declaration files for resolved modules to the output directory.
      builder.onEnd(async () => {
        for (const module of resolvedModules) {
          const { code: dts } = isolatedDeclarationSync(
            module,
            await Bun.file(module).text(),
          )
          const outFile = module.replace(/\.[^.]*$/, '.d.ts')
          // Out file path should retain the relative path from root, and be placed under outdir
          const outFilePath = join(outPath, relative(root, outFile))
          await Bun.write(outFilePath, dts.trim())
        }
      })
    },
  }
}
