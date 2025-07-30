/**
 * Server-Sent Events client for real-time leaderboard updates
 */

import type { 
  GlobalLeaderboardsConfig, 
  GlobalLeaderboardsError,
  LeaderboardEntry,
  LeaderboardMutation,
  UpdateTrigger
} from './types'

/**
 * SSE event types
 */
export type SSEEventType = 
  | 'connected'
  | 'leaderboard_update' // Changed to match WebSocket
  | 'heartbeat'
  | 'error'

/**
 * Enhanced SSE leaderboard update event data - matches WebSocket format
 */
export interface SSELeaderboardUpdateEvent {
  leaderboardId: string
  updateType: 'score_update' | 'full_refresh' | 'bulk_update'
  
  // Complete current state (top 100 entries)
  leaderboard: {
    entries: LeaderboardEntry[]
    totalEntries: number
    displayedEntries: number
  }
  
  // What changed
  mutations: LeaderboardMutation[]
  
  // What triggered this update
  trigger: UpdateTrigger
  
  sequence: number // For ordering/deduplication
}

/**
 * Event handlers for SSE
 */
export interface SSEEventHandlers {
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: GlobalLeaderboardsError) => void
  onLeaderboardUpdate?: (data: SSELeaderboardUpdateEvent) => void
  onHeartbeat?: (data: { connectionId: string; serverTime: string }) => void
  onMessage?: (message: any) => void
}

/**
 * SSE connection options
 */
export interface SSEConnectionOptions {
  userId?: string
  includeMetadata?: boolean
  topN?: number
}

/**
 * LeaderboardSSE client for Server-Sent Events
 * 
 * @example
 * ```typescript
 * const sse = new LeaderboardSSE(config)
 * 
 * const connection = sse.connect('leaderboard-id', {
 *   onLeaderboardUpdate: (data) => {
 *     console.log('Leaderboard updated:', data.topScores)
 *   },
 *   onUserRankUpdate: (data) => {
 *     console.log('User rank changed:', data)
 *   }
 * })
 * 
 * // Later...
 * connection.close()
 * ```
 */
export class LeaderboardSSE {
  private config: Required<GlobalLeaderboardsConfig>
  private connections: Map<string, EventSource> = new Map()
  private reconnectAttempts: Map<string, number> = new Map()
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map()

  /**
   * Create a new LeaderboardSSE client
   * 
   * @param config - Configuration with API key and base URL
   */
  constructor(config: Required<GlobalLeaderboardsConfig>) {
    this.config = config
  }

  /**
   * Connect to a leaderboard's SSE stream
   * 
   * @param leaderboardId - The leaderboard to connect to
   * @param handlers - Event handlers for different SSE events
   * @param options - Connection options
   * @returns Connection object with close method
   */
  connect(
    leaderboardId: string,
    handlers: SSEEventHandlers,
    options: SSEConnectionOptions = {}
  ): { close: () => void } {
    // Close existing connection if any
    this.disconnect(leaderboardId)

    // Build SSE URL
    const params = new URLSearchParams({
      api_key: this.config.apiKey,
      ...(options.userId && { user_id: options.userId }),
      include_metadata: String(options.includeMetadata ?? true),
      top_n: String(options.topN ?? 10)
    })

    const url = `${this.config.baseUrl}/v1/sse/leaderboards/${leaderboardId}?${params.toString()}`

    try {
      const eventSource = new EventSource(url)

      // Handle connection open
      eventSource.onopen = () => {
        console.debug('[LeaderboardSSE] Connection opened:', leaderboardId)
        this.reconnectAttempts.delete(leaderboardId)
        handlers.onConnect?.()
      }

      // Handle generic messages
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.debug('[LeaderboardSSE] Received message:', data)
          handlers.onMessage?.(data)
        } catch (error) {
          console.error('[LeaderboardSSE] Failed to parse message:', error)
        }
      }

      // Handle errors
      eventSource.onerror = (error) => {
        console.error('[LeaderboardSSE] Connection error:', error)
        
        if (eventSource.readyState === EventSource.CLOSED) {
          handlers.onDisconnect?.()
          this.attemptReconnection(leaderboardId, handlers, options)
        }
      }

      // Set up event handlers
      eventSource.addEventListener('connected', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data)
          console.debug('[LeaderboardSSE] Connected event:', data)
        } catch (error) {
          console.error('[LeaderboardSSE] Failed to parse connected event:', error)
        }
      })

      // Handle enhanced leaderboard_update event (matches WebSocket format)
      eventSource.addEventListener('leaderboard_update', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as SSELeaderboardUpdateEvent
          console.debug('[LeaderboardSSE] Received leaderboard_update:', {
            leaderboardId: data.leaderboardId,
            mutations: data.mutations.length,
            entries: data.leaderboard.entries.length,
            sequence: data.sequence
          })
          handlers.onLeaderboardUpdate?.(data)
        } catch (error) {
          console.error('[LeaderboardSSE] Failed to parse leaderboard_update event:', error)
        }
      })

      eventSource.addEventListener('heartbeat', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data)
          handlers.onHeartbeat?.(data)
        } catch (error) {
          console.error('[LeaderboardSSE] Failed to parse heartbeat event:', error)
        }
      })

      eventSource.addEventListener('error', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data)
          const error = new Error(data.error.message) as GlobalLeaderboardsError
          error.code = data.error.code
          handlers.onError?.(error)
        } catch (error) {
          console.error('[LeaderboardSSE] Failed to parse error event:', error)
        }
      })

      // Store connection
      this.connections.set(leaderboardId, eventSource)

      // Return connection control object
      return {
        close: () => this.disconnect(leaderboardId)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create SSE connection'
      const sseError = new Error(message) as GlobalLeaderboardsError
      sseError.code = 'CONNECTION_FAILED'
      handlers.onError?.(sseError)
      
      throw sseError
    }
  }

  /**
   * Disconnect from a specific leaderboard
   * 
   * @param leaderboardId - The leaderboard to disconnect from
   */
  disconnect(leaderboardId: string): void {
    const eventSource = this.connections.get(leaderboardId)
    if (eventSource) {
      eventSource.close()
      this.connections.delete(leaderboardId)
    }

    // Clear reconnection timer
    const timer = this.reconnectTimers.get(leaderboardId)
    if (timer) {
      clearTimeout(timer)
      this.reconnectTimers.delete(leaderboardId)
    }

    this.reconnectAttempts.delete(leaderboardId)
  }

  /**
   * Disconnect from all leaderboards
   */
  disconnectAll(): void {
    for (const leaderboardId of this.connections.keys()) {
      this.disconnect(leaderboardId)
    }
  }

  /**
   * Check if connected to a specific leaderboard
   * 
   * @param leaderboardId - The leaderboard to check
   * @returns Whether connected to the leaderboard
   */
  isConnected(leaderboardId: string): boolean {
    const eventSource = this.connections.get(leaderboardId)
    return eventSource?.readyState === EventSource.OPEN
  }

  /**
   * Get connection status for all leaderboards
   * 
   * @returns Map of leaderboard IDs to connection states
   */
  getConnectionStatus(): Map<string, 'connecting' | 'open' | 'closed'> {
    const status = new Map<string, 'connecting' | 'open' | 'closed'>()
    
    for (const [leaderboardId, eventSource] of this.connections) {
      switch (eventSource.readyState) {
        case EventSource.CONNECTING:
          status.set(leaderboardId, 'connecting')
          break
        case EventSource.OPEN:
          status.set(leaderboardId, 'open')
          break
        case EventSource.CLOSED:
          status.set(leaderboardId, 'closed')
          break
      }
    }
    
    return status
  }

  /**
   * Attempt to reconnect to a leaderboard
   * 
   * @param leaderboardId - The leaderboard to reconnect to
   * @param handlers - Event handlers
   * @param options - Connection options
   */
  private attemptReconnection(
    leaderboardId: string,
    handlers: SSEEventHandlers,
    options: SSEConnectionOptions
  ): void {
    const attempts = this.reconnectAttempts.get(leaderboardId) || 0
    
    if (attempts >= (this.config.maxRetries || 3)) {
      console.error('[LeaderboardSSE] Max reconnection attempts reached:', leaderboardId)
      this.disconnect(leaderboardId)
      return
    }

    const delay = Math.min(1000 * Math.pow(2, attempts), 30000) // Exponential backoff, max 30s
    this.reconnectAttempts.set(leaderboardId, attempts + 1)

    console.debug('[LeaderboardSSE] Scheduling reconnection:', {
      leaderboardId,
      attempt: attempts + 1,
      delay
    })

    const timer = setTimeout(() => {
      console.debug('[LeaderboardSSE] Attempting reconnection:', leaderboardId)
      this.connect(leaderboardId, handlers, options)
      this.reconnectTimers.delete(leaderboardId)
    }, delay)

    this.reconnectTimers.set(leaderboardId, timer)
  }
}