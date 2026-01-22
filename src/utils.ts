import { existsSync } from 'node:fs'
import process from 'node:process'
import { dirname, normalize, relative, resolve } from 'pathe'
import { RE_TS, TS_EXTENSIONS } from './constants'

export const cwd = normalize(process.cwd())

/**
 * Resolve a path based on the current working directory.
 *
 * If the path is already absolute, it will be returned as is.
 *
 * @param path The path to resolve.
 * @returns The resolved path.
 */
export function resolveCwd(path: string): string {
  return resolve(cwd, path)
}

export function formatDuration(duration: number): string {
  return duration < 1000 ? `${duration.toFixed(2)}ms` : `${(duration / 1000).toFixed(2)}s`
}

export interface TryResolveTsOptions {
  resolveIndex?: boolean
}

/**
 * Try to resolve a path to a TypeScript file by adding extensions.
 * Returns the resolved path if found, or null if not found.
 */
export function tryResolveTs(basePath: string, options: TryResolveTsOptions = {}): string | null {
  const { resolveIndex = true } = options

  // If already has a TS extension, check if it exists
  if (RE_TS.test(basePath))
    return existsSync(basePath) ? basePath : null

  // Otherwise, try adding each extension
  for (const ext of TS_EXTENSIONS) {
    const pathWithExt = `${basePath}${ext}`
    if (existsSync(pathWithExt))
      return pathWithExt
  }

  // If not resolving index files, return null
  if (!resolveIndex)
    return null

  // Otherwise, try index files
  for (const ext of TS_EXTENSIONS) {
    const indexPath = resolve(basePath, `index${ext}`)
    if (existsSync(indexPath))
      return indexPath
  }

  return null
}

/**
 * Extract the common ancestor directory from a list of paths.
 *
 * If all paths are based on the current working directory, the result is relative to it.
 *
 * Otherwise, the result is an absolute path.
 *
 * @param paths The list of paths.
 * @returns The common ancestor directory.
 */
export function extractCommonAncestor(paths: string[]): string {
  if (paths.length === 0)
    return '.'
  if (paths.length === 1)
    return dirname(paths[0]!)

  const splitPaths = paths.map(p => resolveCwd(p).split('/'))
  const minLength = Math.min(...splitPaths.map(parts => parts.length))
  const hasAnyNotBasedCwd = paths.some(p => relative(cwd, p).startsWith('..'))
  const commonParts: string[] = []

  for (let i = 0; i < minLength; i++) {
    const part = splitPaths[0]![i]!
    if (splitPaths.some(parts => parts[i] !== part))
      break
    commonParts.push(part)
  }

  const commonAncestor = commonParts.join('/')

  // If is system root path, postfix with '/' (e.g. '/' or 'C:/')
  if (process.platform === 'win32' && /^[a-z]:$/i.test(commonAncestor))
    return `${commonAncestor}/`
  else if (commonAncestor === '')
    return '/'

  return hasAnyNotBasedCwd ? commonAncestor : relative(cwd, commonAncestor) || '.'
}
