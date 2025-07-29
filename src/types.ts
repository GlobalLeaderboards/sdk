/**
 * Configuration options for the GlobalLeaderboards SDK
 */
export interface GlobalLeaderboardsConfig {
  /** API key for authentication */
  apiKey: string
  /** Base URL for the API (default: https://api.globalleaderboards.net) */
  baseUrl?: string
  /** WebSocket URL (default: wss://api.globalleaderboards.net) */
  wsUrl?: string
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number
  /** Enable automatic retry on failure (default: true) */
  autoRetry?: boolean
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
}

/**
 * Score submission request
 */
export interface SubmitScoreRequest {
  /** Leaderboard ID */
  leaderboard_id: string
  /** User ID (ULID format) */
  user_id: string
  /** Display name for the user */
  user_name: string
  /** Score value */
  score: number
  /** Optional metadata to store with the score */
  metadata?: Record<string, unknown>
}

/**
 * Score submission response
 */
export interface SubmitScoreResponse {
  /** Operation performed (insert, update, no_change) */
  operation: 'insert' | 'update' | 'no_change'
  /** User's new rank on the leaderboard */
  rank: number
  /** Previous score if update operation */
  previous_score?: number
  /** Score improvement if update operation */
  improvement?: number
}

/**
 * Bulk score submission request
 */
export interface BulkSubmitScoreRequest {
  /** Array of scores to submit */
  scores: SubmitScoreRequest[]
}

/**
 * Single score result in bulk response
 */
export interface BulkScoreResult extends SubmitScoreResponse {
  /** Leaderboard ID */
  leaderboard_id: string
  /** User ID */
  user_id: string
}

/**
 * Bulk score submission response
 */
export interface BulkSubmitScoreResponse {
  /** Individual results for each score */
  results: BulkScoreResult[]
  /** Summary statistics */
  summary: {
    /** Total scores submitted */
    total: number
    /** Successful submissions */
    successful: number
    /** Failed submissions */
    failed: number
  }
}

/**
 * Extended leaderboard entry with leaderboard info
 */
export interface UserScoreEntry extends LeaderboardEntry {
  /** Leaderboard ID */
  leaderboard_id: string
  /** Leaderboard name */
  leaderboard_name: string
}

/**
 * User scores response
 */
export interface UserScoresResponse {
  /** User's scores across leaderboards */
  data: UserScoreEntry[]
  /** Pagination information */
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
  /** User summary */
  user: {
    /** User ID */
    id: string
    /** Total number of scores */
    total_scores: number
    /** Best rank achieved */
    best_rank: number
  }
}

/**
 * Leaderboard entry
 */
export interface LeaderboardEntry {
  /** User ID */
  user_id: string
  /** User display name */
  user_name: string
  /** Score value */
  score: number
  /** Rank position */
  rank: number
  /** Timestamp when score was submitted */
  timestamp: string
  /** Optional metadata stored with the score */
  metadata?: Record<string, unknown>
}

/**
 * Leaderboard data
 */
export interface LeaderboardData {
  /** Leaderboard ID */
  id: string
  /** Leaderboard name */
  name: string
  /** Total number of entries */
  total_entries: number
  /** Last update timestamp */
  last_updated?: string
}

/**
 * Leaderboard entries response - matches OpenAPI LeaderboardEntriesResponse
 */
export interface LeaderboardEntriesResponse {
  /** Leaderboard entries */
  data: LeaderboardEntry[]
  /** Pagination information */
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
  /** Leaderboard information */
  leaderboard: LeaderboardData
}

/**
 * WebSocket message types - matches OpenAPI spec
 */
export type WebSocketMessageType = 
  | 'subscribe'
  | 'unsubscribe'
  | 'ping'
  | 'pong'
  | 'leaderboard_update'
  | 'user_rank_update'
  | 'error'
  | 'connection_info'
  | 'update'
  | 'score_submission'

/**
 * Base WebSocket message
 */
export interface WebSocketMessage {
  type: WebSocketMessageType
}

/**
 * Subscribe message
 */
export interface SubscribeMessage extends WebSocketMessage {
  type: 'subscribe'
  leaderboard_id: string
  user_id?: string
}

/**
 * Unsubscribe message
 */
export interface UnsubscribeMessage extends WebSocketMessage {
  type: 'unsubscribe'
  leaderboard_id: string
}

/**
 * Mutation types for leaderboard changes
 */
export type MutationType = 'new_entry' | 'rank_change' | 'score_update' | 'username_change' | 'removed'

/**
 * Base mutation interface
 */
export interface BaseMutation {
  type: MutationType
  userId: string
}

/**
 * New entry mutation
 */
export interface NewEntryMutation extends BaseMutation {
  type: 'new_entry'
  newRank: number
  score: number
  userName: string
}

/**
 * Rank change mutation
 */
export interface RankChangeMutation extends BaseMutation {
  type: 'rank_change'
  previousRank: number
  newRank: number
  score: number
}

/**
 * Score update mutation
 */
export interface ScoreUpdateMutation extends BaseMutation {
  type: 'score_update'
  previousScore: number
  newScore: number
  previousRank: number
  newRank: number
}

/**
 * Username change mutation
 */
export interface UsernameChangeMutation extends BaseMutation {
  type: 'username_change'
  previousUsername: string
  newUsername: string
  rank: number
}

/**
 * Removed mutation
 */
export interface RemovedMutation extends BaseMutation {
  type: 'removed'
  previousRank: number
  score: number
}

/**
 * Union type for all mutations
 */
export type LeaderboardMutation = 
  | NewEntryMutation
  | RankChangeMutation
  | ScoreUpdateMutation
  | UsernameChangeMutation
  | RemovedMutation

/**
 * Update trigger information
 */
export interface UpdateTrigger {
  type: 'score_submission' | 'bulk_submission' | 'admin_action' | 'leaderboard_reset'
  submissions?: Array<{
    userId: string
    userName: string
    score: number
    previousScore?: number
    timestamp: string
  }>
}

/**
 * Leaderboard update message with full state and mutations
 */
export interface LeaderboardUpdateMessage extends WebSocketMessage {
  type: 'leaderboard_update'
  id: string
  timestamp: string
  payload: {
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
}

/**
 * User rank update message
 */
export interface UserRankUpdateMessage extends WebSocketMessage {
  type: 'user_rank_update'
  data: {
    leaderboard_id: string
    user_id: string
    old_rank: number
    new_rank: number
    score: number
  }
}

/**
 * Error message
 */
export interface ErrorMessage extends WebSocketMessage {
  type: 'error'
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

/**
 * Connection info message
 */
export interface ConnectionInfoMessage extends WebSocketMessage {
  type: 'connection_info'
  payload?: {
    connectionId: string
    maxConnections: number
    currentConnections: number
    rateLimit?: {
      requestsPerMinute: number
      burstSize: number
    }
  }
}

/**
 * API error response
 */
export interface ApiErrorResponse {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
  timestamp: string
  requestId?: string
}

/**
 * API info response
 */
export interface ApiInfoResponse {
  /** API name */
  name: string
  /** Package version */
  version: string
  /** API version */
  apiVersion: string
  /** Environment */
  environment: 'development' | 'staging' | 'production'
  /** Current timestamp */
  timestamp: string
  /** Available endpoints */
  endpoints: {
    health: {
      basic: string
      detailed: string
    }
    public: {
      description: string
      scores: string
      leaderboards: string
      websocket: string
    }
    dashboard: {
      description: string
      auth: string
      accounts: string
      apps: string
      leaderboards: string
      analytics: string
    }
    admin: {
      description: string
      auth: string
      accounts: string
      apps: string
      analytics: string
    }
  }
  /** Documentation URL */
  documentation: string
  /** Support email */
  support: string
}

/**
 * Basic health check response
 */
export interface HealthResponse {
  /** Health status */
  status: 'healthy' | 'unhealthy'
  /** API version */
  version: string
  /** Current timestamp */
  timestamp: string
}

/**
 * Detailed health check response
 */
export interface DetailedHealthResponse extends HealthResponse {
  /** Individual service statuses */
  services: {
    /** Database health */
    database: {
      status: 'healthy' | 'unhealthy'
      latency?: number
    }
    /** Cache health */
    cache: {
      status: 'healthy' | 'unhealthy'
      latency?: number
    }
    /** Storage health */
    storage: {
      status: 'healthy' | 'unhealthy'
      latency?: number
    }
  }
  /** System information */
  system: {
    /** Memory usage in MB */
    memoryUsage: number
    /** Uptime in seconds */
    uptime: number
    /** Environment */
    environment: string
  }
}

/**
 * SDK error class
 */
export class GlobalLeaderboardsError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'GlobalLeaderboardsError'
  }
}

/**
 * WebSocket event handlers
 */
export interface WebSocketHandlers {
  /** Called when connection is established */
  onConnect?: () => void
  /** Called when connection is closed */
  onDisconnect?: (code: number, reason: string) => void
  /** Called when an error occurs */
  onError?: (error: Error) => void
  /** Called when leaderboard is updated */
  onLeaderboardUpdate?: (data: LeaderboardUpdateMessage['payload']) => void
  /** Called when user rank changes */
  onUserRankUpdate?: (data: UserRankUpdateMessage['data']) => void
  /** Called for any message */
  onMessage?: (message: WebSocketMessage) => void
}