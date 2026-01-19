import type { BunPlugin } from 'bun'
import type { ResolvedDepFilesMap } from './types.ts'
import process from 'node:process'
import { parseSync } from 'oxc-parser'
import { isolatedDeclarationSync } from 'oxc-transform'
import { basename, dirname, join, normalize, relative, resolve } from 'pathe'
import { RE_TS } from './filename.ts'
import { absolute } from './utils.ts'

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
 * Now only support relative imports starting with `.` or `..`.
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
  members: string[]
}

function parseImportExport(type: 'import' | 'export', line: string): ParseResult {
  let regex: RegExp
  if (type === 'import')
    regex = /^import (.*) from ['"](.*)['"];?$/i
  else if (type === 'export')
    regex = /^export (.*) from ['"](.*)['"];?$/i
  else
    throw new Error(`Invalid type: ${type}`)

  const result = regex.exec(line)

  const r: ParseResult = {
    type,
    modulePath: '',
    isRelative: false,
    members: [],
  }

  r.modulePath = result?.[2] ?? ''

  // If not relative import, return early.
  r.isRelative = isRelativeImportExport(r.modulePath)
  if (!r.isRelative)
    return r

  let membersStr = result?.[1]?.trim() ?? ''
  if (membersStr.includes('*')) {
    r.members = ['*']
  }
  else {
    // Remove curly braces if present (e.g., `{ Foo, Bar }` -> `Foo, Bar`)
    if (membersStr.startsWith('{') && membersStr.endsWith('}'))
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
  declarations: Map<string, DeclarationInfo> | null | undefined,
  requestedMembers: string[],
  type: 'import' | 'export',
): string {
  if (!declarations) {
    console.error(`Declarations not found for module dts: ${dts}`)
    return dts
  }

  // If importing everything (*), return the full dts.
  if (requestedMembers.includes('*'))
    return dts

  // Collect all needed members (requested + their dependencies)
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
      // Only add if not already needed and if the declaration exists (who is not external).
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
 * Inline all the dts of inlined modules of one module recursively.
 */
function inlineModuleDtsRecursive(
  root: string,
  entrypoint: string,
  dtsMap: Map<string, string>,
  declarationMap: Map<string, Map<string, DeclarationInfo>>,
  typeRefsMap: Map<string, Set<string>>,
): string {
  const entryDts = dtsMap.get(entrypoint) ?? ''
  const entryDtsLines = entryDts.split('\n')
  const entryTypeRefs = typeRefsMap.get(entrypoint)

  for (let i = 0; i < entryDtsLines.length; i++) {
    const trimmedLine = entryDtsLines[i]!.trim()

    // Parse import/export statement.
    let result: ParseResult
    if (trimmedLine.match(/^import .*$/i)) {
      result = parseImportExport('import', trimmedLine)
      // Filter out non-referenced import members.
      result.members = result.members.filter(m => entryTypeRefs?.has(m))
    }
    else if (trimmedLine.match(/^export .*$/i)) {
      result = parseImportExport('export', trimmedLine)
      // All export members are referenced.
    }
    else {
      continue
    }

    // Skip non-relative imports.
    if (!result.isRelative)
      continue

    // Process relative import/export statement.
    const absModulePath = resolve(dirname(entrypoint), result.modulePath)
    const moduleDts = dtsMap.get(absModulePath) ?? '// MISSING MODULE DTS'
    const moduleDeclarations = declarationMap.get(absModulePath)
    // Remove the import/export statement.
    entryDtsLines.splice(i, 1)
    // Replace with the module dts - only include members that are referenced.
    const filteredDts = extractRequestedDts(
      moduleDts,
      moduleDeclarations,
      result.members,
      result.type,
    )

    // Add the module dts to the entry dts.
    entryDtsLines.push(`// ${relative(root, absModulePath)}`, ...filteredDts.split('\n'))
  }

  return entryDtsLines.join('\n')
}

export function dts(
  absEntrypoints: string[],
  resolvedDepFilesMap: ResolvedDepFilesMap,
): BunPlugin {
  /**
   * A map from file path to its isolated declaration.
   */
  const dtsMap = new Map<string, string>()
  /**
   * A map from file path to its declaration info.
   */
  const declarationMap = new Map<string, Map<string, DeclarationInfo>>()
  const typeRefsMap = new Map<string, Set<string>>()

  return {
    name: 'dts',
    setup(builder) {
      if (!builder.config.outdir)
        return

      const root = builder.config.root ?? process.cwd()
      const outPath = absolute(builder.config.outdir)

      builder.onStart(() => {
        dtsMap.clear()
        declarationMap.clear()
        typeRefsMap.clear()
      })

      // Use `oxc-transform` to generate isolated declaration for each file.
      builder.onLoad({ filter: RE_TS }, async (args) => {
        const argsPath = normalize(args.path)

        // Check if this file belongs to any entrypoint's resolved files.
        let isRelevant = false
        for (const files of resolvedDepFilesMap.values()) {
          if (files.has(argsPath)) {
            isRelevant = true
            break
          }
        }
        // Notice, `args.path` is absolute.
        if (!isRelevant || dtsMap.has(argsPath))
          return

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
        for (const entrypoint of absEntrypoints) {
          const dts = inlineModuleDtsRecursive(root, entrypoint, dtsMap, declarationMap, typeRefsMap)
          const outFilePath = join(outPath, basename(entrypoint).replace(RE_TS, '.d.ts'))
          await Bun.write(outFilePath, dts.trim())
        }
      })
    },
  }
}
