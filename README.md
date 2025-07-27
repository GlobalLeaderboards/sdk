# @globalleaderboards/sdk

Official SDK for GlobalLeaderboards.net - Add competitive leaderboards to any application in under 5 minutes.

## Installation

```bash
npm install @globalleaderboards/sdk
# or
yarn add @globalleaderboards/sdk
# or
pnpm add @globalleaderboards/sdk
```

## Quick Start

```javascript
import { GlobalLeaderboards } from '@globalleaderboards/sdk'

// Initialize the SDK
const leaderboard = new GlobalLeaderboards('your-api-key')

// Submit a score
await leaderboard.submit('player-id', 1250, {
  leaderboardId: 'your-leaderboard-id',
  userName: 'PlayerOne'
})

// Get leaderboard
const scores = await leaderboard.getLeaderboard('your-leaderboard-id', {
  limit: 10
})

// Connect to real-time updates
const ws = leaderboard.connectWebSocket({
  onLeaderboardUpdate: (data) => {
    console.log('Leaderboard updated:', data)
  },
  onUserRankUpdate: (data) => {
    console.log('Rank changed:', data)
  }
})

// Subscribe to a specific leaderboard
ws.subscribe('your-leaderboard-id')
```

## Features

- 🚀 **Simple API** - Get started in minutes
- 🌍 **Global Performance** - <100ms response times worldwide
- 🔄 **Real-time Updates** - WebSocket support for live leaderboards
- 🛡️ **Type Safe** - Full TypeScript support
- 🔒 **Secure** - API key authentication with rate limiting
- 🎮 **Game Ready** - Built for games and competitive applications
- 🏗️ **Reliable** - Automatic retries and error handling

## API Reference

### Constructor

```javascript
const leaderboard = new GlobalLeaderboards(apiKey, options?)
```

**Parameters:**
- `apiKey` (string, required) - Your API key from GlobalLeaderboards.net
- `options` (object, optional) - Configuration options

**Options:**
- `appId` (string) - Optional application ID to restrict operations
- `baseUrl` (string) - API base URL (default: `https://api.globalleaderboards.net`)
- `wsUrl` (string) - WebSocket URL (default: `wss://api.globalleaderboards.net`)
- `timeout` (number) - Request timeout in ms (default: `30000`)
- `autoRetry` (boolean) - Enable automatic retry (default: `true`)
- `maxRetries` (number) - Maximum retry attempts (default: `3`)

### Score Methods

#### submit(userId, score, options)

Submit a score to a leaderboard with validation.

```javascript
const result = await leaderboard.submit('user-123', 1500, {
  leaderboardId: 'leaderboard-456',
  userName: 'PlayerOne',
  metadata: { level: 5, character: 'warrior' }
})

// Returns: { operation: 'insert', rank: 42, previous_score?: 1000, improvement?: 500 }
```

**Parameters:**
- `userId` (string) - Unique user identifier
- `score` (number) - Score value (must be >= 0)
- `options.leaderboardId` (string) - Target leaderboard ID
- `options.userName` (string) - Display name (1-50 chars, alphanumeric + accents)
- `options.metadata` (object) - Optional metadata

#### submitScore(playerId, score, leaderboardId?, options?)

Simplified score submission API.

```javascript
// Using default leaderboard from config
await leaderboard.submitScore('player-123', 2500)

// Or specify leaderboard
await leaderboard.submitScore('player-123', 2500, 'leaderboard-456')
```

#### submitBulk(scores)

Submit multiple scores in a single request for better performance.

```javascript
const results = await leaderboard.submitBulk([
  {
    leaderboard_id: 'leaderboard-456',
    user_id: 'user-123',
    user_name: 'Player1',
    score: 1000
  },
  {
    leaderboard_id: 'leaderboard-456',
    user_id: 'user-456',
    user_name: 'Player2',
    score: 2000
  }
])

// Returns: { results: [...], summary: { total: 2, successful: 2, failed: 0 } }
```

### Leaderboard Methods

#### getLeaderboard(leaderboardId, options?)

Get paginated leaderboard entries.

```javascript
const data = await leaderboard.getLeaderboard('leaderboard-456', {
  page: 1,
  limit: 20,
  aroundUser: 'user-123' // Center results around this user
})

// Returns: { data: [...], pagination: {...}, leaderboard: {...} }
```

**Options:**
- `page` (number) - Page number (default: 1)
- `limit` (number) - Results per page (default: 20, max: 100)
- `aroundUser` (string) - Center results around specific user

#### getUserScores(userId, options?)

Get all scores for a user across leaderboards.

```javascript
const userScores = await leaderboard.getUserScores('user-123', {
  page: 1,
  limit: 50
})

// Returns: { data: [...], pagination: {...}, user: { total_scores: 10, best_rank: 1 } }
```

### Health & Info Methods

#### health()

Basic health check (no authentication required).

```javascript
const health = await leaderboard.health()
// Returns: { status: 'healthy', version: '0.1.10', timestamp: '...' }
```

#### healthDetailed()

Detailed health check with service statuses (no authentication required).

```javascript
const detailed = await leaderboard.healthDetailed()
// Returns: { 
//   status: 'healthy',
//   services: { database: {...}, cache: {...}, storage: {...} },
//   system: { memoryUsage: 128, uptime: 3600, environment: 'production' }
// }
```

#### getApiInfo()

Get API information and available endpoints (no authentication required).

```javascript
const info = await leaderboard.getApiInfo()
// Returns API version, endpoints, documentation URL, etc.
```

### WebSocket Methods

#### connectWebSocket(handlers, options?)

Connect to real-time updates via WebSocket.

```javascript
const ws = leaderboard.connectWebSocket({
  onConnect: () => console.log('Connected'),
  onDisconnect: (code, reason) => console.log('Disconnected'),
  onError: (error) => console.error('Error:', error),
  onLeaderboardUpdate: (data) => console.log('Leaderboard update:', data),
  onUserRankUpdate: (data) => console.log('Rank changed:', data),
  onMessage: (message) => console.log('Raw message:', message)
}, {
  leaderboardId: 'leaderboard-456',
  userId: 'user-123',
  maxReconnectAttempts: 5,
  reconnectDelay: 1000
})
```

**Handlers:**
- `onConnect` - Called when connection is established
- `onDisconnect` - Called when connection is closed
- `onError` - Called on errors
- `onLeaderboardUpdate` - Called when leaderboard data changes
- `onUserRankUpdate` - Called when user's rank changes
- `onMessage` - Called for any WebSocket message

#### disconnectWebSocket()

Disconnect from WebSocket.

```javascript
leaderboard.disconnectWebSocket()
```

### WebSocket Instance Methods

Once connected, use these methods on the WebSocket instance:

#### subscribe(leaderboardId, userId?)

Subscribe to leaderboard updates.

```javascript
ws.subscribe('leaderboard-456', 'user-123')
```

#### unsubscribe(leaderboardId)

Unsubscribe from leaderboard updates.

```javascript
ws.unsubscribe('leaderboard-456')
```

#### disconnect()

Close the WebSocket connection.

```javascript
ws.disconnect()
```

### Utility Methods

#### generateId()

Generate a new ULID (Universally Unique Lexicographically Sortable Identifier).

```javascript
const id = leaderboard.generateId()
// Returns: '01ARZ3NDEKTSV4RRFFQ69G5FAV'
```

## Error Handling

The SDK throws `GlobalLeaderboardsError` for all API errors:

```javascript
try {
  await leaderboard.submit('user-123', -100, {
    leaderboardId: 'leaderboard-456'
  })
} catch (error) {
  if (error instanceof GlobalLeaderboardsError) {
    console.error('Error:', error.message)
    console.error('Code:', error.code)
    console.error('Status:', error.statusCode)
    console.error('Details:', error.details)
  }
}
```

### Common Error Codes

- `INVALID_SCORE` - Score validation failed
- `INVALID_USERNAME` - Username validation failed
- `INVALID_USERNAME_LENGTH` - Username length validation failed
- `MISSING_LEADERBOARD_ID` - Leaderboard ID is required
- `TIMEOUT` - Request timed out
- `HEALTH_CHECK_FAILED` - Health check failed
- `WS_NOT_CONNECTED` - WebSocket is not connected
- `WS_MAX_RECONNECT` - Maximum reconnection attempts reached

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions:

```typescript
import { 
  GlobalLeaderboards,
  SubmitScoreResponse,
  LeaderboardEntriesResponse,
  LeaderboardEntry,
  GlobalLeaderboardsError
} from '@globalleaderboards/sdk'

// All methods are fully typed
const leaderboard = new GlobalLeaderboards('api-key')

const response: SubmitScoreResponse = await leaderboard.submit(
  'user-123',
  1000,
  {
    leaderboardId: 'leaderboard-456',
    userName: 'Player'
  }
)
```

## Examples

### React Hook Example

```javascript
import { useEffect, useState } from 'react'
import { GlobalLeaderboards } from '@globalleaderboards/sdk'

function useLeaderboard(leaderboardId) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  
  const leaderboard = new GlobalLeaderboards(process.env.REACT_APP_API_KEY)
  
  useEffect(() => {
    // Fetch initial data
    leaderboard.getLeaderboard(leaderboardId, { limit: 10 })
      .then(data => {
        setEntries(data.data)
        setLoading(false)
      })
    
    // Connect to real-time updates
    const ws = leaderboard.connectWebSocket({
      onLeaderboardUpdate: (data) => {
        setEntries(data.entries)
      }
    })
    
    ws.subscribe(leaderboardId)
    
    return () => ws.disconnect()
  }, [leaderboardId])
  
  return { entries, loading }
}
```

### Game Integration Example

```javascript
class GameLeaderboard {
  constructor(apiKey) {
    this.client = new GlobalLeaderboards(apiKey)
    this.leaderboardId = 'game-highscores'
  }
  
  async submitGameScore(playerId, playerName, score, level) {
    try {
      const result = await this.client.submit(playerId, score, {
        leaderboardId: this.leaderboardId,
        userName: playerName,
        metadata: {
          level,
          timestamp: Date.now(),
          version: '1.0.0'
        }
      })
      
      if (result.operation === 'update' && result.improvement > 0) {
        console.log(`New personal best! Improved by ${result.improvement} points`)
      }
      
      return result
    } catch (error) {
      console.error('Failed to submit score:', error.message)
      throw error
    }
  }
  
  async getTopPlayers(limit = 10) {
    const data = await this.client.getLeaderboard(this.leaderboardId, { limit })
    return data.data
  }
}
```

## API Rate Limits

The SDK automatically handles rate limiting and retries:

- **Free tier**: 1,000 requests/minute
- **Pro tier**: 10,000 requests/minute
- **Enterprise**: Custom limits

When rate limited, the SDK will automatically retry with exponential backoff if `autoRetry` is enabled.

## Best Practices

1. **Reuse SDK instances** - Create one instance and reuse it
2. **Handle errors gracefully** - Always wrap API calls in try-catch
3. **Use metadata wisely** - Store game-specific data like level, character, etc.
4. **Validate client-side** - The SDK validates scores and usernames automatically
5. **Subscribe to updates** - Use WebSocket for real-time leaderboards
6. **Generate IDs** - Use `generateId()` for consistent ID format

## Documentation

Full API documentation is available at [docs.globalleaderboards.net](https://docs.globalleaderboards.net)

## Support

- 📧 Email: support@globalleaderboards.net
- 📚 Documentation: https://docs.globalleaderboards.net
- 🐛 Issues: https://github.com/globalleaderboards/sdk/issues
- 💬 Discord: https://discord.gg/globalleaderboards

## License

MIT