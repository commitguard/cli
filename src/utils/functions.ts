import type { CommitSymbols, DuplicateSymbol, FunctionInfo, TypeInfo, TypeKind } from '../types'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import process from 'node:process'
import { consola } from 'consola'

export const FUNCTION_STORE_PATH = join('.git', 'commitguard-functions.json')

type Extractor = (source: string) => string[]

const KEYWORDS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'return',
  'new',
  'typeof',
  'instanceof',
  'delete',
  'void',
  'throw',
  'case',
  'default',
  'else',
  'constructor',
  'super',
  'import',
  'export',
  'from',
  'class',
])

const SUPPORTED_EXTENSIONS = new Set([
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.mjs',
  '.mts',
  '.cjs',
  '.cts',
])

function getExtension(file: string): string {
  const i = file.lastIndexOf('.')
  return i > 0 ? file.slice(i) : ''
}

// Matches the `export` or `export default` prefix at the start of a trimmed line
const EXPORT_RE = /^export(?:\s+default)?\s+/

/**
 * Attempts to match a function declaration on a single source line.
 * Returns the function name + whether it is directly exported on that line.
 */
function matchFunctionLine(line: string): { name: string, exported: boolean } | null {
  const trimmed = line.trimStart()
  const exported = EXPORT_RE.test(trimmed)
  const core = trimmed.replace(EXPORT_RE, '').trimStart()

  // function / async function / function*
  let m = core.match(/^(?:async\s+)?function\s*(?:\*\s*)?([A-Za-z_$][\w$]*)\s*[(<]/)
  if (m && m[1].length >= 3)
    return { name: m[1], exported }

  // const/let/var foo = () => / = async () => / = function / = name =>
  m = core.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/)
  if (m && m[1].length >= 3)
    return { name: m[1], exported }

  // Class method: optional modifiers then name(args) { / name(args):
  // Methods are never directly exported (only via their class), so only match
  // when no export prefix is present to avoid false positives.
  if (!exported) {
    m = trimmed.match(/^(?:(?:async|static|override|abstract|public|private|protected|readonly|get|set)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?:\{|:)/)
    if (m && !KEYWORDS.has(m[1]) && m[1].length >= 3)
      return { name: m[1], exported: false }
  }

  return null
}

/**
 * Attempts to match a type-level declaration (interface / type alias / enum / class)
 * on a single source line.
 */
function matchTypeLine(line: string): { name: string, kind: TypeKind, exported: boolean } | null {
  const trimmed = line.trimStart()
  const exported = EXPORT_RE.test(trimmed)
  const core = trimmed.replace(EXPORT_RE, '').trimStart()

  let m = core.match(/^interface\s+([A-Za-z_$][\w$]*)[\s<{]/)
  if (m)
    return { name: m[1], kind: 'interface', exported }

  m = core.match(/^type\s+([A-Za-z_$][\w$]*)\s*[=<]/)
  if (m)
    return { name: m[1], kind: 'type', exported }

  m = core.match(/^(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)\s*\{/)
  if (m)
    return { name: m[1], kind: 'enum', exported }

  m = core.match(/^(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)[\s<{(]/)
  if (m)
    return { name: m[1], kind: 'class', exported }

  return null
}

/**
 * Finds symbols that appear in more than one file within the same commit.
 */
function findIntraCommitDuplicates(
  items: Array<{ name: string, file: string }>,
): DuplicateSymbol[] {
  const byName = new Map<string, Set<string>>()
  for (const { name, file } of items) {
    if (!byName.has(name))
      byName.set(name, new Set())
    byName.get(name)!.add(file)
  }
  const dupes: DuplicateSymbol[] = []
  for (const [name, files] of byName) {
    if (files.size > 1)
      dupes.push({ name, files: [...files] })
  }
  return dupes
}

export function extractJsTsFunctionNames(source: string): string[] {
  const names = new Set<string>()

  // function declarations: function foo( / async function* foo(
  for (const m of source.matchAll(/(?:^|[;{(\s,])(?:async\s+)?function(?:\s+(?:\*\s+)?|\*\s+)([A-Za-z_$][\w$]*)\s*[(<]/gm)) {
    names.add(m[1])
  }

  // Variable-assigned functions / arrow functions:
  //   const foo = function(  /  const foo = async (  /  const foo = () =>
  for (const m of source.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g)) {
    names.add(m[1])
  }

  // Class / object method definitions: foo() {  /  async foo() {  /  static get foo() {
  for (const m of source.matchAll(/^\s*(?:(?:async|static|override|abstract|public|private|protected|get|set)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?:\{|:)/gm)) {
    const name = m[1]
    if (!KEYWORDS.has(name)) {
      names.add(name)
    }
  }

  // Filter: must be >= 3 chars to avoid noise (fn, cb, f, etc.)
  return [...names].filter(n => n.length >= 3)
}

export const EXTRACTORS: Record<string, Extractor> = {
  '.js': extractJsTsFunctionNames,
  '.ts': extractJsTsFunctionNames,
  '.jsx': extractJsTsFunctionNames,
  '.tsx': extractJsTsFunctionNames,
  '.mjs': extractJsTsFunctionNames,
  '.mts': extractJsTsFunctionNames,
  '.cjs': extractJsTsFunctionNames,
  '.cts': extractJsTsFunctionNames,
}

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  'coverage',
  '.turbo',
  '.cache',
  'vendor',
])

export function scanProjectFunctions(
  rootDir: string,
  supportedExtensions: string[] = Object.keys(EXTRACTORS),
): string[] {
  const names = new Set<string>()

  function walk(dir: string): void {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    }
    catch {
      return
    }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry))
        continue

      const full = join(dir, entry)
      let st
      try {
        st = statSync(full)
      }
      catch {
        continue
      }

      if (st.isDirectory()) {
        walk(full)
      }
      else if (supportedExtensions.includes(extname(entry))) {
        try {
          const content = readFileSync(full, 'utf8')
          const extractor = EXTRACTORS[extname(entry)]
          if (extractor) {
            for (const n of extractor(content))
              names.add(n)
          }
        }
        catch {
          // unreadable file — skip
        }
      }
    }
  }

  walk(rootDir)
  return [...names]
}

export function extractFunctionNamesFromDiff(diff: string): string[] {
  // Group added lines by file, determined by "+++ b/path" headers.
  // Added lines use the "N:+content" format produced by addGitLineNumbers.
  const sections: Record<string, string[]> = {}
  let currentFile = ''

  for (const line of diff.split('\n')) {
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/)
    if (fileMatch) {
      currentFile = fileMatch[1]
      if (!sections[currentFile])
        sections[currentFile] = []
      continue
    }

    if (!currentFile)
      continue

    const addedMatch = line.match(/^\d+:\+(.*)$/)
    if (addedMatch) {
      sections[currentFile].push(addedMatch[1])
    }
  }

  const names = new Set<string>()
  for (const [file, lines] of Object.entries(sections)) {
    const ext = extname(file)
    const extractor = EXTRACTORS[ext]
    if (extractor) {
      for (const n of extractor(lines.join('\n')))
        names.add(n)
    }
  }

  return [...names]
}

interface FunctionStore {
  names: string[]
  lastScan: number
}

export function loadFunctionNames(): string[] {
  if (!existsSync(FUNCTION_STORE_PATH))
    return []
  try {
    const store: FunctionStore = JSON.parse(readFileSync(FUNCTION_STORE_PATH, 'utf8'))
    return Array.isArray(store.names) ? store.names : []
  }
  catch {
    return []
  }
}

export function saveFunctionNames(names: string[]): void {
  const store: FunctionStore = { names: [...new Set(names)], lastScan: Date.now() }
  writeFileSync(FUNCTION_STORE_PATH, JSON.stringify(store))
}

export function addFunctionNames(newNames: string[]): void {
  const existing = new Set(loadFunctionNames())
  for (const n of newNames)
    existing.add(n)
  saveFunctionNames([...existing])
}

export async function runFunctionScan(): Promise<void> {
  if (!existsSync('.git')) {
    consola.error('No .git folder found. Run this inside a git repository.')
    process.exit(1)
  }

  consola.start('Scanning project for function names...')
  const names = scanProjectFunctions(process.cwd())
  saveFunctionNames(names)
  const exts = Object.keys(EXTRACTORS).join(', ')
  consola.success(`Tracked ${names.length} function name${names.length === 1 ? '' : 's'} (${exts})`)
}

/**
 * Parses a staged diff (in the `addGitLineNumbers` format `N:+content`)
 * and returns rich symbol metadata for JS/TS files.
 *
 * @param diff            The annotated diff string from `getStagedDiff()`.
 * @param knownFunctionNames  The full project baseline from `loadFunctionNames()`.
 *                        Passed through to the endpoint for server-side comparison.
 */
export function extractCommitSymbols(
  diff: string,
  knownFunctionNames: string[] = [],
): CommitSymbols {
  const functions: FunctionInfo[] = []
  const types: TypeInfo[] = []
  let currentFile = ''

  for (const line of diff.split('\n')) {
    // Track which file we are currently inside
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/)
    if (fileMatch) {
      currentFile = fileMatch[1]
      continue
    }

    if (!currentFile)
      continue

    if (!SUPPORTED_EXTENSIONS.has(getExtension(currentFile)))
      continue

    // Only process added lines  -  format is "LINE_NUM:+CONTENT"
    const addedMatch = line.match(/^(\d+):\+(.*)$/)
    if (!addedMatch)
      continue

    const lineNum = Number.parseInt(addedMatch[1], 10)
    const content = addedMatch[2]

    const fn = matchFunctionLine(content)
    if (fn) {
      functions.push({ name: fn.name, file: currentFile, line: lineNum, exported: fn.exported })
    }

    const ty = matchTypeLine(content)
    if (ty) {
      types.push({ name: ty.name, file: currentFile, line: lineNum, exported: ty.exported, kind: ty.kind })
    }
  }

  return {
    functions,
    types,
    duplicateFunctions: findIntraCommitDuplicates(functions),
    duplicateTypes: findIntraCommitDuplicates(types),
    knownFunctionNames,
  }
}
