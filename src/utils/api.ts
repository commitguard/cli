import type { CommitGuardConfig, CommitGuardResponse } from '../types'
import process from 'node:process'
import { getLastDiff } from './git'
import { getGlobalKey } from './key'

export async function sendToCommitGuard(diff: string, eslint: Record<string, any>, config: CommitGuardConfig): Promise<CommitGuardResponse> {
  const apiKey = process.env.COMMITGUARD_API_KEY || getGlobalKey() || null

  if (!apiKey) {
    throw new Error(
      'No API key found. Set one globally with "commitguard keys" or add COMMITGUARD_API_KEY to your .env file. Get your free API key at https://commitguard.dev',
    )
  }

  const apiUrl = process.env.COMMITGUARD_API_URL || 'https://api.commitguard.ai/v1/analyze'

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
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API request failed (${response.status}): ${errorText}`)
  }

  return await response.json() as CommitGuardResponse
}

export async function bypassCommitGuard() {
  const apiKey = process.env.COMMITGUARD_API_KEY || getGlobalKey() || null

  if (!apiKey) {
    throw new Error(
      'No API key found. Set one globally with "commitguard keys" or add COMMITGUARD_API_KEY to your .env file. Get your free API key at https://commitguard.dev',
    )
  }

  const apiUrl = process.env.COMMITGUARD_API_BYPASS_URL || 'https://api.commitguard.ai/v1/bypass'
  const diff = getLastDiff()

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
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API request failed (${response.status}): ${errorText}`)
  }

  return await response.json() as { success: boolean, message: string }
}
