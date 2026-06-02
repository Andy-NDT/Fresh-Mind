import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import Picker from '@emoji-mart/react'
import emojiData from '@emoji-mart/data'
import { randomPlaceholder } from './placeholders'
import ValueSelectorRow from './ValueSelectorRow'

// Настроения: тяжёлое → нейтральное → светлое. Покрывает основные состояния.
const MOOD_QUICK = [
  '😭', '😩', '😢', '😞', '😠', '😤', '😟', '😨',
  '😕', '😐', '🤔', '🎯', '🙂', '😌', '😊', '🤩'
]
const HIGHLIGHT_COLORS = [
  { name: 'без', value: null },
  // Пастельные
  { name: 'жёлтый',     value: '#FFF3A8' },
  { name: 'охра',       value: '#FFE08A' },
  { name: 'персик',     value: '#FFD4B8' },
  { name: 'коралл',     value: '#FFB8B8' },
  { name: 'розовый',    value: '#F8D4E0' },
  { name: 'фуксия',     value: '#F0B8DC' },
  { name: 'лавандовый', value: '#E0D3F0' },
  { name: 'сиреневый',  value: '#CFC0F0' },
  { name: 'индиго',     value: '#BFC8F0' },
  { name: 'голубой',    value: '#C5E3F1' },
  { name: 'небесный',   value: '#B8E0F0' },
  { name: 'бирюза',     value: '#A8E4DA' },
  { name: 'мятный',     value: '#C8EBC8' },
  { name: 'фисташка',   value: '#D8E8B0' },
  { name: 'оливка',     value: '#E0E0A8' },
  { name: 'кремовый',   value: '#F4E8D4' },
  { name: 'песок',      value: '#E8DAC0' },
  { name: 'серый',      value: '#DCDCE0' },
  { name: 'графит',     value: '#B8B8C0' }
]

function extractHashtags(text) {
  const re = /#([\p{L}\p{N}_\-]+)/gu
  const out = new Set()
  let m
  while ((m = re.exec(text))) out.add(m[1].toLowerCase())
  return [...out]
}

// Локальная (не UTC) дата «сегодня» — должна совпадать с тем, как считает дату
// колесо (RadarChart) и saveEntry в db.js, иначе оценка ляжет не на тот день.
function todayISOLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function QuickCapture({ onSaved, onRatingPersisted, onExpandRequest, autoOpen = false, onAutoOpened }) {
  const [expanded, setExpanded] = useState(false)
  const [placeholder, setPlaceholder] = useState(() => randomPlaceholder())
  const [spheres, setSpheres] = useState([])
  const [sphereValues, setSphereValues] = useState(new Map())  // sphereId -> 0..10
  const [openSphereId, setOpenSphereId] = useState(null)
  const [moodEmoji, setMoodEmoji] = useState(null)
  const [pinned, setPinned] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showFormatBar, setShowFormatBar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hasText, setHasText] = useState(false)
  const containerRef = useRef(null)
  // Ref на save() — нужен, чтобы хоткей в Tiptap editorProps (созданном один раз)
  // мог дёргать актуальную замыкание-функцию.
  const saveRef = useRef(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder }),
      Image.configure({ inline: false, allowBase64: false })
    ],
    content: '',
    autofocus: false,
    onUpdate: ({ editor }) => {
      setHasText(editor.getText().trim().length > 0 || editor.getHTML().includes('<img'))
    },
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault()
          saveRef.current && saveRef.current()
          return true
        }
        return false
      },
      handlePaste: (_view, event) => {
        // Перехватываем картинки из буфера → сохраняем на диск → вставляем как <img>
        const items = event.clipboardData && event.clipboardData.items
        if (!items) return false
        for (const item of items) {
          if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (!file) continue
            event.preventDefault()
            const ext = (file.type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '')
            file.arrayBuffer().then(buf => {
              const bytes = Array.from(new Uint8Array(buf))
              window.freshMind.saveAttachmentImage(bytes, ext).then(res => {
                if (res && res.url && editor) {
                  editor.chain().focus().setImage({ src: res.url }).run()
                }
              })
            })
            return true
          }
        }
        return false
      },
      handleDrop: (_view, event) => {
        // Drag&drop из проводника. Только изображения встраиваются в редактор.
        // ДЛЯ НЕ-ИЗОБРАЖЕНИЙ (pdf, docx, mp3, zip и т.п.) пока ничего не делаем —
        // в будущем добавим отдельную зону «Прикрепить файл», которая будет
        // писать запись в таблицу attachments (она уже есть в БД) и показывать
        // файлы как чипы с иконкой/размером ПОД текстом, не внутри редактора.
        const dt = event.dataTransfer
        if (!dt || !dt.files || !dt.files.length) return false
        const imgFile = Array.from(dt.files).find(f => f.type.startsWith('image/'))
        if (!imgFile) return false
        event.preventDefault()
        const ext = (imgFile.type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '')
        imgFile.arrayBuffer().then(buf => {
          const bytes = Array.from(new Uint8Array(buf))
          window.freshMind.saveAttachmentImage(bytes, ext).then(res => {
            if (res && res.url && editor) {
              editor.chain().focus().setImage({ src: res.url }).run()
            }
          })
        })
        return true
      }
    }
  })

  useEffect(() => {
    window.freshMind.getSpheres().then(setSpheres)
  }, [])

  // Авто-раскрытие при сигнале из родителя (клик по полю в compact-карточке)
  useEffect(() => {
    if (!autoOpen) return
    setExpanded(true)
    setTimeout(() => editor && editor.commands.focus(), 80)
    if (onAutoOpened) onAutoOpened()
  }, [autoOpen, editor])

  useEffect(() => {
    if (!showEmojiPicker && !showColorPicker) return
    function handleOutside(e) {
      const inEmoji = e.target.closest('.qc-emoji-popover')
      const inColor = e.target.closest('.qc-color-popover')
      const inTrigger = e.target.closest('.qc-action-btn')
      if (!inEmoji && !inColor && !inTrigger) {
        setShowEmojiPicker(false)
        setShowColorPicker(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [showEmojiPicker, showColorPicker])

  // Close value-row on click outside.
  // ВАЖНО: шкала (ValueSelectorRow) живёт в .qc-sphere-group-vsr — это СОСЕД
  // .qc-sphere-chip-wrap, а не его потомок. Если не исключить vsr из «клика снаружи»,
  // mousedown по цифре закроет шкалу до того, как сработает её onClick → onChange.
  useEffect(() => {
    if (openSphereId == null) return
    function handleOutside(e) {
      if (!e.target.closest('.qc-sphere-chip-wrap') && !e.target.closest('.qc-sphere-group-vsr')) {
        setOpenSphereId(null)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [openSphereId])

  // Collapse expanded panel on click outside the whole QC (draft stays in memory)
  useEffect(() => {
    if (!expanded) return
    function handleOutside(e) {
      // Не сворачиваем если клик внутри popover'ов emoji-mart (рендерится через portal)
      if (e.target.closest('.quick-capture')) return
      if (e.target.closest('em-emoji-picker') || e.target.closest('.qc-emoji-popover')) return
      collapse()
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [expanded])

  function expand() {
    if (expanded) return
    // Если родитель управляет раскрытием (compact-карточка) — просто сигналим;
    // setExpanded произойдёт у нового инстанса QC через autoOpen-проп.
    if (onExpandRequest) {
      onExpandRequest()
      return
    }
    setExpanded(true)
    setTimeout(() => editor && editor.commands.focus(), 50)
  }

  // Collapse without losing the draft (text + spheres + tags + mood + pin stay in memory)
  function collapse() {
    setExpanded(false)
    setShowFormatBar(false)
    setShowEmojiPicker(false)
    setShowColorPicker(false)
  }

  // Hard reset — для "Отмена" и после save
  function discard() {
    if (editor) editor.commands.clearContent()
    setSphereValues(new Map())
    setOpenSphereId(null)
    setMoodEmoji(null)
    setPinned(false)
    setHasText(false)
    setExpanded(false)
    setShowFormatBar(false)
    setShowEmojiPicker(false)
    setShowColorPicker(false)
    setPlaceholder(randomPlaceholder())
  }

  function hasDraft() {
    const text = editor ? editor.getText().trim() : ''
    return text.length > 0
      || sphereValues.size > 0
      || !!moodEmoji
      || pinned
  }

  const draftPreview = useMemo(() => {
    if (!editor) return ''
    const text = editor.getText().trim()
    if (!text) return ''
    const first = text.split(/\n+/)[0]
    return first.length > 60 ? first.slice(0, 57) + '…' : first
  }, [editor, expanded])

  function toggleSphereOpen(id) {
    setOpenSphereId(prev => (prev === id ? null : id))
  }

  function setSphereValue(id, value) {
    setSphereValues(prev => {
      const next = new Map(prev)
      next.set(id, value)
      return next
    })
  }

  // Выбор цифры в шкале: сразу выставляем сегодняшнюю оценку на колесо (persist),
  // как и прямой клик по сфере на радаре. Черновик-чип тоже обновляем, шкалу закрываем.
  async function pickSphereValue(id, value) {
    setSphereValue(id, value)
    setOpenSphereId(null)
    try {
      await window.freshMind.saveRating(id, todayISOLocal(), value, null, null)
      if (onRatingPersisted) onRatingPersisted()
    } catch (e) {
      console.error('saveRating failed', e)
    }
  }

  // Снять оценку (×): убираем и из черновика, и с колеса (за сегодня).
  async function clearSphereValue(id) {
    setSphereValues(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    setOpenSphereId(null)
    try {
      await window.freshMind.deleteRating(id, todayISOLocal())
      if (onRatingPersisted) onRatingPersisted()
    } catch (e) {
      console.error('deleteRating failed', e)
    }
  }

  function insertEmojiInText(emoji) {
    if (editor) editor.chain().focus().insertContent(emoji).run()
    setShowEmojiPicker(false)
  }

  function applyHighlight(color) {
    if (!editor) return
    if (color === null) editor.chain().focus().unsetHighlight().run()
    else editor.chain().focus().setHighlight({ color }).run()
    setShowColorPicker(false)
  }

  async function save() {
    if (!editor) return
    const content_json = editor.getJSON()
    const content_html = editor.getHTML()
    const content_text = editor.getText()
    if (!content_text.trim()) return

    const tags = extractHashtags(content_text)

    setSaving(true)
    try {
      const sphere_ratings = [...sphereValues.entries()].map(([sphere_id, value]) => ({ sphere_id, value }))
      const entry = await window.freshMind.saveEntry({
        content_json,
        content_html,
        content_text,
        mood_emoji: moodEmoji,
        pinned,
        tags,
        sphere_ratings
      })
      discard()
      if (onSaved) onSaved(entry)
    } catch (e) {
      console.error('saveEntry failed', e)
    } finally {
      setSaving(false)
    }
  }

  // Каждый рендер обновляем ref на save() — чтобы хоткей видел свежее замыкание
  useEffect(() => { saveRef.current = save })

  // TODO: после шага 5 (колесо) — добавить опциональный мост
  // "оценить сегодняшнее состояние" для выбранных сфер прямо здесь
  // (one-jest сохранение и entry, и ratings за сегодня)

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      // Esc на пустой форме = discard. С черновиком = collapse (не теряем).
      if (hasDraft()) collapse()
      else discard()
    }
  }

  const sphereGroups = useMemo(() => {
    const map = new Map()
    for (const s of spheres) {
      const key = s.group_name || '—'
      if (!map.has(key)) {
        map.set(key, { name: key, color: s.group_color || s.color, spheres: [] })
      }
      map.get(key).spheres.push(s)
    }
    return [...map.values()]
  }, [spheres])

  return (
    <div
      className={`quick-capture ${expanded ? 'is-expanded' : ''}`}
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      {!expanded && (
        <button
          className={`qc-collapsed ${hasDraft() ? 'has-draft' : ''}`}
          onClick={expand}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" className="qc-icon">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          {hasDraft() ? (
            <span className="qc-placeholder qc-placeholder-draft">
              <span className="qc-draft-label">продолжить запись…</span>
              {draftPreview && <span className="qc-draft-preview">{draftPreview}</span>}
            </span>
          ) : (
            <span className="qc-placeholder">{placeholder}</span>
          )}
        </button>
      )}

      {expanded && (
        <div className="qc-expanded">
          {/* Top actions */}
          <div className="qc-top-actions">
            <button
              className="qc-action-btn qc-collapse-btn"
              onClick={collapse}
              title="Свернуть (черновик сохраняется)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 15l7-7 7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div className="qc-top-spacer" />
            <button
              className={`qc-action-btn ${showFormatBar ? 'on' : ''}`}
              onClick={() => setShowFormatBar(v => !v)}
              title="Форматирование текста"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 7V5h14v2M9 5v14M15 14v5M11 14h8M14 14v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </button>
            <button
              className={`qc-action-btn ${showColorPicker ? 'on' : ''}`}
              onClick={() => { setShowColorPicker(v => !v); setShowEmojiPicker(false) }}
              title="Выделение цветом"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 3a9 9 0 109 9 4 4 0 01-4-4 4 4 0 01-4-4 4 4 0 01-1-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                <circle cx="7.5" cy="11" r="1" fill="currentColor"/>
                <circle cx="11" cy="7" r="1" fill="currentColor"/>
                <circle cx="14.5" cy="14.5" r="1" fill="currentColor"/>
              </svg>
            </button>
            <button
              className={`qc-action-btn ${showEmojiPicker ? 'on' : ''}`}
              onClick={() => { setShowEmojiPicker(v => !v); setShowColorPicker(false) }}
              title="Вставить эмодзи в текст"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"/>
                <circle cx="9" cy="10" r="1" fill="currentColor"/>
                <circle cx="15" cy="10" r="1" fill="currentColor"/>
                <path d="M8.5 14.5c1 1.5 2.3 2 3.5 2s2.5-.5 3.5-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
              </svg>
            </button>
            <button
              className={`qc-action-btn ${pinned ? 'on pinned' : ''}`}
              onClick={() => setPinned(v => !v)}
              title={pinned ? 'Открепить' : 'Закрепить как памятку'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'}>
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              className="qc-action-btn qc-save-btn"
              onClick={save}
              disabled={saving || !editor || !hasText}
              title="Сохранить (Ctrl+Enter)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                <path d="M7 3v6h9M17 21v-8H7v8" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          {/* Format bar — toggleable */}
          {showFormatBar && (
            <div className="qc-format-bar">
              <button
                className={`qc-fbtn ${editor && editor.isActive('bold') ? 'on' : ''}`}
                onClick={() => editor.chain().focus().toggleBold().run()}
                title="Жирный (Ctrl+B)"
              ><b>B</b></button>
              <button
                className={`qc-fbtn ${editor && editor.isActive('italic') ? 'on' : ''}`}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                title="Курсив (Ctrl+I)"
              ><i>I</i></button>
              <button
                className={`qc-fbtn ${editor && editor.isActive('underline') ? 'on' : ''}`}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                title="Подчёркнутый (Ctrl+U)"
              ><u>U</u></button>
              <button
                className={`qc-fbtn ${editor && editor.isActive('strike') ? 'on' : ''}`}
                onClick={() => editor.chain().focus().toggleStrike().run()}
                title="Зачёркнутый"
              ><s>S</s></button>
              <span className="qc-fsep" />
              <button
                className={`qc-fbtn ${editor && editor.isActive({ textAlign: 'left' }) ? 'on' : ''}`}
                onClick={() => editor.chain().focus().setTextAlign('left').run()}
                title="По левому краю"
              >
                <svg width="13" height="13" viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none"/></svg>
              </button>
              <button
                className={`qc-fbtn ${editor && editor.isActive({ textAlign: 'center' }) ? 'on' : ''}`}
                onClick={() => editor.chain().focus().setTextAlign('center').run()}
                title="По центру"
              >
                <svg width="13" height="13" viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M4 18h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none"/></svg>
              </button>
              <button
                className={`qc-fbtn ${editor && editor.isActive({ textAlign: 'right' }) ? 'on' : ''}`}
                onClick={() => editor.chain().focus().setTextAlign('right').run()}
                title="По правому краю"
              >
                <svg width="13" height="13" viewBox="0 0 24 24"><path d="M4 6h16M10 12h10M4 18h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none"/></svg>
              </button>
              <span className="qc-fsep" />
              <button
                className={`qc-fbtn ${editor && editor.isActive('heading', { level: 1 }) ? 'on' : ''}`}
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                title="Заголовок"
              >H1</button>
              <button
                className={`qc-fbtn ${editor && editor.isActive('heading', { level: 2 }) ? 'on' : ''}`}
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                title="Подзаголовок"
              >H2</button>
              <span className="qc-fsep" />
              <button
                className={`qc-fbtn ${editor && editor.isActive('bulletList') ? 'on' : ''}`}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                title="Маркированный список"
              >
                <svg width="13" height="13" viewBox="0 0 24 24"><circle cx="5" cy="6" r="1.4" fill="currentColor"/><circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="5" cy="18" r="1.4" fill="currentColor"/><path d="M10 6h11M10 12h11M10 18h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
              </button>
              <button
                className={`qc-fbtn ${editor && editor.isActive('orderedList') ? 'on' : ''}`}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                title="Нумерованный список"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><text x="2" y="9" fontSize="6" fontWeight="700" fill="currentColor">1</text><text x="2" y="15" fontSize="6" fontWeight="700" fill="currentColor">2</text><text x="2" y="21" fontSize="6" fontWeight="700" fill="currentColor">3</text><path d="M10 6h11M10 12h11M10 18h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
              </button>
              <button
                className={`qc-fbtn ${editor && editor.isActive('blockquote') ? 'on' : ''}`}
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                title="Цитата"
              >❝</button>
            </div>
          )}

          {/* Color popover */}
          {showColorPicker && (
            <div className="qc-color-popover">
              {HIGHLIGHT_COLORS.map(c => (
                <button
                  key={c.name}
                  className="qc-color-swatch"
                  style={{ background: c.value || 'transparent', borderColor: c.value || 'var(--fm-border-soft)' }}
                  onClick={() => applyHighlight(c.value)}
                  title={c.name}
                >
                  {c.value === null && '×'}
                </button>
              ))}
            </div>
          )}

          {/* Emoji-into-text popover */}
          {showEmojiPicker && (
            <div className="qc-emoji-popover">
              <Picker
                data={emojiData}
                onEmojiSelect={(e) => insertEmojiInText(e.native)}
                theme="light"
                locale="ru"
                previewPosition="none"
                skinTonePosition="none"
                perLine={7}
                dynamicWidth={true}
                emojiSize={18}
                emojiButtonSize={26}
              />
            </div>
          )}

          {/* Editor */}
          <div className="qc-editor-wrap">
            <EditorContent editor={editor} className="qc-editor" />
          </div>

          {/* Mood emoji row */}
          <div className="qc-mood-row">
            <div className="qc-mood-label-line">
              <span className="qc-row-label qc-row-label-block">Настроение</span>
              {moodEmoji && (
                <button
                  className="qc-mood-clear"
                  onClick={() => setMoodEmoji(null)}
                  title="Убрать"
                >×</button>
              )}
            </div>
            <div className="qc-mood-grid">
              {MOOD_QUICK.map(em => (
                <button
                  key={em}
                  className={`qc-mood ${moodEmoji === em ? 'on' : ''}`}
                  onClick={() => setMoodEmoji(moodEmoji === em ? null : em)}
                  title={moodEmoji === em ? 'Убрать настроение' : 'Выбрать настроение'}
                >{em}</button>
              ))}
              {moodEmoji && !MOOD_QUICK.includes(moodEmoji) && (
                <button className="qc-mood on" onClick={() => setMoodEmoji(null)} title="Убрать настроение">{moodEmoji}</button>
              )}
            </div>
          </div>

          {/* Spheres */}
          <div className="qc-spheres">
            {sphereGroups.map(g => {
              const openInGroup = g.spheres.find(s => s.id === openSphereId)
              const ratedInGroup = g.spheres.filter(s => sphereValues.has(s.id)).length
              const hasActive = openInGroup || ratedInGroup > 0
              return (
                <div
                  key={g.name}
                  className={`qc-sphere-group ${hasActive ? 'has-active' : ''}`}
                  style={{ '--group-color': g.color }}
                >
                  <div className="qc-sphere-group-header">
                    {g.name}
                    {ratedInGroup > 0 && <span className="qc-sphere-group-count"> · {ratedInGroup}</span>}
                  </div>
                  <div className="qc-sphere-row">
                    {g.spheres.map(s => {
                      const value = sphereValues.get(s.id)
                      const on = value != null
                      const isOpen = openSphereId === s.id
                      return (
                        <span key={s.id} className="qc-sphere-chip-wrap">
                          <button
                            className={`qc-sphere-chip ${on ? 'on' : ''} ${isOpen ? 'open' : ''}`}
                            style={on ? { background: s.color, borderColor: s.color, color: 'white' } : null}
                            onClick={() => toggleSphereOpen(s.id)}
                            title={s.name}
                          >
                            <span className="qc-sphere-dot" style={{ background: s.color }} />
                            {s.name}
                            {on && <span className="qc-sphere-value">{value}</span>}
                          </button>
                        </span>
                      )
                    })}
                  </div>
                  {openInGroup && (
                    <div className="qc-sphere-group-vsr">
                      <ValueSelectorRow
                        value={sphereValues.get(openInGroup.id)}
                        color={openInGroup.color}
                        onChange={(v) => pickSphereValue(openInGroup.id, v)}
                        onClear={sphereValues.has(openInGroup.id) ? () => clearSphereValue(openInGroup.id) : null}
                        size="sm"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="qc-actions">
            <span className="qc-hint">Ctrl+Enter — сохранить · Esc — свернуть</span>
            <button className="qc-cancel" onClick={discard}>Удалить черновик</button>
          </div>
        </div>
      )}
    </div>
  )
}
