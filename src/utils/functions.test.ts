import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addFunctionNames,
  extractFunctionNamesFromDiff,
  extractJsTsFunctionNames,
  loadFunctionNames,
  saveFunctionNames,
  scanProjectFunctions,
} from './functions'

vi.mock('node:fs')

describe('extractJsTsFunctionNames', () => {
  it('extracts standard function declarations', () => {
    const src = `
function doSomething() {}
async function fetchUser() {}
function* generatorFn() {}
`
    const names = extractJsTsFunctionNames(src)
    expect(names).toContain('doSomething')
    expect(names).toContain('fetchUser')
    expect(names).toContain('generatorFn')
  })

  it('extracts arrow and const-assigned functions', () => {
    const src = `
const handleClick = () => {}
const loadData = async () => {}
const process = function() {}
let buildResponse = (x) => x
`
    const names = extractJsTsFunctionNames(src)
    expect(names).toContain('handleClick')
    expect(names).toContain('loadData')
    expect(names).toContain('process')
    expect(names).toContain('buildResponse')
  })

  it('extracts class methods', () => {
    const src = `
class MyService {
  async fetchAll() {}
  static create() {}
  private deleteById() {}
}
`
    const names = extractJsTsFunctionNames(src)
    expect(names).toContain('fetchAll')
    expect(names).toContain('create')
    expect(names).toContain('deleteById')
  })

  it('does not include keywords', () => {
    const src = `
if (condition) {}
for (let i = 0; i < 10; i++) {}
while (true) {}
switch (x) { case 1: break }
`
    const names = extractJsTsFunctionNames(src)
    expect(names).not.toContain('if')
    expect(names).not.toContain('for')
    expect(names).not.toContain('while')
    expect(names).not.toContain('switch')
  })

  it('filters out names shorter than 3 characters', () => {
    const src = `
const fn = () => {}
function go() {}
`
    const names = extractJsTsFunctionNames(src)
    expect(names).not.toContain('fn')
    expect(names).not.toContain('go')
  })

  it('deduplicates names', () => {
    const src = `
function doWork() {}
function doWork() {}
`
    const names = extractJsTsFunctionNames(src)
    expect(names.filter(n => n === 'doWork').length).toBe(1)
  })
})

describe('extractFunctionNamesFromDiff', () => {
  it('extracts names only from added lines in JS/TS files', () => {
    const diff = `diff --git a/src/helper.ts b/src/helper.ts
--- a/src/helper.ts
+++ b/src/helper.ts
@@ -1,3 +1,6 @@
1: existingFunction() {}
2:+
3:+function newHelper() {}
4:+const arrowFn = () => {}
5:-function removedOld() {}
`
    const names = extractFunctionNamesFromDiff(diff)
    expect(names).toContain('newHelper')
    expect(names).toContain('arrowFn')
    expect(names).not.toContain('removedOld')
    expect(names).not.toContain('existingFunction')
  })

  it('ignores non-JS/TS file sections', () => {
    const diff = `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1,1 +1,2 @@
1: # Project
2:+function notAFunction() {}
`
    const names = extractFunctionNamesFromDiff(diff)
    expect(names).toHaveLength(0)
  })

  it('handles multiple file sections', () => {
    const diff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,1 +1,2 @@
1:+function alphaFn() {}
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,1 +1,2 @@
1:+function betaFn() {}
`
    const names = extractFunctionNamesFromDiff(diff)
    expect(names).toContain('alphaFn')
    expect(names).toContain('betaFn')
  })

  it('returns empty array for empty diff', () => {
    expect(extractFunctionNamesFromDiff('')).toHaveLength(0)
  })
})

describe('loadFunctionNames / saveFunctionNames / addFunctionNames', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loadFunctionNames returns empty array when file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    expect(loadFunctionNames()).toEqual([])
  })

  it('loadFunctionNames returns names from file', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ names: ['doSomething', 'fetchUser'], lastScan: 0 }),
    )
    expect(loadFunctionNames()).toEqual(['doSomething', 'fetchUser'])
  })

  it('loadFunctionNames returns empty array on malformed JSON', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue('not json')
    expect(loadFunctionNames()).toEqual([])
  })

  it('saveFunctionNames deduplicates and writes', () => {
    vi.mocked(writeFileSync).mockReturnValue(undefined)
    saveFunctionNames(['alpha', 'alpha', 'beta'])
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    expect(written.names).toEqual(['alpha', 'beta'])
  })

  it('addFunctionNames merges with existing', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ names: ['alpha'], lastScan: 0 }),
    )
    vi.mocked(writeFileSync).mockReturnValue(undefined)
    addFunctionNames(['beta', 'gamma'])
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    expect(written.names).toContain('alpha')
    expect(written.names).toContain('beta')
    expect(written.names).toContain('gamma')
  })
})

describe('scanProjectFunctions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts function names from TS files recursively', () => {
    vi.mocked(readdirSync)
      .mockReturnValueOnce(['src'] as any)
      .mockReturnValueOnce(['helper.ts'] as any)

    vi.mocked(statSync)
      .mockReturnValueOnce({ isDirectory: () => true } as any)
      .mockReturnValueOnce({ isDirectory: () => false } as any)

    vi.mocked(readFileSync).mockReturnValue('export function parseConfig() {}')

    const names = scanProjectFunctions('/project')
    expect(names).toContain('parseConfig')
  })

  it('skips node_modules and dist', () => {
    vi.mocked(readdirSync).mockReturnValueOnce(['node_modules', 'dist', 'src'] as any)

    vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as any)
    // The third entry (src) triggers another readdir that returns empty
    vi.mocked(readdirSync).mockReturnValueOnce([] as any)

    const names = scanProjectFunctions('/project')
    expect(names).toHaveLength(0)
  })
})
