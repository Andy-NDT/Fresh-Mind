import React, { useEffect, useRef, useState } from 'react'

function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек']
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${time}`
}

function preview(text, maxChars = 140) {
  if (!text) return ''
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length <= maxChars ? t : t.slice(0, maxChars - 1).trimEnd() + '…'
}

export default function App() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const panelRef = useRef(null)

  async function reload() {
    setLoading(true)
    const rows = await window.freshMind.listTrash()
    setEntries(rows || [])
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  // Esc → закрыть окно
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') window.freshMind.closeTrash() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!panelRef.current) return
    const update = () => {
      if (panelRef.current) window.freshMind.resizeTrash(panelRef.current.offsetHeight)
    }
    const ro = new ResizeObserver(update)
    ro.observe(panelRef.current)
    update()
    return () => ro.disconnect()
  }, [entries, loading])

  async function doRestore(id) {
    await window.freshMind.restoreEntry(id)
    await reload()
  }

  async function doPurge(id) {
    if (!confirm('Удалить запись НАВСЕГДА? Это действие нельзя отменить.')) return
    await window.freshMind.purgeEntry(id)
    await reload()
  }

  return (
    <div className="trash-panel" ref={panelRef}>
      <div className="trash-header">
        <span className="trash-title">Корзина</span>
        <button className="trash-close" onClick={() => window.freshMind.closeTrash()} title="Закрыть">×</button>
      </div>

      <div className="trash-hint">
        Записи, которые ты удалил — здесь можно восстановить или стереть навсегда.
      </div>

      {loading && <div className="trash-loading fm-pulse">Загружаю</div>}

      {!loading && entries.length === 0 && (
        <div className="trash-empty">Корзина пуста</div>
      )}

      {!loading && entries.length > 0 && (
        <div className="trash-list">
          {entries.map(e => (
            <div key={e.id} className="trash-item">
              <div className="trash-item-meta">
                <span className="trash-date">{formatDate(e.created_at)}</span>
                {e.mood_emoji && <span className="trash-mood">{e.mood_emoji}</span>}
                <span className="trash-deleted">удалена {formatDate(e.deleted_at)}</span>
              </div>
              <div className="trash-item-text">
                {preview(e.content_text || '') || <em>пустая запись</em>}
              </div>
              {e.spheres && e.spheres.length > 0 && (
                <div className="trash-spheres">
                  {e.spheres.map(s => (
                    <span key={s.id} className="trash-sphere">
                      <span className="trash-sphere-dot" style={{ background: s.color }} />
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
              <div className="trash-actions">
                <button className="trash-btn trash-btn-restore" onClick={() => doRestore(e.id)} title="Восстановить">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0115.49-6.36L23 10M23 4v6h-6"/><path d="M21 12a9 9 0 01-15.49 6.36L1 14"/></svg>
                  Восстановить
                </button>
                <button className="trash-btn trash-btn-purge" onClick={() => doPurge(e.id)} title="Удалить навсегда">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  Навсегда
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
