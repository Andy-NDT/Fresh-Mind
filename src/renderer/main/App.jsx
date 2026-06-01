import React, { useEffect, useMemo, useRef, useState } from 'react'
import ShareDialog from '../shared/ShareDialog.jsx'
import logo from '../shared/brain.png'
import QuickCapture from './QuickCapture'
import RadarChart from './RadarChart'
import DashboardSummary from './DashboardSummary'
import CompareDeltas from './CompareDeltas'
import TrendBlock from './TrendBlock'
import SphereDetailPanel from './SphereDetailPanel'
import EntryFeed from './EntryFeed'
import SummaryPanel from './SummaryPanel'
import OnThisDay from './OnThisDay'
import Onboarding from './Onboarding'
import './QuickCapture.css'

const PROMPTS = [
  'Что узнал о себе сегодня?',
  'Что копится?',
  'Что бесит / что радует?',
  'Что хочется зафиксировать?',
  'А что если коротко?',
  'Поймал инсайт?',
  'Что сегодня дёрнуло?',
  'Что не отпускает?'
]
const CARD_GROUP_ORDER = ['Здоровье', 'Развитие', 'Труд', 'Общество']

function todayISOLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function App() {
  const [savedCount, setSavedCount] = useState(0)
  const [savedToastVisible, setSavedToastVisible] = useState(false)
  const [detailSphereId, setDetailSphereId] = useState(null)
  const [dashboardExpanded, setDashboardExpanded] = useState(false)
  const [qcAutoOpen, setQcAutoOpen] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [ratingTick, setRatingTick] = useState(0)

  // Решение показывать ли онбординг — на основании настроек и пустой ли БД.
  // В dev-режиме — уважаем только флаг (чтобы можно было протестировать с непустой БД).
  useEffect(() => {
    if (!window.freshMind) return
    Promise.all([
      window.freshMind.getSettings(),
      window.freshMind.listEntries({ limit: 1 }),
      window.freshMind.getLatestRatings(todayISOLocal()),
      window.freshMind.isDev ? window.freshMind.isDev() : Promise.resolve(false)
    ]).then(async ([s, entries, ratings, dev]) => {
      if (dev) {
        // В dev: показываем строго по флагу, без auto-mark на основании данных
        setShowOnboarding(s?.onboardingDone !== true)
        return
      }
      const hasAny = (entries?.length || 0) > 0 || (ratings?.length || 0) > 0
      if (hasAny && s?.onboardingDone !== true) {
        // Пользователь уже что-то ввёл — фиксируем флаг навсегда
        await window.freshMind.saveSettings({ onboardingDone: true })
      }
      setShowOnboarding(!hasAny && s?.onboardingDone !== true)
    })
  }, [savedCount, ratingTick])

  async function finishOnboarding() {
    setShowOnboarding(false)
    if (window.freshMind?.saveSettings) {
      await window.freshMind.saveSettings({ onboardingDone: true })
    }
  }

  // Тост «Сохранено» появляется на 2.5с при каждом инкременте savedCount, потом исчезает.
  useEffect(() => {
    if (savedCount === 0) return
    setSavedToastVisible(true)
    const t = setTimeout(() => setSavedToastVisible(false), 2500)
    return () => clearTimeout(t)
  }, [savedCount])

  // Глобальные клавиатурные сочетания в главном окне.
  // Шорткаты в input/textarea/contentEditable не перехватываем — там свои обработчики.
  useEffect(() => {
    function onKey(e) {
      const active = document.activeElement
      const inEditable = active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable
      )

      // Ctrl+F / Cmd+F → фокус на поиск в ленте записей
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F') && !e.shiftKey) {
        // Если уже в поиске — не перехватываем (даём системе)
        if (active && active.classList && active.classList.contains('ef-search')) return
        const search = document.querySelector('.ef-search')
        if (search) {
          e.preventDefault()
          if (!dashboardExpanded) setDashboardExpanded(true)
          // даём время отрисоваться, если только что развернули
          setTimeout(() => { search.focus(); search.select() }, dashboardExpanded ? 0 : 80)
        }
      }

      // Ctrl+, / Cmd+, → открыть Настройки (стандартный shortcut приложений)
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        if (window.freshMind && window.freshMind.openSettings) window.freshMind.openSettings()
      }

      // Esc вне инпутов — закрывает развёрнутый дашборд до компакта
      if (e.key === 'Escape' && !inEditable && dashboardExpanded) {
        // Esc приоритеты обрабатываются дочерними компонентами (lightbox, sphere-detail, edit).
        // Здесь — только финальный fallback на сворачивание дашборда.
        // Чтобы не мешать им — проверяем, нет ли активного оверлея.
        const hasOverlay = document.querySelector('.ef-lightbox, .sphere-detail-panel')
        if (!hasOverlay) {
          e.preventDefault()
          setDashboardExpanded(false)
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dashboardExpanded])
  const [cardPrompt] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)])
  const [cardGroups, setCardGroups] = useState([])
  const [cardSpheres, setCardSpheres] = useState([])
  const [cardRatings, setCardRatings] = useState([])
  const [date, setDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [compareDate, setCompareDate] = useState(null)
  const [compareShareOpen, setCompareShareOpen] = useState(false)
  const compareRef = useRef(null)
  const [isMaximized, setIsMaximized] = useState(false)

  function shiftStr(iso, deltaDays) {
    const [y, m, d] = iso.split('-').map(Number)
    const nx = new Date(y, m - 1, d + deltaDays)
    return `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, '0')}-${String(nx.getDate()).padStart(2, '0')}`
  }

  function toggleCompare() {
    if (compareDate) setCompareDate(null)
    else setCompareDate(shiftStr(date, -7))
  }

  function setComparePreset(days) {
    setCompareDate(shiftStr(date, -days))
  }

  useEffect(() => {
    if (!window.freshMind) return
    window.freshMind.isMainMaximized().then(setIsMaximized)
    const off = window.freshMind.onMainMaximizeChange(setIsMaximized)
    return () => { if (off) off() }
  }, [])

  // Авто-ресайз окна при сворачивании / разворачивании дашборда
  useEffect(() => {
    if (!window.freshMind || !window.freshMind.resizeMain) return
    const compactH = showOnboarding ? 230 : 168
    window.freshMind.resizeMain(dashboardExpanded ? 800 : compactH)
  }, [dashboardExpanded, showOnboarding])

  // Данные для compact-карточки (4 группы и счётчик)
  useEffect(() => {
    if (!window.freshMind) return
    Promise.all([
      window.freshMind.getGroups(),
      window.freshMind.getSpheres(),
      window.freshMind.getRatingsForDate(todayISOLocal())
    ]).then(([gs, ss, rs]) => {
      setCardGroups(gs || [])
      setCardSpheres((ss || []).filter(s => !s.archived))
      setCardRatings(rs || [])
    })
  }, [savedCount, dashboardExpanded])

  const cardStats = useMemo(() => {
    if (!cardGroups.length) return []
    const byName = new Map(cardGroups.map(g => [g.name?.trim(), g]))
    const ratingMap = new Map(cardRatings.map(r => [r.sphere_id, r.value]))
    return CARD_GROUP_ORDER.map(name => {
      const g = byName.get(name)
      if (!g) return null
      const inGroup = cardSpheres
        .filter(s => s.group_id === g.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .slice(0, 5)
      const rated = inGroup.filter(s => ratingMap.has(s.id))
      const avg = rated.length
        ? rated.reduce((sum, s) => sum + ratingMap.get(s.id), 0) / rated.length
        : null
      return { group: g, avg }
    }).filter(Boolean)
  }, [cardGroups, cardSpheres, cardRatings])

  const totalRated = cardRatings.length
  const totalSpheres = Math.min(cardSpheres.length, 20)

  return (
    <div className="main-panel">
      <div className={`titlebar ${dashboardExpanded ? '' : 'titlebar-compact'}`}>
        <div className="titlebar-brand">
          {dashboardExpanded ? (
            <>
              <img src={logo} alt="" className="titlebar-logo" />
              <span className="titlebar-title">Fresh Mind</span>
              <span className="titlebar-sub">дневник мыслей</span>
            </>
          ) : (
            <span className="titlebar-mini">fresh mind · сегодня</span>
          )}
        </div>
        <div className="titlebar-buttons">
          {dashboardExpanded && (
            <button
              className="tbbtn"
              onClick={() => setDashboardExpanded(false)}
              title="Свернуть к карточке"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 6.5L5 3.5L8 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <button
            className="tbbtn"
            onClick={() => window.freshMind.minimizeMain()}
            title="Свернуть"
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="1" y1="8" x2="9" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <button
            className="tbbtn"
            onClick={() => window.freshMind.toggleMaximizeMain()}
            title={isMaximized ? 'В окно' : 'Развернуть'}
          >
            {isMaximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="1.5" y="3" width="5.5" height="5.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M3 3V1.5h5.5V7H7" stroke="currentColor" strokeWidth="1.6" fill="none" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="1.5" y="1.5" width="7" height="7" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            )}
          </button>
          <button
            className="tbbtn"
            onClick={() => window.freshMind.closeMain()}
            title="Закрыть"
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="main-content">
        {!dashboardExpanded && (
          <div className="card-collapsed">
            {showOnboarding ? (
              <Onboarding
                onRecordThought={() => { setDashboardExpanded(true); setQcAutoOpen(true) }}
                onMarkState={() => { setDashboardExpanded(true); setShowOnboarding(false) }}
                onDismiss={finishOnboarding}
              />
            ) : (
              <>
                <div className="card-prompt">{cardPrompt}</div>
                <QuickCapture
                  onSaved={() => setSavedCount(c => c + 1)}
                  onExpandRequest={() => { setDashboardExpanded(true); setQcAutoOpen(true) }}
                />
                <div className="card-sub">Сегодня отмечено {totalRated} / {totalSpheres} сфер</div>
                <div className="card-actions">
                  <button
                    className="card-action card-action-primary"
                    onClick={() => { setDashboardExpanded(true); setQcAutoOpen(false) }}
                  >Открыть</button>
                  <button
                    className="card-action card-action-secondary"
                    onClick={() => window.freshMind.closeMain()}
                  >Позже</button>
                </div>
              </>
            )}
          </div>
        )}

        {dashboardExpanded && (
          <>
        <QuickCapture
          onSaved={() => setSavedCount(c => c + 1)}
          autoOpen={qcAutoOpen}
          onAutoOpened={() => setQcAutoOpen(false)}
        />

        {savedToastVisible && (
          <div className="qc-saved-toast">✓ Сохранено</div>
        )}
          </>
        )}

        {dashboardExpanded && (
        <>
        {showOnboarding && (
          <Onboarding
            onRecordThought={() => { setQcAutoOpen(true) }}
            onMarkState={() => setShowOnboarding(false)}
            onDismiss={finishOnboarding}
          />
        )}

        <OnThisDay refreshKey={savedCount} />

        {compareDate && (
          <div className="section-divider">
            <span className="section-label">Сравнение колёс</span>
            <button
              className="section-share-btn"
              onClick={() => setCompareShareOpen(true)}
              title="Скачать сравнение как картинку"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
            </button>
          </div>
        )}

        <div ref={compareRef} className="radar-compare-wrap">
        <div className={`radar-stage ${compareDate ? 'is-compare' : ''}`}>
          <RadarChart
            date={date}
            onDateChange={setDate}
            onSphereDetail={(id) => setDetailSphereId(prev => prev === id ? null : id)}
            isComparing={!!compareDate}
            onCompareToggle={toggleCompare}
            compact={!!compareDate}
            refreshSignal={savedCount}
            onRatingChanged={() => setRatingTick(t => t + 1)}
          />
          {compareDate && (
            <RadarChart
              date={compareDate}
              onDateChange={setCompareDate}
              onSphereDetail={(id) => setDetailSphereId(prev => prev === id ? null : id)}
              isComparing={true}
              onCompareToggle={toggleCompare}
              compact={true}
              hideHint={true}
              refreshSignal={savedCount}
              comparePresets={true}
              onComparePreset={setComparePreset}
            />
          )}
        </div>

        {compareDate && (
          <CompareDeltas dateA={date} dateB={compareDate} refreshKey={savedCount} />
        )}
        </div>

        {compareDate && (
          <ShareDialog
            isOpen={compareShareOpen}
            onClose={() => setCompareShareOpen(false)}
            targetRef={compareRef}
            filenameStem={`fresh-mind-compare-${date}-vs-${compareDate}`}
            title="Скачать сравнение двух дат"
            defaultSize="landscape"
            defaultBackground="white"
          />
        )}

        {detailSphereId != null && (
          <SphereDetailPanel
            sphereId={detailSphereId}
            refreshKey={savedCount}
            onClose={() => setDetailSphereId(null)}
          />
        )}

        <DashboardSummary
          date={date}
          compareDate={compareDate}
          refreshKey={savedCount}
        />

        <div className="section-divider">
          <span className="section-label">Динамика</span>
        </div>

        <TrendBlock date={date} refreshKey={savedCount} />

        <SummaryPanel refreshKey={savedCount} />

        <div className="section-divider">
          <span className="section-label">Записи</span>
        </div>

        <EntryFeed refreshKey={savedCount} />
        </>
        )}

      </div>
    </div>
  )
}
