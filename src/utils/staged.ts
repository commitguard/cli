import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { consola } from 'consola'
import stringWidth from 'string-width'
import { sendToCommitGuard } from './api'
import { loadConfig } from './config'
import { getEslintRules } from './eslint'
import { getStagedDiff } from './git'
import { createDiffHash } from './global'

const CACHE_PATH = join('.git', 'commitguard-cache.json')
const config = loadConfig()

interface CacheData {
  hash: string
  timestamp: number
  diff: string
  analysis: any
}

const CATEGORY_LABELS = {
  security: '🚨 [SECURITY]',
  performance: '🚀 [PERFORMANCE]',
  code_quality: '✨ [CODE QUALITY]',
  architecture: '🏗️ [ARCHITECTURE]',
}

const SEVERITY = {
  critical: 'CRITICAL',
  warning: 'WARNING',
  suggestion: 'SUGGESTION',
}

const LABEL_WIDTH = Math.max(
  ...Object.values(CATEGORY_LABELS).map(label => stringWidth(label)),
)

function padLabel(label: string): string {
  const pad = LABEL_WIDTH - stringWidth(label)
  return label + ' '.repeat(pad)
}

const SEVERITY_WIDTH = Math.max(
  ...Object.values(SEVERITY).map(sev => stringWidth(sev) + 2),
)
function padSeverity(severity: string): string {
  const pad = SEVERITY_WIDTH - stringWidth(severity)
  return severity + ' '.repeat(pad)
}

let memoryCache: CacheData | null = null

function readCache(): CacheData | null {
  if (memoryCache) {
    return memoryCache
  }

  if (!existsSync(CACHE_PATH)) {
    return null
  }

  try {
    const content = readFileSync(CACHE_PATH, 'utf8')
    memoryCache = JSON.parse(content)
    return memoryCache
  }
  catch {
    return null
  }
}

function writeCache(data: CacheData): void {
  memoryCache = data
  writeFileSync(CACHE_PATH, JSON.stringify(data))
}

export function clearCache(): void {
  memoryCache = null
  if (existsSync(CACHE_PATH)) {
    unlinkSync(CACHE_PATH)
  }
}

function groupIssuesByFile(issues: any[] = []) {
  const grouped: Record<string, any[]> = {}
  const noFile: any[] = []

  for (const issue of issues) {
    if (!issue.file) {
      noFile.push(issue)
      continue
    }
    if (!grouped[issue.file]) {
      grouped[issue.file] = []
    }
    grouped[issue.file].push(issue)
  }

  return { grouped, noFile }
}

export async function onStaged() {
  const diff = getStagedDiff()

  if (!diff.trim()) {
    clearCache()
    return
  }

  const diffHash = createDiffHash(diff)
  const existingCache = readCache()

  if (existingCache && existingCache.hash === diffHash) {
    return
  }

  try {
    const eslint = await getEslintRules()
    const response = await sendToCommitGuard(diff, eslint.rules, config)

    writeCache({
      hash: diffHash,
      timestamp: Date.now(),
      diff,
      analysis: response,
    })
  }
  catch (error) {
    consola.error('Analysis failed:', error)
  }
}

export function getCachedAnalysis(diff?: string, diffHash?: string): { analysis: any, age: number } | null {
  const effectiveDiff = diff ?? getStagedDiff()
  if (!effectiveDiff.trim()) {
    return {
      analysis: { status: 'pass', issues: [] },
      age: 0,
    }
  }

  const effectiveDiffHash = diffHash ?? createDiffHash(effectiveDiff)

  const cache = readCache()

  if (!cache) {
    return null
  }

  if (cache.hash !== effectiveDiffHash) {
    return null
  }

  const age = Math.round((Date.now() - cache.timestamp) / 1000)

  return {
    analysis: cache.analysis,
    age,
  }
}

export async function validateCommit(): Promise<void> {
  const diff = getStagedDiff()
  const diffHash = diff.trim() ? createDiffHash(diff) : ''

  const cached = getCachedAnalysis(diff, diffHash)
  if (!cached) {
    await onStaged()

    const newCached = getCachedAnalysis(diff, diffHash)
    if (!newCached) {
      consola.error('Analysis failed')
      process.exit(1)
    }

    await displayResults(newCached.analysis)
    return
  }
  await displayResults(cached.analysis)
}

async function displayResults(analysis: any): Promise<void> {
  const isTTY = process.stdout.isTTY

  if (analysis.status === 'pass' || analysis.approved || !analysis.issues || analysis.issues.length === 0) {
    consola.success('All checks passed')
    return
  }

  const count = analysis.issues?.length ?? 0

  if (!isTTY) {
    consola.log(`CommitGuard Detected ${count} issue${count === 1 ? '' : 's'}.`)
  }

  const { grouped, noFile } = groupIssuesByFile(analysis.issues)
  const fileCount = Object.keys(grouped).length

  if (isTTY) {
    consola.log(`\nCommitGuard Detected ${count} issue${count === 1 ? '' : 's'} in ${fileCount} file${fileCount === 1 ? '' : 's'}:`)
  }
  else {
    consola.log(`\nIssues in ${fileCount} file${fileCount === 1 ? '' : 's'}:`)
  }

  for (const [file, issues] of Object.entries(grouped)) {
    let output = `\n📄 ${file}\n`
    const lastIdx = issues.length - 1

    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i]
      const prefix = i === lastIdx ? '   └─' : '   ├─'
      const rawLabel = CATEGORY_LABELS[issue.category as keyof typeof CATEGORY_LABELS] ?? '•'
      const label = padLabel(rawLabel)
      const severity = padSeverity(issue.severity ? `[${issue.severity.toUpperCase()}]` : '[INFO]')
      const location = issue.file
        ? ` (${issue.file}${issue.line ? `:${issue.line}` : ''})`
        : ''

      output += `${prefix} ${label} ${severity} ${issue.message}${location}\n`
    }
    process.stdout.write(output)
  }

  if (noFile.length > 0) {
    consola.log('\n📋 General Issues')
    noFile.forEach((issue, idx) => {
      const isLast = idx === noFile.length - 1
      const prefix = isLast ? '   └─' : '   ├─'
      const emoji = CATEGORY_LABELS[issue.category as keyof typeof CATEGORY_LABELS] || '•'
      consola.log(`${prefix} ${emoji} ${issue.message}`)
    })
  }

  consola.log('\nFix these issues and try again.\n')

  if (!isTTY) {
    consola.log('--------------------')
    consola.log('Unfortunately, CommitGuard cannot prompt for easy confirmation in non-interactive mode. To see how this works, please use git in a supported terminal.')
    consola.log('To bypass this check, add --skip anywhere in your commit message')
    process.exit(1)
  }

  const confirmed = await consola.prompt('Do you want to ignore these issues and commit anyway?', {
    type: 'confirm',
    initial: false,
  })

  if (confirmed) {
    consola.log('⚠️  Commit forced by user despite detected issues.\n')
    return
  }

  consola.log('\n💡 To bypass this check, add --skip anywhere in your commit message\n')
  process.exit(1)
}
