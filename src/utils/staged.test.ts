import * as fs from 'node:fs'
import { consola } from 'consola'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendToCommitGuard } from './api'
import { loadConfig } from './config'
import { getEslintRules } from './eslint'
import { getStagedDiff } from './git'
import { createDiffHash } from './global'
import { clearCache, getCachedAnalysis, onStaged, validateCommit } from './staged'

vi.mock('node:fs')
vi.mock('node:path', () => ({
  join: vi.fn((...args) => args.join('/')),
}))
vi.mock('consola', () => ({
  consola: {
    error: vi.fn(),
    success: vi.fn(),
    log: vi.fn(),
    prompt: vi.fn(),
  },
}))
vi.mock('string-width', () => ({
  default: vi.fn((str: string) => str.length),
}))
vi.mock('./api')
vi.mock('./config')
vi.mock('./eslint')
vi.mock('./git')
vi.mock('./global')

describe('clearCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should remove cache file if it exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.unlinkSync).mockReturnValue(undefined)

    clearCache()

    expect(fs.unlinkSync).toHaveBeenCalledWith('.git/commitguard-cache.json')
  })

  it('should not throw if cache file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    expect(() => clearCache()).not.toThrow()
    expect(fs.unlinkSync).not.toHaveBeenCalled()
  })
})

describe('onStaged', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearCache()
  })

  it('should clear cache when diff is empty', async () => {
    vi.mocked(getStagedDiff).mockReturnValue('')
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.unlinkSync).mockReturnValue(undefined)

    await onStaged()

    expect(fs.unlinkSync).toHaveBeenCalledWith('.git/commitguard-cache.json')
    expect(sendToCommitGuard).not.toHaveBeenCalled()
  })

  it('should skip analysis if cache hash matches', async () => {
    const mockDiff = 'diff content'
    const mockHash = 'abc123'

    vi.mocked(getStagedDiff).mockReturnValue(mockDiff)
    vi.mocked(createDiffHash).mockReturnValue(mockHash)
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      hash: mockHash,
      timestamp: Date.now(),
      diff: mockDiff,
      analysis: { passed: true },
    }))

    await onStaged()

    expect(sendToCommitGuard).not.toHaveBeenCalled()
  })

  it('should perform analysis when cache does not exist', async () => {
    clearCache()

    const mockDiff = 'diff content'
    const mockHash = 'abc123'
    const mockConfig = { checks: { security: true } }
    const mockEslint = { rules: {}, source: null }
    const mockResponse = { passed: true, issues: [] }

    vi.mocked(getStagedDiff).mockReturnValue(mockDiff)
    vi.mocked(createDiffHash).mockReturnValue(mockHash)
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(loadConfig).mockReturnValue(mockConfig as any)
    vi.mocked(getEslintRules).mockResolvedValue(mockEslint)
    vi.mocked(sendToCommitGuard).mockResolvedValue(mockResponse)
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)

    await onStaged()

    expect(sendToCommitGuard).toHaveBeenCalledWith(mockDiff, mockEslint.rules, mockConfig)
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '.git/commitguard-cache.json',
      expect.stringContaining(mockHash),
    )
  })

  it('should perform analysis when cache hash differs', async () => {
    clearCache()

    const mockDiff = 'new diff content'
    const mockHash = 'new-hash'
    const mockConfig = { checks: { security: true } }
    const mockEslint = { rules: {}, source: null }
    const mockResponse = { passed: true, issues: [] }

    vi.mocked(getStagedDiff).mockReturnValue(mockDiff)
    vi.mocked(createDiffHash).mockReturnValue(mockHash)
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      hash: 'old-hash',
      timestamp: Date.now(),
      diff: 'old diff',
      analysis: { passed: true },
    }))
    vi.mocked(loadConfig).mockReturnValue(mockConfig as any)
    vi.mocked(getEslintRules).mockResolvedValue(mockEslint)
    vi.mocked(sendToCommitGuard).mockResolvedValue(mockResponse)
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)

    await onStaged()

    expect(sendToCommitGuard).toHaveBeenCalled()
  })

  it('should handle analysis errors gracefully', async () => {
    clearCache()

    const mockDiff = 'diff content'
    const mockHash = 'abc123'

    vi.mocked(getStagedDiff).mockReturnValue(mockDiff)
    vi.mocked(createDiffHash).mockReturnValue(mockHash)
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(loadConfig).mockReturnValue({ checks: {} } as any)
    vi.mocked(getEslintRules).mockResolvedValue({ rules: {}, source: null })
    vi.mocked(sendToCommitGuard).mockRejectedValue(new Error('API error'))

    await onStaged()

    expect(consola.box).toHaveBeenCalledWith({
      title: 'Analysis Failed',
      message: 'API error',
      style: {
        borderColor: 'red',
      },
    })
  })
})

describe('getCachedAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearCache()
  })

  it('should return pass status for empty diff', () => {
    vi.mocked(getStagedDiff).mockReturnValue('')

    const result = getCachedAnalysis()

    expect(result).toEqual({
      analysis: { status: 'pass', issues: [] },
      age: 0,
    })
  })

  it('should return null when cache does not exist', () => {
    vi.mocked(getStagedDiff).mockReturnValue('diff content')
    vi.mocked(createDiffHash).mockReturnValue('abc123')
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const result = getCachedAnalysis()

    expect(result).toBeNull()
  })

  it('should return null when cache hash does not match', () => {
    clearCache()

    vi.mocked(getStagedDiff).mockReturnValue('diff content')
    vi.mocked(createDiffHash).mockReturnValue('new-hash')
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      hash: 'old-hash',
      timestamp: Date.now(),
      diff: 'old diff',
      analysis: { passed: true },
    }))

    const result = getCachedAnalysis()

    expect(result).toBeNull()
  })

  it('should return cached analysis when hash matches', () => {
    clearCache()

    const mockHash = 'abc123'
    const mockTimestamp = Date.now() - 5000
    const mockAnalysis = { passed: true, issues: [] }

    vi.mocked(getStagedDiff).mockReturnValue('diff content')
    vi.mocked(createDiffHash).mockReturnValue(mockHash)
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      hash: mockHash,
      timestamp: mockTimestamp,
      diff: 'diff content',
      analysis: mockAnalysis,
    }))

    const result = getCachedAnalysis()

    expect(result).toEqual({
      analysis: mockAnalysis,
      age: 5,
    })
  })

  it('should handle corrupted cache gracefully', () => {
    clearCache()

    vi.mocked(getStagedDiff).mockReturnValue('diff content')
    vi.mocked(createDiffHash).mockReturnValue('abc123')
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('invalid json{')

    const result = getCachedAnalysis()

    expect(result).toBeNull()
  })
})

describe('validateCommit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearCache()
  })

  it('should display success when analysis passes', async () => {
    vi.mocked(getStagedDiff).mockReturnValue('diff content')
    vi.mocked(createDiffHash).mockReturnValue('abc123')
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      hash: 'abc123',
      timestamp: Date.now(),
      diff: 'diff content',
      analysis: { status: 'pass', issues: [] },
    }))

    await validateCommit()

    expect(consola.success).toHaveBeenCalledWith('All checks passed')
  })

  it('should display success when analysis is approved', async () => {
    vi.mocked(getStagedDiff).mockReturnValue('diff content')
    vi.mocked(createDiffHash).mockReturnValue('abc123')
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      hash: 'abc123',
      timestamp: Date.now(),
      diff: 'diff content',
      analysis: { approved: true, issues: [] },
    }))

    await validateCommit()

    expect(consola.success).toHaveBeenCalledWith('All checks passed')
  })

  it('should trigger new analysis when cache is missing', async () => {
    vi.mocked(getStagedDiff).mockReturnValue('diff content')
    vi.mocked(createDiffHash).mockReturnValue('abc123')
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(loadConfig).mockReturnValue({ checks: {} } as any)
    vi.mocked(getEslintRules).mockResolvedValue({ rules: {}, source: null })
    vi.mocked(sendToCommitGuard).mockResolvedValue({ passed: true, issues: [] })
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)

    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify({
      hash: 'abc123',
      timestamp: Date.now(),
      diff: 'diff content',
      analysis: { status: 'pass', issues: [] },
    }))

    await validateCommit()

    expect(sendToCommitGuard).toHaveBeenCalled()
  })
})
