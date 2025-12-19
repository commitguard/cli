import { execFileSync } from 'node:child_process'

export function getStagedDiff(ignorePatterns: string[]): string {
  try {
    const args = [
      'diff',
      '--cached',
      '--no-color',
      '--function-context',
      '--diff-algorithm=histogram',
      '--diff-filter=AMC',
      '--',
      '.',
      ...ignorePatterns.map(p => `:(exclude)${p}`),
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

export function getLastDiff(ignorePatterns: string[]): string {
  try {
    const args = [
      'diff',
      'HEAD~1',
      'HEAD',
      '--no-color',
      '--function-context',
      '--diff-algorithm=histogram',
      '--diff-filter=AMC',
      '--',
      '.',
      ...ignorePatterns.map(p => `:(exclude)${p}`),
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
