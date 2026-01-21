/**
 * Helper to create a ResolvedFilesMap from entrypoint and its files.
 */
export function createResolvedModules(files: string[]): Set<string> {
  const set: Set<string> = new Set()
  set.union(new Set(files))
  return set
}
