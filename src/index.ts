#!/usr/bin/env node

import process from 'node:process'
import { consola } from 'consola'
import pkg from '../package.json'
import { bypassCommitGuard } from './utils/api'
import { runPreCommit } from './utils/commit'
import { manageConfig } from './utils/config'
import { installHooks, listHooks, removeHooks } from './utils/install'
import { manageGlobalKey } from './utils/key'

const command = process.argv[2];

(async () => {
  try {
    switch (command) {
      case 'init':
        await installHooks()
        break
      case 'config':
        await manageConfig()
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
      case 'keys':
        await manageGlobalKey()
        break
      case 'bypass':
        await bypassCommitGuard()
        break
      default:
        consola.box(`
CommitGuard - AI-powered git commit checker v${pkg.version}

Usage:
  commitguard init          Install git hooks
  commitguard list          Show all installed hooks
  commitguard remove        Remove CommitGuard hooks
  commitguard config        Manage checks configuration
  commitguard keys          Manage global API key
  commitguard pre-commit    Run pre-commit check (used by hook)

After installation, CommitGuard runs automatically on every commit.`)
    }
  }
  catch (error) {
    consola.error('CommitGuard error:', error)
    process.exit(1)
  }
})()
