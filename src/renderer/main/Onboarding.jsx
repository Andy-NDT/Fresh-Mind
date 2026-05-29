import React from 'react'
import './Onboarding.css'

export default function Onboarding({ onRecordThought, onMarkState, onDismiss }) {
  return (
    <div className="onboarding-block">
      <button className="ob-dismiss" onClick={onDismiss} title="Скрыть навсегда">×</button>

      <div className="ob-wave" aria-hidden>👋</div>
      <div className="ob-title">Привет</div>
      <div className="ob-subtitle">
        Это твой дневник и колесо жизни.
      </div>

      <div className="ob-divider" />

      <div className="ob-cta-label">Начни с одного из двух:</div>
      <div className="ob-actions">
        <button className="ob-btn ob-btn-primary" onClick={onRecordThought}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z"/>
          </svg>
          Записать мысль
        </button>
        <button className="ob-btn ob-btn-secondary" onClick={onMarkState}>
          <svg width="14" height="14" viewBox="0 0 24 24" className="ob-wheel-icon">
            {/* 4 цветных квадранта в порядке колеса: Здоровье → Общество → Труд → Развитие */}
            <path d="M 12 12 L 3 12 A 9 9 0 0 1 12 3 Z" fill="#FFE0B2" />
            <path d="M 12 12 L 12 3 A 9 9 0 0 1 21 12 Z" fill="#E1BEE7" />
            <path d="M 12 12 L 21 12 A 9 9 0 0 1 12 21 Z" fill="#B2EBF2" />
            <path d="M 12 12 L 12 21 A 9 9 0 0 1 3 12 Z" fill="#DCEDC8" />
            <line x1="12" y1="3" x2="12" y2="21" stroke="#fff" strokeWidth="1" />
            <line x1="3" y1="12" x2="21" y2="12" stroke="#fff" strokeWidth="1" />
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
          </svg>
          Отметить состояние
        </button>
      </div>

      <div className="ob-footer">
        Твои мысли — только твои. Локально, навсегда.
      </div>
    </div>
  )
}
