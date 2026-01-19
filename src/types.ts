/**
 * Map from entrypoint path to its resolved dependencies.
 * Each entrypoint tracks its own set of dependent files.
 */
export type ResolvedModuleMap = Map<string, Set<string>>
