import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import { findUp } from 'find-up'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getEslintRules } from './eslint'

vi.mock('node:fs')
vi.mock('node:fs/promises')
vi.mock('find-up')
vi.mock('flat-cache', () => ({
  FlatCache: class FlatCache {
    load() {}
    getKey() { return null }
    setKey() {}
    save() {}
  },
}))

describe('getEslintRules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should use default startDir when not provided', async () => {
    vi.mocked(findUp).mockResolvedValue('/project/package.json')
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const result = await getEslintRules()

    expect(result).toEqual({
      rules: {},
      source: null,
    })
  })

  it('should find and parse .eslintrc.json', async () => {
    const mockRules = { 'no-console': 'warn', 'semi': ['error', 'always'] }

    vi.mocked(findUp).mockResolvedValue('/project/package.json')
    vi.mocked(fs.existsSync).mockImplementation((path: any) => path.endsWith('.eslintrc.json'))
    vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({ rules: mockRules }))

    const result = await getEslintRules({ startDir: '/project', overrideCache: true })

    expect(result).toEqual({
      rules: mockRules,
      source: '/project/.eslintrc.json',
    })
  })

  it('should find and parse .eslintrc', async () => {
    const mockRules = { quotes: ['error', 'single'] }

    vi.mocked(findUp).mockResolvedValue('/project/package.json')
    vi.mocked(fs.existsSync).mockImplementation((path: any) => path.endsWith('.eslintrc'))
    vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({ rules: mockRules }))

    const result = await getEslintRules({ startDir: '/project', overrideCache: true })

    expect(result).toEqual({
      rules: mockRules,
      source: '/project/.eslintrc',
    })
  })

  it('should attempt to load .eslintrc.js files', async () => {
    vi.mocked(findUp).mockResolvedValue('/project/package.json')
    vi.mocked(fs.existsSync).mockImplementation((path: any) => path.endsWith('.eslintrc.js'))

    const result = await getEslintRules({ startDir: '/project', overrideCache: true })

    expect(fs.existsSync).toHaveBeenCalled()
    expect(result).toHaveProperty('rules')
    expect(result).toHaveProperty('source')
  })

  it('should attempt to load eslint.config.js files', async () => {
    vi.mocked(findUp).mockResolvedValue('/project/package.json')
    vi.mocked(fs.existsSync).mockImplementation((path: any) => path.endsWith('eslint.config.js'))

    const result = await getEslintRules({ startDir: '/project', overrideCache: true })

    expect(fs.existsSync).toHaveBeenCalled()
    expect(result).toHaveProperty('rules')
  })

  it('should attempt to load .mjs config files', async () => {
    vi.mocked(findUp).mockResolvedValue('/project/package.json')
    vi.mocked(fs.existsSync).mockImplementation((path: any) => path.endsWith('eslint.config.mjs'))

    const result = await getEslintRules({ startDir: '/project', overrideCache: true })

    expect(fs.existsSync).toHaveBeenCalled()
    expect(result).toHaveProperty('rules')
  })

  it('should parse eslintConfig from package.json', async () => {
    const mockRules = { strict: ['error', 'global'] }

    vi.mocked(findUp).mockResolvedValue('/project/package.json')
    vi.mocked(fs.existsSync).mockImplementation((path: any) => path.endsWith('package.json'))
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      JSON.stringify({
        name: 'test-project',
        eslintConfig: {
          rules: mockRules,
        },
      }),
    )

    const result = await getEslintRules({ startDir: '/project', overrideCache: true })

    expect(result).toEqual({
      rules: mockRules,
      source: '/project/package.json',
    })
  })

  it('should return empty rules when no config found', async () => {
    vi.mocked(findUp).mockResolvedValue('/project/package.json')
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const result = await getEslintRules({ startDir: '/project', overrideCache: true })

    expect(result).toEqual({
      rules: {},
      source: null,
    })
  })

  it('should handle JSON parse errors gracefully', async () => {
    vi.mocked(findUp).mockResolvedValue('/project/package.json')
    vi.mocked(fs.existsSync).mockImplementation((path: any) => path.endsWith('.eslintrc.json'))
    vi.mocked(fsPromises.readFile).mockResolvedValue('invalid json{')

    const result = await getEslintRules({ startDir: '/project', overrideCache: true })

    expect(result).toEqual({
      rules: {},
      source: null,
    })
  })

  it('should use startDir as project root when package.json not found', async () => {
    const startDir = '/custom/dir'

    vi.mocked(findUp).mockResolvedValue(undefined)
    vi.mocked(fs.existsSync).mockReturnValue(false)

    await getEslintRules({ startDir, overrideCache: true })

    expect(findUp).toHaveBeenCalledWith('package.json')
  })

  it('should prioritize earlier config files when multiple exist', async () => {
    const mockRules = { 'no-console': 'error' }

    vi.mocked(findUp).mockResolvedValue('/project/package.json')
    vi.mocked(fs.existsSync).mockImplementation((path: any) =>
      path.endsWith('.eslintrc') || path.endsWith('.eslintrc.json'),
    )
    vi.mocked(fsPromises.readFile)
      .mockResolvedValueOnce(JSON.stringify({ rules: mockRules }))
      .mockResolvedValueOnce(JSON.stringify({ rules: { semi: 'error' } }))

    const result = await getEslintRules({ startDir: '/project', overrideCache: true })

    expect(result.rules).toEqual(mockRules)
    expect(result.source).toBe('/project/.eslintrc')
  })

  it('should handle config without rules property in JSON', async () => {
    vi.mocked(findUp).mockResolvedValue('/project/package.json')
    vi.mocked(fs.existsSync).mockImplementation((path: any) => path.endsWith('.eslintrc.json'))
    vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({ extends: 'eslint:recommended' }))

    const result = await getEslintRules({ startDir: '/project', overrideCache: true })

    expect(result).toEqual({
      rules: {},
      source: null,
    })
  })

  it('should handle package.json without eslintConfig', async () => {
    vi.mocked(findUp).mockResolvedValue('/project/package.json')
    vi.mocked(fs.existsSync).mockImplementation((path: any) => path.endsWith('package.json'))
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
      }),
    )

    const result = await getEslintRules({ startDir: '/project', overrideCache: true })

    expect(result).toEqual({
      rules: {},
      source: null,
    })
  })

  it('should handle overrideCache parameter', async () => {
    vi.mocked(findUp).mockResolvedValue('/project/package.json')
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const result = await getEslintRules({ startDir: '/project', overrideCache: true })

    expect(result).toEqual({
      rules: {},
      source: null,
    })
  })

  it('should check all config file paths in order', async () => {
    vi.mocked(findUp).mockResolvedValue('/project/package.json')
    vi.mocked(fs.existsSync).mockReturnValue(false)

    await getEslintRules({ startDir: '/project', overrideCache: true })

    const calls = vi.mocked(fs.existsSync).mock.calls.map(call => call[0])

    expect(calls.some((path: any) => path.endsWith('.eslintrc'))).toBe(true)
    expect(calls.some((path: any) => path.endsWith('.eslintrc.json'))).toBe(true)
    expect(calls.some((path: any) => path.endsWith('.eslintrc.js'))).toBe(true)
    expect(calls.some((path: any) => path.endsWith('eslint.config.js'))).toBe(true)
    expect(calls.some((path: any) => path.endsWith('package.json'))).toBe(true)
  })
})
