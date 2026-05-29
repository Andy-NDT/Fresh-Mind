import React, { useEffect, useRef, useState } from 'react'
import logo from '../shared/brain.png'

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
