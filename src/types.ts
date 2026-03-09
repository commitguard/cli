export interface CommitGuardConfig {
  checks: {
    security: boolean
    performance: boolean
    codeQuality: boolean
    architecture: boolean
    functionSimilarity?: boolean
  }
  severityLevels: {
    critical: boolean
    warning: boolean
    suggestion: boolean
  }
  customRule: string
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
export type TypeKind = 'interface' | 'type' | 'enum' | 'class'

export interface FunctionInfo {
  name: string
  file: string
  line: number
  exported: boolean
}

export interface TypeInfo {
  name: string
  file: string
  line: number
  exported: boolean
  kind: TypeKind
}

export interface DuplicateSymbol {
  /** Symbol name that appears in more than one file within the same commit. */
  name: string
  files: string[]
}

export interface CommitSymbols {
  /** Functions / arrow functions / methods added in this commit. */
  functions: FunctionInfo[]
  /** Interfaces, type aliases, enums and classes added in this commit. */
  types: TypeInfo[]
  /** Function names declared in multiple files within this single commit. */
  duplicateFunctions: DuplicateSymbol[]
  /** Type names declared in multiple files within this single commit. */
  duplicateTypes: DuplicateSymbol[]
  /**
   * The full list of function names already tracked in the project
   * (sourced from the local .git/commitguard-functions.json store).
   * The endpoint uses this as the baseline for similarity comparison.
   */
  knownFunctionNames: string[]
}
