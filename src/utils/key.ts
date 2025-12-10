import confirm from '@inquirer/confirm'
import input from '@inquirer/input'
import { Entry } from '@napi-rs/keyring'
import { consola } from 'consola'

const store = new Entry('commit_guard', 'global_key')

export function setGlobalKey(apiKey: string) {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('API key cannot be empty')
  }
  if (apiKey.startsWith('sk_') === false) {
    throw new Error('Invalid API key format. API key should start with "sk_"')
  }
  store.setPassword(apiKey)
}

export function getGlobalKey() {
  return store.getPassword()
}

export function deleteGlobalKey() {
  store.deletePassword()
}

export async function manageGlobalKey() {
  try {
    const existingKey = getGlobalKey()
    if (existingKey) {
      consola.log('A global API key is already set.')
      const shouldDelete = await confirm({
        message: 'Do you want to delete the existing global API key?',
        default: false,
      })
      if (shouldDelete) {
        deleteGlobalKey()
        consola.success('Global API key deleted.')
      }
      else {
        consola.info('Global API key remains unchanged.')
      }
    }
    else {
      consola.box(
        `You can set a global API key for CommitGuard or add an env in each project.

The env in each project takes precedence over the global key for that project.

To get your free API key visit https://commitguard.dev`,
      )

      let isValid = false

      while (!isValid) {
        const apiKey = await input({
          message: 'Enter your CommitGuard API key:',
        })

        try {
          setGlobalKey(apiKey)
          consola.success('Global API key set successfully.')
          isValid = true
        }
        catch (validationError) {
          consola.warn((validationError as Error).message)
        }
      }
    }
  }
  catch (error) {
    const err = error as Error

    if (err.name === 'ExitPromptError') {
      consola.log('\n👋 Until next time!')
      return
    }

    consola.error(`Error managing global API key: ${err.message}`)
  }
}
