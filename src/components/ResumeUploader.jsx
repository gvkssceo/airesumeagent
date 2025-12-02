import React, { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import './ResumeUploader.css'

// Use proxy API route to avoid CORS issues in both development and production
const WEBHOOK_URL = '/api/webhook'

const ResumeUploader = () => {
  const [resumes, setResumes] = useState([]) // Array of {id, file}
  const [jobDescriptionFile, setJobDescriptionFile] = useState(null)
  const [jobDescriptionText, setJobDescriptionText] = useState('')
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
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

  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = (e) => reject(e)
      reader.readAsText(file)
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
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

    setLoading(true)

    try {
      // Read job description from file
      const jobDescription = await readFileAsText(jobDescriptionFile)

      // Create FormData like the example
      const fd = new FormData()
      fd.append('job_description', jobDescription)
      
      // Append question if provided
      if (question.trim()) {
        fd.append('question', question.trim())
      }
      
      // Append all resume files
      resumes.forEach(resume => {
        fd.append('files[]', resume.file)
      })

      // Send to webhook using FormData
      const webhookResponse = await fetch(WEBHOOK_URL, {
        method: 'POST',
        body: fd
      })

      if (!webhookResponse.ok) {
        let errorMessage = `HTTP error! status: ${webhookResponse.status}`
        try {
          const errorText = await webhookResponse.text()
          // Try to parse as JSON
          try {
            const errorJson = JSON.parse(errorText)
            if (errorJson.message) {
              errorMessage = errorJson.message
            } else if (errorJson.error) {
              errorMessage = errorJson.error
            } else {
              errorMessage = errorText
            }
          } catch {
            // If not JSON, use the text as is
            errorMessage = errorText || errorMessage
          }
        } catch (parseErr) {
          errorMessage = `Server error (${webhookResponse.status}). Please check your n8n workflow configuration.`
        }
        throw new Error(errorMessage)
      }

      // Try to parse response as JSON
      let data
      try {
        const responseText = await webhookResponse.text()
        try {
          data = JSON.parse(responseText)
        } catch (e) {
          // If response is not JSON, wrap it
          data = { response: responseText }
        }
      } catch (e) {
        throw new Error('Failed to parse response from server')
      }

      setResponse(data)
      alert('Uploaded. Processing...')
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
    }
  }

  const handleDownloadExcel = () => {
    if (!response) return

    try {
      let rawData = []

      // Handle different response structures
      if (Array.isArray(response)) {
        // If response is an array, use it directly
        rawData = response
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

      // Filter and map only the required columns
      const dataToExport = rawData.map(item => {
        const filteredItem = {}
        
        // Map candidate_name
        if (item.candidate_name !== undefined) {
          filteredItem['Candidate Name'] = item.candidate_name
        }
        
        // Map processed_at or processed_dt
        if (item.processed_at !== undefined) {
          filteredItem['Processed At'] = item.processed_at
        } else if (item.processed_dt !== undefined) {
          filteredItem['Processed At'] = item.processed_dt
        }
        
        // Map question
        if (item.question !== undefined) {
          filteredItem['Question'] = item.question
        } else if (item.q1_question !== undefined) {
          filteredItem['Question'] = item.q1_question
        }
        
        // Map answers (q1_answer)
        if (item.q1_answer !== undefined) {
          filteredItem['Answer'] = item.q1_answer
        } else if (item.q1_answe !== undefined) {
          filteredItem['Answer'] = item.q1_answe
        }
        
        // Map explanation (q1_explanation)
        if (item.q1_explanation !== undefined) {
          filteredItem['Explanation'] = item.q1_explanation
        }
        
        return filteredItem
      })

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

        {/* Question Input */}
        <div className="form-group question-section">
          <label htmlFor="question-input" className="label">
            Question (Optional)
          </label>
          <textarea
            id="question-input"
            value={question}
            onChange={handleQuestionChange}
            placeholder="Enter your question here... (e.g., What is the candidate ATS score?)"
            className="textarea-input"
            rows="4"
          />
          <div className="question-suggestions">
            <div className="suggestions-label">Suggested Questions:</div>
            <div className="suggestions-list">
              <button
                type="button"
                onClick={() => setQuestion('What is the candidate ATS score?')}
                className="suggestion-button"
              >
                What is the candidate ATS score?
              </button>
              <button
                type="button"
                onClick={() => setQuestion('Evaluate the candidate\'s technical skills and experience.')}
                className="suggestion-button"
              >
                Evaluate the candidate's technical skills and experience.
              </button>
              <button
                type="button"
                onClick={() => setQuestion('What are the candidate\'s strengths and weaknesses?')}
                className="suggestion-button"
              >
                What are the candidate's strengths and weaknesses?
              </button>
              <button
                type="button"
                onClick={() => setQuestion('How well does the candidate match the job requirements?')}
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

        {/* Response Message */}
        {response && (
          <div className="response-container">
            <div className="success-header">
              <strong>Success!</strong>
              <span className="results-count">
                {Array.isArray(response) ? `${response.length} candidate(s) evaluated` : 'Results received'}
              </span>
            </div>
            <div className="results-display">
              {Array.isArray(response) ? (
                response.map((candidate, index) => (
                  <div key={index} className="candidate-card">
                    <div className="candidate-header">
                      <h3 className="candidate-name">
                        {candidate.candidate_name || `Candidate ${index + 1}`}
                      </h3>
                      {candidate.processed_at && (
                        <span className="processed-time">
                          {new Date(candidate.processed_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                    
                    {candidate.q1_question && (
                      <div className="question-section-result">
                        <div className="question-label">Question:</div>
                        <div className="question-text">{candidate.q1_question}</div>
                      </div>
                    )}
                    
                    {candidate.q1_answer !== undefined && candidate.q1_answer !== null && (
                      <div className="score-section">
                        <div className="score-label">ATS Score:</div>
                        <div className="score-value">{candidate.q1_answer}</div>
                      </div>
                    )}
                    
                    {candidate.q1_explanation && (
                      <div className="explanation-section">
                        <div className="explanation-label">Explanation:</div>
                        <div className="explanation-text">{candidate.q1_explanation}</div>
                      </div>
                    )}
                  </div>
                ))
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

        {/* Action Buttons */}
        <div className="action-buttons">
          <button
            type="submit"
            disabled={loading}
            className="run-analysis-button"
          >
            <span className="button-icon">🚀</span>
            {loading ? 'Processing...' : 'Run Analysis'}
          </button>
          <button
            type="button"
            onClick={handleDownloadExcel}
            className="download-report-button"
            disabled={!response}
          >
            <span className="button-icon">📥</span>
            Download Report
          </button>
        </div>
      </form>
    </div>
  )
}

export default ResumeUploader

