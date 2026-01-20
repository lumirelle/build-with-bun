import process from 'node:process'
import { normalize, resolve } from 'pathe'

export const cwd = normalize(process.cwd())

export function resolveCwd(path: string): string {
  return resolve(cwd, path)
}

export function formatDuration(duration: number): string {
  return duration < 1000 ? `${duration.toFixed(2)}ms` : `${(duration / 1000).toFixed(2)}s`
}
