import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { consola } from 'consola'
import { getEslintRules } from './eslint'
import { getGlobalKey } from './key'

const COMMITGUARD_MARKER = '# CommitGuard commit-msg hook'

export async function installHooks() {
  const gitDir = '.git'
  const hooksDir = join(gitDir, 'hooks')
  const commitMsgPath = join(hooksDir, 'commit-msg')

  if (!existsSync(gitDir)) {
    consola.error('No .git folder found. Run this inside a git repository.')
    process.exit(1)
  }

  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true })
  }

  if (existsSync(commitMsgPath)) {
    const content = readFileSync(commitMsgPath, 'utf8')
    if (content.includes(COMMITGUARD_MARKER)) {
      consola.success('CommitGuard hook is already installed.')
      return
    }
    consola.warn('commit-msg hook already exists. Overwriting...')
  }

  consola.info('Installing CommitGuard git hook...')
  const node = process.execPath.replace(/\\/g, '/')
  const cliPath = require.resolve('commitguard').replace(/\\/g, '/')

  const commitMsgContent = `#!/bin/sh
${COMMITGUARD_MARKER}
# Auto-generated - do not edit manually

commit_msg_file="$1"

# Check if commit message contains --skip
if grep -q -- "--skip" "$commit_msg_file"; then
  echo "⚠️  CommitGuard bypassed with --skip"
  # Remove --skip token from commit message
  sed 's/--skip//g' "$commit_msg_file" > "$commit_msg_file.tmp"
  mv "$commit_msg_file.tmp" "$commit_msg_file"
  
  trap '(sleep 1 && "${node}" "${cliPath}" bypass > /dev/null 2>&1 &)' EXIT
  
  exit 0
fi

if [ -t 1 ]; then
  "${node}" "${cliPath}" pre-commit < /dev/tty
  RESULT=$?
else
  "${node}" "${cliPath}" pre-commit
  RESULT=$?
fi

if [ $RESULT -ne 0 ]; then
  exit 1
fi

exit 0
`

  writeFileSync(commitMsgPath, commitMsgContent, { mode: 0o755 })

  consola.success('CommitGuard hook installed successfully!')

  consola.info('Analyzing ESLint configuration for better checks...')
  await getEslintRules({
    overrideCache: true,
  })
  consola.success('ESLint configuration loaded.')
  const apiKey
    = process.env.COMMITGUARD_API_KEY
      ?? getGlobalKey()

  const steps = [
    !apiKey
      ? 'Set your API key with "commitguard keys" or set COMMITGUARD_API_KEY env variable'
      : null,
    'Make a commit — CommitGuard will run automatically',
    'To bypass checks: add --skip anywhere in your commit message',
    'CommitGuard was installed successfully with default settings. Customize it with "commitguard config"',
  ].filter(Boolean)

  consola.box({
    title: 'Next Steps',
    message: steps.map(step => `• ${step}`).join('\n'),
  })
}

export async function listHooks() {
  const gitDir = '.git'
  const hooksDir = join(gitDir, 'hooks')

  if (!existsSync(gitDir)) {
    consola.error('No .git folder found. Run this inside a git repository.')
    process.exit(1)
  }

  if (!existsSync(hooksDir)) {
    consola.info('📋 No hooks directory found.')
    return
  }

  const files = readdirSync(hooksDir)
  const hooks = files.filter((file) => {
    const filePath = join(hooksDir, file)
    const stats = statSync(filePath)
    return stats.isFile() && !file.endsWith('.sample') && !file.startsWith('.')
  })

  if (hooks.length === 0) {
    consola.info('📋 No git hooks installed.')
    return
  }

  consola.log('📋 Installed git hooks:\n')

  for (const hook of hooks) {
    const hookPath = join(hooksDir, hook)
    const content = readFileSync(hookPath, 'utf8')
    const isCommitGuard = content.includes(COMMITGUARD_MARKER)
    const stats = statSync(hookPath)
    const isExecutable = (stats.mode & 0o111) !== 0

    const badge = isCommitGuard ? '🛡️  CommitGuard' : '📝'
    const execBadge = isExecutable ? '✓' : '✗ (not executable)'

    consola.log(`${badge} ${hook} ${execBadge}`)

    if (isCommitGuard) {
      consola.log(`   └─ Managed by CommitGuard`)
    }
  }

  consola.log('\nRun \'commitguard remove\' to uninstall CommitGuard hooks.')
}

export async function removeHooks() {
  const gitDir = '.git'
  const hooksDir = join(gitDir, 'hooks')
  const commitMsgPath = join(hooksDir, 'commit-msg')

  if (!existsSync(gitDir)) {
    consola.error('No .git folder found. Run this inside a git repository.')
    process.exit(1)
  }

  if (!existsSync(commitMsgPath)) {
    consola.info('No CommitGuard hook found.')
    return
  }

  const content = readFileSync(commitMsgPath, 'utf8')

  if (!content.includes(COMMITGUARD_MARKER)) {
    consola.error('commit-msg hook exists but is not managed by CommitGuard.')
    consola.error('Manual removal required.')
    process.exit(1)
  }

  unlinkSync(commitMsgPath)
  consola.success('CommitGuard hook removed successfully!')
  consola.warn('Your commits will no longer be checked by CommitGuard.')
}
