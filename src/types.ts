export interface CommitGuardConfig {
  checks: {
    security?: boolean
    performance?: boolean
    codeQuality?: boolean
    architecture?: boolean
  }
}

export interface CommitGuardIssue {
  category: 'security' | 'performance' | 'code_quality' | 'architecture'
  severity: 'critical' | 'warning' | 'suggestion'
  type: string
  message: string
  file?: string
  line?: number
}

export interface CommitGuardResponse {
  issues: CommitGuardIssue[]
  passed: boolean
}

export interface DiffAnalysis {
  shouldUseFunctionContext: boolean
  totalSize: number
  changedLines: number
  contextLines: number
}

interface ESLintRuleMap {
  [ruleName: string]: any
}

export interface LoadedESLintConfig {
  rules: ESLintRuleMap
  source: string | null
}
