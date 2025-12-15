import type { CommitGuardIssue } from '../types'
import process from 'node:process'
import confirm from '@inquirer/confirm'
import { consola } from 'consola'
import ignoreConfig from '../data/ignore.json'
import { sendToCommitGuard } from './api'
import { loadConfig } from './config.js'
import { getEslintRules } from './eslint'
import { getStagedDiff } from './git'
import 'dotenv/config'

const CATEGORY_EMOJIS = {
  security: '🚨',
  performance: '⚡',
  code_quality: '🧹',
  architecture: '🏗️',
}

const CATEGORY_LABELS = {
  security: 'SECURITY',
  performance: 'PERFORMANCE',
  code_quality: 'CODE QUALITY',
  architecture: 'ARCHITECTURE',
}

const isTTY = process.stdin.isTTY && process.stdout.isTTY

export async function runPreCommit() {
  if (process.env.COMMITGUARD_DISABLED === 'true' || process.env.COMMITGUARD_DISABLED === '1') {
    consola.warn('CommitGuard is disabled via COMMITGUARD_DISABLED env variable.')
    return
  }

  const diff = getStagedDiff(ignoreConfig.ignore)

  if (!diff.trim()) {
    consola.info('No staged changes to check')
    return
  }
  if (isTTY) {
    consola.log('\n🔍 CommitGuard: Analyzing your changes...\n')
  }

  const config = loadConfig()

  try {
    const eslint = await getEslintRules()

    const result = await sendToCommitGuard(diff, eslint.rules, config)

    if (!result.issues || result.issues.length === 0) {
      consola.log('✅ All checks passed! Your commit looks good.\n')
      return
    }

    if (!isTTY) {
      const count = result.issues?.length ?? 0
      consola.log(`CommitGuard Detected ${count} issue${count === 1 ? '' : 's'}.`)
    }
    const grouped = groupIssuesByCategory(result.issues)
    if (isTTY) {
      consola.error('COMMIT BLOCKED - Issues detected:')
    }
    else {
      consola.log('\nIssues detected:\n')
    }
    for (const [category, issues] of Object.entries(grouped)) {
      const emoji = CATEGORY_EMOJIS[category as keyof typeof CATEGORY_EMOJIS]
      const label = CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]

      consola.log(`${emoji} ${label}`)
      issues.forEach((issue) => {
        const location = issue.file ? ` (${issue.file}${issue.line ? `:${issue.line}` : ''})` : ''
        consola.log(`   ├─ ${issue.message}${location}`)
      })
    }

    consola.log('\nFix these issues and try again.\n')

    if (!isTTY) {
      consola.log('--------------------')
      consola.log('Unfortunately, CommitGuard cannot prompt for easy confirmation in non-interactive mode. To see how this works, please use git in a supported terminal.')
      consola.log('To bypass this check, add --skip anywhere in your commit message')
      process.exit(1)
    }
    const confirmed = await confirm({ message: 'Do you want to ignore these issues and commit anyway?' })

    if (confirmed) {
      consola.warn('⚠️  Commit forced by user despite detected issues.\n')
      return
    }
    consola.log('\n💡 To bypass: Add --skip anywhere in your commit message\n')
    process.exit(1)
  }
  catch (err) {
    const error = err as Error

    if (error.name === 'ExitPromptError') {
      consola.log('👋 until next time!')
    }
    const failOpen = config.failOpen || process.env.COMMITGUARD_FAIL_OPEN === 'true'

    if (failOpen) {
      consola.warn('⚠️  CommitGuard service unavailable, allowing commit')
      consola.warn(`   Error: ${error.message}\n`)
      return
    }

    consola.error('❌ CommitGuard error:', error.message)
    process.exit(1)
  }
}

function groupIssuesByCategory(issues: CommitGuardIssue[]): Record<string, CommitGuardIssue[]> {
  const grouped: Record<string, CommitGuardIssue[]> = {}

  for (const issue of issues) {
    if (!grouped[issue.category]) {
      grouped[issue.category] = []
    }
    grouped[issue.category].push(issue)
  }

  return grouped
}
