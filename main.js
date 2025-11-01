const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const path = require('path');
const fs = require('fs');
const express = require('express')
const serverApp = express()
const port = 3000;
const QRCode = require('qrcode');
const os = require('os');

serverApp.use(express.static('public'));




let settingsWindow;
let videoWindow;
let serialPort = null;
let parser = null;
let isConnected = false;
let appSettings = {
  positions: {},
  videos: {},
  lastSavedData: null,
  totalSlots: 10 
};

// Create settings window
function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icon.png'),
    show: false,
    title: 'Rotoscope Settings'
  });

  settingsWindow.loadFile('settings.html');
  
  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
    console.log('🔧 Settings window ready!');
  });

  settingsWindow.on('closed', () => {
    if (serialPort && serialPort.isOpen) {
      serialPort.close();
    }
    settingsWindow = null;
    if (videoWindow) videoWindow.close();
  });
}

// Create video player window
function createVideoWindow() {
  if (videoWindow) {
    videoWindow.focus();
    return;
  }

  videoWindow = new BrowserWindow({
    width: 1080,
    height: 1920,
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    title: 'Rotoscope Video Player'
  });

  videoWindow.loadFile('video-player.html');
  
  videoWindow.once('ready-to-show', () => {
    videoWindow.show();
    // Send settings data to video player
    videoWindow.webContents.send('settings-data', appSettings);
  });

  videoWindow.on('closed', () => {
    videoWindow = null;
  });
}

// App event handlers
app.whenReady().then(() => {
  createSettingsWindow();
  loadAppSettings();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createSettingsWindow();
  }
});

// Settings management
function loadAppSettings() {
  const settingsPath = path.join(app.getPath('userData'), 'rotoscope-settings.json');
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
       appSettings = { 
        positions: {},
        videos: {},
        totalSlots: 5,  // default
        ...JSON.parse(data) 
      };
      console.log('📂 Settings loaded');
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

function saveAppSettings() {
  const settingsPath = path.join(app.getPath('userData'), 'rotoscope-settings.json');
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(appSettings, null, 2));
    console.log('💾 Settings saved');
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    return false;
  }
}

// Serial Port Functions (keeping existing code)
async function listSerialPorts() {
  try {
    const ports = await SerialPort.list();
    return ports.filter(port => port.path);
  } catch (error) {
    console.error('Error listing ports:', error);
    return [];
  }
}

function connectSerial(portPath, baudRate = 115200) {
  return new Promise((resolve, reject) => {
    serialPort = new SerialPort({ 
      path: portPath, 
      baudRate: baudRate,
      autoOpen: false
    });

    parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

    serialPort.open((err) => {
      if (err) {
        reject(err);
        return;
      }

      isConnected = true;
      
      parser.on('data', (data) => {
        const message = data.toString().trim();
        if (settingsWindow && settingsWindow.webContents) {
          settingsWindow.webContents.send('serial-data', message);
        }
        if (videoWindow && videoWindow.webContents) {
          videoWindow.webContents.send('serial-data', message);
        }
      });

      serialPort.on('error', (err) => {
        isConnected = false;
        if (settingsWindow && settingsWindow.webContents) {
          settingsWindow.webContents.send('serial-error', err.message);
        }
      });

      serialPort.on('close', () => {
        isConnected = false;
        if (settingsWindow && settingsWindow.webContents) {
          settingsWindow.webContents.send('serial-disconnected');
        }
      });

      resolve();
    });
  });
}

function disconnectSerial() {
  return new Promise((resolve) => {
    if (serialPort && serialPort.isOpen) {
      serialPort.close(() => {
        isConnected = false;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

function sendCommand(command) {
  return new Promise((resolve, reject) => {
    if (!serialPort || !serialPort.isOpen) {
      reject(new Error('Serial port not connected'));
      return;
    }

    serialPort.write(command + '\n', (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Enhanced IPC Handlers
ipcMain.handle('list-ports', listSerialPorts);
ipcMain.handle('connect-serial', async (event, portPath, baudRate) => {
  try {
    await connectSerial(portPath, baudRate);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('disconnect-serial', async () => {
  await disconnectSerial();
  return { success: true };
});

ipcMain.handle('send-command', async (event, command) => {
  try {
    await sendCommand(command);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-connection-status', () => isConnected);

// Video file selection
ipcMain.handle('select-video-file', async () => {
    console.log('select-video-file');
  const result = await dialog.showOpenDialog(settingsWindow, {
    title: 'Select Video File',
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm', 'ogg'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return { success: true, filePath: result.filePaths[0] };
  } else {
    return { success: false };
  }
});

// Settings data management

// Add new IPC handler for creating slots 
ipcMain.handle('add-new-slot', async () => {
  appSettings.totalSlots += 1;
  const newSlotNumber = appSettings.totalSlots - 1; // 0-indexed
  
  const saved = saveAppSettings();
  return { 
    success: saved, 
    slotNumber: newSlotNumber,
    totalSlots: appSettings.totalSlots 
  };
});

// IPC handler for deleting slots 
ipcMain.handle('delete-slot', async (event, slotNumber) => {
  // Create new objects for renumbered slots
  const newPositions = {};
  const newVideos = {};
  
  // Renumber all slots after the deleted one
  Object.keys(appSettings.positions).forEach(key => {
    const slotNum = parseInt(key);
    if (slotNum < slotNumber) {
      // Keep slots before deleted slot as-is
      newPositions[slotNum] = appSettings.positions[slotNum];
    } else if (slotNum > slotNumber) {
      // Shift slots after deleted slot down by 1
      newPositions[slotNum - 1] = appSettings.positions[slotNum];
    }
    // Skip the deleted slot (slotNum === slotNumber)
  });
  
  Object.keys(appSettings.videos).forEach(key => {
    const slotNum = parseInt(key);
    if (slotNum < slotNumber) {
      newVideos[slotNum] = appSettings.videos[slotNum];
    } else if (slotNum > slotNumber) {
      newVideos[slotNum - 1] = appSettings.videos[slotNum];
    }
  });
  
  // Update app settings with renumbered data
  appSettings.positions = newPositions;
  appSettings.videos = newVideos;
  appSettings.totalSlots -= 1; // Decrease total count
  
  const saved = saveAppSettings();
  return { 
    success: saved, 
    deletedSlot: slotNumber,
    newTotalSlots: appSettings.totalSlots
  };
});
// handler to get total slots
ipcMain.handle('get-total-slots', async () => {
  return { totalSlots: appSettings.totalSlots };
});

ipcMain.handle('save-slot-data', async (event, slotNumber, position, videoPath) => {
  appSettings.positions[slotNumber] = position;
  if (videoPath) {
    appSettings.videos[slotNumber] = videoPath;
  }
  
  const saved = saveAppSettings();
  return { success: saved };
});

ipcMain.handle('get-slot-data', async (event, slotNumber) => {
  return {
    position: appSettings.positions[slotNumber],
    video: appSettings.videos[slotNumber]
  };
});

ipcMain.handle('save-all-settings', async (event, settingsData) => {
  appSettings = { ...appSettings, ...settingsData };
  appSettings.lastSavedData = new Date().toISOString();
  
  const saved = saveAppSettings();
  return { success: saved };
});

ipcMain.handle('get-all-settings', async () => {
  return appSettings;
});

// Navigate to video player
ipcMain.handle('open-video-player', async () => {
  createVideoWindow();
  return { success: true };
});

ipcMain.handle('close-video-player', async () => {
  if (videoWindow) {
    videoWindow.close();
  }
  return { success: true };
});

// Dialog handlers
ipcMain.handle('show-error-dialog', async (event, title, content) => {
  const result = await dialog.showMessageBox(settingsWindow || videoWindow, {
    type: 'error',
    title: title,
    message: content,
    buttons: ['OK']
  });
  return result;
});

ipcMain.handle('show-info-dialog', async (event, title, content) => {
  const result = await dialog.showMessageBox(settingsWindow || videoWindow, {
    type: 'info',
    title: title,
    message: content,
    buttons: ['OK']
  });
  return result;
});

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// Serve mobile control page
serverApp.get('/Control', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'Control.html'));
});

// API: List slots with videos
serverApp.get('/api/slots', (req, res) => {
    const slots = Object.entries(appSettings.videos || {})
        .filter(([slot, video]) => video)
        .map(([slot, video]) => ({ slot: Number(slot), video: path.basename(video) }));
    res.json(slots);
});

// API: Send GOTO command
serverApp.post('/api/goto/:slot', async (req, res) => {
    const slot = req.params.slot;
    try {
        // Send GOTO command to device
        await sendCommand(`GOTO:${slot}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Return local IP address
serverApp.get('/api/ip', (req, res) => {
    res.json({ ip: getLocalIp() });
});

// Serve QR code for /Control
serverApp.get('/qrcode.png', async (req, res) => {
    console.log('QR code requested');
    const ip = getLocalIp();
    const url = `http://${ip}:${port}/Control`;
    res.setHeader('Content-Type', 'image/png');
    QRCode.toFileStream(res, url);
});
const ip = getLocalIp();
serverApp.listen(port,'0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
  console.log(`http://${ip}:${port}/Control`);
});