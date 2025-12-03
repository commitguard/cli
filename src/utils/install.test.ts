import * as fs from 'node:fs'
import process from 'node:process'
import { consola } from 'consola'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getEslintRules } from './eslint'
import { installHooks, listHooks, removeHooks } from './install'

vi.mock('node:fs')
vi.mock('consola')
vi.mock('./eslint')

describe('installHooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.COMMITGUARD_API_KEY = 'test-key-1'
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should exit with error when not in a git repository', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    await installHooks()

    expect(consola.error).toHaveBeenCalledWith('No .git folder found. Run this inside a git repository.')
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('should create hooks directory if it does not exist', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path === '.git')
        return true
      if (path === '.git/hooks')
        return false
      return false
    })
    vi.mocked(getEslintRules).mockResolvedValue({ rules: {}, source: null })

    await installHooks()

    expect(fs.mkdirSync).toHaveBeenCalledWith('.git/hooks', { recursive: true })
  })

  it('should inform user if hook is already installed', async () => {
    const existingHook = '#!/bin/sh\n# CommitGuard commit-msg hook\necho "test"'

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(existingHook)

    await installHooks()

    expect(consola.success).toHaveBeenCalledWith('CommitGuard hook is already installed.')
    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })

  it('should warn when overwriting existing non-commitguard hook', async () => {
    const existingHook = '#!/bin/sh\necho "other hook"'

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(existingHook)
    vi.mocked(getEslintRules).mockResolvedValue({ rules: {}, source: null })

    await installHooks()

    expect(consola.warn).toHaveBeenCalledWith('commit-msg hook already exists. Overwriting...')
    expect(fs.writeFileSync).toHaveBeenCalled()
  })

  it('should write hook file with correct content', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path === '.git')
        return true
      if (path === '.git/hooks')
        return true
      if (path === '.git/hooks/commit-msg')
        return false
      return false
    })
    vi.mocked(getEslintRules).mockResolvedValue({ rules: {}, source: null })

    await installHooks()

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '.git/hooks/commit-msg',
      expect.stringContaining('#!/bin/sh'),
      { mode: 0o755 },
    )
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '.git/hooks/commit-msg',
      expect.stringContaining('# CommitGuard commit-msg hook'),
      { mode: 0o755 },
    )
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '.git/hooks/commit-msg',
      expect.stringContaining('--skip'),
      { mode: 0o755 },
    )
  })

  it('should load eslint configuration during installation', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('')
    vi.mocked(getEslintRules).mockResolvedValue({
      rules: { 'no-console': 'error' },
      source: '.eslintrc.json',
    })

    await installHooks()

    expect(getEslintRules).toHaveBeenCalledWith({ overrideCache: true })
    expect(consola.success).toHaveBeenCalledWith('ESLint configuration loaded.')
  })

  it('should show next steps with API key warning when not set', async () => {
    delete process.env.COMMITGUARD_API_KEY

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('')
    vi.mocked(getEslintRules).mockResolvedValue({ rules: {}, source: null })

    await installHooks()

    expect(consola.box).toHaveBeenCalledWith({
      title: 'Next Steps',
      message: expect.stringContaining('Set your API key: export COMMITGUARD_API_KEY=your_key_here'),
    })
  })

  it('should show next steps without API key warning when set', async () => {
    process.env.COMMITGUARD_API_KEY = 'test-key-1'

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('')
    vi.mocked(getEslintRules).mockResolvedValue({ rules: {}, source: null })

    await installHooks()

    expect(consola.box).toHaveBeenCalledWith({
      title: 'Next Steps',
      message: expect.not.stringContaining('Set your API key'),
    })
  })

  it('should include bypass instructions in next steps', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('')
    vi.mocked(getEslintRules).mockResolvedValue({ rules: {}, source: null })

    await installHooks()

    expect(consola.box).toHaveBeenCalledWith({
      title: 'Next Steps',
      message: expect.stringContaining('To bypass checks: add --skip anywhere in your commit message'),
    })
  })
})

describe('listHooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should exit with error when not in a git repository', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    await listHooks()

    expect(consola.error).toHaveBeenCalledWith('No .git folder found. Run this inside a git repository.')
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('should show message when hooks directory does not exist', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path === '.git')
        return true
      if (path === '.git/hooks')
        return false
      return false
    })

    await listHooks()

    expect(consola.info).toHaveBeenCalledWith('📋 No hooks directory found.')
  })

  it('should show message when no hooks are installed', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([])

    await listHooks()

    expect(consola.info).toHaveBeenCalledWith('📋 No git hooks installed.')
  })

  it('should filter out sample files and hidden files', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      'commit-msg',
      'pre-commit.sample',
      '.DS_Store',
    ] as any)
    vi.mocked(fs.statSync).mockReturnValue({
      isFile: () => true,
      mode: 0o755,
    } as any)
    vi.mocked(fs.readFileSync).mockReturnValue('#!/bin/sh\necho "test"')

    await listHooks()

    expect(consola.log).toHaveBeenCalledWith(expect.stringContaining('commit-msg'))
    expect(consola.log).not.toHaveBeenCalledWith(expect.stringContaining('pre-commit.sample'))
    expect(consola.log).not.toHaveBeenCalledWith(expect.stringContaining('.DS_Store'))
  })

  it('should identify CommitGuard hooks', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue(['commit-msg'] as any)
    vi.mocked(fs.statSync).mockReturnValue({
      isFile: () => true,
      mode: 0o755,
    } as any)
    vi.mocked(fs.readFileSync).mockReturnValue('#!/bin/sh\n# CommitGuard commit-msg hook\necho "test"')

    await listHooks()

    expect(consola.log).toHaveBeenCalledWith(expect.stringContaining('🛡️  CommitGuard'))
    expect(consola.log).toHaveBeenCalledWith(expect.stringContaining('Managed by CommitGuard'))
  })

  it('should identify non-CommitGuard hooks', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue(['pre-commit'] as any)
    vi.mocked(fs.statSync).mockReturnValue({
      isFile: () => true,
      mode: 0o755,
    } as any)
    vi.mocked(fs.readFileSync).mockReturnValue('#!/bin/sh\necho "other hook"')

    await listHooks()

    expect(consola.log).toHaveBeenCalledWith(expect.stringContaining('📝'))
    expect(consola.log).not.toHaveBeenCalledWith(expect.stringContaining('Managed by CommitGuard'))
  })

  it('should show executable status', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue(['commit-msg', 'pre-commit'] as any)

    vi.mocked(fs.statSync).mockImplementation((path: any) => {
      const fileName = path.split('/').pop()
      return {
        isFile: () => true,
        mode: fileName === 'commit-msg' ? 0o755 : 0o644,
      } as any
    })

    vi.mocked(fs.readFileSync).mockReturnValue('#!/bin/sh\necho "test"')

    await listHooks()

    expect(consola.log).toHaveBeenCalledWith(expect.stringContaining('commit-msg ✓'))
    expect(consola.log).toHaveBeenCalledWith(expect.stringContaining('pre-commit ✗ (not executable)'))
  })

  it('should show removal instructions', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue(['commit-msg'] as any)
    vi.mocked(fs.statSync).mockReturnValue({
      isFile: () => true,
      mode: 0o755,
    } as any)
    vi.mocked(fs.readFileSync).mockReturnValue('#!/bin/sh\necho "test"')

    await listHooks()

    expect(consola.log).toHaveBeenCalledWith(expect.stringContaining('Run \'commitguard remove\' to uninstall CommitGuard hooks.'))
  })
})

describe('removeHooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should exit with error when not in a git repository', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    await removeHooks()

    expect(consola.error).toHaveBeenCalledWith('No .git folder found. Run this inside a git repository.')
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('should show message when no hook exists', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path === '.git')
        return true
      if (path === '.git/hooks/commit-msg')
        return false
      return false
    })

    await removeHooks()

    expect(consola.info).toHaveBeenCalledWith('No CommitGuard hook found.')
    expect(fs.unlinkSync).not.toHaveBeenCalled()
  })

  it('should exit with error when hook is not managed by CommitGuard', async () => {
    const otherHook = '#!/bin/sh\necho "other hook"'

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(otherHook)

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`)
    })

    await expect(removeHooks()).rejects.toThrow('process.exit(1)')

    expect(consola.error).toHaveBeenCalledWith('commit-msg hook exists but is not managed by CommitGuard.')
    expect(consola.error).toHaveBeenCalledWith('Manual removal required.')
    expect(fs.unlinkSync).not.toHaveBeenCalled()
  })

  it('should remove CommitGuard hook successfully', async () => {
    const commitGuardHook = '#!/bin/sh\n# CommitGuard commit-msg hook\necho "test"'

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(commitGuardHook)

    await removeHooks()

    expect(fs.unlinkSync).toHaveBeenCalledWith('.git/hooks/commit-msg')
    expect(consola.success).toHaveBeenCalledWith('CommitGuard hook removed successfully!')
  })

  it('should warn user after removal', async () => {
    const commitGuardHook = '#!/bin/sh\n# CommitGuard commit-msg hook\necho "test"'

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(commitGuardHook)

    await removeHooks()

    expect(consola.warn).toHaveBeenCalledWith('Your commits will no longer be checked by CommitGuard.')
  })
})
