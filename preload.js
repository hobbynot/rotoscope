const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Serial port operations
  listPorts: () => ipcRenderer.invoke('list-ports'),
  connectSerial: (port, baudRate) => ipcRenderer.invoke('connect-serial', port, baudRate),
  disconnectSerial: () => ipcRenderer.invoke('disconnect-serial'),
  sendCommand: (command) => ipcRenderer.invoke('send-command', command),
  getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),

  // Video file operations
  selectVideoFile: () => ipcRenderer.invoke('select-video-file'),
  
  // Settings data operations
  saveSlotData: (slotNumber, position, videoPath) => ipcRenderer.invoke('save-slot-data', slotNumber, position, videoPath),
  getSlotData: (slotNumber) => ipcRenderer.invoke('get-slot-data', slotNumber),
  saveAllSettings: (settingsData) => ipcRenderer.invoke('save-all-settings', settingsData),
  getAllSettings: () => ipcRenderer.invoke('get-all-settings'),

    // NEW: Slot management
  addNewSlot: () => ipcRenderer.invoke('add-new-slot'),
  getTotalSlots: () => ipcRenderer.invoke('get-total-slots'),
  deleteSlot: (slotNumber) => ipcRenderer.invoke('delete-slot', slotNumber),

  // Navigation
  openVideoPlayer: () => ipcRenderer.invoke('open-video-player'),
  closeVideoPlayer: () => ipcRenderer.invoke('close-video-player'),

  // Event listeners
  onSerialData: (callback) => ipcRenderer.on('serial-data', callback),
  onSerialError: (callback) => ipcRenderer.on('serial-error', callback),
  onSerialDisconnected: (callback) => ipcRenderer.on('serial-disconnected', callback),
  onSettingsData: (callback) => ipcRenderer.on('settings-data', callback),

  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  // Dialog operations
  showErrorDialog: (title, content) => ipcRenderer.invoke('show-error-dialog', title, content),
  showInfoDialog: (title, content) => ipcRenderer.invoke('show-info-dialog', title, content)
});
