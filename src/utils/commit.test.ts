import type { CommitGuardIssue, CommitGuardResponse } from '../types'
import process from 'node:process'
import { consola } from 'consola'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendToCommitGuard } from './api'
import { runPreCommit } from './commit'
import { loadConfig } from './config'
import { getEslintRules } from './eslint'
import { getStagedDiff } from './git'

vi.mock('./git')
vi.mock('./config')
vi.mock('./eslint')
vi.mock('./api')
vi.mock('consola')

describe('runPreCommit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.COMMITGUARD_DISABLED
    delete process.env.COMMITGUARD_FAIL_OPEN
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should exit early when COMMITGUARD_DISABLED is true', async () => {
    process.env.COMMITGUARD_DISABLED = 'true'

    await runPreCommit()

    expect(consola.warn).toHaveBeenCalledWith('CommitGuard is disabled via COMMITGUARD_DISABLED env variable.')
    expect(getStagedDiff).not.toHaveBeenCalled()
  })

  it('should exit early when COMMITGUARD_DISABLED is 1', async () => {
    process.env.COMMITGUARD_DISABLED = '1'

    await runPreCommit()

    expect(consola.warn).toHaveBeenCalledWith('CommitGuard is disabled via COMMITGUARD_DISABLED env variable.')
    expect(getStagedDiff).not.toHaveBeenCalled()
  })

  it('should return early when no staged changes', async () => {
    vi.mocked(getStagedDiff).mockReturnValue('')

    await runPreCommit()

    expect(consola.info).toHaveBeenCalledWith('No staged changes to check')
    expect(loadConfig).not.toHaveBeenCalled()
  })

  it('should return early when diff is only whitespace', async () => {
    vi.mocked(getStagedDiff).mockReturnValue('   \n  \t  ')

    await runPreCommit()

    expect(consola.info).toHaveBeenCalledWith('No staged changes to check')
    expect(loadConfig).not.toHaveBeenCalled()
  })

  it('should pass when no issues detected', async () => {
    const mockDiff = 'diff --git a/file.ts b/file.ts\n+added line'
    const mockConfig = {
      checks: { security: true, performance: true, codeQuality: true, architecture: true },
      speed: 'balanced' as const,
      failOpen: false,
    }
    const mockEslint = { rules: { 'no-console': 'error' }, source: '.eslintrc.json' }
    const mockResponse: CommitGuardResponse = {
      passed: true,
      issues: [],
    }

    vi.mocked(getStagedDiff).mockReturnValue(mockDiff)
    vi.mocked(loadConfig).mockReturnValue(mockConfig)
    vi.mocked(getEslintRules).mockResolvedValue(mockEslint)
    vi.mocked(sendToCommitGuard).mockResolvedValue(mockResponse)

    await runPreCommit()

    expect(consola.log).toHaveBeenCalledWith('✅ All checks passed! Your commit looks good.\n')
    expect(process.exit).not.toHaveBeenCalled()
  })

  it('should block commit when issues are detected', async () => {
    const mockDiff = 'diff --git a/file.ts b/file.ts\n+console.log("test")'
    const mockConfig = {
      checks: { security: true, performance: true, codeQuality: true, architecture: true },
      speed: 'balanced' as const,
      failOpen: false,
    }
    const mockEslint = { rules: {}, source: null }
    const mockIssues: CommitGuardIssue[] = [
      {
        category: 'security',
        severity: 'critical',
        type: 'sql-injection',
        message: 'Potential SQL injection vulnerability',
        file: 'src/db.ts',
        line: 42,
      },
    ]
    const mockResponse: CommitGuardResponse = {
      passed: false,
      issues: mockIssues,
    }

    vi.mocked(getStagedDiff).mockReturnValue(mockDiff)
    vi.mocked(loadConfig).mockReturnValue(mockConfig)
    vi.mocked(getEslintRules).mockResolvedValue(mockEslint)
    vi.mocked(sendToCommitGuard).mockResolvedValue(mockResponse)

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`)
    })

    await expect(runPreCommit()).rejects.toThrow('process.exit(1)')

    expect(consola.log).toHaveBeenCalledWith('\nIssues detected:\n')
    expect(consola.log).toHaveBeenCalledWith('🚨 SECURITY')
    expect(consola.log).toHaveBeenCalledWith(expect.stringContaining('Potential SQL injection vulnerability'))
    expect(consola.log).toHaveBeenCalledWith(expect.stringContaining('src/db.ts:42'))
  })

  it('should group issues by category', async () => {
    const mockDiff = 'diff --git a/file.ts b/file.ts\n+code'
    const mockConfig = {
      checks: { security: true, performance: true, codeQuality: true, architecture: true },
      speed: 'balanced' as const,
      failOpen: false,
    }
    const mockIssues: CommitGuardIssue[] = [
      {
        category: 'security',
        severity: 'critical',
        type: 'xss',
        message: 'Security issue 1',
        file: 'file1.ts',
        line: 10,
      },
      {
        category: 'security',
        severity: 'warning',
        type: 'csrf',
        message: 'Security issue 2',
        file: 'file2.ts',
        line: 20,
      },
      {
        category: 'performance',
        severity: 'suggestion',
        type: 'n-plus-one',
        message: 'Performance issue',
        file: 'file3.ts',
        line: 30,
      },
    ]
    const mockResponse: CommitGuardResponse = {
      passed: false,
      issues: mockIssues,
    }

    vi.mocked(getStagedDiff).mockReturnValue(mockDiff)
    vi.mocked(loadConfig).mockReturnValue(mockConfig)
    vi.mocked(getEslintRules).mockResolvedValue({ rules: {}, source: null })
    vi.mocked(sendToCommitGuard).mockResolvedValue(mockResponse)

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`)
    })

    await expect(runPreCommit()).rejects.toThrow('process.exit(1)')

    expect(consola.log).toHaveBeenCalledWith('🚨 SECURITY')
    expect(consola.log).toHaveBeenCalledWith(expect.stringContaining('Security issue 1'))
    expect(consola.log).toHaveBeenCalledWith(expect.stringContaining('Security issue 2'))
    expect(consola.log).toHaveBeenCalledWith('⚡ PERFORMANCE')
    expect(consola.log).toHaveBeenCalledWith(expect.stringContaining('Performance issue'))
  })

  it('should display all category types', async () => {
    const mockDiff = 'diff --git a/file.ts b/file.ts\n+code'
    const mockConfig = {
      checks: { security: true, performance: true, codeQuality: true, architecture: true },
      speed: 'balanced' as const,
      failOpen: false,
    }
    const mockIssues: CommitGuardIssue[] = [
      { category: 'security', severity: 'critical', type: 'xss', message: 'Security issue', file: 'file.ts', line: 1 },
      { category: 'performance', severity: 'warning', type: 'inefficient-loop', message: 'Performance issue', file: 'file.ts', line: 2 },
      { category: 'code_quality', severity: 'suggestion', type: 'complexity', message: 'Code quality issue', file: 'file.ts', line: 3 },
      { category: 'architecture', severity: 'warning', type: 'coupling', message: 'Architecture issue', file: 'file.ts', line: 4 },
    ]
    const mockResponse: CommitGuardResponse = {
      passed: false,
      issues: mockIssues,
    }

    vi.mocked(getStagedDiff).mockReturnValue(mockDiff)
    vi.mocked(loadConfig).mockReturnValue(mockConfig)
    vi.mocked(getEslintRules).mockResolvedValue({ rules: {}, source: null })
    vi.mocked(sendToCommitGuard).mockResolvedValue(mockResponse)

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`)
    })

    await expect(runPreCommit()).rejects.toThrow('process.exit(1)')

    expect(consola.log).toHaveBeenCalledWith('🚨 SECURITY')
    expect(consola.log).toHaveBeenCalledWith('⚡ PERFORMANCE')
    expect(consola.log).toHaveBeenCalledWith('🧹 CODE QUALITY')
    expect(consola.log).toHaveBeenCalledWith('🏗️ ARCHITECTURE')
  })

  it('should handle issues without file location', async () => {
    const mockDiff = 'diff --git a/file.ts b/file.ts\n+code'
    const mockConfig = {
      checks: { security: true, performance: true, codeQuality: true, architecture: true },
      speed: 'balanced' as const,
      failOpen: false,
    }
    const mockIssues: CommitGuardIssue[] = [
      {
        category: 'security',
        severity: 'critical',
        type: 'general',
        message: 'General security concern',
      },
    ]
    const mockResponse: CommitGuardResponse = {
      passed: false,
      issues: mockIssues,
    }

    vi.mocked(getStagedDiff).mockReturnValue(mockDiff)
    vi.mocked(loadConfig).mockReturnValue(mockConfig)
    vi.mocked(getEslintRules).mockResolvedValue({ rules: {}, source: null })
    vi.mocked(sendToCommitGuard).mockResolvedValue(mockResponse)

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`)
    })

    await expect(runPreCommit()).rejects.toThrow('process.exit(1)')

    expect(consola.log).toHaveBeenCalledWith('   ├─ General security concern')
  })

  it('should handle issues with file but no line number', async () => {
    const mockDiff = 'diff --git a/file.ts b/file.ts\n+code'
    const mockConfig = {
      checks: { security: true, performance: true, codeQuality: true, architecture: true },
      speed: 'balanced' as const,
      failOpen: false,
    }
    const mockIssues: CommitGuardIssue[] = [
      {
        category: 'security',
        severity: 'critical',
        type: 'auth',
        message: 'File-level issue',
        file: 'src/auth.ts',
      },
    ]
    const mockResponse: CommitGuardResponse = {
      passed: false,
      issues: mockIssues,
    }

    vi.mocked(getStagedDiff).mockReturnValue(mockDiff)
    vi.mocked(loadConfig).mockReturnValue(mockConfig)
    vi.mocked(getEslintRules).mockResolvedValue({ rules: {}, source: null })
    vi.mocked(sendToCommitGuard).mockResolvedValue(mockResponse)

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`)
    })

    await expect(runPreCommit()).rejects.toThrow('process.exit(1)')

    expect(consola.log).toHaveBeenCalledWith(expect.stringContaining('(src/auth.ts)'))
  })

  it('should fail open when API error occurs and failOpen is true in config', async () => {
    const mockDiff = 'diff --git a/file.ts b/file.ts\n+code'
    const mockConfig = {
      checks: { security: true, performance: true, codeQuality: true, architecture: true },
      speed: 'balanced' as const,
      failOpen: true,
    }

    vi.mocked(getStagedDiff).mockReturnValue(mockDiff)
    vi.mocked(loadConfig).mockReturnValue(mockConfig)
    vi.mocked(getEslintRules).mockResolvedValue({ rules: {}, source: null })
    vi.mocked(sendToCommitGuard).mockRejectedValue(new Error('Network timeout'))

    await runPreCommit()

    expect(consola.warn).toHaveBeenCalledWith('⚠️  CommitGuard service unavailable, allowing commit')
    expect(consola.warn).toHaveBeenCalledWith('   Error: Network timeout\n')
    expect(process.exit).not.toHaveBeenCalled()
  })

  it('should fail open when API error occurs and COMMITGUARD_FAIL_OPEN is true', async () => {
    process.env.COMMITGUARD_FAIL_OPEN = 'true'

    const mockDiff = 'diff --git a/file.ts b/file.ts\n+code'
    const mockConfig = {
      checks: { security: true, performance: true, codeQuality: true, architecture: true },
      speed: 'balanced' as const,
      failOpen: false,
    }

    vi.mocked(getStagedDiff).mockReturnValue(mockDiff)
    vi.mocked(loadConfig).mockReturnValue(mockConfig)
    vi.mocked(getEslintRules).mockResolvedValue({ rules: {}, source: null })
    vi.mocked(sendToCommitGuard).mockRejectedValue(new Error('API unavailable'))

    await runPreCommit()

    expect(consola.warn).toHaveBeenCalledWith('⚠️  CommitGuard service unavailable, allowing commit')
    expect(process.exit).not.toHaveBeenCalled()
  })

  it('should fail closed when API error occurs and failOpen is false', async () => {
    const mockDiff = 'diff --git a/file.ts b/file.ts\n+code'
    const mockConfig = {
      checks: { security: true, performance: true, codeQuality: true, architecture: true },
      speed: 'balanced' as const,
      failOpen: false,
    }

    vi.mocked(getStagedDiff).mockReturnValue(mockDiff)
    vi.mocked(loadConfig).mockReturnValue(mockConfig)
    vi.mocked(getEslintRules).mockResolvedValue({ rules: {}, source: null })
    vi.mocked(sendToCommitGuard).mockRejectedValue(new Error('Connection refused'))

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`)
    })

    await expect(runPreCommit()).rejects.toThrow('process.exit(1)')

    expect(consola.error).toHaveBeenCalledWith('❌ CommitGuard error:', 'Connection refused')
    expect(consola.error).toHaveBeenCalledWith('\nTo skip this check, set COMMITGUARD_FAIL_OPEN=true\n')
  })

  it('should call getStagedDiff with ignore patterns', async () => {
    vi.mocked(getStagedDiff).mockReturnValue('')

    await runPreCommit()

    expect(getStagedDiff).toHaveBeenCalledWith(expect.any(Array))
  })

  it('should call sendToCommitGuard with correct parameters', async () => {
    const mockDiff = 'diff --git a/file.ts b/file.ts\n+code'
    const mockConfig = {
      checks: { security: true, performance: true, codeQuality: true, architecture: true },
      speed: 'balanced' as const,
      failOpen: false,
    }
    const mockEslint = { rules: { 'no-console': 'error' }, source: '.eslintrc.json' }
    const mockResponse: CommitGuardResponse = {
      passed: true,
      issues: [],
    }

    vi.mocked(getStagedDiff).mockReturnValue(mockDiff)
    vi.mocked(loadConfig).mockReturnValue(mockConfig)
    vi.mocked(getEslintRules).mockResolvedValue(mockEslint)
    vi.mocked(sendToCommitGuard).mockResolvedValue(mockResponse)

    await runPreCommit()

    expect(sendToCommitGuard).toHaveBeenCalledWith(mockDiff, mockEslint.rules, mockConfig)
  })
})
