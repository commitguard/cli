import type { CommitGuardConfig, CommitGuardResponse } from '../types'
import process from 'node:process'

export async function sendToCommitGuard(diff: string, eslint: Record<string, any>, config: CommitGuardConfig): Promise<CommitGuardResponse> {
  const apiKey = process.env.COMMITGUARD_API_KEY

  if (!apiKey) {
    throw new Error(
      'Missing CommitGuard API key. Set COMMITGUARD_API_KEY environment variable.',
    )
  }

  const apiUrl = process.env.COMMITGUARD_API_URL || 'https://api.commitguard.dev/v1/check'

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      diff,
      eslint,
      checks: config.checks,
      speed: config.speed ?? 'balanced',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API request failed (${response.status}): ${errorText}`)
  }

  return await response.json() as CommitGuardResponse
}
