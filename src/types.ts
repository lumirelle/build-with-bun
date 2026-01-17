/**
 * Map from entrypoint path to its resolved dependencies.
 * Each entrypoint tracks its own set of dependent files.
 */
export type ResolvedFilesMap = Map<string, Set<string>>
