import React, { useEffect, useMemo, useState } from 'react'
import './CompareDeltas.css'

export default function CompareDeltas({ dateA, dateB, refreshKey = 0 }) {
  const [spheres, setSpheres] = useState([])
  const [aRatings, setARatings] = useState([])
  const [bRatings, setBRatings] = useState([])

  useEffect(() => {
    Promise.all([
      window.freshMind.getSpheres(),
      window.freshMind.getRatingsForDate(dateA),
      window.freshMind.getRatingsForDate(dateB)
    ]).then(([sphs, a, b]) => {
      setSpheres((sphs || []).filter(s => !s.archived))
      setARatings(a || [])
      setBRatings(b || [])
    })
  }, [dateA, dateB, refreshKey])

  const deltas = useMemo(() => {
    const aMap = new Map(aRatings.map(r => [r.sphere_id, r.value]))
    const bMap = new Map(bRatings.map(r => [r.sphere_id, r.value]))
    const out = []
    for (const s of spheres) {
      const a = aMap.get(s.id)
      const b = bMap.get(s.id)
      if (a == null || b == null) continue
      out.push({ sphere: s, delta: a - b, a, b })
    }
    return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
  }, [spheres, aRatings, bRatings])

  return (
    <div className="compare-deltas">
      <div className="cd-header">
        <span className="cd-title">Дельты по сферам</span>
        <span className="cd-hint">{dateA} vs {dateB} · сортировка по силе изменения</span>
      </div>
      {deltas.length === 0 ? (
        <div className="cd-empty">Нет сфер с оценками в обеих датах — нечего сравнивать</div>
      ) : (
        <div className="cd-row">
          {deltas.map(({ sphere, delta, a, b }) => (
            <span
              key={sphere.id}
              className={`cd-chip ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'zero'}`}
              title={`${b} → ${a}`}
            >
              <span className="cd-chip-dot" style={{ background: sphere.color }} />
              <span className="cd-chip-name">{sphere.name}</span>
              <span className="cd-chip-delta">
                {delta > 0 ? '+' : delta < 0 ? '−' : ''}{Math.abs(delta)}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
