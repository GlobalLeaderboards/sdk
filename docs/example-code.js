// API configuration
const API_CONFIG = {
  baseUrl: 'https://api.globalleaderboards.net',
  wsUrl: 'wss://api.globalleaderboards.net',
  apiKey: '01K0WESKQRTERJMDSQVCGYKZVD',
  appId: '01J3K4L5M6N7P8Q9R0S1T2U3V6',
  leaderboardId: '01J3K4L5M6N7P8Q9R0S1T2U3V7'
};

// WebSocket connection and real-time updates
class LeaderboardWebSocket {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.liveScores = [];
    this.leaderboard = [];
    this.updateInterval = null;
  }

  connect() {
    console.log('Connecting to WebSocket...');

    const wsUrl = `${API_CONFIG.wsUrl}/v1/ws?api_key=${API_CONFIG.apiKey}&leaderboard_id=${API_CONFIG.leaderboardId}`;
    this.ws = new WebSocket(wsUrl);

    // Start periodic timestamp updates
    this.startTimestampUpdates();

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.updateConnectionStatus('connected');

      // Subscribe to leaderboard updates
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        leaderboard_id: API_CONFIG.leaderboardId
      }));
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WebSocket message:', data);

        switch (data.type) {
          case 'leaderboard_update':
            this.handleLeaderboardUpdate(data.data);
            break;
          case 'new_score':
            this.handleNewScore(data.data);
            break;
          case 'ping':
            this.ws.send(JSON.stringify({ type: 'pong' }));
            break;
          case 'error':
            console.error('WebSocket error:', data.message);
            break;
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.updateConnectionStatus('error');
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.updateConnectionStatus('disconnected');
      this.handleReconnect();
    };
  }

  handleLeaderboardUpdate(data) {
    this.leaderboard = data.entries || [];
    this.renderLeaderboard();
  }

  handleNewScore(data) {
    // Add to live scores (keep last 10)
    this.liveScores.unshift(data);
    if (this.liveScores.length > 10) {
      this.liveScores.pop();
    }
    this.renderLiveScores();
  }

  handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
      setTimeout(() => this.connect(), delay);
    } else {
      console.error('Max reconnection attempts reached');
      this.updateConnectionStatus('failed');
    }
  }

  updateConnectionStatus(status) {
    const statusEl = document.getElementById('connection-status');
    if (!statusEl) return;

    const statusText = {
      connected: '<span class="status-dot"></span> Connected',
      disconnected: '<span class="status-dot"></span> Disconnected',
      error: '<span class="status-dot"></span> Connection Error',
      failed: '<span class="status-dot"></span> Connection Failed'
    };

    statusEl.innerHTML = statusText[status] || status;
    statusEl.className = `connection-status ${status}`;
  }

  renderLiveScores() {
    const container = document.getElementById('live-scores');
    if (!container) return;

    const html = this.liveScores.map(score => `
      <div class="score-item">
        <div style="display: flex; align-items: center; flex: 1;">
          <span class="player-name">${this.escapeHtml(score.user_name)}</span>
          <span class="time">${this.formatTime(score.timestamp)}</span>
        </div>
        <span class="score">${score.score.toLocaleString()}</span>
      </div>
    `).join('');

    container.innerHTML = html || '<div class="empty">Waiting for new scores...</div>';
  }

  renderLeaderboard() {
    const container = document.getElementById('leaderboard-entries');
    if (!container) return;

    const html = this.leaderboard.slice(0, 10).map((entry, index) => `
      <div class="leaderboard-entry">
        <span class="rank">${entry.rank || index + 1}</span>
        <span class="player-name">${this.escapeHtml(entry.user_name)}</span>
        <span class="score">${entry.score.toLocaleString()}</span>
      </div>
    `).join('');

    container.innerHTML = html || '<div class="empty">No leaderboard data yet...</div>';
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.stopTimestampUpdates();
  }

  startTimestampUpdates() {
    // Update timestamps every 30 seconds
    this.updateInterval = setInterval(() => {
      this.renderLiveScores();
    }, 30000);
  }

  stopTimestampUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
}

// REST API functions
const API = {
  async fetchLeaderboard() {
    try {
      const response = await fetch(
        `${API_CONFIG.baseUrl}/v1/leaderboards/${API_CONFIG.leaderboardId}?limit=10`,
        {
          headers: {
            'Authorization': `Bearer ${API_CONFIG.apiKey}`,
            'X-App-Id': API_CONFIG.appId
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      return null;
    }
  },

  async submitScore(userName, score, metadata = {}) {
    try {
      const userId = this.generateUserId();
      const response = await fetch(`${API_CONFIG.baseUrl}/v1/scores`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_CONFIG.apiKey}`,
          'X-App-Id': API_CONFIG.appId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          leaderboard_id: API_CONFIG.leaderboardId,
          user_id: userId,
          user_name: userName,
          score: score,
          metadata: metadata
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error submitting score:', error);
      return null;
    }
  },

  generateUserId() {
    // Generate a ULID-like ID for demo purposes
    const timestamp = Date.now().toString(36).toUpperCase().padStart(10, '0');
    const random = Math.random().toString(36).substring(2, 18).toUpperCase();
    return timestamp + random;
  }
};

// Initialize when DOM is ready
let wsConnection = null;

const initializeDemo = () => {
  // Create UI structure
  const container = document.getElementById('api-demo');
  if (!container) {
    console.error('API demo container not found');
    return;
  }

  container.innerHTML = `
    <div class="api-demo-container">
      <div class="game-info">
        <img src="https://8bitretro.games/favicon.svg" alt="Countdown Game" class="game-icon" />
        <div class="game-details">
          <h2>Live from <span class="game-name">Countdown</span></h2>
          <p>Real-time leaderboard data from the puzzle game at <a href="https://8bitretro.games" target="_blank" rel="noopener">8bitretro.games</a></p>
        </div>
      </div>

      <div class="connection-info">
        <div id="connection-status" class="connection-status"><span class="status-dot"></span> Connecting...</div>
      </div>

      <div class="demo-sections">
        <div class="demo-section">
          <h3>🎮 Live Scores</h3>
          <div class="live-scores-container">
            <div id="live-scores" class="live-scores">
              <div class="empty">Waiting for new scores...</div>
            </div>
          </div>
        </div>

        <div class="demo-section">
          <h3>🏆 Top 10 Leaderboard</h3>
          <div class="leaderboard-container">
            <div id="leaderboard-entries" class="leaderboard-entries">
              <div class="empty">Loading leaderboard...</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <style>
      .api-demo-container {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #fff;
        color: #333;
        padding: 24px;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        border: 1px solid #e5e7eb;
      }

      .dark .api-demo-container {
        background: #1f2937;
        color: #f3f4f6;
        border-color: #374151;
      }

      .game-info {
        display: flex;
        align-items: center;
        gap: 20px;
        margin-bottom: 24px;
        padding-bottom: 20px;
        border-bottom: 1px solid #e5e7eb;
      }

      .dark {
        .game-info {
          border-bottom-color: #374151;
        }
      }

      .game-icon {
        width: 48px;
        height: 48px;
        border-radius: 8px;
        background: #f3f4f6;
        padding: 8px;
      }

      .dark {
        .game-icon {
          background: #374151;
        }
      }

      .game-details h2 {
        margin: 0 0 5px 0;
        font-size: 20px;
        color: #fff;
      }

      .game-name {
        color: #7c3aed; /* brand-purple */
      }

      .game-details p {
        margin: 0;
        font-size: 14px;
        color: #999;
      }

      .game-details a {
        color: #7c3aed; /* brand-purple */
        text-decoration: none;
      }

      .game-details a:hover {
        text-decoration: underline;
      }

      .connection-info {
        text-align: center;
        margin-bottom: 20px;
      }

      .connection-status {
        display: inline-block;
        padding: 6px 16px;
        border-radius: 20px;
        background: #f3f4f6;
        font-size: 14px;
        font-weight: 500;
      }

      .dark {
        .connection-status {
          background: #374151;
        }
      }

      .connection-status.connected { color: #10b981; } /* brand-green */
      .connection-status.disconnected { color: #ef4444; }
      .connection-status.error { color: #f59e0b; }
      .connection-status.failed { color: #ef4444; }

      .status-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 6px;
        background: currentColor;
      }

      .connection-status.connected .status-dot {
        animation: pulse-dot 2s infinite;
      }

      @keyframes pulse-dot {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .demo-sections {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-bottom: 20px;
      }

      @media (max-width: 600px) {
        .demo-sections {
          grid-template-columns: 1fr;
        }
      }

      .demo-section {
        background: #f9fafb;
        padding: 20px;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
      }

      .dark {
        .demo-section {
          background: #111827;
          border-color: #374151;
        }
      }

      .demo-section h3 {
        margin: 0 0 16px 0;
        color: #1f2937;
        font-size: 18px;
        font-weight: 600;
      }

      .dark {
        .demo-section h3 {
          color: #f3f4f6;
        }
      }

      .live-scores, .leaderboard-entries {
        max-height: 300px;
        overflow-y: auto;
      }

      .score-item, .leaderboard-entry {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: #fff;
        margin-bottom: 8px;
        border-radius: 8px;
        font-size: 14px;
        border: 1px solid #e5e7eb;
        transition: all 0.2s;
      }

      .dark {
        .score-item, .leaderboard-entry {
          background: #1f2937;
          border-color: #374151;
        }
      }

      .score-item:hover, .leaderboard-entry:hover {
        background: #f9fafb;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.05);
      }

      .dark {
        .score-item:hover, .leaderboard-entry:hover {
          background: #374151;
        }
      }

      .rank {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 14px;
        margin-right: 12px;
      }

      .leaderboard-entry:nth-child(1) .rank {
        background: #fbbf24;
        color: #92400e;
      }

      .leaderboard-entry:nth-child(2) .rank {
        background: #e5e7eb;
        color: #4b5563;
      }

      .leaderboard-entry:nth-child(3) .rank {
        background: #f97316;
        color: #fff;
      }

      .leaderboard-entry:nth-child(n+4) .rank {
        background: #f3f4f6;
        color: #6b7280;
      }

      .dark {
        .leaderboard-entry:nth-child(n+4) .rank {
          background: #374151;
          color: #d1d5db;
        }
      }

      .player-name {
        flex: 1;
        font-weight: 500;
        color: #1f2937;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        margin: 0 16px;
      }

      .dark {
        .player-name {
          color: #f3f4f6;
        }
      }

      .score {
        font-weight: 700;
        font-size: 18px;
        color: #1f2937;
      }

      .dark {
        .score {
          color: #f3f4f6;
        }
      }

      .time {
        color: #6b7280;
        font-size: 12px;
        margin-left: 16px;
      }

      .empty {
        text-align: center;
        color: #9ca3af;
        padding: 32px;
        font-style: normal;
      }

      .score-submit {
        display: flex;
        gap: 10px;
        align-items: center;
      }

      .score-submit input {
        flex: 1;
        padding: 8px;
        background: #333;
        border: 1px solid #555;
        color: #fff;
        border-radius: 3px;
      }

    </style>
  `;

  // Initialize WebSocket connection
  wsConnection = new LeaderboardWebSocket();
  wsConnection.connect();

  // Load initial leaderboard data
  API.fetchLeaderboard().then(data => {
    if (data && data.data) {
      wsConnection.leaderboard = data.data;
      wsConnection.renderLeaderboard();
    }
  });
};

// Export for use in browser
if (typeof window !== 'undefined') {
  window.LeaderboardAPI = {
    init: initializeDemo,
    API: API,
    WebSocket: LeaderboardWebSocket
  };

  // Auto-initialize if DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDemo);
  } else {
    initializeDemo();
  }
}

// Node.js test function
if (typeof window === 'undefined') {
  const testAPI = async () => {
    console.log('Testing GlobalLeaderboards.net API...');

    console.log('\n1. Testing GET leaderboard...');
    const leaderboard = await API.fetchLeaderboard();
    console.log('Leaderboard response:', leaderboard);

    console.log('\n2. Testing POST score submission...');
    const scoreResult = await API.submitScore(
      'NodeTestPlayer',
      Math.floor(Math.random() * 1000),
      { platform: 'node', test: true }
    );
    console.log('Score submission result:', scoreResult);
  };

  // Run test
  testAPI();
}
