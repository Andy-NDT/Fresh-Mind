// Общий хелпер шеринга — рендерит DOM-элемент в PNG через html2canvas,
// добавляет watermark fresh-mind.app + опц. подпись пользователя, сохраняет файл
// через нативный системный диалог Electron (см. main: 'save-png-file').
//
// Принципы:
// • Никаких упоминаний конкретных соц-сетей в UI/коде. Размеры — нейтральные.
// • Watermark всегда добавляется (фирменный маркер для виральности).
// • scale: 2 в html2canvas → retina-качество, текст не размыт.
// • Размеры: square 1080x1080, landscape 1920x1080, og 1200x630.

import html2canvas from 'html2canvas'

export const SHARE_SIZES = {
  square:    { w: 1080, h: 1080, label: '1080×1080 (квадрат)' },
  landscape: { w: 1920, h: 1080, label: '1920×1080 (широкий)' },
  og:        { w: 1200, h: 630,  label: '1200×630 (горизонтальная карточка)' }
}

export const SHARE_BACKGROUNDS = {
  transparent: { value: null,       label: 'Прозрачный' },
  white:       { value: '#ffffff',  label: 'Белый' },
  dark:        { value: '#1c1430',  label: 'Тёмно-фиолетовый' }
}

/**
 * Создаёт фрейм-обёртку нужного размера, копирует target в центр,
 * добавляет подпись пользователя (если есть) и watermark, рендерит в canvas,
 * сохраняет PNG. Возвращает результат IPC-вызова.
 *
 * @param {HTMLElement} targetEl — DOM-элемент для съёмки
 * @param {Object} opts
 * @param {'square'|'landscape'|'og'} opts.size
 * @param {'transparent'|'white'|'dark'} opts.background
 * @param {string} opts.filenameStem — например 'fresh-mind-radar-2026-05-29'
 * @param {string} [opts.userCaption] — опц. подпись юзера, до 40 символов
 * @returns {Promise<{ok:true, path:string} | {canceled:true} | {error:string}>}
 */
export async function exportElementToPng(targetEl, opts) {
  if (!targetEl) return { error: 'Нет элемента для экспорта' }
  const { size, background, filenameStem, userCaption } = opts
  const sz = SHARE_SIZES[size] || SHARE_SIZES.square
  const bg = SHARE_BACKGROUNDS[background] || SHARE_BACKGROUNDS.white

  // 1. Создаём оффскрин-обёртку нужного размера
  const frame = document.createElement('div')
  frame.style.cssText = `
    position: fixed;
    top: 0;
    left: -99999px;
    width: ${sz.w}px;
    height: ${sz.h}px;
    background: ${bg.value || 'transparent'};
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 36px 48px;
    box-sizing: border-box;
    font-family: var(--fm-font, system-ui, sans-serif);
    overflow: hidden;
    z-index: -1;
  `

  // 2. Клонируем target внутрь
  const clone = targetEl.cloneNode(true)
  // Чтобы клон выглядел как оригинал, перенесём computed background
  clone.style.maxWidth = '100%'
  clone.style.maxHeight = (sz.h - 120) + 'px'
  clone.style.boxSizing = 'border-box'
  frame.appendChild(clone)

  // 3. Подпись юзера (опц.)
  if (userCaption && userCaption.trim()) {
    const cap = document.createElement('div')
    cap.textContent = userCaption.trim().slice(0, 40)
    cap.style.cssText = `
      margin-top: 22px;
      max-width: 80%;
      font-size: 28px;
      font-weight: 600;
      color: ${bg.value === '#1c1430' ? 'rgba(255,255,255,0.92)' : '#3A2C5C'};
      letter-spacing: 0.3px;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `
    frame.appendChild(cap)
  }

  // 4. Watermark Fresh Mind — внизу справа
  const wm = document.createElement('div')
  wm.textContent = 'Fresh Mind'
  wm.style.cssText = `
    position: absolute;
    right: 28px;
    bottom: 22px;
    font-size: 16px;
    font-weight: 700;
    color: ${bg.value === '#1c1430' ? 'rgba(255,255,255,0.6)' : 'rgba(58,44,92,0.6)'};
    letter-spacing: 0.6px;
    user-select: none;
  `
  frame.appendChild(wm)

  document.body.appendChild(frame)

  try {
    // 5. Рендерим в canvas через html2canvas
    const canvas = await html2canvas(frame, {
      backgroundColor: bg.value, // null = transparent
      scale: 2,
      width: sz.w,
      height: sz.h,
      windowWidth: sz.w,
      windowHeight: sz.h,
      useCORS: true,
      logging: false
    })

    // 6. Получаем PNG как Blob → ArrayBuffer
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
    if (!blob) throw new Error('Не удалось сформировать PNG')
    const arrayBuffer = await blob.arrayBuffer()

    // 7. Передаём в main для save-dialog
    const suggestedName = `${filenameStem}-${sz.w}x${sz.h}.png`
    const result = await window.freshMind.savePngFile(arrayBuffer, suggestedName)
    return result
  } catch (err) {
    return { error: err.message || String(err) }
  } finally {
    // 8. Очищаем DOM
    if (frame.parentNode) frame.parentNode.removeChild(frame)
  }
}
