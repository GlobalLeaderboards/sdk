import {
  WebSocketHandlers,
  WebSocketMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  LeaderboardUpdateMessage,
  UserRankUpdateMessage,
  ErrorMessage,
  GlobalLeaderboardsError
} from './types'

/**
 * WebSocket client for real-time leaderboard updates
 * 
 * WebSocket connections now work through the main API domain with full
 * Cloudflare proxy protection. Both WebSocket and SSE are supported options
 * for real-time updates.
 * 
 * @see LeaderboardSSE - Alternative method using Server-Sent Events
 */
export class LeaderboardWebSocket {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private subscribedLeaderboards = new Set<string>()
  private handlers: WebSocketHandlers
  private isConnecting = false
  private shouldReconnect = true
  
  constructor(
    private readonly wsUrl: string,
    private readonly apiKey: string,
    private readonly options: {
      maxReconnectAttempts?: number
      reconnectDelay?: number
      pingInterval?: number
    } = {}
  ) {
    this.handlers = {}
    this.options = {
      maxReconnectAttempts: 5,
      reconnectDelay: 1000,
      pingInterval: 30000,
      ...options
    }
  }

  /**
   * Connect to the WebSocket server
   */
  connect(leaderboardId?: string, userId?: string): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return
    }

    this.isConnecting = true
    this.shouldReconnect = true

    const params = new URLSearchParams({
      api_key: this.apiKey
    })
    
    if (leaderboardId) {
      params.append('leaderboard_id', leaderboardId)
      // Add to subscribed list so we don't re-subscribe after connection
      this.subscribedLeaderboards.add(leaderboardId)
    }
    
    if (userId) {
      params.append('user_id', userId)
    }

    const url = `${this.wsUrl}/v1/ws/connect?${params.toString()}`

    try {
      this.ws = new WebSocket(url)
      this.setupEventHandlers()
    } catch (error) {
      this.isConnecting = false
      this.handleError(error as Error)
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    this.shouldReconnect = false
    this.cleanup()
  }

  /**
   * Subscribe to a leaderboard
   */
  subscribe(leaderboardId: string, userId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new GlobalLeaderboardsError(
        'WebSocket is not connected',
        'WS_NOT_CONNECTED'
      )
    }

    const message: SubscribeMessage = {
      type: 'subscribe',
      leaderboard_id: leaderboardId
    }

    if (userId) {
      message.user_id = userId
    }

    this.send(message)
    this.subscribedLeaderboards.add(leaderboardId)
  }

  /**
   * Unsubscribe from a leaderboard
   */
  unsubscribe(leaderboardId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    const message: UnsubscribeMessage = {
      type: 'unsubscribe',
      leaderboard_id: leaderboardId
    }

    this.send(message)
    this.subscribedLeaderboards.delete(leaderboardId)
  }

  /**
   * Set event handlers
   */
  on(handlers: Partial<WebSocketHandlers>): void {
    this.handlers = { ...this.handlers, ...handlers }
  }

  /**
   * Get connection state
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * Get subscribed leaderboards
   */
  get subscriptions(): string[] {
    return Array.from(this.subscribedLeaderboards)
  }

  private setupEventHandlers(): void {
    if (!this.ws) return

    this.ws.onopen = () => {
      this.isConnecting = false
      this.reconnectAttempts = 0
      this.startPingInterval()
      this.handlers.onConnect?.()
      
      // Re-subscribe to leaderboards after reconnection
      // Skip if leaderboard was already provided in connection URL
      const urlParams = this.ws ? new URL(this.ws.url).searchParams : null
      const connectedLeaderboardId = urlParams?.get('leaderboard_id')
      
      this.subscribedLeaderboards.forEach(leaderboardId => {
        // Don't re-subscribe to the leaderboard we're already connected to
        if (leaderboardId !== connectedLeaderboardId) {
          this.subscribe(leaderboardId)
        }
      })
    }

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage
        this.handleMessage(message)
      } catch (error) {
        this.handleError(new Error('Failed to parse WebSocket message'))
      }
    }

    this.ws.onerror = () => {
      this.handleError(new Error('WebSocket error'))
    }

    this.ws.onclose = (event) => {
      this.isConnecting = false
      this.stopPingInterval()
      this.handlers.onDisconnect?.(event.code, event.reason)
      
      if (this.shouldReconnect) {
        this.scheduleReconnect()
      }
    }
  }

  private handleMessage(message: WebSocketMessage): void {
    this.handlers.onMessage?.(message)

    switch (message.type) {
      case 'leaderboard_update':
        this.handlers.onLeaderboardUpdate?.(
          (message as LeaderboardUpdateMessage).data
        )
        break
      
      case 'user_rank_update':
        this.handlers.onUserRankUpdate?.(
          (message as UserRankUpdateMessage).data
        )
        break
      
      case 'error':
        const errorMsg = message as ErrorMessage
        this.handleError(
          new GlobalLeaderboardsError(
            errorMsg.error.message,
            errorMsg.error.code
          )
        )
        break
      
      case 'ping':
        this.send({ type: 'pong' })
        break
    }
  }

  private send(message: WebSocketMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new GlobalLeaderboardsError(
        'WebSocket is not connected',
        'WS_NOT_CONNECTED'
      )
    }

    this.ws.send(JSON.stringify(message))
  }

  private startPingInterval(): void {
    this.stopPingInterval()
    
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' })
      }
    }, this.options.pingInterval!)
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts!) {
      this.handleError(
        new GlobalLeaderboardsError(
          'Max reconnection attempts reached',
          'WS_MAX_RECONNECT'
        )
      )
      return
    }

    this.reconnectAttempts++
    const delay = this.options.reconnectDelay! * Math.pow(2, this.reconnectAttempts - 1)

    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, delay)
  }

  private handleError(error: Error): void {
    this.handlers.onError?.(error)
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.stopPingInterval()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.isConnecting = false
  }
}