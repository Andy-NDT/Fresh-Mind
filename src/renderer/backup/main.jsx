import React from 'react'
import ReactDOM from 'react-dom/client'
import '../shared/tokens.css'
import './App.css'
import App from './App'
import ErrorBoundary from '../shared/ErrorBoundary'

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary><App /></ErrorBoundary>
)
