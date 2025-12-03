import type { LoadedESLintConfig } from '../types'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'

import { pathToFileURL } from 'node:url'
import { findUp } from 'find-up'
import { FlatCache } from 'flat-cache'

const cacheDir = join(homedir(), '.cache', 'commitguard')

const cache = new FlatCache({
  cacheDir,
  cacheId: 'eslint-config',
})

cache.load('eslint-config', cacheDir)

async function findProjectRoot(startDir: string): Promise<string> {
  const packageJsonPath = await findUp('package.json')
  return packageJsonPath ? dirname(packageJsonPath) : startDir
}

export async function getEslintRules({ startDir = process.cwd(), overrideCache = false}: {
  startDir?: string
  overrideCache?: boolean
} = {}): Promise<LoadedESLintConfig> {
  const cacheKey = `eslint-${startDir}`
  const cached = cache.getKey(cacheKey)

  if (cached && !overrideCache) {
    return cached as LoadedESLintConfig
  }

  const projectRoot = await findProjectRoot(startDir)

  const tryPaths = [
    '.eslintrc',
    '.eslintrc.json',
    '.eslintrc.js',
    '.eslintrc.mjs',
    'eslint.config.js',
    'eslint.config.mjs',
    'package.json',
  ].map(file => join(projectRoot, file))

  const loaders = tryPaths.map(async (full) => {
    if (!existsSync(full))
      return null

    if (full.endsWith('.json') || full.endsWith('.eslintrc')) {
      try {
        const raw = JSON.parse(await readFile(full, 'utf8'))
        if (raw.rules)
          return { rules: raw.rules, source: full }
      }
      catch { /* ignore */ }
    }
    if (full.endsWith('.js') || full.endsWith('.mjs')) {
      try {
        const mod = await import(pathToFileURL(full).href)
        let cfg = mod.default || mod

        if (cfg instanceof Promise) {
          cfg = await cfg
        }

        if (Array.isArray(cfg)) {
          const lastConfigWithRules = [...cfg].reverse().find(c => c.rules && Object.keys(c.rules).length > 0)

          if (lastConfigWithRules?.rules) {
            return { rules: lastConfigWithRules.rules, source: full }
          }
        }

        if (cfg.rules) {
          return { rules: cfg.rules, source: full }
        }
      }
      catch { /* ignore */ }
    }
    if (full.endsWith('package.json')) {
      try {
        const pkg = JSON.parse(await readFile(full, 'utf8'))
        if (pkg.eslintConfig && pkg.eslintConfig.rules) {
          return { rules: pkg.eslintConfig.rules, source: full }
        }
      }
      catch { /* ignore */ }
    }

    return null
  })

  const results = await Promise.all(loaders)
  const config = results.find(r => r !== null) ?? { rules: {}, source: null }

  cache.setKey(cacheKey, config)
  cache.save(true)

  return config
}
