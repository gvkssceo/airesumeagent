import busboy from 'busboy'
import FormData from 'form-data'

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
    // Parse multipart/form-data using busboy
    const bb = busboy({ headers: req.headers })
    const formData = new FormData()
    const fields = {}
    const files = []

    await new Promise((resolve, reject) => {
      bb.on('field', (name, value) => {
        fields[name] = value
      })

      bb.on('file', (name, file, info) => {
        const { filename, encoding, mimeType } = info
        const chunks = []
        
        file.on('data', (chunk) => {
          chunks.push(chunk)
        })

        file.on('end', () => {
          files.push({
            name,
            filename,
            mimeType,
            data: Buffer.concat(chunks)
          })
        })
      })

      bb.on('finish', resolve)
      bb.on('error', reject)
      
      req.pipe(bb)
    })

    // Reconstruct FormData for n8n
    const forwardFormData = new FormData()

    // Add job_description
    if (fields.job_description) {
      forwardFormData.append('job_description', fields.job_description)
    }

    // Add question if provided
    if (fields.question && fields.question.trim()) {
      forwardFormData.append('question', fields.question.trim())
    }

    // Add all files
    files.forEach(file => {
      forwardFormData.append('files[]', file.data, {
        filename: file.filename,
        contentType: file.mimeType || 'application/octet-stream'
      })
    })

    // Forward to n8n webhook
    const n8nWebhookUrl = 'https://gvkssjobs.n8n-wsk.com/webhook/d48e6560-289b-450c-a612-d04bb2247440'
    
    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      body: forwardFormData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      return res.status(response.status).json({ 
        error: errorText || `HTTP error! status: ${response.status}` 
      })
    }

    const data = await response.json()
    return res.status(200).json(data)
  } catch (error) {
    console.error('Proxy error:', error)
    return res.status(500).json({ 
      error: error.message || 'Failed to forward request to webhook' 
    })
  }
}

