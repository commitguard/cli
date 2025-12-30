import type { CommitGuardConfig } from '../types'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { cancel, confirm, intro, isCancel, multiselect, outro } from '@clack/prompts'
import { consola } from 'consola'

const CONFIG_DIR = join(homedir(), '.commitguard')
const PROJECTS_CONFIG_PATH = join(CONFIG_DIR, 'projects.json')

let projectsConfigCache: Record<string, CommitGuardConfig> | null = null

function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    try {
      mkdirSync(CONFIG_DIR, { recursive: true })
    }
    catch (e) {
      consola.error(`Failed to create config directory at ${CONFIG_DIR}: ${(e as Error).message}`)
    }
  }
}

function getDefaultConfig(): CommitGuardConfig {
  return {
    checks: {
      security: true,
      performance: true,
      codeQuality: true,
      architecture: true,
    },
    severityLevels: {
      critical: true,
      warning: true,
      suggestion: true,
    },
  }
}

let projectIdCache: string | null = null

function getProjectId(): string {
  if (projectIdCache)
    return projectIdCache

  try {
    // not sure if there is a better way to get a unique project ID without relying on remote
    const firstCommit = execFileSync('git', ['rev-list', '--max-parents=0', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim().split('\n')[0]

    projectIdCache = firstCommit
    return projectIdCache
  }
  catch {
    consola.error('Warning: Unable to determine project ID. Using current working directory as fallback project ID.')
    // Not a git repo - use cwd should never happen
    projectIdCache = process.cwd()
    return projectIdCache
  }
}

function loadProjectsConfig(): Record<string, CommitGuardConfig> {
  if (projectsConfigCache)
    return projectsConfigCache

  if (existsSync(PROJECTS_CONFIG_PATH)) {
    try {
      const content = readFileSync(PROJECTS_CONFIG_PATH, 'utf8')
      projectsConfigCache = JSON.parse(content)
      return projectsConfigCache!
    }
    catch {
      consola.warn('Failed to parse projects config')
    }
  }

  projectsConfigCache = {}
  return projectsConfigCache
}

function saveProjectsConfig(projects: Record<string, CommitGuardConfig>) {
  try {
    ensureConfigDir()
    writeFileSync(PROJECTS_CONFIG_PATH, JSON.stringify(projects, null, 2))

    projectsConfigCache = projects
  }
  catch (e) {
    consola.error(`Failed to save projects config: ${(e as Error).message}`)
  }
}

export function loadConfig(): CommitGuardConfig {
  const projectId = getProjectId()
  const projects = loadProjectsConfig()

  return projects[projectId] || getDefaultConfig()
}

export async function manageConfig() {
  const projectId = getProjectId()
  const currentConfig = loadConfig()

  intro(`CommitGuard Configuration`)
  const enabledChecks = await multiselect({
    message: 'Select enabled checks for this project:',
    options: [
      { value: 'security', label: 'Security' },
      { value: 'performance', label: 'Performance' },
      { value: 'codeQuality', label: 'Code Quality' },
      { value: 'architecture', label: 'Architecture' },
    ],
    initialValues: Object.entries(currentConfig.checks)
      .filter(([_, enabled]) => enabled)
      .map(([key]) => key),
  })

  const enabledSeverity = await multiselect({
    message: 'Select severity levels for enabled checks:',
    options: [
      { value: 'suggestion', label: 'Suggestion' },
      { value: 'warning', label: 'Warning' },
      { value: 'critical', label: 'Critical' },
    ],
    initialValues: Object.entries(currentConfig.severityLevels)
      .filter(([_, enabled]) => enabled)
      .map(([key]) => key),
  })

  if (isCancel(enabledChecks) || isCancel(enabledSeverity)) {
    cancel('Configuration cancelled')
    return
  }

  const newConfig: CommitGuardConfig = {
    checks: {
      security: enabledChecks.includes('security'),
      performance: enabledChecks.includes('performance'),
      codeQuality: enabledChecks.includes('codeQuality'),
      architecture: enabledChecks.includes('architecture'),
    },
    severityLevels: {
      suggestion: enabledSeverity.includes('suggestion'),
      warning: enabledSeverity.includes('warning'),
      critical: enabledSeverity.includes('critical'),
    },

  }

  if (JSON.stringify(newConfig) === JSON.stringify(currentConfig)) {
    outro('No changes made to the configuration.')
    return
  }

  const confirmUpdate = await confirm({
    message: 'Save this configuration?',
  })
  if (isCancel(confirmUpdate)) {
    cancel('Configuration cancelled')
    return
  }
  if (!confirmUpdate) {
    outro('Configuration not saved.')
    return
  }

  const projects = loadProjectsConfig()
  projects[projectId] = newConfig
  saveProjectsConfig(projects)

  outro('✓ Configuration updated for this project!')
}
