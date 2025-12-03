import * as childProcess from 'node:child_process'
import micromatch from 'micromatch'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getStagedDiff } from './git'

vi.mock('node:child_process')
vi.mock('micromatch')

describe('getStagedDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return full diff when no ignore patterns provided', () => {
    const mockDiff = 'diff --git a/file.ts b/file.ts\n+added line'

    vi.mocked(childProcess.execSync).mockReturnValue(mockDiff)

    const result = getStagedDiff([])

    expect(result).toBe(mockDiff)
    expect(childProcess.execSync).toHaveBeenCalledWith(
      'git diff --cached --unified=10 --no-color --minimal --ignore-all-space --function-context --diff-algorithm=histogram --diff-filter=AMC',
      {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'ignore'],
      },
    )
  })

  it('should return empty string when git command fails', () => {
    vi.mocked(childProcess.execSync).mockImplementation(() => {
      throw new Error('Git error')
    })

    const result = getStagedDiff([])

    expect(result).toBe('')
  })

  it('should filter out files matching ignore patterns', () => {
    const mockDiff = `diff --git a/src/index.ts b/src/index.ts
+code
diff --git a/test/index.test.ts b/test/index.test.ts
+test code
diff --git a/docs/README.md b/docs/README.md
+docs`

    vi.mocked(childProcess.execSync).mockReturnValue(mockDiff)
    vi.mocked(micromatch.isMatch)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)

    const result = getStagedDiff(['**/*.test.ts'])

    expect(result).toContain('diff --git a/src/index.ts b/src/index.ts')
    expect(result).toContain('diff --git a/docs/README.md b/docs/README.md')
    expect(result).not.toContain('diff --git a/test/index.test.ts b/test/index.test.ts')
    expect(micromatch.isMatch).toHaveBeenCalledWith('src/index.ts', ['**/*.test.ts'], { dot: true, matchBase: true })
    expect(micromatch.isMatch).toHaveBeenCalledWith('test/index.test.ts', ['**/*.test.ts'], { dot: true, matchBase: true })
    expect(micromatch.isMatch).toHaveBeenCalledWith('docs/README.md', ['**/*.test.ts'], { dot: true, matchBase: true })
  })

  it('should handle multiple ignore patterns', () => {
    const mockDiff = `diff --git a/src/index.ts b/src/index.ts
+code
diff --git a/test/index.test.ts b/test/index.test.ts
+test code
diff --git a/dist/bundle.js b/dist/bundle.js
+compiled`

    vi.mocked(childProcess.execSync).mockReturnValue(mockDiff)
    vi.mocked(micromatch.isMatch)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)

    const result = getStagedDiff(['**/*.test.ts', 'dist/**'])

    expect(result).toContain('diff --git a/src/index.ts b/src/index.ts')
    expect(result).not.toContain('test/index.test.ts')
    expect(result).not.toContain('dist/bundle.js')
  })

  it('should return empty string when all files are filtered out', () => {
    const mockDiff = `diff --git a/test/file.test.ts b/test/file.test.ts
+test code`

    vi.mocked(childProcess.execSync).mockReturnValue(mockDiff)
    vi.mocked(micromatch.isMatch).mockReturnValue(true)

    const result = getStagedDiff(['**/*.test.ts'])

    expect(result).toBe('')
  })

  it('should handle diff sections without proper file path match', () => {
    const mockDiff = `diff --git invalid format
+code
diff --git a/valid.ts b/valid.ts
+valid code`

    vi.mocked(childProcess.execSync).mockReturnValue(mockDiff)
    vi.mocked(micromatch.isMatch).mockReturnValue(false)

    const result = getStagedDiff(['*.ignored'])

    expect(result).toContain('diff --git invalid format')
    expect(result).toContain('diff --git a/valid.ts b/valid.ts')
  })

  it('should handle empty diff output', () => {
    vi.mocked(childProcess.execSync).mockReturnValue('')

    const result = getStagedDiff([])

    expect(result).toBe('')
  })

  it('should handle diff with dotfiles when using dot option', () => {
    const mockDiff = `diff --git a/.gitignore b/.gitignore
+pattern
diff --git a/src/index.ts b/src/index.ts
+code`

    vi.mocked(childProcess.execSync).mockReturnValue(mockDiff)
    vi.mocked(micromatch.isMatch)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)

    const result = getStagedDiff(['.gitignore'])

    expect(result).not.toContain('.gitignore')
    expect(result).toContain('diff --git a/src/index.ts b/src/index.ts')
    expect(micromatch.isMatch).toHaveBeenCalledWith('.gitignore', ['.gitignore'], { dot: true, matchBase: true })
  })

  it('should preserve diff format when filtering', () => {
    const mockDiff = `diff --git a/file1.ts b/file1.ts
index 1234567..abcdefg 100644
--- a/file1.ts
+++ b/file1.ts
@@ -1,3 +1,4 @@
+new line
 existing line
diff --git a/file2.ts b/file2.ts
index 8901234..xyz5678 100644
--- a/file2.ts
+++ b/file2.ts
@@ -1,2 +1,3 @@
+another line
 code`

    vi.mocked(childProcess.execSync).mockReturnValue(mockDiff)
    vi.mocked(micromatch.isMatch)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)

    const result = getStagedDiff(['ignored/**'])

    expect(result).toContain('diff --git a/file1.ts b/file1.ts')
    expect(result).toContain('index 1234567..abcdefg 100644')
    expect(result).toContain('diff --git a/file2.ts b/file2.ts')
  })

  it('should handle complex file paths with spaces', () => {
    const mockDiff = `diff --git a/path with spaces/file.ts b/path with spaces/file.ts
+code`

    vi.mocked(childProcess.execSync).mockReturnValue(mockDiff)
    vi.mocked(micromatch.isMatch).mockReturnValue(false)

    const result = getStagedDiff(['*.ignored'])

    expect(result).toContain('diff --git a/path with spaces/file.ts')
    expect(micromatch.isMatch).toHaveBeenCalledWith('path with spaces/file.ts', ['*.ignored'], { dot: true, matchBase: true })
  })

  it('should use correct git diff options', () => {
    vi.mocked(childProcess.execSync).mockReturnValue('')

    getStagedDiff([])

    expect(childProcess.execSync).toHaveBeenCalledWith(
      expect.stringContaining('--cached'),
      expect.any(Object),
    )
    expect(childProcess.execSync).toHaveBeenCalledWith(
      expect.stringContaining('--unified=10'),
      expect.any(Object),
    )
    expect(childProcess.execSync).toHaveBeenCalledWith(
      expect.stringContaining('--diff-algorithm=histogram'),
      expect.any(Object),
    )
    expect(childProcess.execSync).toHaveBeenCalledWith(
      expect.stringContaining('--diff-filter=AMC'),
      expect.any(Object),
    )
  })
})
