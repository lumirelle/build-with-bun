import type { BunPlugin } from 'bun'
import type { ResolvedFilesMap } from './resolve.ts'
import { existsSync } from 'node:fs'
import { basename, dirname, join, parse, relative, resolve } from 'node:path'
import { isolatedDeclarationSync } from 'oxc-transform'
import { RE_TS } from './filename.ts'
import { absolute, cwd } from './utils.ts'

/**
 * TypeScript file extensions to try when resolving imports without extension.
 */
const TS_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts']

/**
 * Try to resolve a path to a TypeScript file by adding extensions.
 * Returns the resolved path if found, or null if not found.
 */
function tryResolveTs(basePath: string): string | null {
  // If already has a TS extension, check if it exists
  if (RE_TS.test(basePath)) {
    return existsSync(basePath) ? basePath : null
  }

  // Try adding each extension
  for (const ext of TS_EXTENSIONS) {
    const pathWithExt = `${basePath}${ext}`
    if (existsSync(pathWithExt)) {
      return pathWithExt
    }
  }

  // Try index files
  for (const ext of TS_EXTENSIONS) {
    const indexPath = resolve(basePath, `index${ext}`)
    if (existsSync(indexPath)) {
      return indexPath
    }
  }

  return null
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

            const dts = dtsMap.get(filePath)
            if (!dts)
              return

            // Match both imports with and without .ts extension
            const importRegex = /from\s+['"](\.[^'"]+)['"]/g
            const imports: string[] = []
            let match: RegExpExecArray | null
            // eslint-disable-next-line no-cond-assign
            while ((match = importRegex.exec(dts)) !== null) {
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

            let cleanedDts = dts
            for (const importPath of imports) {
              // Get file name without extension for matching both './foo' and './foo.ts'
              const fileBasename = parse(importPath).name
              // Match imports with or without extension
              cleanedDts = cleanedDts.replace(new RegExp(`import\\s+.*\\s+from\\s+['"]\\.\\/${fileBasename}(\\.tsx?)?['"];?\\s*`, 'g'), '')
              cleanedDts = cleanedDts.replace(new RegExp(`export\\s+.*\\s+from\\s+['"]\\.\\/${fileBasename}(\\.tsx?)?['"];?\\s*`, 'g'), '')
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
            // Get file name without extension for matching both './foo' and './foo.ts'
            const fileBasename = parse(filePath).name
            // Match imports with or without extension
            entrypointDtsContent = entrypointDtsContent.replace(new RegExp(`import\\s+.*\\s+from\\s+['"]\\.\\/${fileBasename}(\\.tsx?)?['"];?\\s*`, 'g'), '')
            entrypointDtsContent = entrypointDtsContent.replace(new RegExp(`export\\s+\\*\\s+from\\s+['"]\\.\\/${fileBasename}(\\.tsx?)?['"];?\\s*`, 'g'), '')
            // Match "export * as xxx from" syntax
            entrypointDtsContent = entrypointDtsContent.replace(new RegExp(`export\\s+\\*\\s+as\\s+\\w+\\s+from\\s+['"]\\.\\/${fileBasename}(\\.tsx?)?['"];?\\s*`, 'g'), '')
            entrypointDtsContent = entrypointDtsContent.replace(new RegExp(`export\\s+\\{[^}]+\\}\\s+from\\s+['"]\\.\\/${fileBasename}(\\.tsx?)?['"];?\\s*`, 'g'), '')
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
