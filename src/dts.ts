import type { BunPlugin } from 'bun'
import type { ResolvedFilesMap } from './resolve.ts'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { isolatedDeclarationSync } from 'oxc-transform'
import { absolute, cwd } from './utils.ts'

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

      builder.onLoad({ filter: /\.([cm]?)tsx?$/ }, async (args) => {
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

            const dts = dtsMap.get(filePath)
            if (!dts)
              return

            const importRegex = /from\s+['"]([^'"]+\.ts)['"]/g
            const imports: string[] = []
            let match: RegExpExecArray | null
            // eslint-disable-next-line no-cond-assign
            while ((match = importRegex.exec(dts)) !== null) {
              const importPath = match[1]
              if (importPath && importPath.startsWith('.')) {
                const depPath = resolve(dirname(filePath), importPath)
                imports.push(depPath)
              }
            }

            for (const depPath of imports) {
              collectDependencies(depPath)
            }

            let cleanedDts = dts
            for (const importPath of imports) {
              const relativePath = `./${basename(importPath)}`
              const escapedPath = relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              cleanedDts = cleanedDts.replace(new RegExp(`import\\s+.*\\s+from\\s+['"]${escapedPath}['"];?\\s*`, 'g'), '')
              cleanedDts = cleanedDts.replace(new RegExp(`export\\s+.*\\s+from\\s+['"]${escapedPath}['"];?\\s*`, 'g'), '')
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

          let entrypointDtsContent = entrypointDts
          // Only clean imports from this entrypoint's resolved files.
          for (const filePath of entrypointResolvedFiles) {
            if (filePath === entrypointPath)
              continue
            const relativePath = `./${basename(filePath)}`
            const escapedPath = relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            entrypointDtsContent = entrypointDtsContent.replace(new RegExp(`import\\s+.*\\s+from\\s+['"]${escapedPath}['"];?\\s*`, 'g'), '')
            entrypointDtsContent = entrypointDtsContent.replace(new RegExp(`export\\s+\\*\\s+from\\s+['"]${escapedPath}['"];?\\s*`, 'g'), '')
            entrypointDtsContent = entrypointDtsContent.replace(new RegExp(`export\\s+\\{[^}]+\\}\\s+from\\s+['"]${escapedPath}['"];?\\s*`, 'g'), '')
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
