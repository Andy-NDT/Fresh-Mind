import React from 'react'
import ReactDOM from 'react-dom/client'
import '../shared/tokens.css'
import './Settings.css'
import Settings from './Settings'
import ErrorBoundary from '../shared/ErrorBoundary'

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary><Settings /></ErrorBoundary>
)
