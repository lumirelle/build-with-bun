import { resolve } from 'node:path'
import process from 'node:process'

export const cwd = process.cwd()

export function absolute(path: string): string {
  return resolve(cwd, path)
}
