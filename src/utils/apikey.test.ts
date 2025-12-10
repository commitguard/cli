import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock flat-cache before importing the module
let mockStore: Record<string, any> = {}

vi.mock('flat-cache', () => ({
  FlatCache: class MockFlatCache {
    load = vi.fn()
    save = vi.fn()
    setKey = (key: string, value: any) => {
      mockStore[key] = value
    }

    getKey = (key: string) => mockStore[key]
    removeKey = (key: string) => {
      delete mockStore[key]
    }

    destroy = () => {
      mockStore = {}
    }
  },
}))

describe('apikey', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockStore = {}
    delete process.env.COMMITGUARD_API_KEY
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('saveApiKey', () => {
    it('should save API key to cache', async () => {
      const { saveApiKey, loadApiKey } = await import('./apikey')
      const apiKey = 'test-api-key-12345'
      saveApiKey(apiKey)

      const loaded = loadApiKey()
      expect(loaded).toBe(apiKey)
    })
  })

  describe('loadApiKey', () => {
    it('should return null when no API key is cached', async () => {
      const { loadApiKey } = await import('./apikey')
      const result = loadApiKey()
      expect(result).toBeNull()
    })

    it('should return cached API key', async () => {
      const { saveApiKey, loadApiKey } = await import('./apikey')
      const apiKey = 'cached-api-key'
      saveApiKey(apiKey)

      const result = loadApiKey()
      expect(result).toBe(apiKey)
    })
  })

  describe('deleteApiKey', () => {
    it('should remove cached API key', async () => {
      const { saveApiKey, loadApiKey, deleteApiKey } = await import('./apikey')
      saveApiKey('test-key')
      expect(loadApiKey()).toBe('test-key')

      deleteApiKey()
      expect(loadApiKey()).toBeNull()
    })
  })

  describe('getApiKey', () => {
    it('should return null when no API key is available', async () => {
      const { getApiKey } = await import('./apikey')
      const result = getApiKey()
      expect(result).toBeNull()
    })

    it('should prefer globally cached API key over environment variable', async () => {
      const { saveApiKey, getApiKey } = await import('./apikey')
      const cachedKey = 'cached-api-key'
      const envKey = 'env-api-key'

      saveApiKey(cachedKey)
      process.env.COMMITGUARD_API_KEY = envKey

      const result = getApiKey()
      expect(result).toBe(cachedKey)
    })

    it('should fall back to environment variable when no cached key exists', async () => {
      const { getApiKey } = await import('./apikey')
      const envKey = 'env-api-key'
      process.env.COMMITGUARD_API_KEY = envKey

      const result = getApiKey()
      expect(result).toBe(envKey)
    })

    it('should return cached key when environment variable is not set', async () => {
      const { saveApiKey, getApiKey } = await import('./apikey')
      const cachedKey = 'cached-only-key'
      saveApiKey(cachedKey)
      delete process.env.COMMITGUARD_API_KEY

      const result = getApiKey()
      expect(result).toBe(cachedKey)
    })

    it('should return environment key when cached key is not set', async () => {
      const { getApiKey } = await import('./apikey')
      const envKey = 'env-only-key'
      process.env.COMMITGUARD_API_KEY = envKey

      const result = getApiKey()
      expect(result).toBe(envKey)
    })
  })
})
