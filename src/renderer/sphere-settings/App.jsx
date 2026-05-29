import React, { useEffect, useMemo, useRef, useState } from 'react'

const COLOR_PALETTE = [
  '#FF7043', '#FF8A65', '#FFAB91', '#FFB74D', '#FFCC80', '#FFE0B2',
  '#7CB342', '#9CCC65', '#AED581', '#558B2F', '#689F38', '#DCEDC8',
  '#0277BD', '#0288D1', '#29B6F6', '#26C6DA', '#4DD0E1', '#B2EBF2',
  '#AB47BC', '#BA68C8', '#9575CD', '#F06292', '#EC407A', '#E1BEE7',
  '#6D4C41', '#8D6E63', '#A1887F', '#78909C', '#90A4AE', '#B0BEC5'
]

export default function App() {
  const [groups, setGroups] = useState([])
  const [spheres, setSpheres] = useState([])
  const [colorPickerFor, setColorPickerFor] = useState(null) // {type:'group'|'sphere', id}
  const [confirmDelete, setConfirmDelete] = useState(null)   // {type, id, name}
  const panelRef = useRef(null)
  const dragStateRef = useRef(null)

  useEffect(() => {
    refresh()
  }, [])

  // Esc: сначала закрывает попап (палитра / подтверждение удаления), потом окно
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (colorPickerFor) { setColorPickerFor(null); return }
      if (confirmDelete) { setConfirmDelete(null); return }
      // Если фокус в input — даём ему обработать Esc (например снять фокус)
      const a = document.activeElement
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) { a.blur(); return }
      window.freshMind.closeSphereSettings()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [colorPickerFor, confirmDelete])

  useEffect(() => {
    if (!panelRef.current) return
    const update = () => {
      if (panelRef.current) window.freshMind.resizeSphereSettings(panelRef.current.offsetHeight)
    }
    const ro = new ResizeObserver(update)
    ro.observe(panelRef.current)
    update()
    return () => ro.disconnect()
  }, [groups, spheres])

  async function refresh() {
    const [gs, ss] = await Promise.all([
      window.freshMind.getGroups(),
      window.freshMind.getSpheresAll()
    ])
    setGroups((gs || []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)))
    setSpheres((ss || []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)))
  }

  function spheresInGroup(groupId) {
    return spheres
      .filter(s => s.group_id === groupId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }

  async function updateSphere(sphere, patch) {
    const next = { ...sphere, ...patch }
    setSpheres(prev => prev.map(s => s.id === sphere.id ? next : s))
    await window.freshMind.saveSphere(next)
  }

  async function updateGroup(group, patch) {
    const next = { ...group, ...patch }
    setGroups(prev => prev.map(g => g.id === group.id ? next : g))
    await window.freshMind.saveGroup(next)
  }

  async function addSphere(groupId) {
    const inGroup = spheresInGroup(groupId)
    const maxOrder = inGroup.length ? Math.max(...inGroup.map(s => s.sort_order ?? 0)) + 1 : 0
    const group = groups.find(g => g.id === groupId)
    const newSphere = await window.freshMind.saveSphere({
      name: 'Новая сфера',
      color: group?.color || '#9B7BD9',
      group_id: groupId,
      sort_order: maxOrder,
      scale_min: 0,
      scale_max: 10
    })
    setSpheres(prev => [...prev, newSphere])
  }

  async function addGroup() {
    const maxOrder = groups.length ? Math.max(...groups.map(g => g.sort_order ?? 0)) + 1 : 0
    const newGroup = await window.freshMind.saveGroup({
      name: 'Новая группа',
      color: '#9B7BD9',
      sort_order: maxOrder
    })
    setGroups(prev => [...prev, newGroup])
  }

  async function deleteSphereConfirmed(id) {
    await window.freshMind.deleteSphere(id)
    setSpheres(prev => prev.filter(s => s.id !== id))
    setConfirmDelete(null)
  }

  async function deleteGroupConfirmed(id) {
    await window.freshMind.deleteGroup(id)
    setGroups(prev => prev.filter(g => g.id !== id))
    // Spheres get group_id=NULL via FK ON DELETE SET NULL
    await refresh()
    setConfirmDelete(null)
  }

  function pickColor(type, id, color) {
    if (type === 'sphere') {
      const s = spheres.find(x => x.id === id)
      if (s) updateSphere(s, { color })
    } else {
      const g = groups.find(x => x.id === id)
      if (g) updateGroup(g, { color })
    }
    setColorPickerFor(null)
  }

  // ── Drag & drop reorder ──────────────────────────────────
  function onDragStart(e, sphereId, groupId) {
    dragStateRef.current = { sphereId, groupId }
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', String(sphereId)) } catch {}
    e.currentTarget.classList.add('is-dragging')
  }

  function onDragEnd(e) {
    e.currentTarget.classList.remove('is-dragging')
    dragStateRef.current = null
  }

  function onDragOver(e) {
    if (!dragStateRef.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  async function onDrop(e, targetSphereId, targetGroupId) {
    e.preventDefault()
    const drag = dragStateRef.current
    if (!drag) return
    const draggedSphere = spheres.find(s => s.id === drag.sphereId)
    if (!draggedSphere) return

    // Если перетащили в другую группу — обновим group_id
    if (draggedSphere.group_id !== targetGroupId) {
      await updateSphere(draggedSphere, { group_id: targetGroupId })
    }

    // Переставляем в порядке группы
    const targetGroupSpheres = spheresInGroup(targetGroupId).filter(s => s.id !== drag.sphereId)
    const targetIdx = targetSphereId
      ? targetGroupSpheres.findIndex(s => s.id === targetSphereId)
      : targetGroupSpheres.length
    const insertAt = targetIdx < 0 ? targetGroupSpheres.length : targetIdx
    const reordered = [
      ...targetGroupSpheres.slice(0, insertAt),
      { ...draggedSphere, group_id: targetGroupId },
      ...targetGroupSpheres.slice(insertAt)
    ]
    // Сохраним новые sort_order
    for (let i = 0; i < reordered.length; i++) {
      const s = reordered[i]
      if ((s.sort_order ?? -1) !== i) {
        await window.freshMind.saveSphere({ ...s, sort_order: i, group_id: targetGroupId })
      }
    }
    dragStateRef.current = null
    await refresh()
  }

  return (
    <div className="ss-panel" ref={panelRef}>
      <div className="ss-header">
        <span className="ss-title">Сферы и группы</span>
        <button className="ss-close" onClick={() => window.freshMind.closeSphereSettings()} title="Закрыть">×</button>
      </div>

      <div className="ss-hint">
        Перетаскивай сферы за <span className="ss-handle-icon">≡</span> чтобы менять порядок или переносить в другую группу. Цвет — клик по точке.
      </div>

      <div className="ss-groups">
        {groups.map(group => {
          const list = spheresInGroup(group.id)
          return (
            <div key={group.id} className="ss-group" style={{ '--group-color': group.color }}>
              <div className="ss-group-header">
                <button
                  className="ss-color-swatch"
                  style={{ background: group.color }}
                  onClick={() => setColorPickerFor({ type: 'group', id: group.id })}
                  title="Сменить цвет"
                />
                <input
                  className="ss-group-name"
                  value={group.name}
                  onChange={e => updateGroup(group, { name: e.target.value })}
                />
                <button
                  className="ss-iconbtn ss-del-btn"
                  onClick={() => setConfirmDelete({ type: 'group', id: group.id, name: group.name })}
                  title="Удалить группу"
                >×</button>
              </div>

              <div className="ss-spheres-list">
                {list.map(s => (
                  <div
                    key={s.id}
                    className={`ss-sphere-row ${s.archived ? 'is-archived' : ''}`}
                    draggable
                    onDragStart={(e) => onDragStart(e, s.id, group.id)}
                    onDragEnd={onDragEnd}
                    onDragOver={onDragOver}
                    onDrop={(e) => onDrop(e, s.id, group.id)}
                  >
                    <span className="ss-handle" title="Перетащить">≡</span>
                    <button
                      className="ss-color-swatch ss-sphere-color"
                      style={{ background: s.color }}
                      onClick={() => setColorPickerFor({ type: 'sphere', id: s.id })}
                      title="Сменить цвет"
                    />
                    <input
                      className="ss-sphere-name"
                      value={s.name}
                      onChange={e => updateSphere(s, { name: e.target.value })}
                    />
                    <button
                      className={`ss-iconbtn ss-archive-btn ${s.archived ? 'on' : ''}`}
                      onClick={() => updateSphere(s, { archived: !s.archived })}
                      title={s.archived ? 'Достать из архива' : 'Архивировать'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="6" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="1.6"/>
                        <path d="M5 10v9a1 1 0 001 1h12a1 1 0 001-1v-9M10 14h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                      </svg>
                    </button>
                    <button
                      className="ss-iconbtn ss-del-btn"
                      onClick={() => setConfirmDelete({ type: 'sphere', id: s.id, name: s.name })}
                      title="Удалить сферу"
                    >×</button>
                  </div>
                ))}
                <button
                  className="ss-add-sphere"
                  onClick={() => addSphere(group.id)}
                  onDragOver={onDragOver}
                  onDrop={(e) => onDrop(e, null, group.id)}
                >+ сфера</button>
              </div>
            </div>
          )
        })}

        <button className="ss-add-group" onClick={addGroup}>
          + Добавить группу
        </button>
      </div>

      {/* Color picker popover */}
      {colorPickerFor && (
        <div className="ss-color-popover" onClick={(e) => { if (e.target === e.currentTarget) setColorPickerFor(null) }}>
          <div className="ss-color-grid">
            {COLOR_PALETTE.map(c => (
              <button
                key={c}
                className="ss-color-pick"
                style={{ background: c }}
                onClick={() => pickColor(colorPickerFor.type, colorPickerFor.id, c)}
                title={c}
              />
            ))}
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="ss-confirm-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null) }}>
          <div className="ss-confirm">
            <div className="ss-confirm-title">
              {confirmDelete.type === 'group' ? 'Удалить группу' : 'Удалить сферу'} «{confirmDelete.name}»?
            </div>
            <div className="ss-confirm-hint">
              {confirmDelete.type === 'sphere'
                ? 'Все оценки и привязки записей к этой сфере будут удалены.'
                : 'Сферы из этой группы останутся, но без группы. Их можно будет привязать к другой.'}
            </div>
            <div className="ss-confirm-actions">
              <button className="ss-btn ss-btn-secondary" onClick={() => setConfirmDelete(null)}>Отмена</button>
              <button
                className="ss-btn ss-btn-danger"
                onClick={() => confirmDelete.type === 'sphere'
                  ? deleteSphereConfirmed(confirmDelete.id)
                  : deleteGroupConfirmed(confirmDelete.id)}
              >Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
