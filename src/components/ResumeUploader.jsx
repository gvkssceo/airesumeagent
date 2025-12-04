import React, { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { FaRocket, FaDownload, FaTimes } from 'react-icons/fa'
import './ResumeUploader.css'

// Use proxy API route to avoid CORS issues in both development and production
const WEBHOOK_URL = '/api/webhook'

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
  const resumeInputRef = useRef(null)
  const jobDescInputRef = useRef(null)

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
    
    // Extract ATS score from q1_answer if it contains "ATS Score: X"
    let extractedScore = null
    if (normalizedData.q1_answer && typeof normalizedData.q1_answer === 'string') {
      const scoreMatch = normalizedData.q1_answer.match(/ATS Score:\s*(\d+)/i)
      if (scoreMatch) {
        extractedScore = scoreMatch[1]
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
        if (keys.length > 0 && (keys.includes('Skills & Tools Match') || keys.some(k => k.includes('Match') || k.includes('Experience')))) {
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
    
    // Remove "ATS Score: X, " prefix if present
    let text = textValue.replace(/^ATS Score:\s*\d+[,\s]*/i, '').trim()
    
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
                question: result.question || item.question || item.q1_question,
                ...item
              })
            })
          } else {
            // Normal structure
            allResults.push({
              candidate_name: resume.file.name.replace(/\.[^/.]+$/, '') || result.answer?.candidate_name,
              resume_file: resume.file.name,
              ...result
            })
          }
        })
      }

      // Clear progress
      setLoadingProgress(null)

      // Set response with all results
      setResponse(allResults)
      
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
        
        // Extract ATS score if present
        let extractedScore = null
        let finalAnswer = answerStr
        if (answerStr) {
          const scoreMatch = answerStr.match(/ATS Score:\s*(\d+)/i)
          if (scoreMatch) {
            extractedScore = scoreMatch[1]
            finalAnswer = extractedScore // Use just the score for Answer column
          }
        }
        
        // Create row data
        const row = {
          'Candidate Name': data.candidate_name || (data.resume_file ? data.resume_file.replace(/\.[^/.]+$/, '') : '') || 'Unknown',
          'Resume': data.resume_file ? data.resume_file.replace(/\.[^/.]+$/, '') : (data.candidate_name || '') || 'Unknown',
          'Process': data.processed_at ? (() => {
            try {
              return new Date(data.processed_at).toISOString().slice(0, 7)
            } catch {
              return String(data.processed_at).slice(0, 7)
            }
          })() : '',
          'Question': safeToString(questionText),
          'Answer': finalAnswer || 'Not provided',
          'Explanation': explanationStr || ''
        }
        
        // Add row
        dataToExport.push(row)
        console.log(`[Excel] Added row ${dataToExport.length}:`, {
          Question: row['Question'].substring(0, 50),
          Answer: row['Answer'].substring(0, 30),
          Explanation: row['Explanation'].substring(0, 30)
        })
      })
      
      console.log(`[Excel Export] Total rows: ${dataToExport.length}`)
      
      // Log summary of what will be exported
      if (dataToExport.length > 0) {
        console.log(`[Excel Export] Summary:`, {
          totalRows: dataToExport.length,
          uniqueQuestions: [...new Set(dataToExport.map(r => r['Question']))].length,
          sampleQuestions: dataToExport.slice(0, 3).map(r => ({
            Question: r['Question'].substring(0, 50),
            HasAnswer: !!r['Answer'],
            HasExplanation: !!r['Explanation']
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
    // Reset file inputs
    document.getElementById('resume-input').value = ''
    document.getElementById('job-desc-input').value = ''
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

  return (
    <div className="resume-uploader">
      {/* Scoring Criteria Section */}
      <div className="scoring-criteria-section">
        <h3 className="scoring-title">Scoring Criteria</h3>
        <div className="scoring-criteria-list">
          <div className="criteria-item">
            <span className="criteria-label">Skills & Tools Match</span>
            <span className="criteria-points">50 pts</span>
          </div>
          <div className="criteria-item">
            <span className="criteria-label">Relevant Experience</span>
            <span className="criteria-points">25 pts</span>
          </div>
          <div className="criteria-item">
            <span className="criteria-label">Education / Certifications</span>
            <span className="criteria-points">15 pts</span>
          </div>
          <div className="criteria-item">
            <span className="criteria-label">Nice-to-have / Extra Fit</span>
            <span className="criteria-points">10 pts</span>
          </div>
        </div>
      </div>

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
                      <FaTimes />
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
                    <FaTimes />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Question Input */}
        <div className="form-group question-section">
          <label htmlFor="question-input" className="label">
            Question(s) <span style={{fontSize: '0.85rem', fontWeight: 'normal', color: '#5f6368'}}>(Enter one per line or separate by "?, ")</span>
          </label>
          <textarea
            id="question-input"
            value={question}
            onChange={handleQuestionChange}
            placeholder={`Enter your question(s) here... You can enter multiple questions by:
1. Putting each question on a new line, OR
2. Separating them with "?, " (question mark, comma)

Example (new lines):
What is the candidate ATS score?
Evaluate the candidate's technical skills and experience?

Example (comma-separated):
What is the candidate ATS score?, Evaluate the candidate's technical skills and experience?`}
            className="textarea-input"
            rows="6"
          />
          {question && question.trim() && (
            <div className="question-count-indicator">
              <span className="question-count-text">
                {parseQuestions(question).length} question{parseQuestions(question).length !== 1 ? 's' : ''} will be processed
                {parseQuestions(question).length > 1 && ` (${resumes.length} resume${resumes.length !== 1 ? 's' : ''} × ${parseQuestions(question).length} question${parseQuestions(question).length !== 1 ? 's' : ''} = ${resumes.length * parseQuestions(question).length} total requests)`}
              </span>
            </div>
          )}
          <div className="question-suggestions">
            <div className="suggestions-label">Suggested Questions:</div>
            <div className="suggestions-list">
              <button
                type="button"
                onClick={() => appendQuestion('What is the candidate ATS score?')}
                className="suggestion-button"
              >
                What is the candidate ATS score?
              </button>
              <button
                type="button"
                onClick={() => appendQuestion('Evaluate the candidate\'s technical skills and experience.')}
                className="suggestion-button"
              >
                Evaluate the candidate's technical skills and experience.
              </button>
              <button
                type="button"
                onClick={() => appendQuestion('What are the candidate\'s strengths and weaknesses?')}
                className="suggestion-button"
              >
                What are the candidate's strengths and weaknesses?
              </button>
              <button
                type="button"
                onClick={() => appendQuestion('How well does the candidate match the job requirements?')}
                className="suggestion-button"
              >
                How well does the candidate match the job requirements?
              </button>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
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

        {/* Response Message */}
        {response && (
          <div className="response-container">
            <div className="success-header">
              <strong>Success!</strong>
              <span className="results-count">
                {Array.isArray(response) ? (() => {
                  // Count unique resumes
                  const uniqueResumes = new Set()
                  response.forEach(item => {
                    const data = parseResponseData(item)
                    const resumeKey = data.resume_file || data.candidate_name
                    if (resumeKey) uniqueResumes.add(resumeKey)
                  })
                  const resumeCount = uniqueResumes.size || response.length
                  return `${resumeCount} resume${resumeCount !== 1 ? 's' : ''} with ${response.length} question${response.length !== 1 ? 's' : ''} answered`
                })() : 'Results received'}
              </span>
            </div>
            <div className="results-display">
              {Array.isArray(response) ? (() => {
                // Group responses by resume_file or candidate_name
                const groupedByResume = {}
                
                response.forEach((item, index) => {
                  const data = parseResponseData(item)
                  
                  // Create a consistent key for grouping (normalize filename)
                  let resumeKey = data.resume_file || data.candidate_name
                  if (resumeKey) {
                    // Normalize the key by removing extension and converting to lowercase
                    resumeKey = resumeKey.replace(/\.[^/.]+$/, '').toLowerCase().trim()
                  } else {
                    // Fallback: use index if no resume identifier
                    resumeKey = `resume-${index}`
                  }
                  
                  // Get resume name (prefer candidate_name, then filename without extension)
                  const resumeName = data.candidate_name || (data.resume_file ? data.resume_file.replace(/\.[^/.]+$/, '') : `Resume ${index + 1}`)
                  
                  if (!groupedByResume[resumeKey]) {
                    groupedByResume[resumeKey] = {
                      resumeName: resumeName,
                      resumeFile: data.resume_file,
                      processedAt: data.processed_at,
                      questions: []
                    }
                  }
                  
                  // Use the earliest processed_at timestamp
                  if (data.processed_at && (!groupedByResume[resumeKey].processedAt || 
                      new Date(data.processed_at) < new Date(groupedByResume[resumeKey].processedAt))) {
                    groupedByResume[resumeKey].processedAt = data.processed_at
                  }
                  
                  // Add this question-answer pair to the resume group
                  groupedByResume[resumeKey].questions.push({
                    question: data.question || data.q1_question,
                    answer: data.q1_answer,
                    explanation: data.q1_explanation,
                    extractedScore: data.extractedScore,
                    error: data.error,
                    processedAt: data.processed_at
                  })
                })
                
                // Render grouped results
                return Object.values(groupedByResume).map((resumeGroup, resumeIndex) => (
                  <div key={resumeIndex} className="candidate-card">
                    <div className="candidate-header">
                      <h3 className="candidate-name">{resumeGroup.resumeName}</h3>
                      {resumeGroup.processedAt && (
                        <span className="processed-time">
                          {new Date(resumeGroup.processedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                    
                    {/* Display all questions and answers for this resume */}
                    {resumeGroup.questions.map((qa, qIndex) => (
                      <div key={qIndex} className="question-answer-group">
                        {/* Display question */}
                        {qa.question && (
                          <div className="question-section-result">
                            <div className="question-label">Question {qIndex + 1}:</div>
                            <div className="question-text">{safeToString(qa.question)}</div>
                          </div>
                        )}
                        
                        {/* Display ATS Score if extracted or if answer contains score */}
                        {(qa.extractedScore || (qa.answer && safeToString(qa.answer).match(/ATS Score:\s*\d+/i))) && (
                          <div className="score-section">
                            <div className="score-label">ATS Score:</div>
                            <div className="score-value">
                              {qa.extractedScore || safeToString(qa.answer).match(/ATS Score:\s*(\d+)/i)?.[1] || 'N/A'}
                            </div>
                          </div>
                        )}
                        
                        {/* Display answer/response text */}
                        {qa.answer && (
                          <div className="explanation-section">
                            <div className="explanation-label">
                              Answer {qIndex + 1}:
                            </div>
                            <div className="explanation-text">
                              {qa.extractedScore ? extractAnswerText(qa.answer) : safeToString(qa.answer)}
                            </div>
                          </div>
                        )}
                        
                        {/* Display explanation/breakdown */}
                        {qa.explanation && (
                          <div className="explanation-section">
                            <div className="explanation-label">Score Breakdown:</div>
                            <div className="explanation-text">{safeToString(qa.explanation)}</div>
                          </div>
                        )}
                        
                        {/* Handle error cases */}
                        {qa.error && (
                          <div className="error-message">
                            <strong>Error:</strong> {safeToString(qa.error)}
                          </div>
                        )}
                        
                        {/* Add separator between questions (except for last one) */}
                        {qIndex < resumeGroup.questions.length - 1 && (
                          <div className="question-separator"></div>
                        )}
                      </div>
                    ))}
                  </div>
                ))
              })() : (
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

        {/* Action Buttons */}
        <div className="action-buttons">
          <button
            type="submit"
            disabled={loading}
            className="run-analysis-button"
          >
            <FaRocket className="button-icon" />
            {loading ? 'Processing...' : 'Run Analysis'}
          </button>
          <button
            type="button"
            onClick={handleDownloadExcel}
            className="download-report-button"
            disabled={!response}
          >
            <FaDownload className="button-icon" />
            Download Report
          </button>
        </div>
      </form>
    </div>
  )
}

export default ResumeUploader

