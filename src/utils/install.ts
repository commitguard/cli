import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { cancel, confirm, log, note, outro } from '@clack/prompts'
import { getEslintRules } from './eslint'
import { getGlobalKey, manageGlobalKey } from './key'

const COMMITGUARD_MARKER = '# CommitGuard commit-msg hook'
const POST_INDEX_MARKER = '# CommitGuard post-index-change hook'
const GIT_DIR = '.git'
const HOOKS_DIR = join(GIT_DIR, 'hooks')
const COMMIT_MSG_HOOK_PATH = join(HOOKS_DIR, 'commit-msg')
const POST_INDEX_HOOK_PATH = join(HOOKS_DIR, 'post-index-change')
const MESSAGES = {
  noGit: 'No .git folder found. Run this inside a git repository.',
}

export async function installHooks() {
  if (!existsSync(GIT_DIR)) {
    cancel(MESSAGES.noGit)
    process.exit(1)
  }

  if (!existsSync(HOOKS_DIR)) {
    mkdirSync(HOOKS_DIR, { recursive: true })
  }

  try {
    const gitVersion = execSync('git --version', { encoding: 'utf8' })
    const versionMatch = gitVersion.match(/(\d+\.\d+\.\d+)/)
    const version = versionMatch ? versionMatch[1] : '0.0.0'

    if (version < '2.34.0') {
      log.warn('Your Git version is below 2.34.0. CommitGuard requires Git 2.34.0 or higher to function properly.')
      note('You can download the latest version of Git from https://git-scm.com/downloads', 'How to update Git')
      return
    }
  }
  catch {
    log.warn('Unable to determine Git version. Please ensure you have Git 2.34.0 or higher installed for CommitGuard to function properly.')
    note('You can download the latest version of Git from https://git-scm.com/downloads', 'How to update Git')
    return
  }

  if (existsSync(COMMIT_MSG_HOOK_PATH)) {
    const content = readFileSync(COMMIT_MSG_HOOK_PATH, 'utf8')
    if (content.includes(COMMITGUARD_MARKER)) {
      outro('CommitGuard is already installed.')
      return
    }

    const response = await confirm({
      message: 'CommitGuard uses the git `commit-msg` hook to function properly. A commit-msg hook already exists. Do you want to overwrite it?',
      initialValue: true,
    })

    if (!response) {
      outro('Installation cancelled. CommitGuard was not installed.')
      return
    }
  }

  if (existsSync(POST_INDEX_HOOK_PATH)) {
    const content = readFileSync(POST_INDEX_HOOK_PATH, 'utf8')
    if (!content.includes(POST_INDEX_MARKER)) {
      const response = await confirm({
        message: 'A post-index-change hook already exists. Do you want to overwrite it?',
        initialValue: true,
      })

      if (!response) {
        log.error('Installation cancelled. CommitGuard was not installed.')
        return
      }
    }
  }

  log.info('Installing CommitGuard...')

  const node = process.execPath.replace(/\\/g, '/')
  const cliPath = require.resolve('commitguard').replace(/\\/g, '/')

  const commitMsgContent = `#!/bin/sh
${COMMITGUARD_MARKER}
# Auto-generated - do not edit manually

commit_msg_file="$1"

if grep -q -- "--skip" "$commit_msg_file"; then
  echo "⚠️  CommitGuard bypassed with --skip"

  sed 's/--skip//g' "$commit_msg_file" > "$commit_msg_file.tmp"
  mv "$commit_msg_file.tmp" "$commit_msg_file"
  
  trap '(sleep 1 && "${node}" "${cliPath}" bypass > /dev/null 2>&1 &)' EXIT
  
  exit 0
fi

if ! grep -qv '^#' "$commit_msg_file" || [ ! -s "$commit_msg_file" ]; then
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

  writeFileSync(COMMIT_MSG_HOOK_PATH, commitMsgContent, { mode: 0o755 })

  const postIndexContent = `#!/bin/sh
${POST_INDEX_MARKER}
# Auto-generated - do not edit manually

# Skip if only flags changed (not actual content)
if [ "$1" = "1" ]; then
  exit 0
fi

"${node}" "${cliPath}" staged > /dev/null 2>&1 &

exit 0
`

  writeFileSync(POST_INDEX_HOOK_PATH, postIndexContent, { mode: 0o755 })
  log.info('Analyzing ESLint configuration for better checks...')

  await getEslintRules({
    overrideCache: true,
  })

  log.success('ESLint configuration loaded.')

  if (!getGlobalKey() && process.env.COMMITGUARD_API_KEY === undefined) {
    const response = await confirm({
      message: 'No global API key found. Do you want to set it now?',
      initialValue: true,
    })
    if (response) {
      await manageGlobalKey()
    }
  }

  outro('You are all set! CommitGuard has been installed successfully.')
}

export async function listHooks() {
  if (!existsSync(GIT_DIR) || !existsSync(HOOKS_DIR)) {
    outro(MESSAGES.noGit)
    return
  }

  const hooks = readdirSync(HOOKS_DIR).filter((file) => {
    const filePath = join(HOOKS_DIR, file)

    return (
      statSync(filePath).isFile()
      && !file.endsWith('.sample')
      && !file.startsWith('.')
      && (
        readFileSync(filePath, 'utf8').includes(COMMITGUARD_MARKER)
        || readFileSync(filePath, 'utf8').includes(POST_INDEX_MARKER)
      )
    )
  })

  if (hooks.length === 0) {
    outro()
    return
  }

  for (const hook of hooks) {
    log.success(hook)
  }

  outro('Run "commitguard remove" to uninstall CommitGuard.')
}

export async function removeHooks() {
  if (!existsSync(GIT_DIR)) {
    cancel(MESSAGES.noGit)
    process.exit(1)
  }

  const commitMsgExists = existsSync(COMMIT_MSG_HOOK_PATH)
  const postIndexExists = existsSync(POST_INDEX_HOOK_PATH)

  if (!commitMsgExists && !postIndexExists) {
    log.info('CommitGuard is not installed in this repository.')
    return
  }

  const response = await confirm({
    message: 'Are you sure you want to remove CommitGuard from this repository?',
    initialValue: false,
  })

  if (!response) {
    outro('CommitGuard uninstallation cancelled.')
    return
  }

  if (commitMsgExists) {
    unlinkSync(COMMIT_MSG_HOOK_PATH)
  }

  if (postIndexExists) {
    unlinkSync(POST_INDEX_HOOK_PATH)
  }

  log.success('CommitGuard uninstalled successfully!')
  outro('Your commits are no longer be secured by CommitGuard.')
}
