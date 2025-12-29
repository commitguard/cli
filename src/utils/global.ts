import { createHash } from 'node:crypto'

export function createDiffHash(diff: string): string {
  return createHash('md5').update(diff).digest('base64url')
}

export function addGitLineNumbers(diff: string): string {
  const lines = diff.split('\n')
  const result: string[] = []
  let oldLine = 0
  let newLine = 0

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) {
        oldLine = Number.parseInt(match[1], 10)
        newLine = Number.parseInt(match[2], 10)
      }
      result.push(line)
    }
    else if (line.startsWith('---') || line.startsWith('+++')
      || line.startsWith('diff ') || line.startsWith('index ')) {
      result.push(line)
    }
    else if (line.startsWith('-')) {
      result.push(`${oldLine}:${line}`)
      oldLine++
    }
    else if (line.startsWith('+')) {
      result.push(`${newLine}:${line}`)
      newLine++
    }
    else {
      result.push(`${newLine}:${line}`)
      oldLine++
      newLine++
    }
  }
  return result.join('\n')
}
