import * as childProcess from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getLastDiff, getStagedDiff } from './git'
import { addGitLineNumbers } from './global'

vi.mock('node:child_process')
vi.mock('./global', () => ({
  addGitLineNumbers: vi.fn((diff: string) => `numbered-${diff}`),
}))
vi.mock('../data/ignore.json', () => ({
  default: {
    ignore: ['node_modules/**', '*.lock', 'dist/**'],
  },
}))

describe('getStagedDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return staged diff with line numbers', () => {
    const mockDiff = 'diff --git a/file.ts b/file.ts\n+added line'
    vi.mocked(childProcess.execFileSync).mockReturnValue(mockDiff)

    const result = getStagedDiff('normal')

    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'git',
      [
        'diff',
        '--cached',
        '--no-color',
        '--function-context',
        '--diff-algorithm=histogram',
        '--diff-filter=AMC',
        '--',
        '.',
        ':(exclude)node_modules/**',
        ':(exclude)*.lock',
        ':(exclude)dist/**',
      ],
      {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'ignore'],
      },
    )
    expect(addGitLineNumbers).toHaveBeenCalledWith(mockDiff)
    expect(result).toBe(`numbered-${mockDiff}`)
  })

  it('should return empty string when git command fails', () => {
    vi.mocked(childProcess.execFileSync).mockImplementation(() => {
      throw new Error('Not a git repository')
    })

    const result = getStagedDiff('normal')

    expect(result).toBe('')
  })

  it('should handle empty diff', () => {
    vi.mocked(childProcess.execFileSync).mockReturnValue('')

    const result = getStagedDiff('normal')

    expect(addGitLineNumbers).toHaveBeenCalledWith('')
    expect(result).toBe('numbered-')
  })

  it('should use correct buffer size for large diffs', () => {
    const largeDiff = 'a'.repeat(5 * 1024 * 1024)
    vi.mocked(childProcess.execFileSync).mockReturnValue(largeDiff)

    getStagedDiff('normal')

    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'git',
      expect.any(Array),
      expect.objectContaining({
        maxBuffer: 10 * 1024 * 1024,
      }),
    )
  })
})

describe('getLastDiffTest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return diff between HEAD~1 and HEAD', () => {
    const mockDiff = 'diff --git a/file.ts b/file.ts\n-removed line\n+added line'
    vi.mocked(childProcess.execFileSync).mockReturnValue(mockDiff)

    const result = getLastDiff('normal')

    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'git',
      [
        'diff',
        'HEAD~1',
        'HEAD',
        '--no-color',
        '--function-context',
        '--diff-algorithm=histogram',
        '--diff-filter=AMC',
        '--',
        '.',
        ':(exclude)node_modules/**',
        ':(exclude)*.lock',
        ':(exclude)dist/**',
      ],
      {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'ignore'],
      },
    )
    expect(result).toBe(mockDiff)
  })

  it('should return empty string when git command fails', () => {
    vi.mocked(childProcess.execFileSync).mockImplementation(() => {
      throw new Error('fatal: ambiguous argument HEAD~1')
    })

    const result = getLastDiff('normal')

    expect(result).toBe('')
  })

  it('should handle empty diff when no changes', () => {
    vi.mocked(childProcess.execFileSync).mockReturnValue('')

    const result = getLastDiff('normal')

    expect(result).toBe('')
  })

  it('should not call addGitLineNumbers', () => {
    const mockDiff = 'diff --git a/file.ts'
    vi.mocked(childProcess.execFileSync).mockReturnValue(mockDiff)

    const result = getLastDiff('normal')

    expect(addGitLineNumbers).not.toHaveBeenCalled()
    expect(result).toBe(mockDiff)
  })

  it('should handle buffer overflow errors', () => {
    vi.mocked(childProcess.execFileSync).mockImplementation(() => {
      const error = new Error('stdout maxBuffer exceeded')
      ;(error as any).code = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
      throw error
    })

    const result = getLastDiff('normal')

    expect(result).toBe('')
  })

  it('should use correct diff filter flags', () => {
    vi.mocked(childProcess.execFileSync).mockReturnValue('diff')

    getLastDiff('normal')

    const callArgs = vi.mocked(childProcess.execFileSync).mock.calls[0][1] as string[]
    expect(callArgs).toContain('--diff-filter=AMC')
  })

  it('should exclude patterns from ignore config', () => {
    vi.mocked(childProcess.execFileSync).mockReturnValue('diff')

    getLastDiff('normal')

    const callArgs = vi.mocked(childProcess.execFileSync).mock.calls[0][1] as string[]
    expect(callArgs).toContain(':(exclude)node_modules/**')
    expect(callArgs).toContain(':(exclude)*.lock')
    expect(callArgs).toContain(':(exclude)dist/**')
  })
})
