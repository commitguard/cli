import type { CommitGuardConfig, CommitGuardResponse } from '../types'
import process from 'node:process'
import { loadConfig } from './config'
import { getLastDiff } from './git'
import { getGlobalKey } from './key'

const DEFAULT_TIMEOUT = 20000

export async function sendToCommitGuard(diff: string, eslint: Record<string, any>, config: CommitGuardConfig): Promise<CommitGuardResponse> {
  const apiKey = process.env.COMMITGUARD_API_KEY || getGlobalKey() || null

  if (!apiKey) {
    throw new Error(
      'No API key found. Set one globally with "commitguard keys" or add COMMITGUARD_API_KEY to your .env file. Get your free API key at https://commitguard.ai',
    )
  }

  const apiUrl = process.env.COMMITGUARD_API_URL || 'https://api.commitguard.ai/v1/analyze'

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'commitguard-cli',
      },
      body: JSON.stringify({
        diff,
        eslint,
        config,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()

      let errorMessage = 'Failed to analyze commit'

      if (response.status === 401) {
        errorMessage = 'Invalid API key. Check your key with "commitguard keys" or get a new one at https://commitguard.ai'
      }
      else if (response.status === 429) {
        errorMessage = 'Rate limit exceeded. Please try again later'
      }
      else if (response.status === 500) {
        errorMessage = 'CommitGuard service error. Please try again later'
      }
      else if (response.status >= 400 && response.status < 500) {
        errorMessage = `Request error: ${errorText || 'Invalid request'}`
      }
      else {
        errorMessage = `Service unavailable (${response.status}). Please try again later`
      }

      throw new Error(errorMessage)
    }

    return await response.json() as CommitGuardResponse
  }
  catch (error) {
    clearTimeout(timeoutId)

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${DEFAULT_TIMEOUT}ms`)
    }

    throw error
  }
}

export async function bypassCommitGuard() {
  const apiKey = process.env.COMMITGUARD_API_KEY || getGlobalKey() || null

  if (!apiKey) {
    throw new Error(
      'No API key found. Set one globally with "commitguard keys" or add COMMITGUARD_API_KEY to your .env file. Get your free API key at https://commitguard.ai',
    )
  }

  const apiUrl = process.env.COMMITGUARD_API_BYPASS_URL || 'https://api.commitguard.ai/v1/bypass'
  const config = loadConfig()
  const diff = getLastDiff(config.context)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'commitguard-cli',
      },
      body: JSON.stringify({
        diff,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API request failed (${response.status}): ${errorText}`)
    }

    return await response.json() as { success: boolean, message: string }
  }
  catch (error) {
    clearTimeout(timeoutId)

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${DEFAULT_TIMEOUT}ms`)
    }

    throw error
  }
}
