import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('freshMind', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  getAutoLaunch: () => ipcRenderer.invoke('get-autolaunch'),
  setAutoLaunch: (v) => ipcRenderer.invoke('set-autolaunch', v),
  quitApp: () => ipcRenderer.send('quit-app'),
  openMain: () => ipcRenderer.send('open-main'),
  closeMain: () => ipcRenderer.send('close-main'),
  restartApp: () => ipcRenderer.send('restart-main'),
  minimizeMain: () => ipcRenderer.send('minimize-main'),
  toggleMaximizeMain: () => ipcRenderer.send('toggle-maximize-main'),
  resizeMain: (height) => ipcRenderer.send('resize-main', height),
  isMainMaximized: () => ipcRenderer.invoke('is-main-maximized'),
  onMainMaximizeChange: (callback) => {
    const handler = (_e, isMax) => callback(isMax)
    ipcRenderer.on('main-maximize-changed', handler)
    return () => ipcRenderer.removeListener('main-maximize-changed', handler)
  },
  openSettings: () => ipcRenderer.send('open-settings'),
  closeSettings: () => ipcRenderer.send('close-settings'),
  resizeSettings: (h) => ipcRenderer.send('resize-settings', h),
  openSphereSettings: () => ipcRenderer.send('open-sphere-settings'),
  closeSphereSettings: () => ipcRenderer.send('close-sphere-settings'),
  resizeSphereSettings: (h) => ipcRenderer.send('resize-sphere-settings', h),
  openTrash: () => ipcRenderer.send('open-trash'),
  closeTrash: () => ipcRenderer.send('close-trash'),
  resizeTrash: (h) => ipcRenderer.send('resize-trash', h),
  openBackup: () => ipcRenderer.send('open-backup'),
  closeBackup: () => ipcRenderer.send('close-backup'),
  resizeBackup: (h) => ipcRenderer.send('resize-backup', h),
  openAiExport: () => ipcRenderer.send('open-ai-export'),
  closeAiExport: () => ipcRenderer.send('close-ai-export'),
  resizeAiExport: (h) => ipcRenderer.send('resize-ai-export', h),
  openAbout: () => ipcRenderer.send('open-about'),
  closeAbout: () => ipcRenderer.send('close-about'),
  resizeAbout: (h) => ipcRenderer.send('resize-about', h),

  // System
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  isDev: () => ipcRenderer.invoke('is-dev'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  openDataFolder: () => ipcRenderer.send('open-data-folder'),
  closePopup: () => ipcRenderer.send('close-popup'),
  resizePopup: (h) => ipcRenderer.send('resize-popup', h),

  // Sphere groups
  getGroups: () => ipcRenderer.invoke('get-groups'),
  saveGroup: (group) => ipcRenderer.invoke('save-group', group),
  deleteGroup: (id) => ipcRenderer.invoke('delete-group', id),

  // Spheres
  getSpheres: () => ipcRenderer.invoke('get-spheres'),
  getSpheresAll: () => ipcRenderer.invoke('get-spheres-all'),
  saveSphere: (sphere) => ipcRenderer.invoke('save-sphere', sphere),
  deleteSphere: (id) => ipcRenderer.invoke('delete-sphere', id),
  reorderSpheres: (ids) => ipcRenderer.invoke('reorder-spheres', ids),

  // Ratings
  saveRating: (sphereId, date, value, note, entryId) => ipcRenderer.invoke('save-rating', sphereId, date, value, note, entryId),
  deleteRating: (sphereId, date) => ipcRenderer.invoke('delete-rating', sphereId, date),
  getRatingsForDate: (date) => ipcRenderer.invoke('get-ratings-for-date', date),
  getLatestRatings: (uptoDate) => ipcRenderer.invoke('get-latest-ratings', uptoDate),
  getSphereHistory: (sphereId, daysBack) => ipcRenderer.invoke('get-sphere-history', sphereId, daysBack),
  getLastRatingBefore: (sphereId, date) => ipcRenderer.invoke('get-last-rating-before', sphereId, date),
  getLastRatingsBefore: (date) => ipcRenderer.invoke('get-last-ratings-before', date),
  getEntriesForSphere: (sphereId, limit) => ipcRenderer.invoke('get-entries-for-sphere', sphereId, limit),
  getDailyAverages: (startDate, endDate) => ipcRenderer.invoke('get-daily-averages', startDate, endDate),
  getEntryDates: (startDate, endDate) => ipcRenderer.invoke('get-entry-dates', startDate, endDate),
  getEntriesByDay: (startDate, endDate) => ipcRenderer.invoke('get-entries-by-day', startDate, endDate),
  getSummaryStats: (opts) => ipcRenderer.invoke('get-summary-stats', opts),
  getOnThisDay: (dateISO) => ipcRenderer.invoke('get-on-this-day', dateISO),
  saveAttachmentImage: (bytes, ext) => ipcRenderer.invoke('save-attachment-image', { bytes, ext }),

  // Trash, export, import, backup
  listTrash: () => ipcRenderer.invoke('list-trash'),
  exportData: () => ipcRenderer.invoke('export-data'),
  importData: () => ipcRenderer.invoke('import-data'),
  backupDataFolder: () => ipcRenderer.invoke('backup-data-folder'),

  // Entries
  listEntries: (opts) => ipcRenderer.invoke('list-entries', opts),
  getEntry: (id) => ipcRenderer.invoke('get-entry', id),
  saveEntry: (entry) => ipcRenderer.invoke('save-entry', entry),
  softDeleteEntry: (id) => ipcRenderer.invoke('soft-delete-entry', id),
  restoreEntry: (id) => ipcRenderer.invoke('restore-entry', id),
  purgeEntry: (id) => ipcRenderer.invoke('purge-entry', id),

  // Tags
  listTags: () => ipcRenderer.invoke('list-tags'),

  // Db stats
  getDbStats: () => ipcRenderer.invoke('get-db-stats'),
  countEntriesInRange: (range) => ipcRenderer.invoke('count-entries-in-range', range),
  getFirstEntryDate: () => ipcRenderer.invoke('get-first-entry-date'),
  getWeeklyAverages: (startISO, endISO) => ipcRenderer.invoke('get-weekly-averages', startISO, endISO),
  getWeeklyEntryStats: (startISO, endISO) => ipcRenderer.invoke('get-weekly-entry-stats', startISO, endISO),

  // AI export
  exportAiReport: (range) => ipcRenderer.invoke('export-ai-report', range),

  // Sharing — сохранение PNG в системную файловую систему через save-dialog
  savePngFile: (bufferOrUint8, suggestedName) => {
    // Принимаем ArrayBuffer/Uint8Array/Buffer — нормализуем в Uint8Array
    const buffer = bufferOrUint8 instanceof Uint8Array
      ? bufferOrUint8
      : new Uint8Array(bufferOrUint8)
    return ipcRenderer.invoke('save-png-file', { buffer, suggestedName })
  }
})