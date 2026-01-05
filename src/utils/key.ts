import { confirm, intro, log, note, outro, text } from '@clack/prompts'
import { Entry } from '@napi-rs/keyring'

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

function validateApiKey(value: string): string | undefined {
  if (!value || value.trim() === '') {
    return 'API key cannot be empty.'
  }
  if (value.startsWith('sk_') === false) {
    return 'Invalid API key format. It should start with "sk_".'
  }
  return undefined
}

export async function manageGlobalKey() {
  try {
    const existingKey = getGlobalKey()
    if (existingKey) {
      intro('An existing API key was found.')
      const shouldDelete = await confirm({
        message: 'Do you want to delete the existing global API key?',
        initialValue: false,
      })
      if (shouldDelete) {
        deleteGlobalKey()
        log.success('Global API key deleted.')
        const doYouWantToAdd = await confirm({
          message: 'Do you want to add a new global API key?',
          initialValue: true,
        })
        if (doYouWantToAdd) {
          const apiKey = await text({
            message: 'Enter your CommitGuard API key:',
            placeholder: 'sk_XXXXXXXXXXXXXXXXXXXXXX',
            validate: validateApiKey,
          })
          if (typeof apiKey === 'string') {
            setGlobalKey(apiKey)
            outro('New global API key set successfully.')
          }
        }
        else {
          outro('API key removed. You can set a new one later using `commitguard init` or `commitguard keys`.')
        }
      }
    }
    else {
      note('To get your free API key, visit https://commitguard.ai', 'Get your free API key')
      const apiKey = await text({
        message: 'Enter your CommitGuard API key:',
        placeholder: 'sk_XXXXXXXXXXXXXXXXXXXXXX',
        validate: validateApiKey,
      })
      if (typeof apiKey === 'string') {
        setGlobalKey(apiKey)
        log.success('Global API key set successfully.')
      }
    }
  }
  catch (error) {
    const err = error as Error

    if (err.name === 'ExitPromptError') {
      log.message('\n👋 Until next time!')
      return
    }

    log.error(`Error managing global API key: ${err.message}`)
  }
}
