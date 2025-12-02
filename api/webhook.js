export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    // Read the raw request body as a buffer
    const bodyBuffer = await new Promise((resolve, reject) => {
      const chunks = []
      
      // If the request is already ended, we can't read it
      if (req.readableEnded) {
        return reject(new Error('Request body has already been consumed'))
      }
      
      // Read from the request stream
      req.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })
      
      req.on('end', () => {
        resolve(Buffer.concat(chunks))
      })
      
      req.on('error', (err) => {
        reject(err)
      })
    })

    if (!bodyBuffer || bodyBuffer.length === 0) {
      return res.status(400).json({ error: 'Request body is empty' })
    }

    // Get content-type to preserve multipart boundary
    const contentType = req.headers['content-type'] || 'application/octet-stream'

    // Forward to n8n webhook with the raw body
    const n8nWebhookUrl = 'https://gvkssjobs.n8n-wsk.com/webhook/d48e6560-289b-450c-a612-d04bb2247440'
    
    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
      },
      body: bodyBuffer,
    })

    if (!response.ok) {
      let errorText
      try {
        errorText = await response.text()
      } catch (e) {
        errorText = `HTTP error! status: ${response.status}`
      }
      return res.status(response.status).json({ 
        error: errorText || `HTTP error! status: ${response.status}` 
      })
    }

    // Try to parse as JSON, if it fails, return as text
    let data
    const contentType = response.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      try {
        data = await response.json()
      } catch (e) {
        const text = await response.text()
        return res.status(200).json({ response: text })
      }
    } else {
      const text = await response.text()
      try {
        data = JSON.parse(text)
      } catch (e) {
        data = { response: text }
      }
    }

    return res.status(200).json(data)
  } catch (error) {
    console.error('Proxy error:', error)
    return res.status(500).json({ 
      error: error.message || 'Failed to forward request to webhook',
      details: error.stack
    })
  }
}

