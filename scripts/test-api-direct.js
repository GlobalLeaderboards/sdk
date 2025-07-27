// Direct API test without SDK
async function testAPI() {
  const apiKey = 'AMF9J9RBF9f9-V6V8y0QrJkj1wpDSmmx'
  const appId = '01K11VJ1BWKKQQZYY7RR008ZZ4'
  const leaderboardId = '01K11WRETAMMSS655HAAZZ7FFR'
  
  console.log('Testing API directly...')
  console.log('API Key:', apiKey)
  console.log('App ID:', appId)
  console.log('---')
  
  try {
    // Test with different header combinations
    console.log('1. Testing with X-API-Key header...')
    const response1 = await fetch('https://api.globalleaderboards.net/v1/leaderboards/' + leaderboardId + '/scores?limit=5', {
      headers: {
        'X-API-Key': apiKey,
        'X-App-Id': appId
      }
    })
    console.log('Status:', response1.status)
    const data1 = await response1.json()
    console.log('Response:', data1)
    console.log('---')
    
    // Test with Authorization header
    console.log('2. Testing with Authorization header...')
    const response2 = await fetch('https://api.globalleaderboards.net/v1/leaderboards/' + leaderboardId + '/scores?limit=5', {
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'X-App-Id': appId
      }
    })
    console.log('Status:', response2.status)
    const data2 = await response2.json()
    console.log('Response:', data2)
    console.log('---')
    
    // Test without App ID
    console.log('3. Testing without App ID...')
    const response3 = await fetch('https://api.globalleaderboards.net/v1/leaderboards/' + leaderboardId + '/scores?limit=5', {
      headers: {
        'X-API-Key': apiKey
      }
    })
    console.log('Status:', response3.status)
    const data3 = await response3.json()
    console.log('Response:', data3)
    
  } catch (error) {
    console.error('Error:', error.message)
  }
}

testAPI()