import { confirm, text } from '@clack/prompts'
import { Entry } from '@napi-rs/keyring'
import { consola } from 'consola'

const store = new Entry('commit_guard', 'global_key')

function setGlobalKey(apiKey: string) {
  store.setPassword(apiKey)
}

export function getGlobalKey() {
  return store.getPassword()
}

function deleteGlobalKey() {
  store.deletePassword()
}

export async function manageGlobalKey() {
  try {
    const existingKey = getGlobalKey()
    if (existingKey) {
      consola.log('An existing API key was found.')
      const shouldDelete = await confirm({
        message: 'Do you want to delete the existing global API key?',
        initialValue: false,
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

      const apiKey = await text({
        message: 'Enter your CommitGuard API key:',
        placeholder: 'sk_XXXXXXXXXXXXXXXXXXXXXX',
        validate: (value) => {
          if (!value || value.trim() === '') {
            throw new Error('API key cannot be empty')
          }
          if (value.startsWith('sk_') === false) {
            throw new Error('Invalid API key format. API key should start with "sk_"')
          }
          return undefined
        },
      })
      if (typeof apiKey === 'string') {
        setGlobalKey(apiKey)
        consola.success('Global API key set successfully.')
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
