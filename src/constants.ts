/**
 * Match TypeScript file extensions (.ts, .tsx, .mts, .cts)
 */
export const RE_TS = /\.([cm]?)tsx?$/

/**
 * Match relative imports (starting with . or ..)
 */
export const RE_RELATIVE = /^\.\.?\//

/**
 * TypeScript file extensions to try when resolving imports without extension.
 */
export const TS_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'] as const
