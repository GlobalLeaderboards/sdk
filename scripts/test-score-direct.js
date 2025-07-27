// Test score submission directly
async function testScoreSubmission() {
  const apiKey = 'AMF9J9RBF9f9-V6V8y0QrJkj1wpDSmmx'
  const appId = '01K11VJ1BWKKQQZYY7RR008ZZ4'
  const leaderboardId = '01K11WRETAMMSS655HAAZZ7FFR'
  
  const scoreData = {
    leaderboardId: leaderboardId,
    userId: 'TEST_' + Date.now(),
    userName: 'DirectTest',
    score: Math.floor(Math.random() * 1000),
    metadata: { test: true }
  }
  
  console.log('Testing score submission...')
  console.log('Score data:', scoreData)
  
  try {
    const response = await fetch('https://api.globalleaderboards.net/v1/scores', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-App-Id': appId
      },
      body: JSON.stringify(scoreData)
    })
    
    console.log('Status:', response.status)
    const data = await response.json()
    console.log('Response:', data)
  } catch (error) {
    console.error('Error:', error)
  }
}

testScoreSubmission()