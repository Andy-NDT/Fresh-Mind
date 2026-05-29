import React, { useEffect, useRef, useState } from 'react'
import brainIcon from '../shared/brain.png'
import earIcon from '../shared/ear-icon.png'
import eyeIcon from '../shared/eye-icon.png'

export default function App() {
  const [version, setVersion] = useState('')
  const [showDataInfo, setShowDataInfo] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    if (window.freshMind?.getAppVersion) {
      window.freshMind.getAppVersion().then(setVersion)
    }
  }, [])

  useEffect(() => {
    if (!panelRef.current) return
    const update = () => {
      if (panelRef.current) window.freshMind.resizeAbout(panelRef.current.offsetHeight)
    }
    const ro = new ResizeObserver(update)
    ro.observe(panelRef.current)
    update()
    return () => ro.disconnect()
  }, [showDataInfo])

  // Esc → закрыть окно
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') window.freshMind.closeAbout() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function openLink(url) {
    window.freshMind.openExternal(url)
  }

  return (
    <div className="ab-panel" ref={panelRef}>
      <button className="ab-close" onClick={() => window.freshMind.closeAbout()} title="Закрыть">×</button>

      <div className="ab-hero">
        <img src={brainIcon} alt="Fresh Mind" className="ab-logo" />
        <div className="ab-title">Fresh Mind</div>
        {version && <div className="ab-version">v{version}</div>}
      </div>

      <div className="ab-manifesto">
        <div>Дневник твоего состояния.</div>
        <div>Локально. Без облака. Без ИИ.</div>
        <div>Данные твои — навсегда.</div>
      </div>

      {/*
        Кросс-описания продуктов линейки Fresh (единый «голос» — «твоё/твои»):
        - Mind:  «Твоя жизнь как на ладони. Колесо сфер, дневник и сравнение во времени.»
        - Ear:   «Твоё творчество не должно лежать в папках. Один забытый трек в день — чтобы вернуться к нему.»
        - Eye:   «Твои видео не должны быть забыты. Один файл в день — чтобы вспомнить, опубликовать или удалить.»
        В About-окнах Ear и Eye использовать те же тексты в их секции «Другие приложения».
      */}
      <div className="ab-family-label">Другие приложения</div>
      <div className="ab-family">
        <div className="ab-family-item">
          <img src={earIcon} alt="Fresh Ear" className="ab-family-icon" />
          <span className="ab-family-name">Fresh Ear</span>
          <span className="ab-family-desc">Твоё творчество не должно лежать в папках. Один забытый трек в день — чтобы вернуться к нему.</span>
        </div>
        <div className="ab-family-item">
          <img src={eyeIcon} alt="Fresh Eye" className="ab-family-icon" />
          <span className="ab-family-name">Fresh Eye</span>
          <span className="ab-family-desc">Твои видео не должны быть забыты. Один файл в день — чтобы вспомнить, опубликовать или удалить.</span>
        </div>
      </div>

      {!showDataInfo ? (
        <button className="ab-data-link" onClick={() => setShowDataInfo(true)} title="Показать путь к папке с данными">
          Где мои данные?
        </button>
      ) : (
        <div className="ab-data-info">
          <div className="ab-data-info-text">
            Все твои записи, оценки и картинки хранятся локально на твоём компьютере в папке:
          </div>
          <div className="ab-data-path">%APPDATA%/fresh-mind/</div>
          <div className="ab-data-info-text">
            Делай бэкап через Настройки → Бэкап и данные.
          </div>
          <div className="ab-data-actions">
            <button className="ab-data-btn ab-data-btn-secondary" onClick={() => setShowDataInfo(false)}>Скрыть</button>
            <button className="ab-data-btn ab-data-btn-primary" onClick={() => window.freshMind.openDataFolder()}>Открыть папку</button>
          </div>
        </div>
      )}

      <div className="ab-author-row">
        <button className="ab-author-btn ab-author-site" onClick={() => openLink('https://andy-ndt.vercel.app/')} title="Открыть сайт автора в браузере">
          andy-ndt.vercel.app
        </button>
        <button className="ab-author-btn ab-author-tg" onClick={() => openLink('https://t.me/TretyakovAndy')} title="Открыть Telegram автора">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/>
          </svg>
          @TretyakovAndy
        </button>
      </div>
    </div>
  )
}
