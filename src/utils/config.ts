import type { CommitGuardConfig } from '../types'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { cancel, confirm, intro, isCancel, log, multiselect, outro, select, text } from '@clack/prompts'
import { consola } from 'consola'
import { MESSAGES } from './global'

const MAX_CUSTOM_PROMPT_LENGTH = 500

const CONFIG_DIR = join(homedir(), '.commitguard')
const PROJECTS_CONFIG_PATH = join(CONFIG_DIR, 'projects.json')

let projectsConfigCache: Record<string, CommitGuardConfig> | null = null
const GIT_DIR = '.git'

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
    context: 'normal',
    checks: {
      security: true,
      performance: true,
      codeQuality: true,
      architecture: true,
    },
    severityLevels: {
      critical: true,
      warning: true,
      suggestion: false,
    },
    customRule: '',
  }
}

let projectIdCache: string | null = null

function getProjectId(): string {
  if (projectIdCache)
    return projectIdCache

  try {
    const firstCommit = execFileSync('git', ['rev-list', '--max-parents=0', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim().split('\n')[0]

    projectIdCache = firstCommit
    return projectIdCache
  }
  catch {
    consola.error('Warning: Unable to determine project ID. Using current working directory as fallback project ID.')
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
  if (!existsSync(GIT_DIR)) {
    cancel(MESSAGES.noGit)
    return
  }
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

  if (isCancel(enabledChecks)) {
    cancel('Configuration cancelled')
    return
  }

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

  if (isCancel(enabledSeverity)) {
    cancel('Configuration cancelled')
    return
  }

  const contextLevel = await select({
    message: 'Select context level for analysis:',
    options: [
      { value: 'minimal', label: 'Minimal (Just Actual Changes)' },
      { value: 'normal', label: 'Normal (Actual Changes + Context Lines)' },
    ],
    initialValue: currentConfig.context,
  })
  if (isCancel(contextLevel)) {
    cancel('Configuration cancelled')
    return
  }

  let customRule = currentConfig.customRule
  if (currentConfig.customRule) {
    log.info(`Current custom rule: ${currentConfig.customRule}`)

    const editCustomRule = await confirm({
      message: 'Would you like to edit the custom rule? (Currently only available to pro users)',
      initialValue: false,
    })

    if (isCancel(editCustomRule)) {
      cancel('Configuration cancelled')
      return
    }

    if (editCustomRule) {
      const newCustomRule = await text({
        message: 'Enter new custom rule (leave empty to remove):',
        initialValue: currentConfig.customRule,
        validate: (value) => {
          const val = String(value).trim()
          if (!val)
            return undefined

          if (val.length > MAX_CUSTOM_PROMPT_LENGTH) {
            return `Custom rule must be ${MAX_CUSTOM_PROMPT_LENGTH} characters or less (current: ${val.length})`
          }
        },
      })

      if (isCancel(newCustomRule)) {
        cancel('Configuration cancelled')
        return
      }

      customRule = String(newCustomRule).trim()
    }
  }
  else {
    const addCustomRule = await confirm({
      message: 'Would you like to add a custom rule for this project? (Currently only available to pro users)',
      initialValue: false,
    })

    if (isCancel(addCustomRule)) {
      cancel('Configuration cancelled')
      return
    }

    if (addCustomRule) {
      const newCustomRule = await text({
        message: 'Enter custom rule (leave empty to skip):',
        placeholder: 'e.g., Check for proper error handling in async functions',
        validate: (value) => {
          const val = String(value).trim()
          if (!val)
            return undefined

          if (val.length > MAX_CUSTOM_PROMPT_LENGTH) {
            return `Custom rule must be ${MAX_CUSTOM_PROMPT_LENGTH} characters or less (current: ${val.length})`
          }
        },
      })

      if (isCancel(newCustomRule)) {
        cancel('Configuration cancelled')
        return
      }

      customRule = String(newCustomRule).trim()
    }
  }

  const newConfig: CommitGuardConfig = {
    context: contextLevel,
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
    customRule,
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
