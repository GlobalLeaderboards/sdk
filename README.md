# @globalleaderboards/sdk

Official SDK for GlobalLeaderboards.net - Add competitive leaderboards to any
application in under 5 minutes.

## Installation

```bash
npm install @globalleaderboards/sdk
# or
yarn add @globalleaderboards/sdk
# or
pnpm add @globalleaderboards/sdk
```

## Authentication

The SDK uses the industry-standard `Authorization: Bearer <api-key>` header for
authentication. Your API key can be obtained from the GlobalLeaderboards
dashboard. Each API key is associated with a specific app, ensuring proper data
isolation.

```javascript
const leaderboard = new GlobalLeaderboards('your-api-key')
```

## Quick Start

```javascript
import {GlobalLeaderboards} from '@globalleaderboards/sdk'

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

// Recommended: Server-Sent Events (simpler, auto-reconnect, firewall-friendly)
const sse = leaderboard.connectSSE('your-leaderboard-id', {
  onLeaderboardUpdate: (data) => {
    console.log('Leaderboard updated:', data)
  },
  onUserRankUpdate: (data) => {
    console.log('Rank changed:', data)
  }
})

// Alternative: WebSocket (only use if you specifically need WebSocket compatibility)
// Note: Currently only receives updates, doesn't send data to server
const ws = leaderboard.connectWebSocket({
  onLeaderboardUpdate: (data) => {
    // New enhanced format with full state and mutations
    console.log('Full leaderboard:', data.leaderboard.entries) // Top 100 entries
    console.log('What changed:', data.mutations) // Array of changes
    console.log('Triggered by:', data.trigger) // What caused the update
  },
  onUserRankUpdate: (data) => {
    console.log('Rank changed:', data)
  }
})
ws.subscribe('your-leaderboard-id')

```

## Features

- 🚀 **Simple API** - Get started in minutes
- 🌍 **Global Performance** - <100ms response times worldwide
- 🔄 **Real-time Updates** - WebSocket and SSE support for live leaderboards
- 🛡️ **Type Safe** - Full TypeScript support
- 🔒 **Secure** - API key authentication with rate limiting
- 🎮 **Game Ready** - Built for games and competitive applications
- 🏗️ **Reliable** - Automatic retries and error handling

## API Reference

### Constructor

```javascript
const leaderboard = new GlobalLeaderboards(apiKey, options)
```

**Parameters:**

- `apiKey` (string, required) - Your API key from GlobalLeaderboards.net
- `options` (object, optional) - Configuration options

**Options:**

- `appId` (string) - Optional application ID to restrict operations
- `baseUrl` (string) - API base URL (default:
  `https://api.globalleaderboards.net`)
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
  metadata: {level: 5, character: 'warrior'}
})

// Returns: { operation: 'insert', rank: 42, previous_score?: 1000, improvement?: 500 }
```

**Parameters:**

- `userId` (string) - Unique user identifier
- `score` (number) - Score value (must be >= 0)
- `options.leaderboardId` (string) - Target leaderboard ID
- `options.userName` (string) - Display name (1-50 chars, alphanumeric +
  accents)
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

### Server-Sent Events (SSE) Methods

Server-Sent Events provide a simpler alternative to WebSocket for receiving
real-time updates. SSE is ideal when you only need to receive updates from the
server (one-way communication).

#### connectSSE(leaderboardId, handlers, options?)

Connect to a leaderboard's SSE stream for real-time updates.

```javascript
const connection = leaderboard.connectSSE('leaderboard-456', {
  onConnect: () => {
    console.log('SSE connected')
  },
  onLeaderboardUpdate: (data) => {
    console.log('Leaderboard updated:', data.topScores)
    console.log('Total entries:', data.totalEntries)
  },
  onUserRankUpdate: (data) => {
    console.log(`${data.userName} moved from rank ${data.previousRank} to ${data.newRank}`)
  },
  onError: (error) => {
    console.error('SSE error:', error)
  },
  onDisconnect: () => {
    console.log('SSE disconnected')
  }
}, {
  userId: 'user-123',              // For personalized updates
  includeMetadata: true,           // Include metadata in updates
  topN: 10                         // Number of top scores in refresh events
})

// Later: close the connection
connection.close()
```

**Event Handlers:**

- `onConnect` - Connection established
- `onDisconnect` - Connection closed
- `onError` - Error occurred
- `onLeaderboardUpdate` - Leaderboard data changed (new scores, refresh, etc.)
- `onUserRankUpdate` - User's rank changed
- `onHeartbeat` - Keep-alive signal from server (optional)
- `onMessage` - Raw message handler (optional)

**Options:**

- `userId` - User ID for personalized rank updates
- `includeMetadata` - Include metadata in score updates (default: true)
- `topN` - Number of top scores to include in refresh events (default: 10)

#### disconnectSSE()

Disconnect all SSE connections.

```javascript
leaderboard.disconnectSSE()
```

### WebSocket Methods

**Note:** The current WebSocket implementation only supports receiving updates from the server. It does not provide methods to send custom data to the server, making it functionally equivalent to SSE but with more complexity. For this reason, **we recommend using SSE instead** unless you specifically need WebSocket for compatibility reasons.

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
- `onLeaderboardUpdate` - Called when leaderboard data changes (see Enhanced Message Format below)
- `onUserRankUpdate` - Called when user's rank changes
- `onMessage` - Called for any WebSocket message

#### Enhanced WebSocket Message Format

**New in v0.5.27**: The `onLeaderboardUpdate` handler now receives an enhanced message format with full leaderboard state and detailed mutations:

```javascript
{
  leaderboardId: "01K1AKF9NMZFX8FK8XA81QYK2J",
  updateType: "score_update", // or "full_refresh", "bulk_update"
  
  // Complete current state (top 100 entries)
  leaderboard: {
    entries: [
      {
        rank: 1,
        userId: "user123",
        userName: "Alice",
        score: 1000,
        timestamp: "2025-07-29T08:15:37.197Z",
        metadata: { /* custom data */ }
      },
      // ... up to 100 entries
    ],
    totalEntries: 150,
    displayedEntries: 100
  },
  
  // What changed (for animations)
  mutations: [
    {
      type: "new_entry",
      userId: "user456",
      newRank: 3,
      score: 850,
      userName: "Bob"
    },
    {
      type: "rank_change",
      userId: "user789",
      previousRank: 3,
      newRank: 4,
      score: 800
    },
    {
      type: "score_update",
      userId: "user123",
      previousScore: 950,
      newScore: 1000,
      previousRank: 2,
      newRank: 1
    },
    {
      type: "username_change",
      userId: "user111",
      previousUsername: "Player111",
      newUsername: "ProPlayer",
      rank: 5
    },
    {
      type: "removed",
      userId: "user999",
      previousRank: 100,
      score: 100
    }
  ],
  
  // What triggered this update
  trigger: {
    type: "score_submission", // or "bulk_submission", "admin_action", "leaderboard_reset"
    submissions: [
      {
        userId: "user123",
        userName: "Alice",
        score: 1000,
        previousScore: 950,
        timestamp: "2025-07-29T08:15:37.197Z"
      }
    ]
  },
  
  sequence: 42 // For ordering/deduplication
}
```

**Mutation Types:**
- `new_entry` - User wasn't on the leaderboard before
- `rank_change` - User's rank changed (but score didn't)
- `score_update` - User's score changed (may also change rank)
- `username_change` - User's display name changed
- `removed` - User dropped out of displayed entries

**Using Mutations for Animations:**
```javascript
ws.onLeaderboardUpdate = (data) => {
  // Update display with full state
  updateLeaderboard(data.leaderboard.entries)
  
  // Animate changes
  data.mutations.forEach(mutation => {
    switch(mutation.type) {
      case 'new_entry':
        animateNewEntry(mutation.userId, mutation.newRank)
        break
      case 'rank_change':
        animateRankChange(mutation.userId, mutation.previousRank, mutation.newRank)
        break
      case 'score_update':
        animateScoreUpdate(mutation.userId, mutation.previousScore, mutation.newScore)
        break
    }
  })
}
```

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

### SSE vs WebSocket

Choose the right real-time technology for your use case:

| Feature           | SSE                     | WebSocket                |
|-------------------|-------------------------|--------------------------|
| Communication     | One-way (server→client) | Two-way (bidirectional)* |
| Complexity        | Simple                  | More complex             |
| Browser Support   | Excellent               | Good                     |
| Auto-reconnect    | Built-in                | Manual                   |
| Firewall Friendly | Yes                     | Sometimes blocked        |
| Use Case          | Display updates         | Interactive features*    |

*Note: The current WebSocket implementation only receives data and doesn't send commands to the server.

**Why SSE is Recommended:**

Since our WebSocket implementation currently only receives updates (no sending capabilities), SSE provides the same functionality with:
- Simpler implementation
- Automatic reconnection
- Better firewall/proxy compatibility
- Lower resource usage
- Easier debugging

**Use SSE (recommended) when:**

- You need real-time leaderboard updates
- You want the simplest integration
- Firewall/proxy compatibility is important
- You're building a display-only leaderboard

**Use WebSocket when:**

- You specifically need WebSocket for compatibility with existing infrastructure
- You're already using WebSocket elsewhere in your application
- Future bidirectional features are planned (not currently available)

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
  GlobalLeaderboardsError,
  SSEScoreUpdateEvent,
  SSELeaderboardRefreshEvent,
  SSEEventHandlers,
  // New WebSocket types
  LeaderboardUpdateMessage,
  LeaderboardMutation,
  NewEntryMutation,
  RankChangeMutation,
  ScoreUpdateMutation,
  UsernameChangeMutation,
  RemovedMutation,
  UpdateTrigger
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

// TypeScript will provide full IntelliSense for mutations
ws.onLeaderboardUpdate = (data: LeaderboardUpdateMessage['payload']) => {
  data.mutations.forEach((mutation: LeaderboardMutation) => {
    if (mutation.type === 'new_entry') {
      // TypeScript knows this is NewEntryMutation
      console.log(mutation.newRank)
    }
  })
}
```

## Examples

### React Hook Example

```javascript
import {useEffect, useState} from 'react'
import {GlobalLeaderboards} from '@globalleaderboards/sdk'

function useLeaderboard(leaderboardId) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const leaderboard = new GlobalLeaderboards(process.env.REACT_APP_API_KEY)

  useEffect(() => {
    // Fetch initial data
    leaderboard.getLeaderboard(leaderboardId, {limit: 10})
      .then(data => {
        setEntries(data.data)
        setLoading(false)
      })

    // Connect to real-time updates
    const ws = leaderboard.connectWebSocket({
      onLeaderboardUpdate: (data) => {
        // New format provides full leaderboard state
        setEntries(data.leaderboard.entries)
        
        // Optionally use mutations for animations
        data.mutations.forEach(mutation => {
          if (mutation.type === 'new_entry') {
            // Animate new entry appearing
          } else if (mutation.type === 'rank_change') {
            // Animate rank movement
          }
        })
      }
    })

    ws.subscribe(leaderboardId)

    return () => ws.disconnect()
  }, [leaderboardId])

  return {entries, loading}
}
```

### SSE Real-time Display Example

```javascript
import {GlobalLeaderboards} from '@globalleaderboards/sdk'

function LeaderboardDisplay({leaderboardId}) {
  const [scores, setScores] = useState([])
  const [latestScore, setLatestScore] = useState(null)

  useEffect(() => {
    const leaderboard = new GlobalLeaderboards(process.env.REACT_APP_API_KEY)

    // Connect to SSE for real-time updates
    const connection = leaderboard.connectSSE(leaderboardId, {
      onConnect: () => {
        console.log('Connected to real-time updates')
      },
      onLeaderboardUpdate: (data) => {
        // Update the leaderboard display
        setScores(data.topScores)

        // Show the latest score if available
        if (data.topScores.length > 0) {
          const newestScore = data.topScores[0]
          setLatestScore(newestScore)
        }
      },
      onUserRankUpdate: (data) => {
        // Handle user rank changes if needed
        console.log(`User ${data.userName} rank changed to ${data.newRank}`)
      },
      onError: (error) => {
        console.error('Real-time connection error:', error)
      }
    }, {
      topN: 10  // We're displaying top 10
    })

    // Fetch initial leaderboard
    const fetchLeaderboard = async () => {
      const data = await leaderboard.getLeaderboard(leaderboardId, {limit: 10})
      setScores(data.data)
    }

    fetchLeaderboard()

    // Cleanup on unmount
    return () => connection.close()
  }, [leaderboardId])

  return (
    <div>
      {latestScore && (
        <div className="latest-score">
          New Score: {latestScore.userName} - {latestScore.score}
        </div>
      )}
      <div className="leaderboard">
        {scores.map((entry, index) => (
          <div key={entry.userId}>
            #{entry.rank} {entry.userName} - {entry.score}
          </div>
        ))}
      </div>
    </div>
  )
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
    const data = await this.client.getLeaderboard(this.leaderboardId, {limit})
    return data.data
  }
}
```

## API Rate Limits

The SDK automatically handles rate limiting and retries. The current rate
limit is 1,000 requests/minute.

When rate limited, the SDK will automatically retry with exponential backoff
if `autoRetry` is enabled.

## Best Practices

1. **Reuse SDK instances** - Create one instance and reuse it
2. **Handle errors gracefully** - Always wrap API calls in try-catch
3. **Use metadata wisely** - Store game-specific data like level, character,
   etc.
4. **Validate client-side** - The SDK validates scores and usernames
   automatically
5. **Subscribe to updates** - Use WebSocket for real-time leaderboards
6. **Generate IDs** - Use `generateId()` for consistent ID format

## Documentation

Full API documentation is available
at [docs.globalleaderboards.net](https://docs.globalleaderboards.net)

## Support

- 📧 Email: gl@smokingmedia.com
- 📚 Documentation: https://docs.globalleaderboards.net
- 🐛 Issues: https://github.com/globalleaderboards/sdk/issues

## License

[MIT](./LICENSE)
