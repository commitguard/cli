import confirm from '@inquirer/confirm'
import input from '@inquirer/input'
import { Entry } from '@napi-rs/keyring'
import { consola } from 'consola'

const store = new Entry('commit_guard', 'global_key')

export function setGlobalKey(apiKey: string) {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('API key cannot be empty')
  }
  if (apiKey.startsWith('sk-') === false) {
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
        consola.log('Global API key deleted.')
      }
      else {
        consola.log('Global API key remains unchanged.')
      }
    }
    else {
      const apiKey = await input({
        message: 'Enter your CommitGuard API key to set it globally:',
      })
      setGlobalKey(apiKey)
      consola.success('Global API key set successfully.')
    }
  }
  catch (error) {
    consola.error(`Error managing global API key: ${(error as Error).message}`)
  }
}
