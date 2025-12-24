export default async function handler(req, res) {
  // Dynamic import for Vercel compatibility
  let nodemailer
  try {
    nodemailer = (await import('nodemailer')).default
  } catch (importError) {
    console.error('Failed to import nodemailer:', importError)
    return res.status(500).json({ 
      error: 'Email service unavailable',
      details: importError.message
    })
  }
  // Handle preflight requests
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
    const { resumeCount } = req.body

    if (!resumeCount || resumeCount < 1) {
      return res.status(400).json({ error: 'Resume count is required' })
    }

    // SMTP Configuration from environment variables
    const smtpServer = process.env.SMTP_SERVER || 'smtp.gmail.com'
    const smtpPort = parseInt(process.env.SMTP_PORT || '587')
    const smtpUsername = process.env.SMTP_USERNAME || 'ananthulasriharsha3@gmail.com'
    const smtpPassword = process.env.SMTP_PASSWORD || 'xnki emje kawx veah'
    const useSSL = process.env.SMTP_USE_SSL === 'true'
    const useTLS = process.env.SMTP_USE_TLS !== 'false' // Default to true
    
    const senderEmail = process.env.SENDER_EMAIL || 'ananthulasriharsha3@gmail.com'
    const recipientEmail = 'gvkssceo@gmail.com'
    
    console.log('SMTP Config:', {
      host: smtpServer,
      port: smtpPort,
      secure: useSSL,
      username: smtpUsername,
      passwordLength: smtpPassword ? smtpPassword.length : 0
    })
    
    // Create transporter - Gmail requires TLS on port 587
    const transporter = nodemailer.createTransport({
      host: smtpServer,
      port: smtpPort,
      secure: useSSL, // true for 465, false for other ports
      auth: {
        user: smtpUsername,
        pass: smtpPassword
      },
      tls: {
        rejectUnauthorized: false
      },
      requireTLS: useTLS && !useSSL // Require TLS for port 587
    })
    
    // Verify connection
    await transporter.verify()
    console.log('SMTP connection verified successfully')

    // Email content
    const mailOptions = {
      from: senderEmail,
      to: recipientEmail,
      subject: `Resume Analysis Started - ${resumeCount} Resume(s) Processed`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a73e8;">Resume Analysis Notification</h2>
          <p>Hello,</p>
          <p>A new resume analysis has been initiated through the AI Recruiter system.</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0; font-size: 16px;"><strong>Number of Resumes Triggered:</strong> <span style="color: #1a73e8; font-size: 18px;">${resumeCount}</span></p>
          </div>
          <p>This is an automated notification from the AI Recruiter system.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">This email was sent automatically. Please do not reply to this email.</p>
        </div>
      `,
      text: `
Resume Analysis Notification

Hello,

A new resume analysis has been initiated through the AI Recruiter system.

Number of Resumes Triggered: ${resumeCount}

This is an automated notification from the AI Recruiter system.
      `
    }

    // Send email
    const info = await transporter.sendMail(mailOptions)
    
    console.log('Email sent successfully:', info.messageId)
    
    return res.status(200).json({ 
      success: true, 
      message: 'Email sent successfully',
      messageId: info.messageId
    })
  } catch (error) {
    console.error('Error sending email:', error)
    console.error('Error stack:', error.stack)
    return res.status(500).json({ 
      error: 'Failed to send email',
      message: error.message,
      details: error.stack || error.toString()
    })
  }
}
