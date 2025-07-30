import { ulid } from 'ulid'
import { version as SDK_VERSION } from '../package.json'
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
  WebSocketHandlers,
  QueuedSubmitResponse,
  FlexibleScoreSubmission,
  QueueEventType,
  QueueEventHandler
} from './types'
import { LeaderboardWebSocket } from './websocket'
import { LeaderboardSSE } from './sse'
import { OfflineQueue } from './offline-queue'

export * from './types'
export * from './sse'
export { LeaderboardWebSocket, LeaderboardSSE }
export { OfflineQueue } from './offline-queue'

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
  private sseClient: LeaderboardSSE | null = null
  private offlineQueue: OfflineQueue
  private isOnline = true
  readonly version: string = SDK_VERSION

  /**
   * Create a new GlobalLeaderboards SDK instance
   * 
   * @param apiKey - Your API key from GlobalLeaderboards.net
   * @param config - Optional configuration options
   * @param config.defaultLeaderboardId - Default leaderboard ID for simplified submit() calls
   * @param config.baseUrl - API base URL (default: https://api.globalleaderboards.net)
   * @param config.wsUrl - WebSocket URL (default: wss://api.globalleaderboards.net)
   * @param config.timeout - Request timeout in ms (default: 30000)
   * @param config.autoRetry - Enable automatic retry (default: true)
   * @param config.maxRetries - Maximum retry attempts (default: 3)
   * 
   * @example
   * ```typescript
   * const leaderboard = new GlobalLeaderboards('your-api-key', {
   *   timeout: 60000
   * })
   * ```
   */
  constructor(apiKey: string, config?: Partial<GlobalLeaderboardsConfig>) {
    this.config = {
      apiKey,
      defaultLeaderboardId: config?.defaultLeaderboardId,
      baseUrl: config?.baseUrl || 'https://api.globalleaderboards.net',
      wsUrl: config?.wsUrl || 'wss://api.globalleaderboards.net',
      timeout: config?.timeout || 30000,
      autoRetry: config?.autoRetry ?? true,
      maxRetries: config?.maxRetries || 3
    } as Required<GlobalLeaderboardsConfig>
    
    // Initialize offline queue
    this.offlineQueue = new OfflineQueue(apiKey)
    
    // Set up network detection
    this.setupNetworkDetection()
    
    // Check initial network state
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
  }

  /**
   * Submit a score to a leaderboard with validation
   * 
   * Supports three signature variations:
   * - `submit(userId, score)` - Uses default leaderboard ID
   * - `submit(userId, score, leaderboardId)` - Specify leaderboard
   * - `submit(userId, score, options)` - Full options object
   * 
   * When offline or queue not empty, submissions are queued and processed when online.
   * 
   * @param userId - Unique user identifier
   * @param score - Score value (must be >= 0)
   * @param leaderboardIdOrOptions - Leaderboard ID string or options object
   * @returns Score submission response or queued response
   * @throws {GlobalLeaderboardsError} If validation fails
   * 
   * @example
   * ```typescript
   * // Using default leaderboard
   * await leaderboard.submit('user-123', 1500)
   * 
   * // Specify leaderboard
   * await leaderboard.submit('user-123', 1500, 'leaderboard-456')
   * 
   * // Full options
   * await leaderboard.submit('user-123', 1500, {
   *   leaderboardId: 'leaderboard-456',
   *   userName: 'PlayerOne',
   *   metadata: { level: 5 }
   * })
   * ```
   */
  async submit(
    userId: string,
    score: number,
    leaderboardIdOrOptions?: string | {
      leaderboardId?: string
      userName?: string
      metadata?: Record<string, unknown>
    }
  ): Promise<SubmitScoreResponse | QueuedSubmitResponse> {
    // Validate score (must be >= 0)
    if (score < 0) {
      throw new GlobalLeaderboardsError(
        'Score must be greater than or equal to 0',
        'INVALID_SCORE'
      )
    }

    // Parse arguments to normalized options
    let options: {
      leaderboardId?: string
      userName?: string
      metadata?: Record<string, unknown>
    }
    
    if (typeof leaderboardIdOrOptions === 'string') {
      // submit(userId, score, leaderboardId)
      options = { leaderboardId: leaderboardIdOrOptions }
    } else if (leaderboardIdOrOptions) {
      // submit(userId, score, options)
      options = leaderboardIdOrOptions
    } else {
      // submit(userId, score) - use default
      options = {}
    }

    // Use default leaderboard if not specified
    const leaderboardId = options.leaderboardId || this.config.defaultLeaderboardId
    if (!leaderboardId) {
      throw new GlobalLeaderboardsError(
        'Leaderboard ID is required (specify in options or set defaultLeaderboardId in constructor)',
        'MISSING_LEADERBOARD_ID'
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

    // Check if offline or queue not empty
    if (!this.isOnline || this.offlineQueue.hasItems()) {
      // Queue the operation
      return this.offlineQueue.enqueue({
        method: 'submit',
        params: {
          userId,
          score,
          leaderboardId,
          userName,
          metadata: options.metadata
        }
      })
    }

    // Online and queue empty - execute immediately
    const request: SubmitScoreRequest = {
      leaderboard_id: leaderboardId,
      user_id: userId,
      user_name: userName,
      score,
      metadata: options.metadata
    }

    return this.request<SubmitScoreResponse>('POST', '/v1/scores', request)
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
    const path = `/v1/leaderboards/${leaderboardId}/scores${query ? `?${query}` : ''}`

    return this.request<LeaderboardEntriesResponse>('GET', path)
  }

  /**
   * Submit multiple scores in bulk for better performance
   * 
   * Accepts mixed formats for flexibility:
   * - `[userId, score]` - Uses default leaderboard
   * - `[userId, score, leaderboardId]` - Specify leaderboard
   * - Full object with all options
   * 
   * @param submissions - Array of score submissions in various formats (max 100)
   * @returns Bulk submission response with individual results and summary
   * @throws {GlobalLeaderboardsError} If validation fails or API returns an error
   * 
   * @example
   * ```typescript
   * const results = await leaderboard.submitBulk([
   *   ['user-123', 1000],                    // Uses default leaderboard
   *   ['user-456', 2000, 'leaderboard-789'], // Specific leaderboard
   *   {                                      // Full options
   *     userId: 'user-789',
   *     score: 3000,
   *     leaderboardId: 'leaderboard-789',
   *     userName: 'TopPlayer',
   *     metadata: { level: 10 }
   *   }
   * ])
   * ```
   */
  async submitBulk(submissions: FlexibleScoreSubmission[]): Promise<BulkSubmitScoreResponse> {
    // Convert flexible formats to standard SubmitScoreRequest
    const scores: SubmitScoreRequest[] = submissions.map(submission => {
      if (Array.isArray(submission)) {
        // Handle array formats
        const [userId, score, leaderboardId] = submission
        const finalLeaderboardId = leaderboardId || this.config.defaultLeaderboardId
        
        if (!finalLeaderboardId) {
          throw new GlobalLeaderboardsError(
            'Leaderboard ID is required for bulk submission',
            'MISSING_LEADERBOARD_ID'
          )
        }
        
        return {
          user_id: userId,
          user_name: userId, // Default to userId
          score,
          leaderboard_id: finalLeaderboardId
        }
      } else {
        // Handle object format
        const leaderboardId = submission.leaderboardId || this.config.defaultLeaderboardId
        
        if (!leaderboardId) {
          throw new GlobalLeaderboardsError(
            'Leaderboard ID is required for bulk submission',
            'MISSING_LEADERBOARD_ID'
          )
        }
        
        return {
          user_id: submission.userId,
          user_name: submission.userName || submission.userId,
          score: submission.score,
          leaderboard_id: leaderboardId,
          metadata: submission.metadata
        }
      }
    })
    
    // Check if offline or queue not empty
    if (!this.isOnline || this.offlineQueue.hasItems()) {
      // Queue the bulk operation
      // For bulk operations, we can't return a proper BulkSubmitScoreResponse when queued
      // So we throw an error instead - bulk operations should be retried when online
      throw new GlobalLeaderboardsError(
        'Bulk submissions cannot be queued offline. Please retry when online.',
        'OFFLINE_BULK_NOT_SUPPORTED'
      )
    }
    
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
   * WebSocket connections now work through the main API domain with full
   * Cloudflare proxy protection. Both WebSocket and SSE are supported options
   * for real-time updates. Choose based on your specific needs:
   * - WebSocket: Lower latency, binary support, bidirectional potential
   * - SSE: Simpler implementation, automatic reconnection, better firewall compatibility
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
   * 
   * @see connectSSE - Recommended alternative for real-time updates
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
   * Connect to Server-Sent Events (SSE) for real-time leaderboard updates
   * 
   * This is the recommended method for real-time updates. SSE provides:
   * - Simpler implementation compared to WebSocket
   * - Automatic reconnection with exponential backoff
   * - Better firewall and proxy compatibility
   * - Lower resource usage
   * - Built-in heartbeat for connection health
   * 
   * @param leaderboardId - Leaderboard to connect to
   * @param handlers - Event handlers for SSE events
   * @param handlers.onConnect - Called when connection is established
   * @param handlers.onDisconnect - Called when connection is closed
   * @param handlers.onError - Called on errors
   * @param handlers.onLeaderboardUpdate - Called when leaderboard data changes
   * @param handlers.onUserRankUpdate - Called when user's rank changes
   * @param handlers.onHeartbeat - Called on heartbeat (optional)
   * @param handlers.onMessage - Raw message handler (optional)
   * @param options - Connection options
   * @param options.userId - User ID for personalized updates
   * @param options.includeMetadata - Include metadata in updates (default: true)
   * @param options.topN - Number of top scores to include in refresh events (default: 10)
   * @returns SSE connection object with close method
   * 
   * @example
   * ```typescript
   * const connection = leaderboard.connectSSE('leaderboard-123', {
   *   onLeaderboardUpdate: (data) => {
   *     console.log('Top scores:', data.topScores)
   *   },
   *   onUserRankUpdate: (data) => {
   *     console.log('Rank changed:', data)
   *   }
   * })
   * 
   * // Later...
   * connection.close()
   * ```
   */
  connectSSE(
    leaderboardId: string,
    handlers: import('./sse').SSEEventHandlers,
    options?: import('./sse').SSEConnectionOptions
  ): { close: () => void } {
    if (!this.sseClient) {
      this.sseClient = new LeaderboardSSE(this.config)
    }
    return this.sseClient.connect(leaderboardId, handlers, options)
  }

  /**
   * Disconnect from all SSE connections
   * 
   * @example
   * ```typescript
   * leaderboard.disconnectSSE()
   * ```
   */
  disconnectSSE(): void {
    if (this.sseClient) {
      this.sseClient.disconnectAll()
      this.sseClient = null
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
          errorData.error.message || `HTTP ${response.status}`,
          errorData.error.code || 'HTTP_ERROR',
          response.status,
          errorData.error.details
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

  /**
   * Set up network detection and automatic queue processing
   * @private
   */
  private setupNetworkDetection(): void {
    if (typeof window === 'undefined') {
      return
    }
    
    // Handle online event
    window.addEventListener('online', () => {
      console.debug('[GlobalLeaderboards] Network is online')
      this.isOnline = true
      
      // Process offline queue when back online
      this.processOfflineQueue()
    })
    
    // Handle offline event
    window.addEventListener('offline', () => {
      console.debug('[GlobalLeaderboards] Network is offline')
      this.isOnline = false
    })
  }
  
  /**
   * Process the offline queue
   * @private
   */
  private async processOfflineQueue(): Promise<void> {
    if (!this.isOnline || this.offlineQueue.isProcessing()) {
      return
    }
    
    this.offlineQueue.setProcessing(true)
    
    try {
      const batches = this.offlineQueue.batchOperations()
      let totalProcessed = 0
      let totalFailed = 0
      
      for (const [key, operations] of batches) {
        try {
          if (key.startsWith('bulk_')) {
            // Process bulk operation
            const op = operations[0]
            if (op.params.scores) {
              await this.request<BulkSubmitScoreResponse>('POST', '/v1/scores/bulk', {
                scores: op.params.scores
              })
              await this.offlineQueue.removeProcessed([op.queueId])
              totalProcessed++
            }
          } else {
            // Process batched submit operations
            const scores: SubmitScoreRequest[] = operations.map(op => ({
              user_id: op.params.userId!,
              user_name: op.params.userName || op.params.userId!,
              score: op.params.score!,
              leaderboard_id: op.params.leaderboardId!,
              metadata: op.params.metadata
            }))
            
            await this.request<BulkSubmitScoreResponse>('POST', '/v1/scores/bulk', {
              scores
            })
            
            const queueIds = operations.map(op => op.queueId)
            await this.offlineQueue.removeProcessed(queueIds)
            totalProcessed += operations.length
          }
          
          // Emit progress event
          this.offlineQueue.emit('queue:progress', {
            processed: totalProcessed,
            total: this.offlineQueue.size() + totalProcessed
          })
        } catch (error) {
          // Check if permanent error
          if (error instanceof GlobalLeaderboardsError && 
              (error.statusCode === 404 || error.statusCode === 401 || error.statusCode === 403)) {
            // Permanent error - remove from queue
            for (const op of operations) {
              await this.offlineQueue.markFailed(op.queueId, true)
              totalFailed++
            }
          } else {
            // Temporary error - stop processing
            break
          }
        }
      }
      
      // If queue is now empty and we're still online, future submissions go direct
      if (this.offlineQueue.size() === 0 && this.isOnline) {
        console.debug('[GlobalLeaderboards] Offline queue processed successfully')
      }
    } finally {
      this.offlineQueue.setProcessing(false)
    }
  }
  
  /**
   * Register event handler for queue events
   * 
   * @param event - Event type to listen for
   * @param handler - Handler function
   * 
   * @example
   * ```typescript
   * leaderboard.on('queue:processed', (data) => {
   *   console.log('Queue item processed:', data)
   * })
   * ```
   */
  on(event: QueueEventType, handler: QueueEventHandler): void {
    this.offlineQueue.on(event, handler)
  }
  
  /**
   * Unregister event handler
   * 
   * @param event - Event type
   * @param handler - Handler function to remove
   */
  off(event: QueueEventType, handler: QueueEventHandler): void {
    this.offlineQueue.off(event, handler)
  }
  
  /**
   * Get current offline queue status
   * 
   * @returns Queue information including size and processing state
   */
  getQueueStatus(): {
    size: number
    processing: boolean
    items: Array<{
      queueId: string
      method: string
      timestamp: number
    }>
  } {
    const items = this.offlineQueue.getQueue()
    return {
      size: items.length,
      processing: this.offlineQueue.isProcessing(),
      items: items.map(item => ({
        queueId: item.queueId,
        method: item.method,
        timestamp: item.timestamp
      }))
    }
  }
  
  /**
   * Manually trigger offline queue processing
   * 
   * @returns Promise that resolves when processing is complete
   */
  async processQueue(): Promise<void> {
    return this.processOfflineQueue()
  }
}