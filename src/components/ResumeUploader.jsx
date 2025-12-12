import React, { useState, useRef, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import './ResumeUploader.css'

// Use proxy API route to avoid CORS issues in both development and production
const WEBHOOK_URL = '/api/webhook'

// OpenAI API Configuration
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || ''
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

// Hook to close dropdown when clicking outside
const useClickOutside = (ref, handler) => {
  useEffect(() => {
    const listener = (event) => {
      if (!ref.current || ref.current.contains(event.target)) {
        return
      }
      handler(event)
    }
    document.addEventListener('mousedown', listener)
    document.addEventListener('touchstart', listener)
    return () => {
      document.removeEventListener('mousedown', listener)
      document.removeEventListener('touchstart', listener)
    }
  }, [ref, handler])
}

const ResumeUploader = () => {
  const [resumes, setResumes] = useState([]) // Array of {id, file}
  const [jobDescriptionFile, setJobDescriptionFile] = useState(null)
  const [jobDescriptionText, setJobDescriptionText] = useState('')
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState(null) // { current: 1, total: 5, question: "...", resume: "..." }
  const [response, setResponse] = useState(null)
  const [error, setError] = useState(null)
  const [dragOverResume, setDragOverResume] = useState(false)
  const [dragOverJobDesc, setDragOverJobDesc] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [scoreFilter, setScoreFilter] = useState('all') // 'all', '50', '70', '80', '90'
  const [preScoreFilter, setPreScoreFilter] = useState('all') // Pre-submission filter selection
  const [showQuestionDropdown, setShowQuestionDropdown] = useState(false)
  const [selectedResumeIds, setSelectedResumeIds] = useState([]) // Selected resume IDs for Smart Recruiter AI
  const [smartRecruiterQuestion, setSmartRecruiterQuestion] = useState('')
  const [smartRecruiterResponse, setSmartRecruiterResponse] = useState(null)
  const [smartRecruiterLoading, setSmartRecruiterLoading] = useState(false)
  const [showSmartRecruiterChat, setShowSmartRecruiterChat] = useState(false) // Toggle chat visibility
  const resumeInputRef = useRef(null)
  const jobDescInputRef = useRef(null)
  const questionDropdownRef = useRef(null)

  // Close dropdown when clicking outside
  useClickOutside(questionDropdownRef, () => {
    setShowQuestionDropdown(false)
  })

  const RESUMES_PER_PAGE = 5

  const handleResumeChange = (e) => {
    const files = Array.from(e.target.files)
    if (files.length > 0) {
      const newResumes = files.map((file, index) => ({
        id: `res${Date.now()}-${index}`,
        file: file
      }))
      setResumes(prev => [...prev, ...newResumes])
      setError(null)
      // Reset file input to allow selecting the same file again
      e.target.value = ''
    }
  }

  const handleResumeDrop = (e) => {
    e.preventDefault()
    setDragOverResume(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      const newResumes = files.map((file, index) => ({
        id: `res${Date.now()}-${index}`,
        file: file
      }))
      setResumes(prev => [...prev, ...newResumes])
      setError(null)
    }
  }

  const handleJobDescriptionDrop = (e) => {
    e.preventDefault()
    setDragOverJobDesc(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      setJobDescriptionFile(file)
      setError(null)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  const handleResumeDragEnter = (e) => {
    e.preventDefault()
    setDragOverResume(true)
  }

  const handleResumeDragLeave = (e) => {
    e.preventDefault()
    setDragOverResume(false)
  }

  const handleJobDescDragEnter = (e) => {
    e.preventDefault()
    setDragOverJobDesc(true)
  }

  const handleJobDescDragLeave = (e) => {
    e.preventDefault()
    setDragOverJobDesc(false)
  }

  const handleChooseResumeFiles = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (resumeInputRef.current) {
      resumeInputRef.current.click()
    }
  }

  const handleChooseJobDescFile = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (jobDescInputRef.current) {
      jobDescInputRef.current.click()
    }
  }

  const handleRemoveResume = (id) => {
    setResumes(prev => {
      const newResumes = prev.filter(resume => resume.id !== id)
      // Adjust current page if needed after removal
      const totalPages = Math.ceil(newResumes.length / RESUMES_PER_PAGE)
      if (currentPage > totalPages && totalPages > 0) {
        setCurrentPage(totalPages)
      }
      return newResumes
    })
  }

  const handleRemoveJobDescription = () => {
    setJobDescriptionFile(null)
    setError(null)
    // Reset file input
    if (jobDescInputRef.current) {
      jobDescInputRef.current.value = ''
    }
  }

  const handleJobDescriptionFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setJobDescriptionFile(file)
      setError(null)
    }
  }

  const handleJobDescriptionTextChange = (e) => {
    setJobDescriptionText(e.target.value)
    setError(null)
  }

  const handleQuestionChange = (e) => {
    setQuestion(e.target.value)
    setError(null)
  }

  // Helper function to append a question to existing questions
  const appendQuestion = (newQuestion) => {
    setQuestion(prev => {
      const trimmedPrev = prev ? prev.trim() : ''
      const trimmedNew = newQuestion ? newQuestion.trim() : ''
      
      // If no existing question, just set the new one
      if (!trimmedPrev) {
        return trimmedNew
      }
      
      // Split existing questions by newlines
      const existingQuestions = trimmedPrev.split('\n').filter(q => q.trim().length > 0)
      
      // Check if the question already exists (case-insensitive, ignoring punctuation)
      const questionExists = existingQuestions.some(existing => {
        const normalizedExisting = existing.trim().toLowerCase().replace(/[?.!;:]/g, '')
        const normalizedNew = trimmedNew.toLowerCase().replace(/[?.!;:]/g, '')
        return normalizedExisting === normalizedNew
      })
      
      // If question already exists, don't add it again
      if (questionExists) {
        return prev // Return unchanged
      }
      
      // Append the new question on a new line
      return trimmedPrev + '\n' + trimmedNew
    })
    setError(null)
  }

  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = (e) => reject(e)
      reader.readAsText(file)
    })
  }

  // Helper function to parse and normalize response data
  const parseResponseData = (item) => {
    let normalizedData = { ...item }
    
    // Handle new structure where answer is nested
    if (item.question && item.answer && typeof item.answer === 'object') {
      // Merge answer data, but prioritize top-level fields
      normalizedData = {
        ...item.answer,
        ...normalizedData,
        // Keep top-level values
        candidate_name: normalizedData.candidate_name || item.answer.candidate_name,
        resume_file: normalizedData.resume_file || item.answer.resume_file,
        processed_at: normalizedData.processed_at || item.answer.processed_at,
        question: normalizedData.question || item.question || item.answer.question
      }
    }
    
    // Parse "text" field if it exists (it might contain JSON string)
    // Only use it if we're missing key fields
    if (normalizedData.text && typeof normalizedData.text === 'string') {
      // Only parse if we're missing important fields
      if (!normalizedData.q1_answer && !normalizedData.q1_question && !normalizedData.q1_explanation) {
        try {
          const parsedText = JSON.parse(normalizedData.text)
          // Merge parsed data, but keep existing values (prioritize direct fields)
          normalizedData = {
            ...parsedText,
            ...normalizedData,
            // Keep original values if they exist (they take priority)
            candidate_name: normalizedData.candidate_name || parsedText.candidate_name,
            processed_at: normalizedData.processed_at || parsedText.processed_at,
            question: normalizedData.question || parsedText.question || parsedText.q1_question
          }
        } catch (e) {
          // If parsing fails, ignore the text field
          console.warn('Failed to parse text field:', e)
        }
      }
    }
    
    // Extract score from q1_answer if it contains "Score: X" or just a number
    let extractedScore = null
    if (normalizedData.q1_answer && typeof normalizedData.q1_answer === 'string') {
      // Try pattern "Score: X" first
      let scoreMatch = normalizedData.q1_answer.match(/Score:\s*(\d+)/i)
      if (scoreMatch) {
        extractedScore = scoreMatch[1]
      } else {
        // If question is about score, try to extract just a number
        const questionText = normalizedData.question || normalizedData.q1_question || ''
        if (/score/i.test(questionText)) {
          const numberMatch = normalizedData.q1_answer.trim().match(/^(\d+)$/)
          if (numberMatch) {
            const potentialScore = parseInt(numberMatch[1], 10)
            // Only accept if it's a reasonable score (0-100)
            if (potentialScore >= 0 && potentialScore <= 100) {
              extractedScore = String(potentialScore)
            }
          }
        }
      }
    }
    
    // Ensure string values are actually strings, not objects
    const ensureString = (value) => {
      if (typeof value === 'string') return value
      if (value === null || value === undefined) return value
      if (typeof value === 'object') {
        // If it's an object, convert to formatted JSON string
        try {
          return JSON.stringify(value, null, 2)
        } catch {
          return String(value)
        }
      }
      return String(value)
    }

    return {
      candidate_name: normalizedData.candidate_name,
      resume_file: normalizedData.resume_file,
      processed_at: normalizedData.processed_at,
      question: ensureString(normalizedData.question || normalizedData.q1_question),
      q1_question: ensureString(normalizedData.q1_question || normalizedData.question),
      q1_answer: normalizedData.q1_answer, // Keep as-is, will be handled in rendering
      q1_explanation: normalizedData.q1_explanation, // Keep as-is, will be handled in rendering
      extractedScore: extractedScore,
      error: normalizedData.error
    }
  }

  // Helper function to safely convert any value to string for rendering
  const safeToString = (value) => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (typeof value === 'object') {
      // If it's an object, try to format it nicely
      try {
        // Check if it's an array
        if (Array.isArray(value)) {
          return value.map(item => safeToString(item)).join('\n')
        }
        
        // If it looks like a score breakdown object, format it nicely
        const keys = Object.keys(value)
        if (keys.length > 0 && (keys.includes('Skills & IT Tools') || keys.some(k => k.includes('Match') || k.includes('Experience')))) {
          // Format as key-value pairs
          return keys.map(key => `${key}: ${safeToString(value[key])}`).join('\n')
        }
        
        // If it has a toString method, use it
        if (typeof value.toString === 'function' && value.toString() !== '[object Object]') {
          return value.toString()
        }
        
        // Otherwise, format as JSON with proper formatting
        return JSON.stringify(value, null, 2)
      } catch (e) {
        return String(value)
      }
    }
    return String(value)
  }

  // Helper function to extract and format answer text
  const extractAnswerText = (answerText) => {
    // First convert to string if it's an object
    const textValue = safeToString(answerText)
    if (!textValue || typeof textValue !== 'string') return textValue
    
    // Remove "Score: X, " prefix if present
    let text = textValue.replace(/^Score:\s*\d+[,\s]*/i, '').trim()
    
    // Clean up any leading/trailing punctuation
    text = text.replace(/^[,\s;]+|[,\s;]+$/g, '').trim()
    
    return text
  }

  // Helper function to format answer text with better structure
  const formatAnswerText = (answerText) => {
    if (!answerText || typeof answerText !== 'string') return answerText
    
    // Replace semicolons with line breaks for better readability
    let formatted = answerText.replace(/;\s*/g, ';\n\n')
    
    // Add line breaks after colons in key-value pairs
    formatted = formatted.replace(/:\s*([^,;]+)([,;])/g, ':\n$1$2')
    
    return formatted
  }

  // Helper function to convert Markdown bold syntax (**text**) to HTML and render it
  const renderMarkdownText = (text) => {
    if (!text || typeof text !== 'string') return text
    
    // Convert **text** to <strong>text</strong>
    // Match **text** but not ***text*** (triple asterisks) or more
    let html = text.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    
    // Convert newlines to <br /> tags
    html = html.replace(/\n/g, '<br />')
    
    // Return JSX with dangerouslySetInnerHTML to render the HTML
    return <span dangerouslySetInnerHTML={{ __html: html }} />
  }

  // Helper function to parse questions from string or array
  const parseQuestions = (questions) => {
    let questionList = []

    // Parse questions - can be array or newline-separated string
    if (Array.isArray(questions)) {
      questionList = questions.filter(q => q && q.trim().length > 0)
    } else if (typeof questions === 'string') {
      // First split by newlines
      let lines = questions.split('\n').map(q => q.trim()).filter(q => q.length > 0)
      
      questionList = []
      lines.forEach(line => {
        // Check if line contains multiple questions separated by "?," pattern
        // Example: "Question 1?, Question 2?"
        if (line.includes('?') && line.match(/\?\s*[,;]\s*/)) {
          // Split by question mark followed by comma/semicolon and optional whitespace
          const parts = line.split(/\?\s*[,;]\s*/)
          parts.forEach((part, index) => {
            let trimmed = part.trim()
            if (trimmed.length > 0) {
              // Add question mark to each part
              if (!trimmed.endsWith('?')) {
                trimmed += '?'
              }
              questionList.push(trimmed)
            }
          })
        } else {
          // Single question on this line (or already properly formatted)
          questionList.push(line)
        }
      })
    }
    
    // Final cleanup - remove empty questions and trim whitespace
    questionList = questionList.map(q => q.trim()).filter(q => q.length > 0)
    
    return questionList
  }

  // Function to send multiple questions to n8n webhook
  const sendMultipleQuestions = async (file, jobDescription, questions, onProgress) => {
    const questionList = parseQuestions(questions)

    // If no valid questions, return empty array
    if (questionList.length === 0) {
      return []
    }

    const results = []
    const totalQuestions = questionList.length

    // Send one request per question
    for (let i = 0; i < questionList.length; i++) {
      const q = questionList[i]
      
      // Update progress
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: totalQuestions,
          question: q,
          resume: file.name
        })
      }

      let timeoutId = null
      try {
        const formData = new FormData()
        formData.append('file0', file)
        formData.append('job_description', jobDescription)
        formData.append('question', q)

        // Log request details for debugging
        console.log(`[Webhook Request ${i + 1}/${totalQuestions}] Sending request for question:`, q.substring(0, 50) + '...')
        console.log(`[Webhook Request ${i + 1}/${totalQuestions}] File:`, file.name, `Size:`, file.size, 'bytes')

        // Create abort controller for timeout (10 minutes max per request)
        const controller = new AbortController()
        timeoutId = setTimeout(() => {
          console.warn(`[Webhook Request ${i + 1}/${totalQuestions}] Request timeout after 10 minutes`)
          controller.abort()
        }, 10 * 60 * 1000) // 10 minutes

        const startTime = Date.now()
        const res = await fetch(WEBHOOK_URL, {
          method: 'POST',
          body: formData,
          signal: controller.signal
        })
        const duration = ((Date.now() - startTime) / 1000).toFixed(2)
        console.log(`[Webhook Request ${i + 1}/${totalQuestions}] Response received in ${duration}s, status:`, res.status)
        
        if (timeoutId) clearTimeout(timeoutId)
        timeoutId = null

        if (!res.ok) {
          let errorMessage = `HTTP error! status: ${res.status}`
          try {
            const errorText = await res.text()
            try {
              const errorJson = JSON.parse(errorText)
              errorMessage = errorJson.message || errorJson.error || errorText
            } catch {
              errorMessage = errorText || errorMessage
            }
          } catch (parseErr) {
            errorMessage = `Server error (${res.status}). Please check your n8n workflow configuration.`
          }
          throw new Error(errorMessage)
        }

        // Parse response as JSON
        let json
        try {
          const responseText = await res.text()
          try {
            json = JSON.parse(responseText)
            
            // Handle array responses - take the first item or merge all
            if (Array.isArray(json) && json.length > 0) {
              // If array has one item, use it directly; otherwise merge or take first
              if (json.length === 1) {
                json = json[0]
              } else {
                // Multiple items in array - use the first one (or merge all)
                json = json[0]
              }
            }
          } catch (e) {
            json = { response: responseText }
          }
        } catch (e) {
          json = { error: 'Failed to parse response from server' }
        }

        results.push({
          question: q,
          answer: json
        })
      } catch (err) {
        // Clean up timeout if it exists
        if (timeoutId) clearTimeout(timeoutId)
        
        // Handle different types of errors
        let errorMessage = 'Failed to get response for this question'
        
        if (err.name === 'AbortError') {
          errorMessage = 'Request timeout: The workflow took longer than 10 minutes to respond. Please check your n8n workflow or try again with fewer questions.'
        } else if (err.message) {
          errorMessage = err.message
        }
        
        // If a question fails, still add it to results with error
        results.push({
          question: q,
          answer: { error: errorMessage }
        })
      }
    }

    return results
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Prevent duplicate submissions
    if (loading) {
      console.warn('Submission already in progress, ignoring duplicate request')
      return
    }
    
    setError(null)
    setResponse(null)

    if (resumes.length === 0) {
      setError('Please select at least one resume file')
      return
    }

    if (!jobDescriptionFile) {
      setError('Please provide a job description file')
      return
    }

    if (!question || !question.trim()) {
      setError('Please enter at least one question')
      return
    }

    setLoading(true)
    setLoadingProgress(null)
    
    console.log('=== Starting Analysis ===')
    console.log('Resumes:', resumes.length)
    console.log('Job Description:', jobDescriptionFile.name)

    try {
      // Read job description from file
      const jobDescription = await readFileAsText(jobDescriptionFile)

      // Parse questions to get total count (using same logic as sendMultipleQuestions)
      const questionList = parseQuestions(question)
      const totalQuestions = questionList.length
      const totalOperations = resumes.length * totalQuestions
      let currentOperation = 0

      // Process all resumes and questions
      const allResults = []

      // Process each resume file separately
      for (let resumeIndex = 0; resumeIndex < resumes.length; resumeIndex++) {
        const resume = resumes[resumeIndex]
        
        // Send all questions for this resume
        const questionResults = await sendMultipleQuestions(
          resume.file,
          jobDescription,
          question,
          (progress) => {
            // Calculate overall progress across all resumes
            currentOperation = (resumeIndex * totalQuestions) + progress.current
            setLoadingProgress({
              current: currentOperation,
              total: totalOperations,
              question: progress.question,
              resume: progress.resume
            })
          }
        )

        // Add resume info to each result
        questionResults.forEach(result => {
          // If answer is already an array (direct response from n8n), flatten it
          if (Array.isArray(result.answer)) {
            result.answer.forEach(item => {
              allResults.push({
                candidate_name: resume.file.name.replace(/\.[^/.]+$/, '') || item.candidate_name,
                resume_file: resume.file.name,
                resume_id: resume.id,
                question: result.question || item.question || item.q1_question,
                ...item
              })
            })
          } else {
            // Normal structure
            allResults.push({
              candidate_name: resume.file.name.replace(/\.[^/.]+$/, '') || result.answer?.candidate_name,
              resume_file: resume.file.name,
              resume_id: resume.id,
              ...result
            })
          }
        })
      }

      // Clear progress
      setLoadingProgress(null)

      // Set response with all results
      setResponse(allResults)
      
      // Apply the pre-selected score filter to results filter
      if (preScoreFilter !== 'all') {
        setScoreFilter(preScoreFilter)
      }
      
      console.log('=== Analysis Complete ===')
      console.log('Total results:', allResults.length)
      console.log('Successful:', allResults.filter(r => !r.answer?.error).length)
      console.log('Failed:', allResults.filter(r => r.answer?.error).length)
      
      if (allResults.length > 0) {
        const successCount = allResults.filter(r => !r.answer?.error).length
        const failCount = allResults.filter(r => r.answer?.error).length
        if (failCount > 0) {
          alert(`Processed ${allResults.length} question(s). ${successCount} succeeded, ${failCount} failed. Check the results for details.`)
        } else {
          alert(`Successfully processed ${allResults.length} question(s)!`)
        }
      }
    } catch (err) {
      let errorMessage = err.message || 'Failed to send data to webhook. Please try again.'
      
      // Provide helpful message for common n8n errors
      if (errorMessage.includes('Unused Respond to Webhook')) {
        errorMessage = 'Workflow Error: The n8n workflow has an unused "Respond to Webhook" node. Please check your workflow configuration and ensure the Respond to Webhook node is properly connected in your n8n workflow.'
      }
      
      setError(errorMessage)
      console.error('Error:', err)
    } finally {
      setLoading(false)
      setLoadingProgress(null)
    }
  }

  const handleDownloadExcel = () => {
    if (!response) return

    try {
      let rawData = []

      // Handle different response structures
      if (Array.isArray(response)) {
        // If response is an array, use it directly - each item should be one question
        rawData = response
        console.log(`[Excel Export] Processing ${rawData.length} items for export`)
      } else if (response.data && Array.isArray(response.data)) {
        // If response has a data property that's an array
        rawData = response.data
      } else if (typeof response === 'object') {
        // If response is an object, convert it to array format
        rawData = [response]
      } else {
        // If response is a primitive, wrap it
        rawData = [{ value: response }]
      }

      // Create Excel rows - one row per question
      const dataToExport = []
      
      rawData.forEach((item, index) => {
        console.log(`[Excel] Processing item ${index + 1}:`, {
          hasQuestion: !!item.question,
          hasAnswer: !!item.answer,
          answerType: typeof item.answer,
          answerIsArray: Array.isArray(item.answer),
          keys: Object.keys(item),
          itemPreview: JSON.stringify(item).substring(0, 200)
        })
        
        // Parse the response item - this handles nested structures
        const data = parseResponseData(item)
        
        console.log(`[Excel] Parsed data:`, {
          question: data.question,
          q1Question: data.q1_question,
          hasQ1Answer: !!data.q1_answer,
          hasQ1Explanation: !!data.q1_explanation,
          candidateName: data.candidate_name,
          resumeFile: data.resume_file
        })
        
        // Get question - prioritize item.question (the actual question asked)
        const questionText = item.question || data.question || data.q1_question || `Question ${index + 1}`
        
        // Get answer - check multiple sources
        let answer = data.q1_answer
        if (!answer && item.answer) {
          if (typeof item.answer === 'object' && !Array.isArray(item.answer)) {
            answer = item.answer.q1_answer || item.answer.answer
          } else if (typeof item.answer === 'string') {
            answer = item.answer
          }
        }
        
        // Get explanation - check multiple sources
        let explanation = data.q1_explanation
        if (!explanation && item.answer && typeof item.answer === 'object' && !Array.isArray(item.answer)) {
          explanation = item.answer.q1_explanation || item.answer.explanation
        }
        
        // Convert to strings
        const answerStr = answer ? safeToString(answer) : ''
        const explanationStr = explanation ? safeToString(explanation) : ''
        
        // Extract score if present
        let extractedScore = null
        let finalAnswer = answerStr
        if (answerStr) {
          const scoreMatch = answerStr.match(/Score:\s*(\d+)/i)
          if (scoreMatch) {
            extractedScore = scoreMatch[1]
            finalAnswer = extractedScore // Use just the score for Answer column
          }
        }
        
        // Create row data
        const row = {
          'Candidate Name': data.candidate_name || (data.resume_file ? data.resume_file.replace(/\.[^/.]+$/, '') : '') || 'Unknown',
          'Resume File': data.resume_file ? data.resume_file.replace(/\.[^/.]+$/, '') : (data.candidate_name || '') || 'Unknown',
          'Criteria': safeToString(questionText),
          'Score': finalAnswer || 'Not provided',
          'Remark': explanationStr || ''
        }
        
        // Add row
        dataToExport.push(row)
        console.log(`[Excel] Added row ${dataToExport.length}:`, {
          Criteria: row['Criteria'].substring(0, 50),
          Score: row['Score'].substring(0, 30),
          Remark: row['Remark'].substring(0, 30)
        })
      })
      
      console.log(`[Excel Export] Total rows: ${dataToExport.length}`)
      
      // Log summary of what will be exported
      if (dataToExport.length > 0) {
        console.log(`[Excel Export] Summary:`, {
          totalRows: dataToExport.length,
          uniqueCriteria: [...new Set(dataToExport.map(r => r['Criteria']))].length,
          sampleCriteria: dataToExport.slice(0, 3).map(r => ({
            Criteria: r['Criteria'].substring(0, 50),
            HasScore: !!r['Score'],
            HasRemark: !!r['Remark']
          }))
        })
      } else {
        console.warn(`[Excel Export] No data to export! rawData had ${rawData.length} items`)
      }

      // Create workbook and worksheet
      const ws = XLSX.utils.json_to_sheet(dataToExport)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Response Data')

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
      const filename = `webhook-response-${timestamp}.xlsx`

      // Download the file
      XLSX.writeFile(wb, filename)
    } catch (err) {
      console.error('Error exporting to Excel:', err)
      setError('Failed to export to Excel. Please try again.')
    }
  }

  const handleReset = () => {
    setResumes([])
    setJobDescriptionFile(null)
    setJobDescriptionText('')
    setQuestion('')
    setResponse(null)
    setError(null)
    setCurrentPage(1)
    setPreScoreFilter('all')
    setScoreFilter('all')
    setSelectedResumeIds([])
    setSmartRecruiterQuestion('')
    setSmartRecruiterResponse(null)
    setShowSmartRecruiterChat(false)
    // Reset file inputs
    document.getElementById('resume-input').value = ''
    document.getElementById('job-desc-input').value = ''
  }

  // Call OpenAI API with question and webhook data
  const callOpenAI = async (question, webhookData, resumeName) => {
    // List of models to try in order of preference
    const modelsToTry = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo']
    let lastError = null

    // Format webhook data for the prompt
    let webhookDataText = `Resume Analysis Results for ${resumeName}:\n\n`
    
    if (Array.isArray(webhookData) && webhookData.length > 0) {
      webhookData.forEach((item, index) => {
        const data = parseResponseData(item)
        webhookDataText += `Question ${index + 1}: ${data.question || data.q1_question || 'N/A'}\n`
        webhookDataText += `Answer: ${safeToString(data.q1_answer || data.answer || 'N/A')}\n`
        if (data.q1_explanation || data.explanation) {
          webhookDataText += `Explanation: ${safeToString(data.q1_explanation || data.explanation)}\n`
        }
        if (data.extractedScore) {
          webhookDataText += `Score: ${data.extractedScore}\n`
        }
        webhookDataText += '\n'
      })
    } else if (webhookData && typeof webhookData === 'object') {
      const data = parseResponseData(webhookData)
      webhookDataText += `Question: ${data.question || data.q1_question || 'N/A'}\n`
      webhookDataText += `Answer: ${safeToString(data.q1_answer || data.answer || 'N/A')}\n`
      if (data.q1_explanation || data.explanation) {
        webhookDataText += `Explanation: ${safeToString(data.q1_explanation || data.explanation)}\n`
      }
      if (data.extractedScore) {
        webhookDataText += `Score: ${data.extractedScore}\n`
      }
    }

    // Normalize "Nice-to-Have Skills" to "Soft Skills / Inter Personal Skills"
    webhookDataText = webhookDataText.replace(/Nice-to-Have Skills/gi, 'Soft Skills / Inter Personal Skills')
    webhookDataText = webhookDataText.replace(/Nice to Have Skills/gi, 'Soft Skills / Inter Personal Skills')

    const prompt = `You are a smart recruiter AI assistant. Based on the following resume analysis results from a webhook, answer the user's question.

${webhookDataText}

User Question: ${question}

Please provide a clear, detailed, and helpful answer based on the analysis results above. When referring to scoring criteria, use "Soft Skills / Inter Personal Skills" instead of "Nice-to-Have Skills".`

    console.log('Calling OpenAI API...')
    console.log('Prompt length:', prompt.length)

    // Try each model until one works
    for (const model of modelsToTry) {
      try {
        console.log(`Trying model: ${model}`)
        
        const response = await fetch(OPENAI_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'system',
                content: 'You are a helpful AI assistant that analyzes resume evaluation results and provides insights to recruiters.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 1000
          })
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }))
          const errorMessage = errorData.error?.message || `OpenAI API error: ${response.status}`
          
          // If it's a model access error, try the next model
          if (errorMessage.includes('does not have access to model') || errorMessage.includes('model_not_found')) {
            console.warn(`Model ${model} not available:`, errorMessage)
            lastError = new Error(errorMessage)
            continue // Try next model
          }
          
          // For other errors, throw immediately
          throw new Error(errorMessage)
        }

        const data = await response.json()
        const aiResponse = data.choices?.[0]?.message?.content || 'No response from AI'

        console.log(`OpenAI response received using model ${model}:`, aiResponse.substring(0, 100))

        return aiResponse
      } catch (err) {
        // If it's a model access error, try the next model
        if (err.message && (err.message.includes('does not have access to model') || err.message.includes('model_not_found'))) {
          console.warn(`Model ${model} failed:`, err.message)
          lastError = err
          continue // Try next model
        }
        
        // For other errors, throw immediately
        console.error('OpenAI API error:', err)
        throw err
      }
    }

    // If we get here, all models failed
    const errorMessage = lastError?.message || 'All models failed'
    throw new Error(`Unable to access any OpenAI model. Last error: ${errorMessage}. Please check your OpenAI API key and project settings to ensure access to at least one model (gpt-4o-mini, gpt-4o, gpt-4-turbo, gpt-4, or gpt-3.5-turbo).`)
  }

  // Handle Smart Recruiter AI question submission
  const handleAskSmartRecruiter = async (e) => {
    e.preventDefault()
    
    if (selectedResumeIds.length === 0) {
      setError('Please select at least one resume to ask a question about')
      return
    }

    if (!smartRecruiterQuestion || !smartRecruiterQuestion.trim()) {
      setError('Please enter a question')
      return
    }

    if (!response || !Array.isArray(response)) {
      setError('No analysis results available. Please run the initial analysis first.')
      setSmartRecruiterLoading(false)
      return
    }

    setSmartRecruiterLoading(true)
    setError(null)

    try {
      console.log('=== Ask Smart Recruiter AI Started ===')
      console.log('Selected Resume IDs:', selectedResumeIds)
      console.log('Question:', smartRecruiterQuestion)

      // Get webhook response data for selected resumes
      const allResults = []
      
      for (let resumeIndex = 0; resumeIndex < selectedResumeIds.length; resumeIndex++) {
        const resumeId = selectedResumeIds[resumeIndex]
        
        // Find the resume file
        const resume = resumes.find(r => r.id === resumeId)
        if (!resume) {
          console.warn(`Resume with ID ${resumeId} not found`)
          continue
        }

        const resumeName = resume.file.name.replace(/\.[^/.]+$/, '')
        
        // Get all webhook responses for this resume
        const resumeWebhookData = response.filter(item => {
          const data = parseResponseData(item)
          const itemResumeId = data.resume_id
          const itemFileName = data.resume_file ? data.resume_file.replace(/\.[^/.]+$/, '') : ''
          const resumeFileName = resume.file.name.replace(/\.[^/.]+$/, '')
          
          return itemResumeId === resumeId || 
                 itemFileName.toLowerCase() === resumeFileName.toLowerCase()
        })

        console.log(`Found ${resumeWebhookData.length} webhook response(s) for resume: ${resumeName}`)

        if (resumeWebhookData.length === 0) {
          console.warn(`No webhook data found for resume: ${resumeName}`)
          allResults.push({
            candidate_name: resumeName,
            resume_file: resume.file.name,
            resume_id: resumeId,
            question: smartRecruiterQuestion,
            answer: 'No analysis data available for this resume. Please ensure the initial analysis has been completed.',
            error: 'No webhook data'
          })
          continue
        }

        // Update loading progress
        setLoadingProgress({
          current: resumeIndex + 1,
          total: selectedResumeIds.length,
          question: smartRecruiterQuestion,
          resume: resumeName
        })

        // Call OpenAI API with question and webhook data
        const aiResponse = await callOpenAI(smartRecruiterQuestion, resumeWebhookData, resumeName)

        allResults.push({
          candidate_name: resumeName,
          resume_file: resume.file.name,
          resume_id: resumeId,
          question: smartRecruiterQuestion,
          answer: aiResponse,
          ai_generated: true
        })
      }

      setLoadingProgress(null)
      setSmartRecruiterResponse(allResults)
      setSmartRecruiterLoading(false)
      
      console.log('=== Smart Recruiter AI Complete ===')
      console.log('Total results:', allResults.length)
      
    } catch (err) {
      console.error('Error asking Smart Recruiter AI:', err)
      setError(err.message || 'Failed to get response from Smart Recruiter AI')
      setSmartRecruiterLoading(false)
      setLoadingProgress(null)
    }
  }

  // Handle checkbox selection
  const handleResumeSelection = (resumeId, isChecked) => {
    if (isChecked) {
      setSelectedResumeIds(prev => [...prev, resumeId])
    } else {
      setSelectedResumeIds(prev => prev.filter(id => id !== resumeId))
    }
  }

  // Get resume ID from resume group
  const getResumeIdFromResumeGroup = (resumeGroup) => {
    // First try to use the stored resume_id
    if (resumeGroup.resumeId) {
      return resumeGroup.resumeId
    }
    
    // Fallback: Try to match by resume file name
    if (resumeGroup.resumeFile) {
      const fileName = resumeGroup.resumeFile.replace(/\.[^/.]+$/, '')
      const resume = resumes.find(r => {
        const resumeFileName = r.file.name.replace(/\.[^/.]+$/, '')
        return resumeFileName.toLowerCase() === fileName.toLowerCase()
      })
      if (resume) return resume.id
    }
    
    // Fallback: Try to match by resume name
    if (resumeGroup.resumeName) {
      const resume = resumes.find(r => {
        const resumeFileName = r.file.name.replace(/\.[^/.]+$/, '')
        return resumeFileName.toLowerCase() === resumeGroup.resumeName.toLowerCase()
      })
      if (resume) return resume.id
    }
    
    return null
  }

  // Calculate pagination
  const totalPages = Math.ceil(resumes.length / RESUMES_PER_PAGE)
  const startIndex = (currentPage - 1) * RESUMES_PER_PAGE
  const endIndex = startIndex + RESUMES_PER_PAGE
  const currentResumes = resumes.slice(startIndex, endIndex)

  // Reset to page 1 when resumes are added and current page becomes invalid
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1)
    }
  }, [resumes.length, currentPage, totalPages])

  // Helper function to extract score from a resume group
  const getResumeScore = (resumeGroup) => {
    // Look for score in any question's extractedScore or answer
    for (const qa of resumeGroup.questions) {
      if (qa.extractedScore) {
        return parseInt(qa.extractedScore, 10)
      }
      if (qa.answer) {
        const answerStr = safeToString(qa.answer)
        
        // Try pattern "Score: X" first
        let scoreMatch = answerStr.match(/Score:\s*(\d+)/i)
        if (scoreMatch) {
          return parseInt(scoreMatch[1], 10)
        }
        
        // If the question is about score and answer is just a number, use it
        if (qa.question && /score/i.test(qa.question)) {
          // Trim and check if answer is just a number (like "90" or "90%")
          const trimmedAnswer = answerStr.trim()
          // Match standalone number or number with % at the end
          const numberMatch = trimmedAnswer.match(/^(\d+)\s*%?$/)
          if (numberMatch) {
            const potentialScore = parseInt(numberMatch[1], 10)
            // Only accept if it's a reasonable score (0-100)
            if (potentialScore >= 0 && potentialScore <= 100) {
              return potentialScore
            }
          }
        }
      }
    }
    return null
  }

  // Filter resumes based on score threshold
  const filterResumesByScore = (groupedResumes, threshold) => {
    if (threshold === 'all') {
      return groupedResumes
    }
    const minScore = parseInt(threshold, 10)
    return groupedResumes.filter(resumeGroup => {
      const score = getResumeScore(resumeGroup)
      return score !== null && score >= minScore
    })
  }

  // Group responses by resume - memoized to avoid recalculation
  const groupedResumes = useMemo(() => {
    if (!response || !Array.isArray(response)) {
      return []
    }

    const groupedByResume = {}
    
    response.forEach((item, index) => {
      const data = parseResponseData(item)
      
      // Create a consistent key for grouping (normalize filename)
      let resumeKey = data.resume_file || data.candidate_name
      if (resumeKey) {
        resumeKey = resumeKey.replace(/\.[^/.]+$/, '').toLowerCase().trim()
      } else {
        resumeKey = `resume-${index}`
      }
      
      const resumeName = data.candidate_name || (data.resume_file ? data.resume_file.replace(/\.[^/.]+$/, '') : `Resume ${index + 1}`)
      
      if (!groupedByResume[resumeKey]) {
        groupedByResume[resumeKey] = {
          resumeName: resumeName,
          resumeFile: data.resume_file,
          resumeId: data.resume_id, // Store resume ID from response
          processedAt: data.processed_at,
          questions: []
        }
      }
      
      // If resume_id is available but not stored yet, update it
      if (data.resume_id && !groupedByResume[resumeKey].resumeId) {
        groupedByResume[resumeKey].resumeId = data.resume_id
      }
      
      if (data.processed_at && (!groupedByResume[resumeKey].processedAt || 
          new Date(data.processed_at) < new Date(groupedByResume[resumeKey].processedAt))) {
        groupedByResume[resumeKey].processedAt = data.processed_at
      }
      
      groupedByResume[resumeKey].questions.push({
        question: data.question || data.q1_question,
        answer: data.q1_answer,
        explanation: data.q1_explanation,
        extractedScore: data.extractedScore,
        error: data.error,
        processedAt: data.processed_at
      })
    })
    
    return Object.values(groupedByResume)
  }, [response])

  // Filter resumes based on score threshold - memoized
  const filteredResumes = useMemo(() => {
    // Use preScoreFilter if set, otherwise use scoreFilter
    const activeFilter = preScoreFilter !== 'all' ? preScoreFilter : scoreFilter
    if (activeFilter === 'all') {
      return groupedResumes
    }
    const minScore = parseInt(activeFilter, 10)
    return groupedResumes.filter(resumeGroup => {
      const score = getResumeScore(resumeGroup)
      return score !== null && score >= minScore
    })
  }, [groupedResumes, preScoreFilter, scoreFilter])

  return (
    <div className="resume-uploader">
      <form onSubmit={handleSubmit} className="upload-form">
        <div className="upload-sections">
          {/* Candidate Resumes Section */}
          <div className="upload-section">
            <h3 className="section-title">Candidate Resumes</h3>
            <div 
              className={`drop-zone ${dragOverResume ? 'drag-over' : ''}`}
              onDrop={handleResumeDrop}
              onDragOver={handleDragOver}
              onDragEnter={handleResumeDragEnter}
              onDragLeave={handleResumeDragLeave}
            >
              <input
                type="file"
                id="resume-input"
                ref={resumeInputRef}
                accept=".pdf,.doc,.docx,.txt"
                onChange={handleResumeChange}
                className="file-input"
                multiple
                required={resumes.length === 0}
              />
              <label htmlFor="resume-input" className="drop-zone-label">
                <button type="button" className="choose-files-button" onClick={handleChooseResumeFiles}>Choose Files</button>
                <span className="file-chosen-text">
                  {resumes.length > 0 ? `${resumes.length} file(s) chosen` : '(No file chosen)'}
                </span>
              </label>
              <p className="drop-zone-hint">*Drag and drop files here, or click to browse.</p>
            </div>
            {resumes.length > 0 && (
              <>
              <div className="resumes-list">
                  {currentResumes.map((resume, index) => (
                  <div key={resume.id} className="resume-item">
                    <span className="resume-item-filename">{resume.file.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveResume(resume.id)}
                      className="remove-resume-button"
                      disabled={loading}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
                {resumes.length > RESUMES_PER_PAGE && (
                  <div className="pagination-controls">
                    <button
                      type="button"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1 || loading}
                      className="pagination-button"
                    >
                      ← Previous
                    </button>
                    <span className="pagination-info">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages || loading}
                      className="pagination-button"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Job Description Document Section */}
          <div className="upload-section">
            <h3 className="section-title">Job Description Document</h3>
            <div 
              className={`drop-zone ${dragOverJobDesc ? 'drag-over' : ''}`}
              onDrop={handleJobDescriptionDrop}
              onDragOver={handleDragOver}
              onDragEnter={handleJobDescDragEnter}
              onDragLeave={handleJobDescDragLeave}
            >
              <input
                type="file"
                id="job-desc-input"
                ref={jobDescInputRef}
                accept=".pdf,.doc,.docx,.txt"
                onChange={handleJobDescriptionFileChange}
                className="file-input"
              />
              <label htmlFor="job-desc-input" className="drop-zone-label">
                <button type="button" className="choose-files-button" onClick={handleChooseJobDescFile}>Choose File</button>
                <span className="file-chosen-text">
                  {jobDescriptionFile ? jobDescriptionFile.name : '(No file chosen)'}
                </span>
              </label>
              <p className="drop-zone-hint">*Drag and drop the document here, or click to browse.</p>
            </div>
            {jobDescriptionFile && (
              <div className="resumes-list">
                <div className="resume-item">
                  <span className="resume-item-filename">{jobDescriptionFile.name}</span>
                  <button
                    type="button"
                    onClick={handleRemoveJobDescription}
                    className="remove-resume-button"
                    disabled={loading}
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scoring Criteria Section */}
        <div className="scoring-criteria-section">
          <h3 className="scoring-title">Scoring Criteria</h3>
          <div className="scoring-criteria-list">
            <div className="criteria-item">
              <span className="criteria-label">Skills & IT Tools</span>
              <span className="criteria-points">50 pts</span>
            </div>
            <div className="criteria-item">
              <span className="criteria-label">Total / Relevant Experience</span>
              <span className="criteria-points">25 pts</span>
            </div>
            <div className="criteria-item">
              <span className="criteria-label">Education / Certifications</span>
              <span className="criteria-points">15 pts</span>
            </div>
            <div className="criteria-item">
              <span className="criteria-label">Soft Skills / Inter Personal Skills</span>
              <span className="criteria-points">10 pts</span>
            </div>
          </div>
        </div>

        {/* Response Message - Show before questions */}
        {response && (
          <div className="response-container">
            <div className="success-header">
              <div className="success-header-left">
                <strong>Success!</strong>
                <span className="results-count">
                  {Array.isArray(response) ? (
                    `${filteredResumes.length} of ${groupedResumes.length} resume${groupedResumes.length !== 1 ? 's' : ''} shown${preScoreFilter !== 'all' ? ` (score ≥ ${preScoreFilter})` : scoreFilter !== 'all' ? ` (score ≥ ${scoreFilter})` : ''}`
                  ) : 'Results received'}
                </span>
              </div>
              {Array.isArray(response) && filteredResumes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSmartRecruiterChat(!showSmartRecruiterChat)}
                  className="ask-ai-button"
                  style={{
                    padding: '10px 20px',
                    background: showSmartRecruiterChat ? '#1557b0' : '#1a73e8',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '0.95rem',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {showSmartRecruiterChat ? 'Hide AI Chat' : 'Ask Smart Recruiter AI'}
                </button>
              )}
            </div>
            <div className="results-display">
              {Array.isArray(response) ? (
                filteredResumes.length > 0 ? filteredResumes.map((resumeGroup, resumeIndex) => {
                  // Extract score from the resume group
                  const resumeScore = getResumeScore(resumeGroup)
                  // Get resume ID from resume group
                  const resumeId = getResumeIdFromResumeGroup(resumeGroup)
                  const isSelected = resumeId && selectedResumeIds.includes(resumeId)
                  
                  return (
                    <div key={resumeIndex} className="candidate-row">
                      <input
                        type="checkbox"
                        checked={isSelected || false}
                        onChange={(e) => {
                          if (resumeId) {
                            handleResumeSelection(resumeId, e.target.checked)
                          }
                        }}
                        className="resume-checkbox"
                        id={`resume-checkbox-${resumeIndex}`}
                      />
                      <label htmlFor={`resume-checkbox-${resumeIndex}`} className="candidate-row-label">
                        <div className="candidate-name-simple">{resumeGroup.resumeName}</div>
                        <div className="candidate-score-simple">
                          {resumeScore !== null ? resumeScore : 'N/A'}
                        </div>
                      </label>
                    </div>
                  )
                }) : (
                  <div className="no-results-message">
                    <p>No resumes found with score ≥ {preScoreFilter !== 'all' ? preScoreFilter : scoreFilter}.</p>
                    <p style={{ fontSize: '0.9rem', color: '#5f6368', marginTop: '8px' }}>
                      Try selecting a lower threshold or "All Resumes" to see all results.
                    </p>
                  </div>
                )
              ) : (
                <div className="candidate-card">
                  {typeof response === 'object' ? (
                    Object.entries(response).map(([key, value]) => (
                      <div key={key} className="result-item">
                        <span className="result-key">{key}:</span>
                        <span className="result-value">
                          {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="result-text">{String(response)}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Ask Smart Recruiter AI Section - Chat Interface */}
        {response && Array.isArray(response) && filteredResumes.length > 0 && showSmartRecruiterChat && (
          <div className="smart-recruiter-section" style={{ marginTop: '24px' }}>
            <div className="smart-recruiter-header">
              <h3 className="smart-recruiter-title">Ask Smart Recruiter AI</h3>
              {selectedResumeIds.length > 0 && (
                <span className="selected-count">
                  {selectedResumeIds.length} resume{selectedResumeIds.length !== 1 ? 's' : ''} selected
                </span>
              )}
            </div>
            <div className="smart-recruiter-form">
              <div className="form-group">
                <label htmlFor="smart-recruiter-question" className="label">
                  Question
                </label>
                <textarea
                  id="smart-recruiter-question"
                  value={smartRecruiterQuestion}
                  onChange={(e) => setSmartRecruiterQuestion(e.target.value)}
                  placeholder="Ask any question about the selected resume(s)... e.g., Why does this resume have a high score?"
                  className="textarea-input"
                  rows="3"
                  disabled={smartRecruiterLoading || selectedResumeIds.length === 0}
                  onKeyDown={(e) => {
                    // Allow Ctrl+Enter or Cmd+Enter to submit
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault()
                      if (!smartRecruiterLoading && selectedResumeIds.length > 0 && smartRecruiterQuestion.trim()) {
                        handleAskSmartRecruiter(e)
                      }
                    }
                  }}
                />
              </div>
              <button
                type="button"
                onClick={handleAskSmartRecruiter}
                className="btn btn-primary smart-recruiter-button"
                disabled={smartRecruiterLoading || selectedResumeIds.length === 0 || !smartRecruiterQuestion.trim()}
              >
                {smartRecruiterLoading ? 'Processing...' : 'Ask Smart Recruiter AI'}
              </button>
            </div>

            {/* Smart Recruiter AI Results */}
            {smartRecruiterResponse && smartRecruiterResponse.length > 0 && (
              <div className="smart-recruiter-results">
                <h4 className="smart-recruiter-results-title">Smart Recruiter AI Response</h4>
                {smartRecruiterResponse.map((item, index) => {
                  const resumeName = item.candidate_name || item.resume_file?.replace(/\.[^/.]+$/, '') || `Resume ${index + 1}`
                  const question = item.question || smartRecruiterQuestion
                  const answer = item.answer || 'No answer provided'
                  
                  return (
                    <div key={index} className="smart-recruiter-result-item">
                      <div className="smart-recruiter-result-header">
                        <span className="smart-recruiter-resume-name">
                          {resumeName}
                        </span>
                        {item.ai_generated && (
                          <span className="ai-badge" style={{
                            fontSize: '0.75rem',
                            color: '#1a73e8',
                            background: '#e8f0fe',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            marginLeft: '8px'
                          }}>
                            AI Generated
                          </span>
                        )}
                      </div>
                      <div className="smart-recruiter-result-content">
                        <div className="smart-recruiter-question">
                          <strong>Question:</strong> {question}
                        </div>
                        <div className="smart-recruiter-answer">
                          <strong>Answer:</strong> 
                          <div style={{ 
                            marginTop: '8px', 
                            whiteSpace: 'pre-wrap',
                            lineHeight: '1.6'
                          }}>
                            {renderMarkdownText(answer)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Loading Progress */}
        {loading && loadingProgress && (
          <div className="loading-progress">
            <div className="progress-header">
              <strong>Processing...</strong>
              <span className="progress-count">
                {loadingProgress.current} of {loadingProgress.total}
              </span>
            </div>
            <div className="progress-bar-container">
              <div 
                className="progress-bar"
                style={{ width: `${(loadingProgress.current / loadingProgress.total) * 100}%` }}
              ></div>
            </div>
            <div className="progress-details">
              <div className="progress-resume">
                <strong>Resume:</strong> {loadingProgress.resume}
              </div>
              <div className="progress-question">
                <strong>Question:</strong> {loadingProgress.question}
              </div>
            </div>
          </div>
        )}

        {/* Question Input */}
        <div className="form-group question-section">
          <div className="question-header">
            <div className="question-label-wrapper">
              <label htmlFor="question-input" className="label">
                Question(s)
              </label>
              <div className="question-suggestions-dropdown" ref={questionDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowQuestionDropdown(!showQuestionDropdown)}
                  className="add-questions-button"
                  disabled={loading}
                >
                  Add Questions {showQuestionDropdown ? '▲' : '▼'}
                </button>
                {showQuestionDropdown && (
                  <div className="questions-dropdown-menu">
                    <button
                      type="button"
                      onClick={() => {
                        appendQuestion('What is the candidate score?')
                        setShowQuestionDropdown(false)
                      }}
                      className="dropdown-question-item"
                    >
                      What is the candidate score?
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        appendQuestion('Evaluate the candidate\'s technical skills and experience.')
                        setShowQuestionDropdown(false)
                      }}
                      className="dropdown-question-item"
                    >
                      Evaluate the candidate's technical skills and experience.
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        appendQuestion('What are the candidate\'s strengths and weaknesses?')
                        setShowQuestionDropdown(false)
                      }}
                      className="dropdown-question-item"
                    >
                      What are the candidate's strengths and weaknesses?
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        appendQuestion('How well does the candidate match the job requirements?')
                        setShowQuestionDropdown(false)
                      }}
                      className="dropdown-question-item"
                    >
                      How well does the candidate match the job requirements?
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="question-filter-wrapper">
              <label htmlFor="pre-score-filter" className="filter-label-inline">Filter Results by Score:</label>
              <select
                id="pre-score-filter"
                value={preScoreFilter}
                onChange={(e) => {
                  setPreScoreFilter(e.target.value)
                  // Also update the results filter if results are already shown
                  if (response) {
                    setScoreFilter(e.target.value)
                  }
                }}
                className="score-filter-select-inline"
                disabled={loading}
              >
                <option value="all">Show All Resumes</option>
                <option value="50">Score ≥ 50</option>
                <option value="60">Score ≥ 60</option>
                <option value="70">Score ≥ 70</option>
                <option value="80">Score ≥ 80</option>
                <option value="90">Score ≥ 90</option>
              </select>
            </div>
          </div>
          <textarea
            id="question-input"
            value={question}
            onChange={handleQuestionChange}
            placeholder={`Enter your question(s) here... You can enter multiple questions by:
1. Putting each question on a new line, OR
2. Separating them with "?, " (question mark, comma)

Example (new lines):
What is the candidate score?
Evaluate the candidate's technical skills and experience?

Example (comma-separated):
What is the candidate score?, Evaluate the candidate's technical skills and experience?`}
            className="textarea-input"
            rows="4"
          />
          {question && question.trim() && (
            <div className="question-count-indicator">
              <span className="question-count-text">
                {parseQuestions(question).length} question{parseQuestions(question).length !== 1 ? 's' : ''} will be processed
                {parseQuestions(question).length > 1 && ` (${resumes.length} resume${resumes.length !== 1 ? 's' : ''} × ${parseQuestions(question).length} question${parseQuestions(question).length !== 1 ? 's' : ''} = ${resumes.length * parseQuestions(question).length} total requests)`}
              </span>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="action-buttons">
          <button
            type="submit"
            disabled={loading}
            className="run-analysis-button"
          >
            {loading ? 'Processing...' : 'Run Analysis'}
          </button>
          <button
            type="button"
            onClick={handleDownloadExcel}
            className="download-report-button"
            disabled={!response}
          >
            Download Report
          </button>
        </div>
      </form>
    </div>
  )
}

export default ResumeUploader

