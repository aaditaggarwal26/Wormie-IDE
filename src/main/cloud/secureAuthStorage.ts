import { safeStorage } from 'electron'
import Store from 'electron-store'
import type { SupportedStorage } from '@supabase/supabase-js'
import { canPersistAuthSession } from './authStoragePolicy'

type AuthStore = {
  tokens: Record<string, string>
}

export class SecureAuthStorage implements SupportedStorage {
  private readonly store = new Store<AuthStore>({ name: 'cloud-auth' })
  private readonly memory = new Map<string, string>()

  private canPersist(): boolean {
    const backend = process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : undefined
    return canPersistAuthSession(process.platform, safeStorage.isEncryptionAvailable(), backend)
  }

  private discardPersistentTokens(): void {
    if (this.store.has('tokens')) this.store.delete('tokens')
  }

  async getItem(key: string): Promise<string | null> {
    if (!this.canPersist()) {
      this.discardPersistentTokens()
      return this.memory.get(key) ?? null
    }
    const encrypted = this.store.get('tokens')?.[key]
    if (!encrypted) return null
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch {
      await this.removeItem(key)
      return null
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    if (!this.canPersist()) {
      this.discardPersistentTokens()
      this.memory.set(key, value)
      return
    }
    const tokens = this.store.get('tokens') ?? {}
    this.store.set('tokens', {
      ...tokens,
      [key]: safeStorage.encryptString(value).toString('base64')
    })
  }

  async removeItem(key: string): Promise<void> {
    this.memory.delete(key)
    const tokens = this.store.get('tokens') ?? {}
    if (!(key in tokens)) return
    const next = { ...tokens }
    delete next[key]
    this.store.set('tokens', next)
  }
}
