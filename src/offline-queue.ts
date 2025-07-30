import { ulid } from 'ulid'
import {
  QueuedOperation,
  QueueEventType,
  QueueEventHandler,
  QueuedSubmitResponse
} from './types'

// Chrome storage types (simplified)
declare global {
  interface Chrome {
    storage: {
      sync: {
        get(keys: string | string[], callback: (result: Record<string, unknown>) => void): void
        set(items: Record<string, unknown>, callback?: () => void): void
        remove(keys: string | string[], callback?: () => void): void
      }
    }
    runtime: {
      lastError?: { message: string }
    }
  }
  const chrome: Chrome | undefined
}

/**
 * Storage adapter interface for offline queue persistence
 */
interface StorageAdapter {
  get(key: string): Promise<QueuedOperation[]>
  set(key: string, value: QueuedOperation[]): Promise<void>
  clear(key: string): Promise<void>
}

/**
 * Chrome storage sync adapter
 * Uses chrome.storage.sync for cross-device synchronization
 */
class ChromeStorageAdapter implements StorageAdapter {
  async get(key: string): Promise<QueuedOperation[]> {
    // Check if chrome.storage is available
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      return new Promise((resolve) => {
        chrome.storage.sync.get(key, (result: Record<string, unknown>) => {
          resolve((result[key] || []) as QueuedOperation[])
        })
      })
    }
    // Fallback to localStorage
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : []
  }

  async set(key: string, value: QueuedOperation[]): Promise<void> {
    // Check if chrome.storage is available
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      return new Promise((resolve, reject) => {
        chrome.storage.sync.set({ [key]: value }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
          } else {
            resolve()
          }
        })
      })
    }
    // Fallback to localStorage
    localStorage.setItem(key, JSON.stringify(value))
  }

  async clear(key: string): Promise<void> {
    // Check if chrome.storage is available
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      return new Promise((resolve) => {
        chrome.storage.sync.remove(key, () => resolve())
      })
    }
    // Fallback to localStorage
    localStorage.removeItem(key)
  }
}

/**
 * Offline queue for managing API operations when offline
 * 
 * Features:
 * - Automatic persistence using chrome.storage.sync
 * - Intelligent batching of submit operations
 * - FIFO processing order
 * - Event-based notifications
 * - Automatic cleanup of expired items
 */
export class OfflineQueue {
  private queue: QueuedOperation[] = []
  private processing = false
  private storageKey: string
  private storage: StorageAdapter
  private eventHandlers: Map<QueueEventType, Set<QueueEventHandler>> = new Map()
  private readonly MAX_QUEUE_SIZE = 1000
  private readonly QUEUE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
  private readonly MAX_BATCH_SIZE = 100

  constructor(apiKey: string) {
    // Use API key hash for storage key to ensure isolation
    this.storageKey = `gl_queue_${this.hashApiKey(apiKey)}`
    this.storage = new ChromeStorageAdapter()
    this.loadQueue()
  }

  /**
   * Add an operation to the queue
   */
  async enqueue(operation: Omit<QueuedOperation, 'queueId' | 'timestamp' | 'retryCount'>): Promise<QueuedSubmitResponse> {
    const queueId = ulid()
    const queuedOp: QueuedOperation = {
      ...operation,
      queueId,
      timestamp: Date.now(),
      retryCount: 0
    }

    // Check queue size limit
    if (this.queue.length >= this.MAX_QUEUE_SIZE) {
      throw new Error(`Queue is full (max ${this.MAX_QUEUE_SIZE} items)`)
    }

    this.queue.push(queuedOp)
    await this.persistQueue()

    // Emit event
    this.emit('queue:added', queuedOp)

    // Return queued response
    return {
      queued: true,
      queueId,
      queuePosition: this.queue.length,
      operation: 'insert',
      rank: -1
    }
  }

  /**
   * Check if queue has items
   */
  hasItems(): boolean {
    return this.queue.length > 0
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.queue.length
  }

  /**
   * Check if currently processing
   */
  isProcessing(): boolean {
    return this.processing
  }

  /**
   * Get all queued operations
   */
  getQueue(): QueuedOperation[] {
    return [...this.queue]
  }

  /**
   * Group operations by leaderboard for intelligent batching
   */
  batchOperations(): Map<string, QueuedOperation[]> {
    const groups = new Map<string, QueuedOperation[]>()
    
    // Clean expired items first
    this.cleanExpiredItems()

    // Group submit operations by leaderboard
    for (const op of this.queue) {
      if (op.method === 'submit' && op.params.leaderboardId) {
        const key = op.params.leaderboardId
        if (!groups.has(key)) {
          groups.set(key, [])
        }
        groups.get(key)!.push(op)
      } else if (op.method === 'submitBulk') {
        // Bulk operations stay separate
        groups.set(`bulk_${op.queueId}`, [op])
      }
    }

    // Limit batch sizes
    const limitedGroups = new Map<string, QueuedOperation[]>()
    for (const [key, ops] of groups) {
      if (ops.length > this.MAX_BATCH_SIZE) {
        // Split into smaller batches
        for (let i = 0; i < ops.length; i += this.MAX_BATCH_SIZE) {
          limitedGroups.set(`${key}_${i}`, ops.slice(i, i + this.MAX_BATCH_SIZE))
        }
      } else {
        limitedGroups.set(key, ops)
      }
    }

    return limitedGroups
  }

  /**
   * Mark operations as processed and remove from queue
   */
  async removeProcessed(queueIds: string[]): Promise<void> {
    const idSet = new Set(queueIds)
    this.queue = this.queue.filter(op => !idSet.has(op.queueId))
    await this.persistQueue()
  }

  /**
   * Clear the entire queue
   */
  async clear(): Promise<void> {
    this.queue = []
    await this.storage.clear(this.storageKey)
  }

  /**
   * Mark operation as failed and increment retry count
   */
  async markFailed(queueId: string, permanent = false): Promise<void> {
    const op = this.queue.find(o => o.queueId === queueId)
    if (op) {
      if (permanent) {
        // Remove permanently failed items
        this.queue = this.queue.filter(o => o.queueId !== queueId)
        this.emit('queue:failed', { operation: op, permanent: true })
      } else {
        // Increment retry count
        op.retryCount = (op.retryCount || 0) + 1
      }
      await this.persistQueue()
    }
  }

  /**
   * Set processing state
   */
  setProcessing(processing: boolean): void {
    this.processing = processing
  }

  /**
   * Register event handler
   */
  on(event: QueueEventType, handler: QueueEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set())
    }
    this.eventHandlers.get(event)!.add(handler)
  }

  /**
   * Unregister event handler
   */
  off(event: QueueEventType, handler: QueueEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler)
  }

  /**
   * Emit event
   * @internal
   */
  emit(event: QueueEventType, data: unknown): void {
    this.eventHandlers.get(event)?.forEach(handler => {
      try {
        handler(event, data)
      } catch (error) {
        console.error(`Error in queue event handler for ${event}:`, error)
      }
    })
  }

  /**
   * Load queue from storage
   */
  private async loadQueue(): Promise<void> {
    try {
      this.queue = await this.storage.get(this.storageKey)
      this.cleanExpiredItems()
    } catch (error) {
      console.error('Failed to load offline queue:', error)
      this.queue = []
    }
  }

  /**
   * Persist queue to storage
   */
  private async persistQueue(): Promise<void> {
    try {
      await this.storage.set(this.storageKey, this.queue)
    } catch (error) {
      console.error('Failed to persist offline queue:', error)
    }
  }

  /**
   * Clean expired items from queue
   */
  private cleanExpiredItems(): void {
    const now = Date.now()
    const originalSize = this.queue.length
    this.queue = this.queue.filter(op => {
      const age = now - op.timestamp
      return age < this.QUEUE_TTL_MS
    })
    
    if (this.queue.length < originalSize) {
      this.persistQueue()
    }
  }

  /**
   * Simple hash function for API key
   */
  private hashApiKey(apiKey: string): string {
    let hash = 0
    for (let i = 0; i < apiKey.length; i++) {
      const char = apiKey.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36)
  }
}