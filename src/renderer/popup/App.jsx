import React, { useEffect, useRef, useState } from 'react'
import logo from '../shared/brain.png'
import './App.css'

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
const RADAR_GROUP_ORDER = ['Здоровье', 'Развитие', 'Труд', 'Общество']

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function App() {
  const [prompt] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)])
  const [groups, setGroups] = useState([])
  const [spheres, setSpheres] = useState([])
  const [ratings, setRatings] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!panelRef.current) return
    const updateSize = () => {
      if (!panelRef.current) return
      window.freshMind.resizePopup(panelRef.current.offsetHeight)
    }
    const observer = new ResizeObserver(updateSize)
    observer.observe(panelRef.current)
    updateSize()
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    Promise.all([
      window.freshMind.getGroups(),
      window.freshMind.getSpheres(),
      window.freshMind.getRatingsForDate(todayISO())
    ]).then(([gs, ss, rs]) => {
      setGroups(gs || [])
      setSpheres((ss || []).filter(s => !s.archived))
      setRatings(rs || [])
    })
  }, [refreshKey])

  // Группа -> средняя по канон. 5 сферам
  const groupStats = React.useMemo(() => {
    if (!groups.length) return []
    const byName = new Map(groups.map(g => [g.name?.trim(), g]))
    const ratingMap = new Map(ratings.map(r => [r.sphere_id, r.value]))
    return RADAR_GROUP_ORDER.map(name => {
      const g = byName.get(name)
      if (!g) return null
      const inGroup = spheres
        .filter(s => s.group_id === g.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .slice(0, 5)
      const rated = inGroup.filter(s => ratingMap.has(s.id))
      const avg = rated.length
        ? rated.reduce((sum, s) => sum + ratingMap.get(s.id), 0) / rated.length
        : null
      return { group: g, avg }
    }).filter(Boolean)
  }, [groups, spheres, ratings])

  const totalRated = ratings.length
  const totalTotal = Math.min(spheres.length, 20)

  return (
    <div className="popup-mind" ref={panelRef}>
      <div className="popup-header">
        <img src={logo} alt="" className="popup-logo" />
        <div className="popup-brand">
          <span className="popup-name">fresh mind</span>
          <span className="popup-meta">· сегодня</span>
        </div>
        <button
          className="popup-iconbtn"
          onClick={() => setRefreshKey(k => k + 1)}
          title="Обновить"
        >↻</button>
      </div>

      <div className="popup-stats">
        {groupStats.map(({ group, avg }) => (
          <div key={group.id} className="popup-stat" style={{ borderColor: group.color }}>
            <span className="popup-stat-name">{group.name}</span>
            <span className="popup-stat-value">{avg != null ? avg.toFixed(1) : '—'}</span>
          </div>
        ))}
      </div>

      <div className="popup-title">{prompt}</div>
      <div className="popup-subtitle">
        Сегодня отмечено {totalRated} / {totalTotal} сфер
      </div>

      <div className="popup-actions">
        <button
          className="popup-action popup-action-primary"
          onClick={() => {
            window.freshMind.openMain()
            window.freshMind.closePopup()
          }}
        >
          Записать
        </button>
        <button
          className="popup-action popup-action-secondary"
          onClick={() => window.freshMind.closePopup()}
        >
          Позже
        </button>
      </div>
    </div>
  )
}
