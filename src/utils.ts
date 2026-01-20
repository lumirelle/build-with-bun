import { existsSync } from 'node:fs'
import process from 'node:process'
import { normalize, resolve } from 'pathe'
import { RE_TS, TS_EXTENSIONS } from './constants'

export const cwd = normalize(process.cwd())

export function resolveCwd(path: string): string {
  return resolve(cwd, path)
}

export function formatDuration(duration: number): string {
  return duration < 1000 ? `${duration.toFixed(2)}ms` : `${(duration / 1000).toFixed(2)}s`
}

/**
 * Try to resolve a path to a TypeScript file by adding extensions.
 * Returns the resolved path if found, or null if not found.
 */
export function tryResolveTs(basePath: string): string | null {
  // If already has a TS extension, check if it exists
  if (RE_TS.test(basePath))
    return existsSync(basePath) ? basePath : null

  // Otherwise, try adding each extension
  for (const ext of TS_EXTENSIONS) {
    const pathWithExt = `${basePath}${ext}`
    if (existsSync(pathWithExt))
      return pathWithExt
  }

  // Otherwise, try index files
  for (const ext of TS_EXTENSIONS) {
    const indexPath = resolve(basePath, `index${ext}`)
    if (existsSync(indexPath))
      return indexPath
  }

  return null
}
