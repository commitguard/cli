import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { FlatCache } from 'flat-cache'

const cacheDir = join(homedir(), '.cache', 'commitguard')

const cache = new FlatCache({
  cacheDir,
  cacheId: 'api-key',
})

cache.load('api-key', cacheDir)

const API_KEY_CACHE_KEY = 'commitguard-api-key'

export function saveApiKey(apiKey: string): void {
  cache.setKey(API_KEY_CACHE_KEY, apiKey)
  cache.save(true)
}

export function loadApiKey(): string | null {
  const cached = cache.getKey(API_KEY_CACHE_KEY)
  return cached ? String(cached) : null
}

export function deleteApiKey(): void {
  cache.removeKey(API_KEY_CACHE_KEY)
  cache.save(true)
}

export function getApiKey(): string | null {
  // First try to get from global cache
  const globalKey = loadApiKey()
  if (globalKey) {
    return globalKey
  }

  // Fall back to environment variable
  return process.env.COMMITGUARD_API_KEY || null
}
