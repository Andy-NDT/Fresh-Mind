import React, { useState, useEffect } from 'react'
import './ShareDialog.css'
import { exportElementToPng, SHARE_SIZES, SHARE_BACKGROUNDS } from './sharePng.js'

/**
 * Переиспользуемый модал шеринга PNG.
 *
 * Props:
 *   isOpen          — boolean, открыт ли модал
 *   onClose         — () => void, вызов при закрытии (Esc/Отмена/успех)
 *   targetRef       — useRef к DOM-элементу для съёмки
 *   filenameStem    — стартовая часть имени, например 'fresh-mind-radar-2026-05-29'
 *   title           — заголовок модала, например 'Скачать колесо за день'
 *   defaultSize     — 'square' | 'landscape' | 'og' (default 'square')
 *   defaultBackground — 'transparent' | 'white' | 'dark' (default 'white')
 */
export default function ShareDialog({
  isOpen,
  onClose,
  targetRef,
  filenameStem,
  title = 'Скачать как картинку',
  defaultSize = 'square',
  defaultBackground = 'white'
}) {
  const [size, setSize] = useState(defaultSize)
  const [background, setBackground] = useState(defaultBackground)
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)

  // Esc → закрыть
  useEffect(() => {
    if (!isOpen) return
    function onKey(e) { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, busy, onClose])

  // Сброс state при открытии
  useEffect(() => {
    if (isOpen) {
      setStatus(null)
      setBusy(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  async function handleDownload() {
    if (!targetRef?.current) {
      setStatus({ kind: 'err', text: 'Нет элемента для съёмки' })
      return
    }
    setBusy(true)
    setStatus(null)
    const r = await exportElementToPng(targetRef.current, {
      size,
      background,
      filenameStem,
      userCaption: caption
    })
    setBusy(false)
    if (r?.canceled) {
      // Юзер закрыл диалог сохранения — оставляем модал открытым
    } else if (r?.ok) {
      setStatus({ kind: 'ok', text: 'Сохранено' })
      // Через короткую паузу закрываем
      setTimeout(() => onClose(), 900)
    } else if (r?.error) {
      setStatus({ kind: 'err', text: r.error })
    }
  }

  return (
    <div className="sd-backdrop" onClick={() => { if (!busy) onClose() }}>
      <div className="sd-modal" onClick={e => e.stopPropagation()}>
        <div className="sd-header">
          <span className="sd-title">{title}</span>
          <button className="sd-close" onClick={onClose} disabled={busy} title="Закрыть (Esc)">×</button>
        </div>

        {/* Размер */}
        <div className="sd-section">
          <div className="sd-section-label">Размер</div>
          <div className="sd-chips">
            {Object.entries(SHARE_SIZES).map(([key, sz]) => (
              <button
                key={key}
                className={`sd-chip ${size === key ? 'active' : ''}`}
                onClick={() => setSize(key)}
                disabled={busy}
              >{sz.label}</button>
            ))}
          </div>
        </div>

        {/* Фон */}
        <div className="sd-section">
          <div className="sd-section-label">Фон</div>
          <div className="sd-chips">
            {Object.entries(SHARE_BACKGROUNDS).map(([key, bg]) => (
              <button
                key={key}
                className={`sd-chip ${background === key ? 'active' : ''}`}
                onClick={() => setBackground(key)}
                disabled={busy}
              >{bg.label}</button>
            ))}
          </div>
        </div>

        {/* Подпись пользователя (опц.) */}
        <div className="sd-section">
          <div className="sd-section-label">Подпись по центру внизу картинки</div>
          <input
            type="text"
            className="sd-caption-input"
            placeholder="Например, «Мой 29 мая» — или оставь пустым"
            value={caption}
            maxLength={40}
            onChange={e => setCaption(e.target.value)}
            disabled={busy}
          />
        </div>

        {/* Действия */}
        <div className="sd-actions">
          <button
            className="sd-btn sd-btn-secondary"
            onClick={onClose}
            disabled={busy}
          >Отмена</button>
          <button
            className="sd-btn sd-btn-primary"
            onClick={handleDownload}
            disabled={busy}
          >
            {busy ? 'Готовлю…' : 'Скачать'}
          </button>
        </div>

        {status && (
          <div className={`sd-status sd-status-${status.kind}`}>{status.text}</div>
        )}

        <div className="sd-bottom-hint">
          В углу картинки появится маленький фирменный маркер <b>Fresh Mind</b>.
        </div>
      </div>
    </div>
  )
}
