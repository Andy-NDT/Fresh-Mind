import { app, BrowserWindow, Tray, ipcMain, screen, nativeImage, dialog, protocol, net, shell } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import fs from 'fs'
import crypto from 'crypto'
import AutoLaunch from 'auto-launch'
import cron from 'node-cron'
import { loadJSON, saveJSON } from './store.js'
import {
  listGroups, saveGroup, deleteGroup,
  listSpheres, saveSphere, deleteSphere, reorderSpheres,
  setRating, deleteRating, getRatingsForDate, getLatestRatings, getSphereHistory, getLastRatingBefore, getLastRatingsBefore, getEntriesForSphere, getDailyAverages, getEntryDates, getEntriesByDay, getSummaryStats, getOnThisDay,
  listTrash, exportAllData, importAllData,
  listEntries, getEntry, saveEntry, softDeleteEntry, restoreEntry, purgeEntry,
  listTags, getStats, countEntriesInRange, getFirstEntryDate,
  getWeeklyAverages, getWeeklyEntryStats
} from './db.js'
import { generateReport } from './aiExport.js'

const autoLauncher = new AutoLaunch({ name: 'Fresh Mind' })

const DEFAULT_SETTINGS = {
  notifyTime: '22:00',
  popupEnabled: true,
  pinnedToTray: true,
  soundEnabled: true,
  onboardingDone: false
}

const isDev = !app.isPackaged

// --- Custom protocol для отдачи локальных файлов (вложений) в renderer ---
// Регистрируем до whenReady. Renderer обращается как fresh-mind-file://<encodedPath>.
protocol.registerSchemesAsPrivileged([{
  scheme: 'fresh-mind-file',
  privileges: { secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
}])

function attachmentsDir() {
  const dir = join(app.getPath('userData'), 'attachments')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}
const APP_ICON = join(__dirname, '../../resources/icons-crop/icons/icon.ico')

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

let tray = null
let mainWindow = null
let popupWindow = null
let settingsWindow = null
let sphereSettingsWindow = null
let trashWindow = null
let backupWindow = null
let aiExportWindow = null
let aboutWindow = null
let popupReady = false
let popupReposeInterval = null
let mainReposeInterval = null

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
  } else if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
  }
})

// --- Neighbor (Fresh Ear/Eye) popup detection ---
// Возвращает массив всех видимых попап-окон Fresh-экосистемы в нижнем правом углу.
let findAllNeighborWindows = () => []
try {
  const wm = require('node-window-manager')
  const manager = wm.windowManager
  findAllNeighborWindows = () => {
    try {
      const ws = manager.getWindows()
      const wa = screen.getPrimaryDisplay().workArea
      const out = []
      for (const w of ws) {
        try {
          if (!w.isVisible()) continue
          const p = w.path || ''
          if (!/Fresh[\s_-]?(Ear|Eye)/i.test(p)) continue
          const b = w.getBounds()
          if (!b || !b.width || !b.height) continue
          if (b.width > 600 || b.height > 500) continue
          const cx = b.x + b.width / 2
          const cy = b.y + b.height / 2
          if (cx < wa.x + wa.width * 0.55) continue
          if (cy < wa.y + wa.height * 0.55) continue
          out.push({ window: w, bounds: b })
        } catch { /* ignore */ }
      }
      return out
    } catch {
      return []
    }
  }
} catch { /* node-window-manager not installed */ }

function moveNeighborTo(neighbor, targetY) {
  try {
    const b = neighbor.bounds
    if (Math.abs(b.y - targetY) < 2) return true
    neighbor.window.setBounds({ x: b.x, y: Math.round(targetY), width: b.width, height: b.height })
    neighbor.bounds = { ...b, y: Math.round(targetY) }
    return true
  } catch {
    return false
  }
}

// --- Settings helper ---
function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(loadJSON('settings.json') || {}) }
}

// --- Renderer URL helper ---
function loadRendererURL(win, page) {
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    const url = process.env['ELECTRON_RENDERER_URL'] + '/' + page
    win.loadURL(url).catch(() => {
      setTimeout(() => {
        if (!win.isDestroyed()) win.loadURL(url)
      }, 1000)
    })
  } else {
    win.loadFile(join(__dirname, '../renderer/' + page))
  }
}

// --- Main window (стиль попап-уведомления: anchor в правом-нижнем, стек с Fresh Eye/Ear) ---
const MAIN_W = 320
const MAIN_INITIAL_H = 168

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return
  }

  // Я новейший — все соседи уезжают вверх, я занимаю нижний слот.
  pushNeighborsUpForNewPopup(MAIN_INITIAL_H)
  const pos = popupAnchorPosition(MAIN_W, MAIN_INITIAL_H)

  mainWindow = new BrowserWindow({
    width: MAIN_W,
    height: MAIN_INITIAL_H,
    x: pos.x,
    y: pos.y,
    minWidth: 300,
    minHeight: 130,
    title: '',
    icon: APP_ICON,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    roundedCorners: true, // Win11 native rounded corners (ignored на Win10/older)
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  loadRendererURL(mainWindow, 'main.html')

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Реанкеринг: 1.5с тик. Mind не двигает соседей — двигает только себя.
  // Логика: если сосед был при открытии и существует сейчас → стек над ним;
  // иначе → у нижнего края. Так Mind корректно «падает» при закрытии Eye/Ear.
  if (mainReposeInterval) clearInterval(mainReposeInterval)
  // Состояние ручного перемещения: пользователь утащил окно — отключаем реанкеринг.
  // Сравниваем «ожидаемую» позицию (что мы сами поставили) с реальной. Если разлад
  // > 24px по любой оси — считаем что пользователь перетащил вручную, замораживаем.
  let expectedY = pos.y
  let expectedX = pos.x
  let manuallyMoved = false

  mainWindow.on('move', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (manuallyMoved) return
    const b = mainWindow.getBounds()
    if (Math.abs(b.y - expectedY) > 24 || Math.abs(b.x - expectedX) > 24) {
      manuallyMoved = true
    }
  })

  mainReposeInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      clearInterval(mainReposeInterval)
      mainReposeInterval = null
      return
    }
    if (mainWindow.isMaximized()) return
    if (manuallyMoved) return  // пользователь перенёс — не дёргаем
    const b = mainWindow.getBounds()
    const anchor = popupAnchorPosition(b.width, b.height)
    if (Math.abs(anchor.y - b.y) > 2 || Math.abs(anchor.x - b.x) > 2) {
      mainWindow.setBounds({ x: anchor.x, y: anchor.y, width: b.width, height: b.height, animate: false })
      expectedX = anchor.x
      expectedY = anchor.y
    }
  }, 1500)

  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('main-maximize-changed', true)
  })
  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('main-maximize-changed', false)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    if (mainReposeInterval) {
      clearInterval(mainReposeInterval)
      mainReposeInterval = null
    }
  })
}

// --- Settings window ---
function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 320,
    height: 540,
    title: '',
    icon: APP_ICON,
    show: false,
    resizable: false,
    frame: false,
    transparent: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  loadRendererURL(settingsWindow, 'settings.html')

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show()
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

// --- Sphere settings window (управление сферами и группами) ---
function createSphereSettingsWindow() {
  if (sphereSettingsWindow && !sphereSettingsWindow.isDestroyed()) {
    sphereSettingsWindow.show()
    sphereSettingsWindow.focus()
    return
  }
  sphereSettingsWindow = new BrowserWindow({
    width: 320,
    height: 540,
    title: '',
    icon: APP_ICON,
    show: false,
    resizable: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    minWidth: 280,
    minHeight: 280,
    parent: settingsWindow || undefined,
    modal: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  loadRendererURL(sphereSettingsWindow, 'sphere-settings.html')
  sphereSettingsWindow.once('ready-to-show', () => { sphereSettingsWindow.show() })
  sphereSettingsWindow.on('closed', () => { sphereSettingsWindow = null })
}

// --- Корзина ---
function createTrashWindow() {
  if (trashWindow && !trashWindow.isDestroyed()) {
    trashWindow.show()
    trashWindow.focus()
    return
  }
  trashWindow = new BrowserWindow({
    width: 320,
    height: 540,
    title: '',
    icon: APP_ICON,
    show: false,
    resizable: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    minWidth: 320,
    minHeight: 260,
    parent: settingsWindow || undefined,
    modal: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  loadRendererURL(trashWindow, 'trash.html')
  trashWindow.once('ready-to-show', () => { trashWindow.show() })
  trashWindow.on('closed', () => { trashWindow = null })
}

// --- Бэкап ---
function createBackupWindow() {
  if (backupWindow && !backupWindow.isDestroyed()) {
    backupWindow.show()
    backupWindow.focus()
    return
  }
  backupWindow = new BrowserWindow({
    width: 320,
    height: 320,
    title: '',
    icon: APP_ICON,
    show: false,
    resizable: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    minWidth: 320,
    minHeight: 240,
    parent: settingsWindow || undefined,
    modal: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  loadRendererURL(backupWindow, 'backup.html')
  backupWindow.once('ready-to-show', () => { backupWindow.show() })
  backupWindow.on('closed', () => { backupWindow = null })
}

// --- ИИ-экспорт ---
function createAiExportWindow() {
  if (aiExportWindow && !aiExportWindow.isDestroyed()) {
    aiExportWindow.show()
    aiExportWindow.focus()
    return
  }
  const parent =
    (backupWindow && !backupWindow.isDestroyed()) ? backupWindow :
    (settingsWindow && !settingsWindow.isDestroyed()) ? settingsWindow :
    undefined
  aiExportWindow = new BrowserWindow({
    width: 380,
    height: 620,
    title: '',
    icon: APP_ICON,
    show: false,
    resizable: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    minWidth: 360,
    minHeight: 360,
    parent,
    modal: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  loadRendererURL(aiExportWindow, 'ai-export.html')
  aiExportWindow.once('ready-to-show', () => { aiExportWindow.show() })
  aiExportWindow.on('closed', () => { aiExportWindow = null })
}

// --- О приложении ---
function createAboutWindow() {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.show()
    aboutWindow.focus()
    return
  }
  aboutWindow = new BrowserWindow({
    width: 320,
    height: 480,
    title: '',
    icon: APP_ICON,
    show: false,
    resizable: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    minWidth: 300,
    minHeight: 360,
    parent: settingsWindow || undefined,
    modal: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  loadRendererURL(aboutWindow, 'about.html')
  aboutWindow.once('ready-to-show', () => { aboutWindow.show() })
  aboutWindow.on('closed', () => { aboutWindow = null })
}

// --- Popup window (placeholder for now) ---
const POPUP_W = 380
const POPUP_INITIAL_H = 1
const POPUP_MARGIN = 16
const POPUP_NEIGHBOR_GAP = 12

// Я уже открыт. На каждый тик:
// - Если подо мной (ниже по Y) ЕСТЬ сосед → встаю над ним (neighbor.y - height - gap)
// - Если соседей подо мной нет → опускаюсь к нижнему якорю
function popupAnchorPosition(width, height) {
  const wa = screen.getPrimaryDisplay().workArea
  const x = wa.x + wa.width - width - POPUP_MARGIN
  const bottomY = wa.y + wa.height - height - POPUP_MARGIN

  const neighbors = findAllNeighborWindows()
  // Кто реально стоит на «слоте снизу» или ниже моего потенциального низа
  const below = neighbors
    .filter(n => (n.bounds.y + n.bounds.height) > (bottomY + 4))
    .sort((a, b) => a.bounds.y - b.bounds.y)

  if (below.length > 0) {
    return { x, y: below[0].bounds.y - height - POPUP_NEIGHBOR_GAP }
  }
  return { x, y: bottomY }
}

// При создании окна: толкаю всех текущих соседей ВВЕРХ, освобождая нижний слот.
// Соседей стакаем друг над другом, а не на одну Y-координату.
function pushNeighborsUpForNewPopup(newHeight) {
  const wa = screen.getPrimaryDisplay().workArea
  const newTopY = wa.y + wa.height - newHeight - POPUP_MARGIN
  const neighbors = findAllNeighborWindows()
    // Сначала те, что ниже (ближе к низу) → они уезжают первыми
    .filter(n => (n.bounds.y + n.bounds.height) > newTopY - 4)
    .sort((a, b) => b.bounds.y - a.bounds.y)

  let nextSlotTop = newTopY  // верх следующего «свободного» места
  for (const n of neighbors) {
    const targetY = nextSlotTop - POPUP_NEIGHBOR_GAP - n.bounds.height
    moveNeighborTo(n, targetY)
    nextSlotTop = targetY
  }
}

function createPopupWindow() {
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.show()
    popupWindow.focus()
    return
  }

  neighborWasAtOpen = !!getNeighborPopupBounds()

  const pos = popupAnchorPosition(POPUP_W, POPUP_INITIAL_H)
  popupReady = false

  popupWindow = new BrowserWindow({
    width: POPUP_W,
    height: POPUP_INITIAL_H,
    x: pos.x,
    y: pos.y,
    title: '',
    icon: APP_ICON,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  loadRendererURL(popupWindow, 'popup.html')

  if (popupReposeInterval) clearInterval(popupReposeInterval)
  popupReposeInterval = setInterval(() => {
    if (!popupWindow || popupWindow.isDestroyed()) {
      clearInterval(popupReposeInterval)
      popupReposeInterval = null
      return
    }
    if (!popupReady) return
    const b = popupWindow.getBounds()
    const anchor = popupAnchorPosition(b.width, b.height)
    if (Math.abs(anchor.y - b.y) > 2 || Math.abs(anchor.x - b.x) > 2) {
      popupWindow.setBounds({ x: anchor.x, y: anchor.y, width: b.width, height: b.height })
    }
  }, 1500)

  popupWindow.on('closed', () => {
    popupWindow = null
    popupReady = false
    if (popupReposeInterval) {
      clearInterval(popupReposeInterval)
      popupReposeInterval = null
    }
  })
}

// --- Tray ---
function createTray() {
  const iconPath = join(__dirname, '../../resources/tray-icon.png')
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon)
  tray.setToolTip('Fresh Mind')

  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      mainWindow.close()
    } else {
      createMainWindow()
    }
  })

  tray.on('right-click', () => {
    if (settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible()) {
      settingsWindow.close()
    } else {
      createSettingsWindow()
    }
  })
}

// --- IPC ---
ipcMain.handle('get-settings', () => getSettings())

ipcMain.handle('save-settings', (_e, patch) => {
  const merged = { ...getSettings(), ...patch }
  saveJSON('settings.json', merged)
  return merged
})

ipcMain.handle('get-autolaunch', async () => {
  try { return await autoLauncher.isEnabled() }
  catch { return false }
})

ipcMain.handle('set-autolaunch', async (_e, enabled) => {
  try {
    if (enabled) await autoLauncher.enable()
    else await autoLauncher.disable()
    return enabled
  } catch {
    return !enabled
  }
})

// ── Sphere groups ─────────────────────────────────────────
ipcMain.handle('get-groups', () => listGroups())
ipcMain.handle('save-group', (_e, group) => saveGroup(group))
ipcMain.handle('delete-group', (_e, id) => { deleteGroup(id); return true })

// ── Spheres ───────────────────────────────────────────────
ipcMain.handle('get-spheres', () => listSpheres())
ipcMain.handle('get-spheres-all', () => listSpheres({ includeArchived: true }))
ipcMain.handle('save-sphere', (_e, sphere) => saveSphere(sphere))
ipcMain.handle('delete-sphere', (_e, id) => { deleteSphere(id); return true })
ipcMain.handle('reorder-spheres', (_e, ids) => { reorderSpheres(ids); return true })

// ── Ratings ───────────────────────────────────────────────
ipcMain.handle('save-rating', (_e, sphereId, date, value, note, entryId) => {
  setRating(sphereId, date, value, note, entryId)
  return true
})
ipcMain.handle('delete-rating', (_e, sphereId, date) => {
  deleteRating(sphereId, date)
  return true
})
ipcMain.handle('get-last-rating-before', (_e, sphereId, date) => getLastRatingBefore(sphereId, date))
ipcMain.handle('get-last-ratings-before', (_e, date) => getLastRatingsBefore(date))
ipcMain.handle('get-entries-for-sphere', (_e, sphereId, limit) => getEntriesForSphere(sphereId, limit))
ipcMain.handle('get-daily-averages', (_e, startDate, endDate) => getDailyAverages(startDate, endDate))
ipcMain.handle('get-entry-dates', (_e, startDate, endDate) => getEntryDates(startDate, endDate))
ipcMain.handle('get-entries-by-day', (_e, startDate, endDate) => getEntriesByDay(startDate, endDate))
ipcMain.handle('get-summary-stats', (_e, opts) => getSummaryStats(opts || {}))
ipcMain.handle('get-on-this-day', (_e, dateISO) => getOnThisDay(dateISO))

// ── Корзина ─────────────────────────────────────────────
ipcMain.handle('list-trash', () => listTrash())

// ── Экспорт данных (JSON) ──────────────────────────────
ipcMain.handle('export-data', async () => {
  try {
    const targetWindow = settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : mainWindow
    const defaultName = `fresh-mind-export-${new Date().toISOString().slice(0, 10)}.json`
    const r = await dialog.showSaveDialog(targetWindow || undefined, {
      title: 'Сохранить экспорт Fresh Mind',
      defaultPath: defaultName,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (r.canceled || !r.filePath) return { canceled: true }
    const snapshot = exportAllData()
    fs.writeFileSync(r.filePath, JSON.stringify(snapshot, null, 2), 'utf-8')
    return { ok: true, path: r.filePath, entries: snapshot.entries.length }
  } catch (e) {
    console.error('export-data failed', e)
    return { error: e && e.message ? e.message : 'unknown' }
  }
})

// ── Импорт данных (JSON) — ПЕРЕЗАПИСЫВАЕТ всё ────────
ipcMain.handle('import-data', async () => {
  let pickedPath = null
  try {
    const targetWindow = settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : mainWindow
    const r = await dialog.showOpenDialog(targetWindow || undefined, {
      title: 'Выбрать файл импорта Fresh Mind',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (r.canceled || !r.filePaths.length) return { canceled: true }
    pickedPath = r.filePaths[0]

    let raw
    try {
      raw = fs.readFileSync(pickedPath, 'utf-8')
    } catch (e) {
      return { error: 'Не удалось прочитать файл. Возможно, к нему нет доступа.' }
    }

    let snapshot
    try {
      snapshot = JSON.parse(raw)
    } catch (e) {
      return { error: 'Файл повреждён или это не JSON.' }
    }

    if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.entries) || !Array.isArray(snapshot.spheres)) {
      return { error: 'Это не экспорт Fresh Mind. Нужен файл, созданный кнопкой «Экспорт JSON».' }
    }

    // Делаем авто-бэкап текущей БД перед заменой
    const dbPath = join(app.getPath('userData'), 'freshmind.db')
    const backupPath = dbPath + '.before-import-' + Date.now() + '.bak'
    if (fs.existsSync(dbPath)) {
      try { fs.copyFileSync(dbPath, backupPath) } catch (e) { /* не критично — продолжаем */ }
    }
    importAllData(snapshot)
    return { ok: true, entries: snapshot.entries.length, backupPath }
  } catch (e) {
    console.error('import-data failed', e)
    return { error: e && e.message ? `Ошибка при импорте: ${e.message}` : 'Неизвестная ошибка при импорте.' }
  }
})

// ── Бэкап: копирует папку userData в выбранную пользователем директорию ──
ipcMain.handle('backup-data-folder', async () => {
  try {
    const targetWindow = settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : mainWindow
    const r = await dialog.showOpenDialog(targetWindow || undefined, {
      title: 'Куда сохранить бэкап Fresh Mind?',
      properties: ['openDirectory', 'createDirectory']
    })
    if (r.canceled || !r.filePaths.length) return { canceled: true }
    const src = app.getPath('userData')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const dst = join(r.filePaths[0], `fresh-mind-backup-${stamp}`)
    fs.mkdirSync(dst, { recursive: true })
    copyDirSync(src, dst)
    return { ok: true, path: dst }
  } catch (e) {
    console.error('backup-data-folder failed', e)
    return { error: e && e.message ? e.message : 'unknown' }
  }
})

function copyDirSync(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name)
    const d = join(dst, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(s, d)
    } else if (entry.isFile()) {
      // Пропускаем temp WAL-файлы SQLite
      if (entry.name.endsWith('-shm') || entry.name.endsWith('-wal')) continue
      try { fs.copyFileSync(s, d) } catch (e) { /* ignore locked */ }
    }
  }
}

// ── Вложения (изображения и в будущем — другие файлы) ─────────────
// Изображения хранятся в <userData>/attachments/<timestamp>-<hash>.<ext>.
// При soft-delete записи файлы НЕ удаляются — окончательное удаление будет
// в шаге 12 (Корзина) с явной кнопкой «удалить навсегда».
//
// TODO (шаг 12 — экспорт/импорт):
//  • При экспорте дать выбор: «JSON только данные» / «ZIP с вложениями».
//  • ZIP содержит data.json + папку attachments/ (копия файлов).
//  • При импорте ZIP — восстанавливать файлы в attachments/, перепривязывать src
//    в content_html на новые URL.
// TODO (отдельная фича — прикреплённые НЕ-изображения):
//  • Таблица attachments в БД уже готова (type, path, original).
//  • UI: отдельная зона «Прикрепить файл» под редактором, drag&drop файла
//    → insertAttachmentRow → отображение чипом (иконка типа + название + размер).
//  • НЕ встраивать в Tiptap, хранить связь через entry_id.
ipcMain.handle('save-attachment-image', (_e, payload) => {
  try {
    const { bytes, ext = 'png' } = payload || {}
    if (!bytes || !bytes.length) return { error: 'no-data' }
    const buf = Buffer.from(bytes)
    const safeExt = (ext || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png'
    const id = crypto.randomBytes(8).toString('hex')
    const filename = `${Date.now()}-${id}.${safeExt}`
    const filePath = join(attachmentsDir(), filename)
    fs.writeFileSync(filePath, buf)
    const url = 'fresh-mind-file://' + encodeURIComponent(filePath.replace(/\\/g, '/'))
    return { url, path: filePath, filename }
  } catch (e) {
    console.error('save-attachment-image failed', e)
    return { error: e && e.message ? e.message : 'unknown' }
  }
})
ipcMain.handle('get-ratings-for-date', (_e, date) => getRatingsForDate(date))
ipcMain.handle('get-latest-ratings', (_e, uptoDate) => getLatestRatings(uptoDate))
ipcMain.handle('get-sphere-history', (_e, sphereId, daysBack) => getSphereHistory(sphereId, daysBack))

// ── Entries ───────────────────────────────────────────────
ipcMain.handle('list-entries', (_e, opts) => listEntries(opts || {}))
ipcMain.handle('get-entry', (_e, id) => getEntry(id))
ipcMain.handle('save-entry', (_e, entry) => saveEntry(entry))
ipcMain.handle('soft-delete-entry', (_e, id) => { softDeleteEntry(id); return true })
ipcMain.handle('restore-entry', (_e, id) => { restoreEntry(id); return true })
ipcMain.handle('purge-entry', (_e, id) => { purgeEntry(id); return true })

// ── Tags ──────────────────────────────────────────────────
ipcMain.handle('list-tags', () => listTags())

// ── Db stats ──────────────────────────────────────────────
ipcMain.handle('get-db-stats', () => getStats())
ipcMain.handle('count-entries-in-range', (_e, range) => countEntriesInRange(range || {}))
ipcMain.handle('get-first-entry-date', () => getFirstEntryDate())
ipcMain.handle('get-weekly-averages', (_e, startISO, endISO) => getWeeklyAverages(startISO, endISO))
ipcMain.handle('get-weekly-entry-stats', (_e, startISO, endISO) => getWeeklyEntryStats(startISO, endISO))

// ── AI export (Step 15.5) ─────────────────────────────────
ipcMain.handle('export-ai-report', async (e, { startISO, endISO, promptText } = {}) => {
  if (!startISO || !endISO) return { error: 'Не указан период' }
  const win = BrowserWindow.fromWebContents(e.sender)
  const defName = `fresh-mind-report-${startISO}_to_${endISO}.txt`
  const r = await dialog.showSaveDialog(win, {
    title: 'Сохранить отчёт для ИИ-аналитики',
    defaultPath: defName,
    filters: [{ name: 'Текстовый файл', extensions: ['txt'] }]
  })
  if (r.canceled || !r.filePath) return { canceled: true }

  const stream = fs.createWriteStream(r.filePath, { encoding: 'utf8' })
  try {
    const stats = await generateReport({ startISO, endISO, promptText }, stream)
    await new Promise((resolve, reject) => {
      stream.end((err) => err ? reject(err) : resolve())
    })
    const size = fs.statSync(r.filePath).size
    return {
      ok: true,
      path: r.filePath,
      entries: stats.entriesCount,
      ratings: stats.ratingsCount,
      correlationsShown: stats.correlationsShown,
      promptIncluded: stats.promptIncluded,
      sizeKB: Math.round(size / 1024)
    }
  } catch (err) {
    try { stream.destroy() } catch {}
    try { fs.unlinkSync(r.filePath) } catch {}
    return { error: err.message || String(err) }
  }
})

// ── Sharing: сохранение PNG-картинок через системный save-dialog (Step 17.1) ──
ipcMain.handle('save-png-file', async (e, { buffer, suggestedName } = {}) => {
  if (!buffer) return { error: 'Нет данных для сохранения' }
  const win = BrowserWindow.fromWebContents(e.sender)
  const defName = suggestedName || `fresh-mind-${Date.now()}.png`
  const r = await dialog.showSaveDialog(win, {
    title: 'Сохранить картинку',
    defaultPath: defName,
    filters: [{ name: 'PNG', extensions: ['png'] }]
  })
  if (r.canceled || !r.filePath) return { canceled: true }
  try {
    // buffer приходит как Uint8Array (preload конвертирует ArrayBuffer)
    fs.writeFileSync(r.filePath, Buffer.from(buffer))
    return { ok: true, path: r.filePath }
  } catch (err) {
    return { error: err.message || String(err) }
  }
})

ipcMain.on('quit-app', () => {
  app.isQuitting = true
  app.quit()
})

ipcMain.on('open-main', () => createMainWindow())
ipcMain.on('close-main', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
})
ipcMain.on('restart-main', () => {
  // Используется ErrorBoundary при сбое: закрываем и сразу создаём заново
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.once('closed', () => createMainWindow())
    mainWindow.close()
  } else {
    createMainWindow()
  }
})
ipcMain.on('minimize-main', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize()
})
ipcMain.on('toggle-maximize-main', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
ipcMain.handle('is-main-maximized', () => {
  return !!(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized())
})
ipcMain.on('resize-main', (_e, height) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMaximized()) return
  const b = mainWindow.getBounds()
  const newH = Math.max(130, Math.round(height))
  // Если выросли (например, в dashboardExpanded) — толкнём соседей вверх под новый размер.
  if (newH > b.height + 4) {
    pushNeighborsUpForNewPopup(newH)
  }
  const anchor = popupAnchorPosition(b.width, newH)
  mainWindow.setBounds({ x: anchor.x, y: anchor.y, width: b.width, height: newH, animate: false })
})

ipcMain.on('open-settings', () => createSettingsWindow())
ipcMain.on('close-settings', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close()
})
ipcMain.on('open-sphere-settings', () => createSphereSettingsWindow())
ipcMain.on('close-sphere-settings', () => {
  if (sphereSettingsWindow && !sphereSettingsWindow.isDestroyed()) sphereSettingsWindow.close()
})
ipcMain.on('resize-sphere-settings', (_e, height) => {
  if (sphereSettingsWindow && !sphereSettingsWindow.isDestroyed()) {
    const [w] = sphereSettingsWindow.getSize()
    const screenH = screen.getPrimaryDisplay().workAreaSize.height
    const maxH = Math.max(420, screenH - 40)
    sphereSettingsWindow.setSize(w, Math.max(260, Math.min(maxH, Math.ceil(height) + 4)))
  }
})

ipcMain.on('open-trash', () => createTrashWindow())
ipcMain.on('close-trash', () => {
  if (trashWindow && !trashWindow.isDestroyed()) trashWindow.close()
})
ipcMain.on('resize-trash', (_e, height) => {
  if (trashWindow && !trashWindow.isDestroyed()) {
    const [w] = trashWindow.getSize()
    const screenH = screen.getPrimaryDisplay().workAreaSize.height
    const maxH = Math.max(420, screenH - 40)
    trashWindow.setSize(w, Math.max(260, Math.min(maxH, Math.ceil(height) + 4)))
  }
})

ipcMain.on('open-backup', () => createBackupWindow())
ipcMain.on('close-backup', () => {
  if (backupWindow && !backupWindow.isDestroyed()) backupWindow.close()
})
ipcMain.on('resize-backup', (_e, height) => {
  if (backupWindow && !backupWindow.isDestroyed()) {
    const [w] = backupWindow.getSize()
    const screenH = screen.getPrimaryDisplay().workAreaSize.height
    const maxH = Math.max(420, screenH - 40)
    backupWindow.setSize(w, Math.max(240, Math.min(maxH, Math.ceil(height) + 4)))
  }
})

ipcMain.on('open-ai-export', () => createAiExportWindow())
ipcMain.on('close-ai-export', () => {
  if (aiExportWindow && !aiExportWindow.isDestroyed()) aiExportWindow.close()
})
ipcMain.on('resize-ai-export', (_e, height) => {
  if (aiExportWindow && !aiExportWindow.isDestroyed()) {
    const [w] = aiExportWindow.getSize()
    const screenH = screen.getPrimaryDisplay().workAreaSize.height
    const maxH = Math.max(420, screenH - 40)
    aiExportWindow.setSize(w, Math.max(260, Math.min(maxH, Math.ceil(height) + 4)))
  }
})

ipcMain.on('open-about', () => createAboutWindow())
ipcMain.on('close-about', () => {
  if (aboutWindow && !aboutWindow.isDestroyed()) aboutWindow.close()
})
ipcMain.on('resize-about', (_e, height) => {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    const [w] = aboutWindow.getSize()
    const screenH = screen.getPrimaryDisplay().workAreaSize.height
    const maxH = Math.max(420, screenH - 40)
    aboutWindow.setSize(w, Math.max(360, Math.min(maxH, Math.ceil(height) + 4)))
  }
})

// Внешние ссылки и системные действия
ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('is-dev', () => isDev)
ipcMain.on('open-external', (_e, url) => {
  if (typeof url !== 'string') return
  // Защита: разрешаем только http/https
  if (!/^https?:\/\//i.test(url)) return
  shell.openExternal(url)
})
ipcMain.on('open-data-folder', () => {
  shell.openPath(app.getPath('userData'))
})
ipcMain.on('resize-settings', (_e, height) => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    const [w] = settingsWindow.getSize()
    const screenH = screen.getPrimaryDisplay().workAreaSize.height
    const maxH = Math.max(560, screenH - 40)
    settingsWindow.setSize(w, Math.max(360, Math.min(maxH, Math.ceil(height))))
  }
})

ipcMain.on('close-popup', () => {
  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.close()
})
ipcMain.on('resize-popup', (_e, height) => {
  if (popupWindow && !popupWindow.isDestroyed()) {
    const newH = Math.max(120, Math.ceil(height))
    const anchor = popupAnchorPosition(POPUP_W, newH)
    popupWindow.setBounds({ x: anchor.x, y: anchor.y, width: POPUP_W, height: newH })
    if (!popupReady) {
      popupReady = true
      popupWindow.show()
    }
  }
})

// --- Cron: напоминание в notifyTime — открывает главное окно (compact-карточка) ---
let lastPopupTriggerDate = null
cron.schedule('* * * * *', () => {
  const settings = getSettings()
  if (settings.popupEnabled === false) return
  const now = new Date()
  const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  if (hhmm !== (settings.notifyTime || '22:00')) return
  if (lastPopupTriggerDate === today) return
  lastPopupTriggerDate = today
  if (mainWindow && !mainWindow.isDestroyed()) return
  createMainWindow()
})

// --- App lifecycle ---
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Пытается открыть БД с ретраями (антивирус / OneDrive могут держать файл).
// Возвращает { ok: true } при успехе или { ok: false, reason, error } при провале.
async function initDbWithRetry(attempts = 3, delayMs = 500) {
  let lastError = null
  for (let i = 0; i < attempts; i++) {
    try {
      const s = getStats()
      console.log('[DB] init OK:', s)
      return { ok: true }
    } catch (e) {
      lastError = e
      // Future schema — ретраить бессмысленно, сразу выходим
      if (e && e.name === 'FutureSchemaError') {
        return { ok: false, reason: 'future-schema', error: e }
      }
      console.error(`[DB] init attempt ${i + 1}/${attempts} failed:`, e && e.message ? e.message : e)
      if (i < attempts - 1) await sleep(delayMs)
    }
  }
  return { ok: false, reason: 'locked-or-corrupt', error: lastError }
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.ndt.freshmind')
  }

  // Хэндлер кастомного протокола для отдачи вложений (изображений)
  protocol.handle('fresh-mind-file', (request) => {
    const encoded = request.url.replace(/^fresh-mind-file:\/\//, '')
    const filePath = decodeURIComponent(encoded)
    return net.fetch(pathToFileURL(filePath).toString())
  })

  const dbResult = await initDbWithRetry()
  if (!dbResult.ok) {
    if (dbResult.reason === 'future-schema') {
      const err = dbResult.error
      await dialog.showMessageBox({
        type: 'warning',
        title: 'Fresh Mind — несовместимая версия',
        message: 'База данных создана новой версией Fresh Mind.',
        detail: `Текущая установка поддерживает версию схемы ${err.supportedVersion}, но в базе версия ${err.currentVersion}. Установите свежую версию Fresh Mind, чтобы открыть свои данные.\n\nПриложение будет закрыто без изменений в базе.`,
        buttons: ['Закрыть'],
        defaultId: 0
      })
    } else {
      const dbPath = join(app.getPath('userData'), 'freshmind.db')
      const choice = await dialog.showMessageBox({
        type: 'error',
        title: 'Fresh Mind — не удаётся открыть базу данных',
        message: 'Не удалось получить доступ к файлу базы данных.',
        detail: `Возможные причины:\n• антивирус или OneDrive держат файл\n• файл повреждён\n• нет прав на чтение\n\nПуть: ${dbPath}\n\nПопробовать ещё раз?`,
        buttons: ['Повторить', 'Закрыть'],
        defaultId: 0,
        cancelId: 1
      })
      if (choice.response === 0) {
        const retry = await initDbWithRetry(3, 500)
        if (!retry.ok) {
          await dialog.showMessageBox({
            type: 'error',
            title: 'Fresh Mind',
            message: 'Не удалось открыть базу данных и со второй попытки.',
            detail: 'Перезагрузите компьютер или проверьте антивирус и повторите.',
            buttons: ['Закрыть']
          })
          app.exit(1)
          return
        }
      } else {
        app.exit(1)
        return
      }
    }
    if (dbResult.reason === 'future-schema') {
      app.exit(0)
      return
    }
  }

  createTray()
})

app.on('window-all-closed', () => {
  const settings = getSettings()
  if (settings.pinnedToTray === false) {
    app.quit()
  }
})