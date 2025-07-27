const { GlobalLeaderboards } = require('../dist/index.js')

async function testSDK() {
  const apiKey = 'AMF9J9RBF9f9-V6V8y0QrJkj1wpDSmmx'
  const leaderboardId = '01K11WRETAMMSS655HAAZZ7FFR'
  
  console.log('Testing GlobalLeaderboards SDK...')
  console.log('API Key:', apiKey)
  console.log('Leaderboard ID:', leaderboardId)
  console.log('---')
  
  try {
    const client = new GlobalLeaderboards(apiKey)
    
    // Test 1: Check API health
    console.log('1. Testing API health...')
    const health = await client.health()
    console.log('Health check:', health)
    console.log('---')
    
    // Test 2: Get API info
    console.log('2. Getting API info...')
    const apiInfo = await client.getApiInfo()
    console.log('API Info:', apiInfo)
    console.log('---')
    
    // Test 3: Get leaderboard
    console.log('3. Getting leaderboard...')
    console.log('Request URL:', client.config.baseUrl + '/v1/leaderboards/' + leaderboardId + '/scores')
    const leaderboard = await client.getLeaderboard(leaderboardId, { limit: 5 })
    console.log('Leaderboard entries:', leaderboard.data.length)
    console.log('First few entries:', leaderboard.data.slice(0, 3))
    console.log('---')
    
    // Test 4: Submit a test score
    console.log('4. Submitting test score...')
    const userId = client.generateId()
    const score = Math.floor(Math.random() * 1000) + 100
    const result = await client.submit(userId, score, {
      leaderboardId: leaderboardId,
      userName: 'TestUser_' + Date.now()
    })
    console.log('Score submission result:', result)
    
  } catch (error) {
    console.error('Error:', error.message)
    if (error.response) {
      console.error('Response status:', error.response.status)
      console.error('Response data:', error.response.data)
    }
  }
}

testSDK()