import * as fs from 'node:fs'
import { consola } from 'consola'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from './config'

vi.mock('node:fs')
vi.mock('consola')

describe('loadConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return default config when config file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const config = loadConfig()

    expect(config).toEqual({
      checks: {
        security: true,
        performance: true,
        codeQuality: true,
        architecture: true,
      },
      speed: 'balanced',
      failOpen: false,
    })
    expect(fs.existsSync).toHaveBeenCalledWith('commitguard.config.json')
  })

  it('should load and parse valid config file', () => {
    const mockConfig = {
      checks: {
        security: false,
        performance: true,
        codeQuality: false,
        architecture: true,
      },
      speed: 'fast',
      failOpen: true,
    }

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig))

    const config = loadConfig()

    expect(config).toEqual(mockConfig)
    expect(fs.readFileSync).toHaveBeenCalledWith('commitguard.config.json', 'utf8')
  })

  it('should return default config and warn when JSON parsing fails', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('invalid json{')

    const config = loadConfig()

    expect(config).toEqual({
      checks: {
        security: true,
        performance: true,
        codeQuality: true,
        architecture: true,
      },
      speed: 'balanced',
      failOpen: false,
    })
    expect(consola.warn).toHaveBeenCalledWith('Failed to parse commitguard.config.json, using defaults')
  })

  it('should return default config and warn when file reading fails', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File read error')
    })

    const config = loadConfig()

    expect(config).toEqual({
      checks: {
        security: true,
        performance: true,
        codeQuality: true,
        architecture: true,
      },
      speed: 'balanced',
      failOpen: false,
    })
    expect(consola.warn).toHaveBeenCalledWith('Failed to parse commitguard.config.json, using defaults')
  })

  it('should handle partial config and merge with parsed values', () => {
    const partialConfig = {
      checks: {
        security: false,
      },
      speed: 'slow',
    }

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(partialConfig))

    const config = loadConfig()

    expect(config).toEqual(partialConfig)
  })

  it('should handle empty config file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('{}')

    const config = loadConfig()

    expect(config).toEqual({})
  })
})
