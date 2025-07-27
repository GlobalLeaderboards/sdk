import { ulid } from 'ulid'
import {
  GlobalLeaderboardsConfig,
  SubmitScoreRequest,
  SubmitScoreResponse,
  BulkSubmitScoreRequest,
  BulkSubmitScoreResponse,
  LeaderboardEntriesResponse,
  UserScoresResponse,
  ApiInfoResponse,
  HealthResponse,
  DetailedHealthResponse,
  ApiErrorResponse,
  GlobalLeaderboardsError,
  WebSocketHandlers
} from './types'
import { LeaderboardWebSocket } from './websocket'

export * from './types'
export { LeaderboardWebSocket }

/**
 * GlobalLeaderboards SDK client for interacting with the GlobalLeaderboards.net API
 * 
 * @example
 * ```typescript
 * const leaderboard = new GlobalLeaderboards('your-api-key')
 * ```
 */
export class GlobalLeaderboards {
  private readonly config: Required<GlobalLeaderboardsConfig>
  private wsClient: LeaderboardWebSocket | null = null

  /**
   * Create a new GlobalLeaderboards SDK instance
   * 
   * @param apiKey - Your API key from GlobalLeaderboards.net
   * @param config - Optional configuration options
   * @param config.appId - Optional application ID to restrict operations
   * @param config.baseUrl - API base URL (default: https://api.globalleaderboards.net)
   * @param config.wsUrl - WebSocket URL (default: wss://api.globalleaderboards.net)
   * @param config.timeout - Request timeout in ms (default: 30000)
   * @param config.autoRetry - Enable automatic retry (default: true)
   * @param config.maxRetries - Maximum retry attempts (default: 3)
   * 
   * @example
   * ```typescript
   * const leaderboard = new GlobalLeaderboards('your-api-key', {
   *   appId: 'your-app-id',
   *   timeout: 60000
   * })
   * ```
   */
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
   * Submit a score to a leaderboard with validation
   * 
   * @param userId - Unique user identifier
   * @param score - Score value (must be >= 0)
   * @param options - Submission options
   * @param options.leaderboardId - Target leaderboard ID
   * @param options.userName - Display name (1-50 chars, alphanumeric + accents)
   * @param options.metadata - Optional metadata to store with the score
   * @returns Score submission response with rank and operation details
   * @throws {GlobalLeaderboardsError} If validation fails or API returns an error
   * 
   * @example
   * ```typescript
   * const result = await leaderboard.submit('user-123', 1500, {
   *   leaderboardId: 'leaderboard-456',
   *   userName: 'PlayerOne',
   *   metadata: { level: 5 }
   * })
   * ```
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
    // Validate score (must be >= 0)
    if (score < 0) {
      throw new GlobalLeaderboardsError(
        'Score must be greater than or equal to 0',
        'INVALID_SCORE'
      )
    }

    const userName = options.userName || userId

    // Validate user_name (pattern from OpenAPI spec)
    const userNamePattern = /^[a-zA-Z0-9\u00C0-\u017F()._\- ]+$/
    if (!userNamePattern.test(userName)) {
      throw new GlobalLeaderboardsError(
        'Username contains invalid characters. Only alphanumeric, accented letters, parentheses, dots, underscores, hyphens, and spaces are allowed',
        'INVALID_USERNAME'
      )
    }

    // Validate user_name length (1-50 characters)
    if (userName.length < 1 || userName.length > 50) {
      throw new GlobalLeaderboardsError(
        'Username must be between 1 and 50 characters',
        'INVALID_USERNAME_LENGTH'
      )
    }

    const request: SubmitScoreRequest = {
      leaderboard_id: options.leaderboardId,
      user_id: userId,
      user_name: userName,
      score,
      metadata: options.metadata
    }

    return this.request<SubmitScoreResponse>('POST', '/v1/scores', request)
  }

  /**
   * Submit a score using a simplified API
   * 
   * @param playerId - Player's unique identifier
   * @param score - Score value (must be >= 0)
   * @param leaderboardId - Target leaderboard ID (uses appId from config if not provided)
   * @param options - Optional submission options
   * @param options.userName - Display name (defaults to playerId)
   * @param options.metadata - Optional metadata
   * @returns Score submission response
   * @throws {GlobalLeaderboardsError} If leaderboard ID is missing or validation fails
   * 
   * @example
   * ```typescript
   * // Using default leaderboard from config
   * await leaderboard.submitScore('player-123', 2500)
   * 
   * // Specify leaderboard
   * await leaderboard.submitScore('player-123', 2500, 'leaderboard-456')
   * ```
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

    // Validation is handled in the submit method
    return this.submit(playerId, score, {
      leaderboardId: targetLeaderboardId,
      userName: options?.userName,
      metadata: options?.metadata
    })
  }

  /**
   * Get paginated leaderboard entries
   * 
   * @param leaderboardId - Leaderboard ID to retrieve
   * @param options - Query options
   * @param options.page - Page number (default: 1)
   * @param options.limit - Results per page (default: 20, max: 100)
   * @param options.aroundUser - Center results around specific user ID
   * @returns Leaderboard entries with pagination info
   * @throws {GlobalLeaderboardsError} If API returns an error
   * 
   * @example
   * ```typescript
   * const data = await leaderboard.getLeaderboard('leaderboard-456', {
   *   page: 1,
   *   limit: 10,
   *   aroundUser: 'user-123'
   * })
   * ```
   */
  async getLeaderboard(
    leaderboardId: string,
    options?: {
      page?: number
      limit?: number
      aroundUser?: string
    }
  ): Promise<LeaderboardEntriesResponse> {
    const params = new URLSearchParams()
    
    if (options?.page) params.append('page', options.page.toString())
    if (options?.limit) params.append('limit', options.limit.toString())
    if (options?.aroundUser) params.append('around_user', options.aroundUser)

    const query = params.toString()
    const path = `/v1/leaderboards/${leaderboardId}${query ? `?${query}` : ''}`

    return this.request<LeaderboardEntriesResponse>('GET', path)
  }

  /**
   * Submit multiple scores in bulk for better performance
   * 
   * @param scores - Array of scores to submit (max 100)
   * @returns Bulk submission response with individual results and summary
   * @throws {GlobalLeaderboardsError} If validation fails or API returns an error
   * 
   * @example
   * ```typescript
   * const results = await leaderboard.submitBulk([
   *   {
   *     leaderboard_id: 'leaderboard-456',
   *     user_id: 'user-123',
   *     user_name: 'Player1',
   *     score: 1000
   *   },
   *   {
   *     leaderboard_id: 'leaderboard-456',
   *     user_id: 'user-456',
   *     user_name: 'Player2',
   *     score: 2000
   *   }
   * ])
   * ```
   */
  async submitBulk(scores: SubmitScoreRequest[]): Promise<BulkSubmitScoreResponse> {
    const request: BulkSubmitScoreRequest = { scores }
    return this.request<BulkSubmitScoreResponse>('POST', '/v1/scores/bulk', request)
  }

  /**
   * Get all scores for a user across leaderboards
   * 
   * @param userId - User ID to get scores for
   * @param options - Query options
   * @param options.page - Page number (default: 1)
   * @param options.limit - Results per page (default: 20)
   * @returns User scores with pagination and summary stats
   * @throws {GlobalLeaderboardsError} If API returns an error
   * 
   * @example
   * ```typescript
   * const userScores = await leaderboard.getUserScores('user-123', {
   *   page: 1,
   *   limit: 50
   * })
   * ```
   */
  async getUserScores(
    userId: string,
    options?: {
      page?: number
      limit?: number
    }
  ): Promise<UserScoresResponse> {
    const params = new URLSearchParams()
    
    if (options?.page) params.append('page', options.page.toString())
    if (options?.limit) params.append('limit', options.limit.toString())

    const query = params.toString()
    const path = `/v1/scores/user/${userId}${query ? `?${query}` : ''}`

    return this.request<UserScoresResponse>('GET', path)
  }

  /**
   * Connect to WebSocket for real-time leaderboard updates
   * 
   * @param handlers - Event handlers for WebSocket events
   * @param handlers.onConnect - Called when connection is established
   * @param handlers.onDisconnect - Called when connection is closed
   * @param handlers.onError - Called on errors
   * @param handlers.onLeaderboardUpdate - Called when leaderboard data changes
   * @param handlers.onUserRankUpdate - Called when user's rank changes
   * @param handlers.onMessage - Called for any WebSocket message
   * @param options - Connection options
   * @param options.leaderboardId - Initial leaderboard to subscribe to
   * @param options.userId - User ID for personalized updates
   * @param options.maxReconnectAttempts - Max reconnection attempts
   * @param options.reconnectDelay - Delay between reconnection attempts in ms
   * @returns WebSocket client instance
   * 
   * @example
   * ```typescript
   * const ws = leaderboard.connectWebSocket({
   *   onConnect: () => console.log('Connected'),
   *   onLeaderboardUpdate: (data) => console.log('Update:', data)
   * }, {
   *   leaderboardId: 'leaderboard-456'
   * })
   * ```
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
   * Disconnect from WebSocket
   * 
   * @example
   * ```typescript
   * leaderboard.disconnectWebSocket()
   * ```
   */
  disconnectWebSocket(): void {
    if (this.wsClient) {
      this.wsClient.disconnect()
      this.wsClient = null
    }
  }

  /**
   * Generate a new ULID (Universally Unique Lexicographically Sortable Identifier)
   * 
   * @returns A new ULID string
   * 
   * @example
   * ```typescript
   * const id = leaderboard.generateId()
   * // Returns: '01ARZ3NDEKTSV4RRFFQ69G5FAV'
   * ```
   */
  generateId(): string {
    return ulid()
  }

  /**
   * Get API information and available endpoints
   * 
   * @returns API info including version, endpoints, and documentation URL
   * @throws {GlobalLeaderboardsError} If API returns an error
   * 
   * @remarks No authentication required for this endpoint
   * 
   * @example
   * ```typescript
   * const info = await leaderboard.getApiInfo()
   * console.log('API Version:', info.version)
   * ```
   */
  async getApiInfo(): Promise<ApiInfoResponse> {
    // Root endpoint doesn't require authentication
    const url = `${this.config.baseUrl}/`
    
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout
      )

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new GlobalLeaderboardsError(
          `Failed to get API info: HTTP ${response.status}`,
          'API_INFO_FAILED',
          response.status
        )
      }

      return await response.json() as ApiInfoResponse
    } catch (error) {
      if (error instanceof GlobalLeaderboardsError) {
        throw error
      } else if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new GlobalLeaderboardsError(
            'API info request timeout',
            'TIMEOUT'
          )
        }
        throw new GlobalLeaderboardsError(
          error.message,
          'API_INFO_ERROR'
        )
      } else {
        throw new GlobalLeaderboardsError(
          'Unknown error getting API info',
          'UNKNOWN_ERROR'
        )
      }
    }
  }

  /**
   * Perform a basic health check on the API
   * 
   * @returns Health status with version and timestamp
   * @throws {GlobalLeaderboardsError} If health check fails
   * 
   * @remarks No authentication required for this endpoint
   * 
   * @example
   * ```typescript
   * const health = await leaderboard.health()
   * if (health.status === 'healthy') {
   *   console.log('API is healthy')
   * }
   * ```
   */
  async health(): Promise<HealthResponse> {
    // Health endpoints don't require authentication, so we make a direct request
    const url = `${this.config.baseUrl}/health`
    
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout
      )

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new GlobalLeaderboardsError(
          `Health check failed: HTTP ${response.status}`,
          'HEALTH_CHECK_FAILED',
          response.status
        )
      }

      return await response.json() as HealthResponse
    } catch (error) {
      if (error instanceof GlobalLeaderboardsError) {
        throw error
      } else if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new GlobalLeaderboardsError(
            'Health check timeout',
            'TIMEOUT'
          )
        }
        throw new GlobalLeaderboardsError(
          error.message,
          'HEALTH_CHECK_ERROR'
        )
      } else {
        throw new GlobalLeaderboardsError(
          'Unknown error during health check',
          'UNKNOWN_ERROR'
        )
      }
    }
  }

  /**
   * Perform a detailed health check with individual service statuses
   * 
   * @returns Detailed health info including database, cache, and storage status
   * @throws {GlobalLeaderboardsError} If health check fails
   * 
   * @remarks No authentication required for this endpoint
   * 
   * @example
   * ```typescript
   * const health = await leaderboard.healthDetailed()
   * console.log('Database:', health.services.database.status)
   * console.log('Cache:', health.services.cache.status)
   * ```
   */
  async healthDetailed(): Promise<DetailedHealthResponse> {
    // Health endpoints don't require authentication, so we make a direct request
    const url = `${this.config.baseUrl}/health/detailed`
    
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout
      )

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new GlobalLeaderboardsError(
          `Detailed health check failed: HTTP ${response.status}`,
          'HEALTH_CHECK_FAILED',
          response.status
        )
      }

      return await response.json() as DetailedHealthResponse
    } catch (error) {
      if (error instanceof GlobalLeaderboardsError) {
        throw error
      } else if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new GlobalLeaderboardsError(
            'Detailed health check timeout',
            'TIMEOUT'
          )
        }
        throw new GlobalLeaderboardsError(
          error.message,
          'HEALTH_CHECK_ERROR'
        )
      } else {
        throw new GlobalLeaderboardsError(
          'Unknown error during detailed health check',
          'UNKNOWN_ERROR'
        )
      }
    }
  }

  /**
   * Make an authenticated API request with automatic retry
   * 
   * @private
   * @param method - HTTP method
   * @param path - API endpoint path
   * @param body - Request body (optional)
   * @param retryCount - Current retry attempt (internal use)
   * @returns API response
   * @throws {GlobalLeaderboardsError} If request fails
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
   * Check if an error is retryable
   * 
   * @private
   * @param error - Error to check
   * @returns True if error is retryable (5xx, 429, 408, timeout)
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