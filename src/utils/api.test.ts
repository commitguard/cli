import type { CommitGuardConfig, CommitGuardResponse } from '../types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendToCommitGuard } from './api'

globalThis.fetch = vi.fn()

// Mock the apikey module
vi.mock('./apikey', () => ({
  getApiKey: vi.fn(),
}))

describe('sendToCommitGuard', () => {
  const mockDiff = 'diff --git a/file.ts'
  const mockEslint = { errors: [], warnings: [] }
  const mockConfig: CommitGuardConfig = {
    checks: {
      security: true,
      performance: true,
      codeQuality: true,
      architecture: true,
    },
    speed: 'balanced',
    failOpen: false,
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    const { getApiKey } = await import('./apikey')
    vi.mocked(getApiKey).mockReturnValue('test-api-key')
    delete process.env.COMMITGUARD_API_URL
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should throw error when API key is missing', async () => {
    const { getApiKey } = await import('./apikey')
    vi.mocked(getApiKey).mockReturnValue(null)

    await expect(
      sendToCommitGuard(mockDiff, mockEslint, mockConfig),
    ).rejects.toThrow('Missing CommitGuard API key. Set COMMITGUARD_API_KEY environment variable or save globally with `commitguard set-key <api-key>`.')
  })

  it('should use default API URL when not provided', async () => {
    const mockResponse: CommitGuardResponse = {
      issues: [],
      passed: true,
    }

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    await sendToCommitGuard(mockDiff, mockEslint, mockConfig)

    expect(fetch).toHaveBeenCalledWith(
      'https://api.commitguard.dev/v1/check',
      expect.any(Object),
    )
  })

  it('should use custom API URL when provided', async () => {
    process.env.COMMITGUARD_API_URL = 'https://custom.api.com/check'

    const mockResponse: CommitGuardResponse = {
      issues: [],
      passed: true,
    }

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    await sendToCommitGuard(mockDiff, mockEslint, mockConfig)

    expect(fetch).toHaveBeenCalledWith(
      'https://custom.api.com/check',
      expect.any(Object),
    )
  })

  it('should send correct request payload', async () => {
    const mockResponse: CommitGuardResponse = {
      issues: [],
      passed: true,
    }

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    await sendToCommitGuard(mockDiff, mockEslint, mockConfig)

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key',
        },
        body: JSON.stringify({
          diff: mockDiff,
          eslint: mockEslint,
          checks: mockConfig.checks,
          speed: 'balanced',
        }),
      },
    )
  })

  it('should default speed to balanced when not provided', async () => {
    const configWithoutSpeed: CommitGuardConfig = {
      checks: {
        security: true,
        performance: true,
        codeQuality: true,
        architecture: true,
      },
      failOpen: false,
    }

    const mockResponse: CommitGuardResponse = {
      issues: [],
      passed: true,
    }

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    await sendToCommitGuard(mockDiff, mockEslint, configWithoutSpeed)

    const callArgs = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(callArgs[1]?.body as string)
    expect(body.speed).toBe('balanced')
  })

  it('should return parsed response on success', async () => {
    const mockResponse: CommitGuardResponse = {
      passed: false,
      issues: [
        {
          type: 'security',
          category: 'security',
          severity: 'critical',
          message: 'Potential security vulnerability detected',
          file: 'src/auth.ts',
          line: 42,
        },
      ],
    }

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const result = await sendToCommitGuard(mockDiff, mockEslint, mockConfig)

    expect(result).toEqual(mockResponse)
  })

  it('should throw error when API request fails with status code', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response)

    await expect(
      sendToCommitGuard(mockDiff, mockEslint, mockConfig),
    ).rejects.toThrow('API request failed (401): Unauthorized')
  })

  it('should throw error when API request fails with 500', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as Response)

    await expect(
      sendToCommitGuard(mockDiff, mockEslint, mockConfig),
    ).rejects.toThrow('API request failed (500): Internal Server Error')
  })

  it('should throw error when network request fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

    await expect(
      sendToCommitGuard(mockDiff, mockEslint, mockConfig),
    ).rejects.toThrow('Network error')
  })

  it('should handle different speed configurations', async () => {
    const fastConfig: CommitGuardConfig = {
      ...mockConfig,
      speed: 'fast',
    }

    const mockResponse: CommitGuardResponse = {
      issues: [],
      passed: true,
    }

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    await sendToCommitGuard(mockDiff, mockEslint, fastConfig)

    const callArgs = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(callArgs[1]?.body as string)
    expect(body.speed).toBe('fast')
  })

  it('should handle empty diff and eslint data', async () => {
    const mockResponse: CommitGuardResponse = {
      issues: [],
      passed: true,
    }

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    await sendToCommitGuard('', {}, mockConfig)

    const callArgs = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(callArgs[1]?.body as string)
    expect(body.diff).toBe('')
    expect(body.eslint).toEqual({})
  })
})
