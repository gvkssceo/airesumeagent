export default async function handler(req, res) {
  console.log('Webhook handler called, method:', req.method)
  
  // Handle preflight requests first
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(200).end()
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  try {
    console.log('Reading request body...')
    console.log('Request readable:', req.readable)
    console.log('Request readableEnded:', req.readableEnded)
    
    let bodyBuffer
    
    // Try to get body if it's already available (some Vercel setups)
    if (req.body) {
      console.log('Body already available in req.body')
      if (Buffer.isBuffer(req.body)) {
        bodyBuffer = req.body
      } else if (typeof req.body === 'string') {
        bodyBuffer = Buffer.from(req.body, 'utf8')
      } else {
        bodyBuffer = Buffer.from(JSON.stringify(req.body), 'utf8')
      }
    } else if (req.readableEnded) {
      console.error('Request already ended, cannot read body')
      return res.status(400).json({ error: 'Request body has already been consumed' })
    } else {
      // Read the raw request body as a buffer
      bodyBuffer = await new Promise((resolve, reject) => {
        const chunks = []
        let hasError = false
        let hasResolved = false
        
        // Set a timeout to avoid hanging
        const timeout = setTimeout(() => {
          if (!hasError && !hasResolved) {
            hasError = true
            reject(new Error('Request body read timeout'))
          }
        }, 30000) // 30 second timeout
        
        // Read from the request stream
        req.on('data', (chunk) => {
          if (!hasError && !hasResolved) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          }
        })
        
        req.on('end', () => {
          if (!hasError && !hasResolved) {
            hasResolved = true
            clearTimeout(timeout)
            const buffer = Buffer.concat(chunks)
            console.log('Body read complete, size:', buffer.length)
            resolve(buffer)
          }
        })
        
        req.on('error', (err) => {
          if (!hasError && !hasResolved) {
            hasError = true
            hasResolved = true
            clearTimeout(timeout)
            console.error('Request stream error:', err)
            reject(err)
          }
        })
        
        // Handle case where stream might be paused
        if (req.isPaused && req.isPaused()) {
          req.resume()
        }
      })
    }

    if (!bodyBuffer || bodyBuffer.length === 0) {
      console.error('Request body is empty')
      return res.status(400).json({ error: 'Request body is empty' })
    }

    // Get content-type to preserve multipart boundary
    const requestContentType = req.headers['content-type'] || 'application/octet-stream'
    console.log('Content-Type:', requestContentType)
    console.log('Body size:', bodyBuffer.length, 'bytes')

    // Forward to n8n webhook with the raw body
    const n8nWebhookUrl = 'https://gvkssjobs.n8n-wsk.com/webhook/d48e6560-289b-450c-a612-d04bb2247440'
    console.log('Forwarding to n8n webhook...')
    
    // Create AbortController for timeout (15 minutes max - longer than frontend timeout)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
      console.log('n8n webhook request timeout after 15 minutes')
    }, 15 * 60 * 1000) // 15 minutes
    
    let response
    try {
      response = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': requestContentType,
        },
        body: bodyBuffer,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError.name === 'AbortError') {
        console.error('n8n webhook request timed out after 15 minutes')
        return res.status(504).json({ 
          error: 'Gateway Timeout: The n8n workflow took longer than 15 minutes to respond. Please check your workflow or try again.',
          timeout: true
        })
      }
      throw fetchError
    }

    console.log('n8n response status:', response.status)

    if (!response.ok) {
      let errorText
      try {
        errorText = await response.text()
        console.error('n8n error response:', errorText)
      } catch (e) {
        console.error('Error reading n8n error response:', e)
        errorText = `HTTP error! status: ${response.status}`
      }
      return res.status(response.status).json({ 
        error: errorText || `HTTP error! status: ${response.status}` 
      })
    }

    // Try to parse as JSON, if it fails, return as text
    let data
    const responseContentType = response.headers.get('content-type') || ''
    console.log('Response Content-Type:', responseContentType)
    
    if (responseContentType.includes('application/json')) {
      try {
        data = await response.json()
        console.log('Successfully parsed JSON response')
      } catch (e) {
        console.error('Error parsing JSON, trying text:', e)
        const text = await response.text()
        return res.status(200).json({ response: text })
      }
    } else {
      const text = await response.text()
      try {
        data = JSON.parse(text)
        console.log('Parsed text as JSON')
      } catch (e) {
        console.log('Response is not JSON, returning as text')
        data = { response: text }
      }
    }

    console.log('Returning success response')
    return res.status(200).json(data)
  } catch (error) {
    console.error('Proxy error:', error)
    console.error('Error stack:', error.stack)
    console.error('Error name:', error.name)
    console.error('Error message:', error.message)
    
    return res.status(500).json({ 
      error: error.message || 'Failed to forward request to webhook',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

