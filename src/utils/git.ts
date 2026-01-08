import type { CommitGuardConfig } from '../types'
import { execFileSync } from 'node:child_process'
import ignoreConfig from '../data/ignore.json'
import { addGitLineNumbers } from './global'

export function getStagedDiff(context: CommitGuardConfig['context']): string {
  const gitContextCommand = context === 'minimal' ? [] : ['--function-context']
  try {
    const args = [
      'diff',
      '--cached',
      '--no-color',
      ...gitContextCommand,
      '--diff-algorithm=histogram',
      '--diff-filter=AMC',
      '--',
      '.',
      ...ignoreConfig.ignore.map(p => `:(exclude)${p}`),
    ]
    const diff = execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    return addGitLineNumbers(diff)
  }
  catch {
    return ''
  }
}

export function getLastDiff(context: CommitGuardConfig['context']): string {
  const gitContextCommand = context === 'minimal' ? [] : ['--function-context']
  try {
    const args = [
      'diff',
      'HEAD~1',
      'HEAD',
      '--no-color',
      ...gitContextCommand,
      '--diff-algorithm=histogram',
      '--diff-filter=AMC',
      '--',
      '.',
      ...ignoreConfig.ignore.map(p => `:(exclude)${p}`),
    ]
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'ignore'],
    })
  }
  catch {
    return ''
  }
}
