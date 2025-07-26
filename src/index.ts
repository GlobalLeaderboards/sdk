import { ulid } from 'ulid'
import {
  GlobalLeaderboardsConfig,
  SubmitScoreRequest,
  SubmitScoreResponse,
  LeaderboardResponse,
  ApiErrorResponse,
  GlobalLeaderboardsError,
  WebSocketHandlers
} from './types'
import { LeaderboardWebSocket } from './websocket'

export * from './types'
export { LeaderboardWebSocket }

/**
 * GlobalLeaderboards SDK client
 */
export class GlobalLeaderboards {
  private readonly config: Required<GlobalLeaderboardsConfig>
  private wsClient: LeaderboardWebSocket | null = null

  constructor(apiKey: string, config?: Partial<GlobalLeaderboardsConfig>) {
    this.config = {
      apiKey,
      appId: config?.appId || '',
      baseUrl: config?.baseUrl || 'https://api.globalleaderboards.net',
      wsUrl: config?.wsUrl || 'wss://api.globalleaderboards.net',
      timeout: config?.timeout || 30000,
      autoRetry: config?.autoRetry ?? true,
      maxRetries: config?.maxRetries || 3
    }
  }

  /**
   * Submit a score to a leaderboard
   */
  async submit(
    userId: string,
    score: number,
    options: {
      leaderboardId: string
      userName?: string
      metadata?: Record<string, unknown>
    }
  ): Promise<SubmitScoreResponse> {
    const request: SubmitScoreRequest = {
      leaderboard_id: options.leaderboardId,
      user_id: userId,
      user_name: options.userName || userId,
      score,
      metadata: options.metadata
    }

    return this.request<SubmitScoreResponse>('POST', '/v1/scores', request)
  }

  /**
   * Submit a score using a simplified API
   * This matches the example usage: leaderboard.submit('player-id', 1250)
   */
  async submitScore(
    playerId: string,
    score: number,
    leaderboardId?: string,
    options?: {
      userName?: string
      metadata?: Record<string, unknown>
    }
  ): Promise<SubmitScoreResponse> {
    // If no leaderboardId provided, use a default one from config
    const targetLeaderboardId = leaderboardId || this.config.appId
    
    if (!targetLeaderboardId) {
      throw new GlobalLeaderboardsError(
        'Leaderboard ID is required. Provide it as a parameter or set appId in config.',
        'MISSING_LEADERBOARD_ID'
      )
    }

    return this.submit(playerId, score, {
      leaderboardId: targetLeaderboardId,
      userName: options?.userName,
      metadata: options?.metadata
    })
  }

  /**
   * Get leaderboard entries
   */
  async getLeaderboard(
    leaderboardId: string,
    options?: {
      page?: number
      limit?: number
      aroundUser?: string
    }
  ): Promise<LeaderboardResponse> {
    const params = new URLSearchParams()
    
    if (options?.page) params.append('page', options.page.toString())
    if (options?.limit) params.append('limit', options.limit.toString())
    if (options?.aroundUser) params.append('around_user', options.aroundUser)

    const query = params.toString()
    const path = `/v1/leaderboards/${leaderboardId}${query ? `?${query}` : ''}`

    return this.request<LeaderboardResponse>('GET', path)
  }

  /**
   * Connect to WebSocket for real-time updates
   */
  connectWebSocket(
    handlers: WebSocketHandlers,
    options?: {
      leaderboardId?: string
      userId?: string
      maxReconnectAttempts?: number
      reconnectDelay?: number
    }
  ): LeaderboardWebSocket {
    if (this.wsClient) {
      this.wsClient.disconnect()
    }

    this.wsClient = new LeaderboardWebSocket(
      this.config.wsUrl,
      this.config.apiKey,
      {
        maxReconnectAttempts: options?.maxReconnectAttempts,
        reconnectDelay: options?.reconnectDelay
      }
    )

    this.wsClient.on(handlers)
    this.wsClient.connect(options?.leaderboardId, options?.userId)

    return this.wsClient
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket(): void {
    if (this.wsClient) {
      this.wsClient.disconnect()
      this.wsClient = null
    }
  }

  /**
   * Generate a new ULID
   */
  generateId(): string {
    return ulid()
  }

  /**
   * Make an API request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retryCount = 0
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json'
    }

    if (this.config.appId) {
      headers['X-App-Id'] = this.config.appId
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout
      )

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json() as ApiErrorResponse
        throw new GlobalLeaderboardsError(
          errorData.message || `HTTP ${response.status}`,
          errorData.error || 'HTTP_ERROR',
          response.status,
          errorData.details
        )
      }

      return await response.json() as T
    } catch (error) {
      // Handle retry logic
      if (
        this.config.autoRetry &&
        retryCount < this.config.maxRetries &&
        this.shouldRetry(error)
      ) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 10000)
        await new Promise(resolve => setTimeout(resolve, delay))
        return this.request<T>(method, path, body, retryCount + 1)
      }

      // Re-throw or wrap error
      if (error instanceof GlobalLeaderboardsError) {
        throw error
      } else if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new GlobalLeaderboardsError(
            'Request timeout',
            'TIMEOUT',
            undefined,
            { timeout: this.config.timeout }
          )
        }
        throw new GlobalLeaderboardsError(
          error.message,
          'REQUEST_ERROR'
        )
      } else {
        throw new GlobalLeaderboardsError(
          'Unknown error occurred',
          'UNKNOWN_ERROR'
        )
      }
    }
  }

  /**
   * Check if error is retryable
   */
  private shouldRetry(error: unknown): boolean {
    if (error instanceof GlobalLeaderboardsError) {
      // Retry on 5xx errors and specific 4xx errors
      return (
        (error.statusCode && error.statusCode >= 500) ||
        error.statusCode === 429 || // Rate limited
        error.statusCode === 408 || // Request timeout
        error.code === 'TIMEOUT' ||
        error.code === 'REQUEST_ERROR'
      )
    }
    return false
  }
}