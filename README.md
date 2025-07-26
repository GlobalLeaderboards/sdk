# @globalleaderboards/sdk

Official SDK for GlobalLeaderboards.net - Add competitive leaderboards to any application in under 5 minutes.

## Installation

```bash
npm install @globalleaderboards/sdk
# or
yarn add @globalleaderboards/sdk
```

## Quick Start

```javascript
import { GlobalLeaderboards } from '@globalleaderboards/sdk'

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
  onNewScore: (data) => {
    console.log('New score:', data)
  },
  onLeaderboardUpdate: (data) => {
    console.log('Leaderboard updated:', data)
  }
})

// Subscribe to a specific leaderboard
ws.subscribe('your-leaderboard-id')
```

## API Reference

### Constructor

```javascript
const leaderboard = new GlobalLeaderboards(apiKey, options)
```

Options:
- `appId` - Optional application ID to restrict operations
- `baseUrl` - API base URL (default: https://api.globalleaderboards.net)
- `wsUrl` - WebSocket URL (default: wss://api.globalleaderboards.net)
- `timeout` - Request timeout in ms (default: 30000)
- `autoRetry` - Enable automatic retry (default: true)
- `maxRetries` - Maximum retry attempts (default: 3)

### Methods

#### submit(userId, score, options)
Submit a score to a leaderboard.

```javascript
const result = await leaderboard.submit('user-123', 1500, {
  leaderboardId: 'leaderboard-456',
  userName: 'PlayerOne',
  metadata: { level: 5, character: 'warrior' }
})
```

#### getLeaderboard(leaderboardId, options)
Get leaderboard entries.

```javascript
const data = await leaderboard.getLeaderboard('leaderboard-456', {
  page: 1,
  limit: 20,
  aroundUser: 'user-123' // Center results around this user
})
```

#### connectWebSocket(handlers, options)
Connect to real-time updates via WebSocket.

```javascript
const ws = leaderboard.connectWebSocket({
  onConnect: () => console.log('Connected'),
  onDisconnect: (code, reason) => console.log('Disconnected'),
  onError: (error) => console.error('Error:', error),
  onLeaderboardUpdate: (data) => console.log('Update:', data),
  onNewScore: (data) => console.log('New score:', data),
  onUserRankUpdate: (data) => console.log('Rank changed:', data)
}, {
  leaderboardId: 'leaderboard-456',
  userId: 'user-123'
})
```

### WebSocket Methods

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

## Error Handling

The SDK throws `GlobalLeaderboardsError` for API errors:

```javascript
try {
  await leaderboard.submit('user-123', 1000, {
    leaderboardId: 'invalid-id'
  })
} catch (error) {
  if (error instanceof GlobalLeaderboardsError) {
    console.error('API Error:', error.message)
    console.error('Error Code:', error.code)
    console.error('Status Code:', error.statusCode)
  }
}
```

## License

MIT