import type { BunPlugin } from 'bun'
import type { ResolvedFilesMap } from './types.ts'
import { basename, dirname, join, parse, relative, resolve } from 'node:path'
import { isolatedDeclarationSync } from 'oxc-transform'
import { RE_TS, tryResolveTs } from './filename.ts'
import { absolute, cwd } from './utils.ts'

/**
 * Remove import/export statements that reference a specific file.
 * Handles both with and without file extensions.
 */
function cleanImportExport(content: string, fileBasename: string): string {
  // Match various import/export patterns with or without extension
  const patterns = [
    // import xxx from './file'
    `import\\s+.*\\s+from\\s+['"]\\.\\/${fileBasename}(\\.tsx?)?['"];?\\s*`,
    // export * from './file'
    `export\\s+\\*\\s+from\\s+['"]\\.\\/${fileBasename}(\\.tsx?)?['"];?\\s*`,
    // export * as xxx from './file'
    `export\\s+\\*\\s+as\\s+\\w+\\s+from\\s+['"]\\.\\/${fileBasename}(\\.tsx?)?['"];?\\s*`,
    // export { xxx } from './file'
    `export\\s+\\{[^}]+\\}\\s+from\\s+['"]\\.\\/${fileBasename}(\\.tsx?)?['"];?\\s*`,
  ]

  let result = content
  for (const pattern of patterns) {
    result = result.replace(new RegExp(pattern, 'g'), '')
  }
  return result
}

export function dts(
  resolvedFilesMap: ResolvedFilesMap,
  entrypointPaths: string[],
): BunPlugin {
  /**
   * A set of files that have been processed for dts generation.
   */
  const processedTrack = new Set<string>()
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
        processedTrack.clear()
        dtsMap.clear()
      })

      builder.onLoad({ filter: RE_TS }, async (args) => {
        // Check if this file belongs to any entrypoint's resolved files.
        let isRelevant = false
        for (const files of resolvedFilesMap.values()) {
          if (files.has(args.path)) {
            isRelevant = true
            break
          }
        }

        if (!isRelevant || processedTrack.has(args.path))
          return

        processedTrack.add(args.path)
        const { code } = isolatedDeclarationSync(
          args.path,
          await Bun.file(args.path).text(),
        )

        dtsMap.set(args.path, code)
      })

      builder.onEnd(async () => {
        for (const entrypointPath of entrypointPaths) {
          // Get the resolved files for this specific entrypoint.
          const entrypointResolvedFiles = resolvedFilesMap.get(entrypointPath)
          if (!entrypointResolvedFiles)
            continue

          const entrypointDts = dtsMap.get(entrypointPath)
          if (!entrypointDts)
            continue

          const allDtsContents: Array<{ path: string, content: string }> = []
          const processedFiles = new Set<string>()

          const collectDependencies = (filePath: string): void => {
            if (processedFiles.has(filePath) || filePath === entrypointPath)
              return
            processedFiles.add(filePath)

            const dtsContent = dtsMap.get(filePath)
            if (!dtsContent)
              return

            // Match both imports with and without .ts extension
            const importRegex = /from\s+['"](\.[^'"]+)['"]/g
            const imports: string[] = []
            let match: RegExpExecArray | null
            // eslint-disable-next-line no-cond-assign
            while ((match = importRegex.exec(dtsContent)) !== null) {
              const importPath = match[1]
              if (importPath && importPath.startsWith('.')) {
                const basePath = resolve(dirname(filePath), importPath)
                const resolvedPath = tryResolveTs(basePath)
                if (resolvedPath) {
                  imports.push(resolvedPath)
                }
              }
            }

            for (const depPath of imports) {
              collectDependencies(depPath)
            }

            // Clean all internal imports from the dts content
            let cleanedDts = dtsContent
            for (const importPath of imports) {
              cleanedDts = cleanImportExport(cleanedDts, parse(importPath).name)
            }

            const relativePath = relative(cwd, filePath).replace(/\\/g, '/')
            allDtsContents.push({ path: relativePath, content: cleanedDts })
          }

          // Only collect dependencies from this entrypoint's resolved files.
          for (const filePath of entrypointResolvedFiles) {
            if (filePath !== entrypointPath) {
              collectDependencies(filePath)
            }
          }

          // Clean imports from entrypoint's resolved files
          let entrypointDtsContent = entrypointDts
          for (const filePath of entrypointResolvedFiles) {
            if (filePath === entrypointPath)
              continue
            entrypointDtsContent = cleanImportExport(entrypointDtsContent, parse(filePath).name)
          }

          const mergedDtsParts: string[] = []
          for (const { path, content } of allDtsContents) {
            mergedDtsParts.push(`// ${path}`)
            mergedDtsParts.push(content)
          }

          const entrypointRelativePath = relative(cwd, entrypointPath).replace(/\\/g, '/')
          const mergedDts = allDtsContents.length > 0
            ? `${mergedDtsParts.join('\n')}\n// ${entrypointRelativePath}\n${entrypointDtsContent}`
            : `// ${entrypointRelativePath}\n${entrypointDtsContent}`

          const outputPath = join(outPath, basename(entrypointPath)).replace(/\.ts$/, '.d.ts')
          await Bun.write(outputPath, mergedDts)
        }
      })
    },
  }
}
