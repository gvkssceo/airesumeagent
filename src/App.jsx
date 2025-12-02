import React from 'react'
import ResumeUploader from './components/ResumeUploader'
import './App.css'

function App() {
  return (
    <div className="App">
      <div className="container">
        <h1 className="title">HR System</h1>
        <p className="subtitle">Upload Candidate Resumes And Attach The Job Description To Evaluate How Well Each Submission Matches The Role.</p>
        
        <ResumeUploader />
      </div>
    </div>
  )
}

export default App

