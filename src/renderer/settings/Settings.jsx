import React, { useCallback, useEffect, useRef, useState } from 'react'
import logo from '../shared/brain.png'

function TimePart({ value, max, onChange }) {
  const ref = useRef(null)
  const inputRef = useRef(null)
  const [editing, setEditing] = useState(false)
  const [hovered, setHovered] = useState(false)

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const dir = e.deltaY < 0 ? 1 : -1
    onChange((value + dir + max + 1) % (max + 1))
  }, [value, max, onChange])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  function startEdit() {
    setEditing(true)
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 0)
  }

  function commitEdit(v) {
    const n = parseInt(v)
    if (!isNaN(n) && n >= 0 && n <= max) onChange(n)
    setEditing(false)
  }

  const display = String(value).padStart(2, '0')

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="time-part-input"
        type="text"
        defaultValue={display}
        maxLength={2}
        onBlur={e => commitEdit(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') commitEdit(e.target.value)
          if (e.key === 'Escape') setEditing(false)
          if (e.key === 'ArrowUp') { e.preventDefault(); onChange((value + 1) % (max + 1)) }
          if (e.key === 'ArrowDown') { e.preventDefault(); onChange((value - 1 + max + 1) % (max + 1)) }
        }}
      />
    )
  }

  return (
    <div
      ref={ref}
      className="time-part-wrap"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className={`time-arrow ${hovered ? 'visible' : ''}`}
        onClick={() => onChange((value + 1) % (max + 1))}>▲</span>
      <span className="time-part" onClick={startEdit}>{display}</span>
      <span className={`time-arrow ${hovered ? 'visible' : ''}`}
        onClick={() => onChange((value - 1 + max + 1) % (max + 1))}>▼</span>
    </div>
  )
}

function TimeScroller({ value, onChange }) {
  const safe = /^\d{2}:\d{2}$/.test(value || '') ? value : '22:00'
  const hh = parseInt(safe.slice(0, 2))
  const mm = parseInt(safe.slice(3, 5))
  return (
    <div className="time-scroller">
      <TimePart value={hh} max={23} onChange={h =>
        onChange(String(h).padStart(2, '0') + ':' + safe.slice(3, 5))
      } />
      <span className="time-sep">:</span>
      <TimePart value={mm} max={59} onChange={m =>
        onChange(safe.slice(0, 2) + ':' + String(m).padStart(2, '0'))
      } />
    </div>
  )
}

export default function Settings() {
  const [settings, setSettings] = useState(null)
  const [autoLaunch, setAutoLaunch] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    window.freshMind.getSettings().then(setSettings)
    window.freshMind.getAutoLaunch().then(setAutoLaunch)
  }, [])

  // Esc → закрыть окно
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') window.freshMind.closeSettings() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!panelRef.current) return
    const updateSize = () => {
      if (!panelRef.current) return
      window.freshMind.resizeSettings(panelRef.current.offsetHeight)
    }
    const observer = new ResizeObserver(updateSize)
    observer.observe(panelRef.current)
    updateSize()
    return () => observer.disconnect()
  }, [settings])

  async function toggle(key) {
    const updated = await window.freshMind.saveSettings({ [key]: !settings[key] })
    setSettings(updated)
  }

  async function toggleAutoLaunch() {
    const next = !autoLaunch
    await window.freshMind.setAutoLaunch(next)
    setAutoLaunch(next)
  }

  if (!settings) return null

  const popupOn = settings.popupEnabled !== false
  const pinnedOn = settings.pinnedToTray !== false
  const soundOn = settings.soundEnabled !== false

  return (
    <div className="settings-panel" ref={panelRef}>
      <button className="close-btn" onClick={() => window.freshMind.closeSettings()} title="Закрыть">×</button>

      <div className="settings-hero">
        <img src={logo} alt="" className="hero-logo" />
        <div className="hero-bar">
          <span className="hero-title">Fresh Mind</span>
          <span className="hero-sub">дневник мыслей</span>
        </div>
      </div>

      <div className="settings-divider" />

      <div className="settings-row">
        <span className="row-label">Запускать с Windows</span>
        <div className="row-control">
          <button
            className={`toggle ${autoLaunch ? 'on' : ''}`}
            onClick={toggleAutoLaunch}
          >
            <span className="toggle-knob" />
          </button>
        </div>
      </div>

      <div className="settings-row">
        <span className="row-label">Работать в фоне</span>
        <div className="row-control">
          <button
            className={`toggle ${pinnedOn ? 'on' : ''}`}
            onClick={() => toggle('pinnedToTray')}
          >
            <span className="toggle-knob" />
          </button>
        </div>
      </div>

      <div className="settings-row">
        <span className="row-label">Попап-напоминание</span>
        <div className="row-control">
          <button
            className={`toggle ${popupOn ? 'on' : ''}`}
            onClick={() => toggle('popupEnabled')}
          >
            <span className="toggle-knob" />
          </button>
        </div>
      </div>

      <div className={`settings-row ${popupOn ? '' : 'row-dimmed'}`}>
        <span className="row-label">Время уведомления</span>
        <div className="row-control">
          <TimeScroller value={settings.notifyTime || '22:00'} onChange={async v => {
            const updated = await window.freshMind.saveSettings({ notifyTime: v })
            setSettings(updated)
          }} />
        </div>
      </div>

      <div className="settings-row">
        <span className="row-label">Звук отклика</span>
        <div className="row-control">
          <button
            className={`toggle ${soundOn ? 'on' : ''}`}
            onClick={() => toggle('soundEnabled')}
          >
            <span className="toggle-knob" />
          </button>
        </div>
      </div>

      <button
        className="settings-row settings-row-link"
        onClick={() => window.freshMind.openSphereSettings()}
      >
        <span className="row-label">Сферы и группы</span>
        <span className="row-arrow">›</span>
      </button>

      <button
        className="settings-row settings-row-link"
        onClick={() => window.freshMind.openBackup()}
      >
        <span className="row-label">Бэкап и данные</span>
        <span className="row-arrow">›</span>
      </button>

      <button
        className="settings-row settings-row-link settings-row-trash"
        onClick={() => window.freshMind.openTrash()}
      >
        <span className="row-label row-label-with-icon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="row-icon-trash">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
          Корзина
        </span>
        <span className="row-arrow">›</span>
      </button>

      <button
        className="settings-about-link"
        onClick={() => window.freshMind.openAbout()}
      >о приложении</button>

      <div className="settings-actions">
        <button className="btn-primary" onClick={() => window.freshMind.quitApp()}>
          Выход
        </button>
      </div>
    </div>
  )
}
