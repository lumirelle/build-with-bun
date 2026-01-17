/**
 * Map from entrypoint path to its resolved dependencies.
 * Each entrypoint tracks its own set of dependent files.
 */
export type ResolvedDepFilesMap = Map<string, Set<string>>
