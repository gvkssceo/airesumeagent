import React from 'react'
import ResumeUploader from './components/ResumeUploader'
import './App.css'

function App() {
  return (
    <div className="App">
      <div className="container">   
        <div className="title-header">
          <h1 className="title">AI Recruiter</h1>
          <footer className="app-footer">
            <p className="footer-text">
              <span className="footer-copyright">©</span>
              <span className="footer-powered"> powered by</span>
              <span className="footer-brand"> gvkss</span>
            </p>
          </footer>
        </div>
        <p className="subtitle">Upload Candidate Resumes And Attach The Job Description To Evaluate How Well Each Submission Matches The Role.</p>
        
        <ResumeUploader />
      </div>
    </div>
  )
}

export default App

