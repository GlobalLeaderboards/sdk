/**
 * Configuration options for the GlobalLeaderboards SDK
 */
export interface GlobalLeaderboardsConfig {
  /** API key for authentication */
  apiKey: string
  /** Optional application ID to restrict operations to a specific app */
  appId?: string
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
 * Leaderboard response
 */
export interface LeaderboardResponse {
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
 * WebSocket message types
 */
export type WebSocketMessageType = 
  | 'subscribe'
  | 'unsubscribe'
  | 'ping'
  | 'pong'
  | 'leaderboard_update'
  | 'new_score'
  | 'user_rank_update'
  | 'error'

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
 * Leaderboard update message
 */
export interface LeaderboardUpdateMessage extends WebSocketMessage {
  type: 'leaderboard_update'
  data: {
    leaderboard_id: string
    entries: LeaderboardEntry[]
    changes?: {
      added: string[]
      updated: string[]
      removed: string[]
    }
  }
}

/**
 * New score message
 */
export interface NewScoreMessage extends WebSocketMessage {
  type: 'new_score'
  data: {
    leaderboard_id: string
    user_id: string
    user_name: string
    score: number
    rank: number
    timestamp: string
    previous_rank?: number
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
  code: string
  message: string
}

/**
 * API error response
 */
export interface ApiErrorResponse {
  error: string
  message: string
  details?: Record<string, unknown>
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
  onLeaderboardUpdate?: (data: LeaderboardUpdateMessage['data']) => void
  /** Called when a new score is submitted */
  onNewScore?: (data: NewScoreMessage['data']) => void
  /** Called when user rank changes */
  onUserRankUpdate?: (data: UserRankUpdateMessage['data']) => void
  /** Called for any message */
  onMessage?: (message: WebSocketMessage) => void
}