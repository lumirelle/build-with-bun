import process from 'node:process'
import { dirname, isAbsolute, normalize, relative, resolve } from 'pathe'

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
 * Extract the common ancestor directory from a list of paths.
 *
 * If any of the input paths is absolute, the result will be absolute.
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
  const isAnyAbsolute = paths.some(p => isAbsolute(p))
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

  return isAnyAbsolute ? commonAncestor : relative(cwd, commonAncestor) || '.'
}
