import type { CommitGuardConfig } from '../types'
import * as childProcess from 'node:child_process'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as clack from '@clack/prompts'
import { consola } from 'consola'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs')
vi.mock('node:child_process')
vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/user'),
}))
vi.mock('@clack/prompts')
vi.mock('consola', () => ({
  consola: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

describe('loadConfig', () => {
  const mockHomedir = '/home/user'
  const mockProjectId = 'abc123commit'

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.mocked(os.homedir).mockReturnValue(mockHomedir)
    vi.mocked(childProcess.execFileSync).mockReturnValue(mockProjectId)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return default config when no projects config exists', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    const { loadConfig } = await import('./config')

    const config = loadConfig()

    expect(config).toEqual({
      checks: {
        security: true,
        performance: true,
        codeQuality: true,
        architecture: true,
      },
      severityLevels: {
        critical: true,
        suggestion: true,
        warning: true,
      },
    })
  })

  it('should return project-specific config when it exists', async () => {
    const mockProjectsConfig = {
      [mockProjectId]: {
        checks: {
          security: true,
          performance: false,
          codeQuality: true,
          architecture: false,
        },
      },
    }

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockProjectsConfig))
    const { loadConfig } = await import('./config')

    const config = loadConfig()

    expect(config).toEqual(mockProjectsConfig[mockProjectId])
  })

  it('should return default config when project ID not in projects config', async () => {
    const mockProjectsConfig = {
      'different-project': {
        checks: {
          security: false,
          performance: false,
          codeQuality: false,
          architecture: false,
        },
        severityLevels: {
          critical: true,
          suggestion: true,
          warning: true,
        },
      },
    }

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockProjectsConfig))
    const { loadConfig } = await import('./config')

    const config = loadConfig()

    expect(config).toEqual({
      checks: {
        security: true,
        performance: true,
        codeQuality: true,
        architecture: true,
      },
      severityLevels: {
        critical: true,
        suggestion: true,
        warning: true,
      },
    })
  })

  it('should use cwd as fallback when git command fails', async () => {
    const mockCwd = '/path/to/project'
    vi.mocked(childProcess.execFileSync).mockImplementation(() => {
      throw new Error('Not a git repository')
    })
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.spyOn(process, 'cwd').mockReturnValue(mockCwd)
    const { loadConfig } = await import('./config')

    const config = loadConfig()

    expect(consola.error).toHaveBeenCalledWith(
      expect.stringContaining('Unable to determine project ID'),
    )
    expect(config).toEqual({
      checks: {
        security: true,
        performance: true,
        codeQuality: true,
        architecture: true,
      },
      severityLevels: {
        critical: true,
        suggestion: true,
        warning: true,
      },
    })
  })

  it('should handle corrupted projects config file gracefully', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('invalid json{')
    const { loadConfig } = await import('./config')

    const config = loadConfig()

    expect(consola.warn).toHaveBeenCalledWith('Failed to parse projects config')
    expect(config).toEqual({
      checks: {
        security: true,
        performance: true,
        codeQuality: true,
        architecture: true,
      },
      severityLevels: {
        critical: true,
        suggestion: true,
        warning: true,
      },
    })
  })

  it('should cache project ID on subsequent calls', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    const { loadConfig } = await import('./config')

    loadConfig()
    loadConfig()

    expect(childProcess.execFileSync).toHaveBeenCalledTimes(1)
  })
})

describe('manageConfig', () => {
  const mockHomedir = '/home/user'
  const mockConfigPath = '/home/user/.commitguard/projects.json'
  const mockProjectId = 'abc123commit'

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.mocked(os.homedir).mockReturnValue(mockHomedir)
    vi.mocked(childProcess.execFileSync).mockReturnValue(mockProjectId)
    vi.mocked(fs.existsSync).mockReturnValue(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should save new configuration when user confirms', async () => {
    vi.mocked(clack.intro).mockReturnValue(undefined)
    vi.mocked(clack.multiselect).mockResolvedValue(['security', 'performance'])
    vi.mocked(clack.isCancel).mockReturnValue(false)
    vi.mocked(clack.confirm).mockResolvedValue(true)
    vi.mocked(clack.outro).mockReturnValue(undefined)
    vi.mocked(fs.existsSync).mockReturnValue(false)
    const { manageConfig } = await import('./config')

    await manageConfig()

    expect(clack.multiselect).toHaveBeenCalled()
    expect(clack.confirm).toHaveBeenCalled()
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      mockConfigPath,
      expect.stringContaining('"security": true'),
    )
    expect(clack.outro).toHaveBeenCalledWith('✓ Configuration updated for this project!')
  })

  it('should handle cancellation at multiselect', async () => {
    vi.mocked(clack.intro).mockReturnValue(undefined)
    vi.mocked(clack.multiselect).mockResolvedValue(Symbol('cancel') as any)
    vi.mocked(clack.isCancel).mockReturnValue(true)
    vi.mocked(clack.cancel).mockReturnValue(undefined)
    const { manageConfig } = await import('./config')

    await manageConfig()

    expect(clack.cancel).toHaveBeenCalledWith('Configuration cancelled')
    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })

  it('should handle cancellation at confirmation', async () => {
    vi.mocked(clack.intro).mockReturnValue(undefined)
    vi.mocked(clack.multiselect).mockResolvedValue(['security', 'codeQuality'])
    vi.mocked(clack.isCancel)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    vi.mocked(clack.confirm).mockResolvedValue(Symbol('cancel') as any)
    vi.mocked(clack.cancel).mockReturnValue(undefined)
    const { manageConfig } = await import('./config')

    await manageConfig()

    expect(clack.cancel).toHaveBeenCalledWith('Configuration cancelled')
    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })

  it('should not save when user declines confirmation', async () => {
    vi.mocked(clack.intro).mockReturnValue(undefined)
    vi.mocked(clack.multiselect).mockResolvedValue(['architecture'])
    vi.mocked(clack.isCancel).mockReturnValue(false)
    vi.mocked(clack.confirm).mockResolvedValue(false)
    vi.mocked(clack.outro).mockReturnValue(undefined)
    const { manageConfig } = await import('./config')

    await manageConfig()

    expect(fs.writeFileSync).not.toHaveBeenCalled()
    expect(clack.outro).toHaveBeenCalledWith('Configuration not saved.')
  })

  it('should not save when configuration has not changed', async () => {
    const existingConfig: CommitGuardConfig = {
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

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ [mockProjectId]: existingConfig }),
    )
    vi.mocked(clack.intro).mockReturnValue(undefined)
    vi.mocked(clack.multiselect).mockResolvedValue([
      'security',
      'performance',
      'codeQuality',
      'architecture',
    ])
    vi.mocked(clack.isCancel).mockReturnValue(false)
    vi.mocked(clack.outro).mockReturnValue(undefined)
    const { manageConfig } = await import('./config')

    await manageConfig()

    expect(fs.writeFileSync).not.toHaveBeenCalled()
    expect(clack.outro).toHaveBeenCalledWith('Configuration not saved.')
  })

  it('should load initial values from existing config', async () => {
    const existingConfig: CommitGuardConfig = {
      checks: {
        security: true,
        performance: false,
        codeQuality: true,
        architecture: false,
      },
      severityLevels: {
        critical: true,
        warning: false,
        suggestion: true,
      },
    }

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ [mockProjectId]: existingConfig }),
    )
    vi.mocked(clack.intro).mockReturnValue(undefined)
    vi.mocked(clack.multiselect).mockResolvedValue(['security', 'performance'])
    vi.mocked(clack.isCancel).mockReturnValue(false)
    vi.mocked(clack.confirm).mockResolvedValue(true)
    vi.mocked(clack.outro).mockReturnValue(undefined)
    const { manageConfig } = await import('./config')

    await manageConfig()

    expect(clack.multiselect).toHaveBeenCalledWith(
      expect.objectContaining({
        initialValues: ['security', 'codeQuality'],
      }),
    )
  })

  it('should handle file write errors gracefully', async () => {
    vi.mocked(clack.intro).mockReturnValue(undefined)
    vi.mocked(clack.multiselect).mockResolvedValue(['security'])
    vi.mocked(clack.isCancel).mockReturnValue(false)
    vi.mocked(clack.confirm).mockResolvedValue(true)
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      throw new Error('Permission denied')
    })
    const { manageConfig } = await import('./config')

    await manageConfig()

    expect(consola.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to save projects config'),
    )
  })

  it('should create config directory if it does not exist', async () => {
    vi.mocked(clack.intro).mockReturnValue(undefined)
    vi.mocked(clack.multiselect).mockResolvedValue(['performance'])
    vi.mocked(clack.isCancel).mockReturnValue(false)
    vi.mocked(clack.confirm).mockResolvedValue(true)
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(clack.outro).mockReturnValue(undefined)
    const { manageConfig } = await import('./config')

    await manageConfig()

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.commitguard'),
      { recursive: true },
    )
  })
})
