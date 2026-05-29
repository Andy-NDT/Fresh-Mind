import React from 'react'
import './ErrorBoundary.css'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, details: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // В консоль — полный stacktrace для debug. Пользователю показываем
    // только дружелюбное сообщение.
    console.error('[ErrorBoundary] React error:', error, info)
    this.setState({ details: info && info.componentStack ? info.componentStack : null })
  }

  handleRestart = () => {
    if (window.freshMind && window.freshMind.restartApp) {
      window.freshMind.restartApp()
    } else {
      // Fallback: reload renderer (заодно сбросит React-стейт)
      window.location.reload()
    }
  }

  handleClose = () => {
    if (window.freshMind && window.freshMind.closeMain) {
      window.freshMind.closeMain()
    } else {
      window.close()
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const msg = this.state.error && this.state.error.message
      ? this.state.error.message
      : 'Неизвестная ошибка'

    return (
      <div className="fm-error-screen">
        <div className="fm-error-card">
          <div className="fm-error-icon">⚠</div>
          <div className="fm-error-title">Что-то пошло не так</div>
          <div className="fm-error-message">{msg}</div>
          <div className="fm-error-hint">
            Окно нужно перезапустить. Твои данные не пострадали — всё сохранено локально.
          </div>
          <div className="fm-error-actions">
            <button className="fm-error-btn fm-error-btn-secondary" onClick={this.handleClose}>
              Закрыть
            </button>
            <button className="fm-error-btn fm-error-btn-primary" onClick={this.handleRestart}>
              Перезапустить окно
            </button>
          </div>
        </div>
      </div>
    )
  }
}
