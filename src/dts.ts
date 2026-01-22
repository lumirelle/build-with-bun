/**
 * @file A Bun build plugin to generate `.d.ts` files for entrypoints using `oxc-transform` and `oxc-parser`.
 */

import type { BunPlugin } from 'bun'
import { parseSync } from 'oxc-parser'
import { isolatedDeclarationSync } from 'oxc-transform'
import { dirname, join, normalize, relative, resolve } from 'pathe'
import { RE_TS } from './constants.ts'
import { cwd, extractCommonAncestor, resolveCwd } from './utils.ts'

interface DeclarationInfo {
  name: string
  code: string
  startLine: number
  endLine: number
  typeRefs: Set<string>
}

/**
 * Extract declarations and their type references from dts code.
 */
function extractDeclarations(code: string): Map<string, DeclarationInfo> {
  const declarations = new Map<string, DeclarationInfo>()
  const lines = code.split('\n')

  try {
    const result = parseSync('module.d.ts', code, {
      sourceType: 'module',
    })

    if (result.errors.length > 0) {
      console.error(result.errors.map(e => e.message).join('\n'))
      return declarations
    }

    for (const stmt of result.program.body) {
      let name: string | null = null
      let decl: any = stmt

      // Handle export declarations
      if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
        decl = stmt.declaration
        name = getDeclarationName(decl)
      }
      // Handle direct declarations
      else {
        name = getDeclarationName(stmt)
      }

      if (name && stmt.start !== undefined && stmt.end !== undefined) {
        // Calculate line numbers
        const beforeStart = code.substring(0, stmt.start)
        const startLine = beforeStart.split('\n').length - 1
        const stmtCode = code.substring(stmt.start, stmt.end)
        const endLine = startLine + stmtCode.split('\n').length - 1

        // Collect type references
        const typeRefs = collectTypeReferences(decl)
        // Remove self-reference
        typeRefs.delete(name)

        declarations.set(name, {
          name,
          code: lines.slice(startLine, endLine + 1).join('\n'),
          startLine,
          endLine,
          typeRefs,
        })
      }
    }
  }
  catch {
    // If parsing fails, return empty map
    console.error(`Failed to parse dts file: ${code}`)
  }

  return declarations
}

/**
 * TODO(Lumirelle): Now only support relative imports starting with `.` or `..`.
 */
function isRelativeImportExport(path: string): boolean {
  return path.startsWith('.')
    || path.startsWith('..')
    // || path.startsWith('@')
    // || path.startsWith('~')
    // ...
}

interface ParseResult {
  type: 'import' | 'export'
  modulePath: string
  isRelative: boolean
  isTypeOnly: boolean
  members: string[]
  code: string
}

function parseImportExport(type: 'import' | 'export', line: string): ParseResult {
  let regex: RegExp
  if (type === 'import')
    regex = /^import (type )?(.*?) from ['"](.*?)['"];?$/i
  else if (type === 'export')
    regex = /^export (type )?(.*?) from ['"](.*?)['"];?$/i
  else
    throw new Error(`Invalid type: ${type}`)

  const result = regex.exec(line)

  const isTypeOnly = !!result?.[1]

  const r: ParseResult = {
    type,
    modulePath: '',
    isRelative: false,
    isTypeOnly,
    members: [],
    code: line,
  }

  r.modulePath = result?.[3] ?? ''

  // If not relative import, return early.
  r.isRelative = isRelativeImportExport(r.modulePath)
  if (!r.isRelative)
    return r

  let membersStr = result?.[2]?.trim() ?? ''
  if (membersStr.includes('*')) {
    r.members = ['*']
  }
  else {
    // TODO(Lumirelle): Better way to parse members than string manipulation?
    // Remove curly braces if present (e.g., `{ Foo, Bar }` -> `Foo, Bar`)
    if (membersStr.startsWith('{'))
      membersStr = membersStr.slice(1, -1).trim()
    // Split by commas and trim each member.
    r.members = membersStr.split(',').map((m) => {
      let name = m.trim()
      // Remove `type` keyword (e.g., `type Foo` -> `Foo`)
      if (name.startsWith('type '))
        name = name.slice(5).trim()
      // Handle aliases (e.g., `Foo as Bar` -> `Foo`)
      const asIndex = name.indexOf(' as ')
      if (asIndex !== -1)
        name = name.slice(0, asIndex).trim()
      return name
    }).filter(m => m.length > 0)
  }

  return r
}

/**
 * Get the name of a declaration node.
 */
function getDeclarationName(decl: any): string | null {
  if (!decl)
    return null

  // TSTypeAliasDeclaration, TSInterfaceDeclaration, FunctionDeclaration, ClassDeclaration
  if (decl.id?.name)
    return decl.id.name

  // VariableDeclaration
  if (decl.type === 'VariableDeclaration' && decl.declarations?.[0]?.id?.name)
    return decl.declarations[0].id.name

  // TSEnumDeclaration
  if (decl.type === 'TSEnumDeclaration' && decl.id?.name)
    return decl.id.name

  // TSModuleDeclaration (namespace)
  if (decl.type === 'TSModuleDeclaration' && decl.id?.name)
    return decl.id.name

  return null
}

/**
 * Collect all type references from a declaration node by recursively traversing the AST.
 */
function collectTypeReferences(node: any): Set<string> {
  const refs = new Set<string>()

  function traverse(n: any): void {
    if (!n || typeof n !== 'object')
      return

    // Handle TSTypeReference
    if (n.type === 'TSTypeReference' && n.typeName) {
      if (n.typeName.type === 'Identifier') {
        refs.add(n.typeName.name)
      }
      else if (n.typeName.type === 'TSQualifiedName') {
        // Get the leftmost identifier (e.g., Namespace.Type -> Namespace)
        let current = n.typeName
        while (current.left?.type === 'TSQualifiedName')
          current = current.left
        if (current.left?.name)
          refs.add(current.left.name)
      }
    }

    // Handle TSTypeQuery (typeof xxx)
    if (n.type === 'TSTypeQuery' && n.exprName?.type === 'Identifier') {
      refs.add(n.exprName.name)
    }

    // Handle extends in interfaces
    if (n.type === 'TSInterfaceHeritage' && n.expression?.type === 'Identifier') {
      refs.add(n.expression.name)
    }

    // Handle implements in classes
    if (n.type === 'TSClassImplements' && n.expression?.type === 'Identifier') {
      refs.add(n.expression.name)
    }

    // Handle class extends
    if (n.type === 'ClassDeclaration' && n.superClass?.type === 'Identifier') {
      refs.add(n.superClass.name)
    }

    // Recursively traverse all properties
    for (const key of Object.keys(n)) {
      const value = n[key]
      if (Array.isArray(value)) {
        for (const item of value)
          traverse(item)
      }
      else if (value && typeof value === 'object') {
        traverse(value)
      }
    }
  }

  traverse(node)
  return refs
}

/**
 * Extract only the requested members and their dependencies from module dts code.
 */
function extractRequestedDts(
  dts: string,
  declarations: Map<string, DeclarationInfo>,
  requestedMembers: string[],
  type: 'import' | 'export',
): string {
  // If importing everything (*), return the full dts.
  if (requestedMembers.includes('*'))
    return dts

  /**
   * Requested members and their dependencies.
   */
  const neededMembers = new Set<string>()
  const queue = [...requestedMembers]

  while (queue.length > 0) {
    const member = queue.pop()!
    if (neededMembers.has(member))
      continue
    const declaration = declarations.get(member)
    if (!declaration) {
      console.error(`Declaration not found: ${member}`)
      continue
    }

    neededMembers.add(member)
    // Add type references to the queue
    for (const ref of declaration.typeRefs) {
      // Only add if not already needed and if the declaration exists in that module.
      if (!neededMembers.has(ref) && declarations.has(ref))
        queue.push(ref)
    }
  }

  const resultParts: string[] = []
  // Preserve original import/export statements (they will be processed externally)
  const dtsLines = dts.split('\n')
  for (const line of dtsLines) {
    const trimmed = line.trim()
    if (trimmed.match(/^import .* from ['"].*['"];?$/i) || trimmed.match(/^export .* from ['"].*['"];?$/i))
      resultParts.push(line)
    // TODO(Lumirelle): Or break? If the dts code hoist the import/export statements, we can break here for better performance.
  }
  // Collect the code for all needed members
  for (const [name, declaration] of declarations) {
    if (!neededMembers.has(name))
      continue
    let dts = declaration.code
    // For non-requested but referenced members, or requested but imported members, remove the `export` keyword.
    if (!requestedMembers.includes(name) || type === 'import')
      dts = dts.replace(/^export /i, '')
    resultParts.push(dts)
  }

  return resultParts.join('\n')
}

/**
 * Inline all the `dts` code of dependent modules start from entrypoint recursively.
 *
 * @param entrypoint The entrypoint to start from.
 * @param dtsMap The map of module paths to their dts.
 * @param declarationMap The map of module paths to their declaration map.
 * @param typeRefsMap The map of module paths to their type references.
 * @returns The inline `dts` code of the entrypoint.
 */
function inlineModuleDtsRecursive(
  entrypoint: string,
  dtsMap: Map<string, string>,
  declarationMap: Map<string, Map<string, DeclarationInfo>>,
  typeRefsMap: Map<string, Set<string>>,
): string {
  const entryDts = dtsMap.get(entrypoint)
  const entrypointDir = dirname(entrypoint)

  if (!entryDts) {
    console.error(`Entrypoint dts code not found: ${entrypoint}`)
    return ''
  }

  const entryDtsLines = entryDts.split('\n').filter(Boolean)
  const entryTypeRefs = typeRefsMap.get(entrypoint)

  let i = 0
  while (i < entryDtsLines.length) {
    const trimmedLine = entryDtsLines[i]!.trim()

    // Parse import/export statement.
    let result: ParseResult
    if (trimmedLine.match(/^import .*? from ['"].*?['"];?$/i)) {
      result = parseImportExport('import', trimmedLine)
      // Filter out non-referenced import members.
      result.members = result.members.filter(m => entryTypeRefs?.has(m))
    }
    else if (trimmedLine.match(/^export .*? from ['"].*?['"];?$/i)) {
      result = parseImportExport('export', trimmedLine)
      // All export members are referenced.
    }
    else {
      i++
      continue
      // TODO(Lumirelle): Or break? If the dts code hoist the import/export statements, we can break here for better performance.
    }

    // Skip non-relative imports.
    if (!result.isRelative) {
      i++
      continue
    }

    entryDtsLines.splice(i, 1)

    // Process relative import/export statement.
    const modulePath = resolve(entrypointDir, result.modulePath)
    let moduleDts = dtsMap.get(modulePath)
    if (!moduleDts)
      moduleDts = '// MISSING MODULE DTS'
    const moduleDeclarations = declarationMap.get(modulePath)

    let filteredDts = moduleDts
    if (moduleDeclarations) {
      // Replace with the module dts - only include members that are referenced.
      filteredDts = extractRequestedDts(
        moduleDts,
        moduleDeclarations,
        result.members,
        result.type,
      )
    }

    // Add the module dts to the entry dts.
    entryDtsLines.push('', `// ${relative(cwd, modulePath)}`, ...filteredDts.split('\n'))
  }

  return entryDtsLines.join('\n')
}

/**
 * Generate `.d.ts` files for entrypoints (Using `oxc-transform` and `oxc-parser`).
 *
 * @param root The project root directory.
 * @param resolvedEntrypoints The entrypoints to generate `.d.ts` files for.
 * @param resolvedModules The set of all resolved module paths.
 */
export function dts(
  root: string | undefined,
  resolvedEntrypoints: string[],
  resolvedModules: Set<string>,
): BunPlugin {
  if (!root)
    root = extractCommonAncestor(resolvedEntrypoints)

  /**
   * A map from module path to its isolated declaration.
   */
  const dtsMap = new Map<string, string>()
  /**
   * A map from module path to its declaration map.
   */
  const declarationMap = new Map<string, Map<string, DeclarationInfo>>()
  /**
   * A map from module path to its all type references.
   */
  const typeRefsMap = new Map<string, Set<string>>()

  return {
    name: 'dts',
    setup(builder) {
      if (!builder.config.outdir)
        return

      const outPath = resolveCwd(builder.config.outdir)

      builder.onStart(() => {
        dtsMap.clear()
        declarationMap.clear()
        typeRefsMap.clear()
      })

      // Use `oxc-transform` to generate isolated declaration for each TypeScript file.
      builder.onLoad({ filter: RE_TS }, async (args) => {
        // Notice, `argsPath` is absolute.
        const argsPath = normalize(args.path)

        if (
          (!resolvedEntrypoints.includes(argsPath) && !resolvedModules.has(argsPath))
          || dtsMap.has(argsPath)
        ) {
          return
        }

        const { code: dts } = isolatedDeclarationSync(
          argsPath,
          await Bun.file(argsPath).text(),
        )
        dtsMap.set(argsPath, dts)
        const declarations = extractDeclarations(dts)
        declarationMap.set(argsPath, declarations)
        typeRefsMap.set(argsPath, new Set<string>())
        for (const declaration of declarations.values())
          typeRefsMap.get(argsPath)?.union(declaration.typeRefs)
      })

      // Composite all isolated declarations into dts files for each entrypoint.
      builder.onEnd(async () => {
        for (const entrypoint of resolvedEntrypoints) {
          const dts = inlineModuleDtsRecursive(entrypoint, dtsMap, declarationMap, typeRefsMap)
          const outFile = entrypoint.replace(RE_TS, '.d.ts')
          const outFilePath = join(
            outPath,
            relative(root, outFile),
          )
          await Bun.write(outFilePath, dts.trim())
        }
      })
    },
  }
}
