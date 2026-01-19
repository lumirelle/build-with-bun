import type { BunPlugin } from 'bun'
import type { ResolvedDepFilesMap } from './types.ts'
import process from 'node:process'
import { isolatedDeclarationSync } from 'oxc-transform'
import { basename, dirname, join, normalize, relative, resolve } from 'pathe'
import { RE_TS } from './filename.ts'
import { absolute } from './utils.ts'

/**
 * Now only support relative imports starting with `.` or `..`.
 */
function isRelativeImport(path: string): boolean {
  return path.startsWith('.')
    || path.startsWith('..')
    // || path.startsWith('@')
    // || path.startsWith('~')
    // ...
}

/**
 * Inline all the dts of inlined modules of one module recursively.
 */
function inlineModuleDtsRecursive(root: string, path: string, dtsMap: Map<string, string>): string {
  const code = dtsMap.get(path) ?? ''
  const lines = code.split('\n')

  for (const line of lines) {
    const trimmedLine = line.trim()

    let modulePath = ''
    if (trimmedLine.match(/^import .*$/i))
      modulePath = trimmedLine.replace(/^import .* from ['"](.*)['"];?/i, '$1')
    if (trimmedLine.match(/^export .*$/i))
      modulePath = trimmedLine.replace(/^export .* from ['"](.*)['"];?/i, '$1')
    // Filter out non-relative imports.
    if (isRelativeImport(modulePath)) {
      const absModulePath = resolve(dirname(path), modulePath)
      const moduleCode = dtsMap.get(absModulePath) ?? '// MISSING MODULE DTS'
      lines.push(`// ${relative(root, absModulePath)}`, ...moduleCode.split('\n'))
    }
  }

  return lines.join('\n')
}

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

      // Use `oxc-transform` to generate isolated declaration for each file.
      builder.onLoad({ filter: RE_TS }, async (args) => {
        const argsPath = normalize(args.path)

        // Check if this file belongs to any entrypoint's resolved files.
        let isRelevant = false
        for (const files of resolvedDepFilesMap.values()) {
          if (files.has(argsPath)) {
            isRelevant = true
            break
          }
        }
        // Notice, `args.path` is absolute.
        if (!isRelevant || dtsMap.has(argsPath))
          return
        const { code } = isolatedDeclarationSync(
          argsPath,
          await Bun.file(argsPath).text(),
        )
        dtsMap.set(argsPath, code)
      })

      // Composite all isolated declarations into dts files for each entrypoint.
      builder.onEnd(async () => {
        for (const entrypoint of absEntrypoints) {
          const code = inlineModuleDtsRecursive(builder.config.root ?? process.cwd(), entrypoint, dtsMap)
          const outFilePath = join(outPath, basename(entrypoint).replace(RE_TS, '.d.ts'))
          await Bun.write(outFilePath, code)
        }
      })
    },
  }
}
