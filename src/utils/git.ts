import { execSync } from 'node:child_process'
import micromatch from 'micromatch'

export function getStagedDiff(ignorePatterns: string[]): string {
  try {
    const fullDiff = execSync(
      'git diff --cached --unified=10 --no-color --minimal --ignore-all-space --function-context --diff-algorithm=histogram --diff-filter=AMC',
      {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'ignore'],
      },
    )

    if (!ignorePatterns.length)
      return fullDiff

    return filterDiffByPatterns(fullDiff, ignorePatterns)
  }
  catch {
    return ''
  }
}

function filterDiffByPatterns(diff: string, patterns: string[]): string {
  const sections = diff.split(/^diff --git /m).filter(Boolean)

  const filtered = sections.filter((section) => {
    const match = section.match(/^a\/(.*?) b\//)
    if (!match)
      return true

    const filepath = match[1]
    return !micromatch.isMatch(filepath, patterns, { dot: true, matchBase: true })
  })

  return filtered.length ? `diff --git ${filtered.join('diff --git ')}` : ''
}
