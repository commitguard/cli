import type { CommitGuardConfig, CommitGuardResponse } from '../types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bypassCommitGuard, sendToCommitGuard } from './api'
import * as git from './git'
import * as key from './key'

vi.mock('./git')
vi.mock('./key')

describe('sendToCommitGuard', () => {
  const mockDiff = 'diff --git a/file.ts'
  const mockEslint = { errors: [] }
  const mockConfig: CommitGuardConfig = {
    checks: {
      security: true,
      performance: true,
      codeQuality: true,
      architecture: false,
    },
    severityLevels: {
      critical: true,
      warning: true,
      suggestion: true,
    },
    customRule: '',
  }
  const mockResponse: CommitGuardResponse = {
    passed: true,
    issues: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.COMMITGUARD_API_KEY
    delete process.env.COMMITGUARD_API_URL
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should successfully send data to CommitGuard API', async () => {
    process.env.COMMITGUARD_API_KEY = 'test-api-key'

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const result = await sendToCommitGuard(mockDiff, mockEslint, mockConfig)

    expect(fetch).toHaveBeenCalledWith(
      'https://api.commitguard.ai/v1/analyze',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key',
          'User-Agent': 'commitguard-cli',
        },
        body: JSON.stringify({
          diff: mockDiff,
          eslint: mockEslint,
          config: mockConfig,
        }),
      },
    )
    expect(result).toEqual(mockResponse)
  })

  it('should use global key when env key is not set', async () => {
    vi.mocked(key.getGlobalKey).mockReturnValue('global-key')

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    await sendToCommitGuard(mockDiff, mockEslint, mockConfig)

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer global-key',
        }),
      }),
    )
  })

  it('should use custom API URL from environment', async () => {
    process.env.COMMITGUARD_API_KEY = 'test-api-key'
    process.env.COMMITGUARD_API_URL = 'https://custom.api.url/analyze'

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    await sendToCommitGuard(mockDiff, mockEslint, mockConfig)

    expect(fetch).toHaveBeenCalledWith(
      'https://custom.api.url/analyze',
      expect.any(Object),
    )
  })

  it('should throw error when no API key is found', async () => {
    vi.mocked(key.getGlobalKey).mockReturnValue(null)

    await expect(sendToCommitGuard(mockDiff, mockEslint, mockConfig))
      .rejects
      .toThrow('No API key found')
  })

  it('should throw error when API request fails', async () => {
    process.env.COMMITGUARD_API_KEY = 'test-api-key'

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad request',
    } as Response)

    await expect(sendToCommitGuard(mockDiff, mockEslint, mockConfig))
      .rejects
      .toThrow('Request error: Bad request')
  })
})

describe('bypassCommitGuard', () => {
  const mockBypassResponse = { success: true, message: 'Bypass recorded' }

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.COMMITGUARD_API_KEY
    delete process.env.COMMITGUARD_API_BYPASS_URL
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should successfully bypass CommitGuard', async () => {
    process.env.COMMITGUARD_API_KEY = 'test-api-key'
    vi.mocked(git.getLastDiff).mockReturnValue('diff content')

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockBypassResponse,
    } as Response)

    const result = await bypassCommitGuard()

    expect(git.getLastDiff).toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledWith(
      'https://api.commitguard.ai/v1/bypass',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key',
          'User-Agent': 'commitguard-cli',
        },
        body: JSON.stringify({
          diff: 'diff content',
        }),
      },
    )
    expect(result).toEqual(mockBypassResponse)
  })

  it('should use custom bypass URL from environment', async () => {
    process.env.COMMITGUARD_API_KEY = 'test-api-key'
    process.env.COMMITGUARD_API_BYPASS_URL = 'https://custom.bypass.url'
    vi.mocked(git.getLastDiff).mockReturnValue('diff')

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockBypassResponse,
    } as Response)

    await bypassCommitGuard()

    expect(fetch).toHaveBeenCalledWith(
      'https://custom.bypass.url',
      expect.any(Object),
    )
  })

  it('should throw error when no API key is found', async () => {
    vi.mocked(key.getGlobalKey).mockReturnValue(null)

    await expect(bypassCommitGuard())
      .rejects
      .toThrow('No API key found')
  })

  it('should throw error when API request fails', async () => {
    process.env.COMMITGUARD_API_KEY = 'test-api-key'
    vi.mocked(git.getLastDiff).mockReturnValue('diff')

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Server error',
    } as Response)

    await expect(bypassCommitGuard())
      .rejects
      .toThrow('API request failed (500): Server error')
  })
})
