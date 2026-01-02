import { describe, expect, it } from 'vitest'
import { addGitLineNumbers, createDiffHash } from './global'

describe('createDiffHash', () => {
  it('should create consistent hash for same input', () => {
    const diff = 'diff --git a/file.ts b/file.ts\n+added line'
    const hash1 = createDiffHash(diff)
    const hash2 = createDiffHash(diff)

    expect(hash1).toBe(hash2)
  })

  it('should create different hashes for different inputs', () => {
    const diff1 = 'diff --git a/file1.ts'
    const diff2 = 'diff --git a/file2.ts'

    const hash1 = createDiffHash(diff1)
    const hash2 = createDiffHash(diff2)

    expect(hash1).not.toBe(hash2)
  })

  it('should return base64url encoded hash', () => {
    const diff = 'test diff'
    const hash = createDiffHash(diff)

    expect(hash).toMatch(/^[\w-]+$/)
    expect(hash).not.toContain('+')
    expect(hash).not.toContain('/')
    expect(hash).not.toContain('=')
  })

  it('should handle empty string', () => {
    const hash = createDiffHash('')

    expect(hash).toBeTruthy()
    expect(typeof hash).toBe('string')
  })

  it('should handle multi-line diffs', () => {
    const diff = `diff --git a/file.ts b/file.ts
-old line
+new line
 context line`

    const hash = createDiffHash(diff)

    expect(hash).toBeTruthy()
    expect(typeof hash).toBe('string')
  })

  it('should handle large diffs', () => {
    const largeDiff = 'a'.repeat(10000)
    const hash = createDiffHash(largeDiff)

    expect(hash).toBeTruthy()
    expect(hash.length).toBeGreaterThan(0)
  })
})

describe('addGitLineNumbers', () => {
  it('should return empty string for empty input', () => {
    expect(addGitLineNumbers('')).toBe('')
  })

  it('should return unchanged for whitespace-only input', () => {
    expect(addGitLineNumbers('   ')).toBe('   ')
    expect(addGitLineNumbers('\n\n')).toBe('\n\n')
  })

  it('should preserve diff headers', () => {
    const diff = `diff --git a/file.ts b/file.ts
index 1234567..abcdefg 100644
--- a/file.ts
+++ b/file.ts`

    const result = addGitLineNumbers(diff)

    expect(result).toContain('diff --git a/file.ts b/file.ts')
    expect(result).toContain('index 1234567..abcdefg 100644')
    expect(result).toContain('--- a/file.ts')
    expect(result).toContain('+++ b/file.ts')
  })

  it('should add line numbers to added lines', () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 context line
+added line
 context line`

    const result = addGitLineNumbers(diff)
    const lines = result.split('\n')

    expect(lines).toContain('1: context line')
    expect(lines).toContain('2:+added line')
    expect(lines).toContain('3: context line')
  })

  it('should add line numbers to removed lines', () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,2 @@
 context line
-removed line
 context line`

    const result = addGitLineNumbers(diff)
    const lines = result.split('\n')

    expect(lines).toContain('1: context line')
    expect(lines).toContain('2:-removed line')
    expect(lines).toContain('2: context line')
  })

  it('should handle context lines correctly', () => {
    const diff = `@@ -5,3 +5,3 @@
 context line 1
 context line 2
 context line 3`

    const result = addGitLineNumbers(diff)
    const lines = result.split('\n')

    expect(lines[1]).toBe('5: context line 1')
    expect(lines[2]).toBe('6: context line 2')
    expect(lines[3]).toBe('7: context line 3')
  })

  it('should handle mixed changes', () => {
    const diff = `@@ -10,5 +10,5 @@
 context
-old line
+new line
 context
 more context`

    const result = addGitLineNumbers(diff)
    const lines = result.split('\n')

    expect(lines[1]).toBe('10: context')
    expect(lines[2]).toBe('11:-old line')
    expect(lines[3]).toBe('11:+new line')
    expect(lines[4]).toBe('12: context')
    expect(lines[5]).toBe('13: more context')
  })

  it('should parse hunk headers with line counts', () => {
    const diff = `@@ -1,10 +1,12 @@
 line`

    const result = addGitLineNumbers(diff)

    expect(result).toContain('1: line')
  })

  it('should parse hunk headers without line counts', () => {
    const diff = `@@ -1 +1 @@
 line`

    const result = addGitLineNumbers(diff)

    expect(result).toContain('1: line')
  })

  it('should handle multiple hunks', () => {
    const diff = `@@ -1,2 +1,2 @@
 first hunk
+added in first
@@ -10,2 +11,2 @@
 second hunk
+added in second`

    const result = addGitLineNumbers(diff)
    const lines = result.split('\n')

    expect(lines[1]).toBe('1: first hunk')
    expect(lines[2]).toBe('2:+added in first')
    expect(lines[4]).toBe('11: second hunk')
    expect(lines[5]).toBe('12:+added in second')
  })

  it('should handle file creation', () => {
    const diff = `diff --git a/new-file.ts b/new-file.ts
--- /dev/null
+++ b/new-file.ts
@@ -0,0 +1,3 @@
+line 1
+line 2
+line 3`

    const result = addGitLineNumbers(diff)

    expect(result).toContain('1:+line 1')
    expect(result).toContain('2:+line 2')
    expect(result).toContain('3:+line 3')
  })

  it('should handle file deletion', () => {
    const diff = `diff --git a/old-file.ts b/old-file.ts
--- a/old-file.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-line 1
-line 2
-line 3`

    const result = addGitLineNumbers(diff)

    expect(result).toContain('1:-line 1')
    expect(result).toContain('2:-line 2')
    expect(result).toContain('3:-line 3')
  })

  it('should increment old line only for removed lines', () => {
    const diff = `@@ -5,4 +5,2 @@
 context
-removed 1
-removed 2
 context`

    const result = addGitLineNumbers(diff)
    const lines = result.split('\n')

    expect(lines[1]).toBe('5: context')
    expect(lines[2]).toBe('6:-removed 1')
    expect(lines[3]).toBe('7:-removed 2')
    expect(lines[4]).toBe('6: context')
  })

  it('should increment new line only for added lines', () => {
    const diff = `@@ -5,2 +5,4 @@
 context
+added 1
+added 2
 context`

    const result = addGitLineNumbers(diff)
    const lines = result.split('\n')

    expect(lines[1]).toBe('5: context')
    expect(lines[2]).toBe('6:+added 1')
    expect(lines[3]).toBe('7:+added 2')
    expect(lines[4]).toBe('8: context')
  })

  it('should handle hunk header with function context', () => {
    const diff = `@@ -15,3 +15,3 @@ function myFunc() {
 context`

    const result = addGitLineNumbers(diff)

    expect(result).toContain('@@ -15,3 +15,3 @@ function myFunc() {')
    expect(result).toContain('15: context')
  })

  it('should handle real-world git diff format', () => {
    const diff = `diff --git a/src/file.ts b/src/file.ts
index abc123..def456 100644
--- a/src/file.ts
+++ b/src/file.ts
@@ -42,7 +42,8 @@ export function example() {
   const x = 1
   const y = 2
-  return x + y
+  const z = 3
+  return x + y + z
   console.log('done')
 }
 `

    const result = addGitLineNumbers(diff)

    expect(result).toContain('42:   const x = 1')
    expect(result).toContain('43:   const y = 2')
    expect(result).toContain('44:-  return x + y')
    expect(result).toContain('44:+  const z = 3')
    expect(result).toContain('45:+  return x + y + z')
    expect(result).toContain('46:   console.log(\'done\')')
  })
})
