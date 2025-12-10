#!/usr/bin/env node

import process from 'node:process'
import { consola } from 'consola'
import pkg from '../package.json'
import { deleteApiKey, getApiKey, saveApiKey } from './utils/apikey'
import { runPreCommit } from './utils/commit'
import { installHooks, listHooks, removeHooks } from './utils/install'

const command = process.argv[2];

(async () => {
  try {
    switch (command) {
      case 'init':
        await installHooks()
        break
      case 'pre-commit':
        await runPreCommit()
        break
      case 'list':
      case 'ls':
        await listHooks()
        break
      case 'remove':
      case 'uninstall':
        await removeHooks()
        break
      case 'set-key': {
        const apiKey = process.argv[3]
        if (!apiKey) {
          consola.error('Please provide an API key: commitguard set-key <api-key>')
          process.exit(1)
        }
        saveApiKey(apiKey)
        consola.success('API key saved globally!')
        consola.info('The key is stored in ~/.cache/commitguard/')
        break
      }
      case 'get-key': {
        const key = getApiKey()
        if (!key) {
          consola.warn('No API key found.')
          consola.info('Set one with: commitguard set-key <api-key>')
          consola.info('Or use environment variable: COMMITGUARD_API_KEY')
        }
        else {
          const masked = key.length > 8 ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : '****'
          consola.success(`API key found: ${masked}`)
          consola.info('The key is stored in ~/.cache/commitguard/')
        }
        break
      }
      case 'delete-key': {
        deleteApiKey()
        consola.success('API key deleted from global storage')
        break
      }
      default:
        consola.box(`
CommitGuard - AI-powered git commit checker v${pkg.version}

Usage:
  commitguard init          Install git hooks
  commitguard list          Show all installed hooks
  commitguard remove        Remove CommitGuard hooks
  commitguard pre-commit    Run pre-commit check (used by hook)
  commitguard set-key       Save API key globally
  commitguard get-key       Display current API key (masked)
  commitguard delete-key    Delete globally saved API key

After installation, CommitGuard runs automatically on every commit.`)
    }
  }
  catch (error) {
    consola.error('CommitGuard error:', error)
    process.exit(1)
  }
})()
