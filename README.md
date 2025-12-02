# ATS Evaluation - Resume & Job Description Upload

A React application that allows users to upload resumes and job descriptions to an n8n webhook for ATS (Applicant Tracking System) evaluation.

## Features

- Upload resume files (PDF, DOC, DOCX, TXT)
- Upload job description files or enter text directly
- Send data to n8n webhook endpoint
- Modern, responsive UI
- Error handling and success feedback

## Installation

1. Install dependencies:
```bash
npm install
```

## Development

Run the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or the port Vite assigns).

## Build

Build for production:
```bash
npm run build
```

## Usage

1. Select a resume file (required)
2. Either upload a job description file OR enter the job description text
3. Click "Submit for Evaluation"
4. The data will be sent to: `https://gvkssjobs.n8n-wsk.com/webhook/d48e6560-289b-450c-a612-d04bb2247440`

## Webhook Endpoint

The component sends a POST request to:
```
https://gvkssjobs.n8n-wsk.com/webhook/d48e6560-289b-450c-a612-d04bb2247440
```

## Features

- **Excel Export**: After receiving a response from the webhook, you can download it as an Excel file using the "Download Response as Excel" button.

The request includes:
- `files[]`: The resume file(s)
- `job_description`: The job description (from file or text)
- `question`: The question (optional, if provided)

