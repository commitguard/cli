import type { CommitGuardConfig } from '../types'
import { existsSync, readFileSync } from 'node:fs'
import { consola } from 'consola'

export function loadConfig(): CommitGuardConfig {
  const configPath = 'commitguard.config.json'

  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf8')
      return JSON.parse(content)
    }
    catch {
      consola.warn('Failed to parse commitguard.config.json, using defaults')
      return getDefaultConfig()
    }
  }

  return getDefaultConfig()
}

function getDefaultConfig(): CommitGuardConfig {
  return {
    checks: {
      security: true,
      performance: true,
      codeQuality: true,
      architecture: true,
    },
    speed: 'balanced',
    failOpen: false,
  }
}
