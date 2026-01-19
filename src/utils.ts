import process from 'node:process'
import { resolve } from 'pathe'

export const cwd = process.cwd()

export function absolute(path: string): string {
  return resolve(cwd, path)
}

export function formatDuration(duration: number): string {
  return duration < 1000 ? `${duration.toFixed(2)}ms` : `${(duration / 1000).toFixed(2)}s`
}
