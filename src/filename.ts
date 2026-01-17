import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Match TypeScript file extensions (.ts, .tsx, .mts, .cts)
 */
export const RE_TS = /\.([cm]?)tsx?$/

/**
 * Match relative imports (starting with . or ..)
 */
export const RE_RELATIVE = /^\.\.?\//

/**
 * TypeScript file extensions to try when resolving imports without extension.
 */
export const TS_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'] as const

/**
 * Try to resolve a path to a TypeScript file by adding extensions.
 * Returns the resolved path if found, or null if not found.
 */
export function tryResolveTs(basePath: string): string | null {
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
