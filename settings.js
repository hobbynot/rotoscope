// Application State
let isConnected = false;
let currentPosition = 0;
let totalRotations = 0;
let memorySlots = {};
let slotVideos = {}; // Global variable for video storage
let connectionStatus = 'disconnected';
let totalSlots = 10; // track total slots in frontend too

// DOM Elements
const elements = {
    // Connection
    portSelect: document.getElementById('portSelect'),
    baudRate: document.getElementById('baudRate'),
    refreshPorts: document.getElementById('refreshPorts'),
    connectBtn: document.getElementById('connectBtn'),
    disconnectBtn: document.getElementById('disconnectBtn'),
    connectionIndicator: document.getElementById('connectionIndicator'),
    connectionText: document.getElementById('connectionText'),
    
    // Status
    currentPosition: document.getElementById('currentPosition'),
    totalRotations: document.getElementById('totalRotations'),
    startLimit: document.getElementById('startLimit'),
    endLimit: document.getElementById('endLimit'),
    queryPosition: document.getElementById('queryPosition'),
    queryLimits: document.getElementById('queryLimits'),
    homeBtn: document.getElementById('homeBtn'),
    
    // Movement
    moveLeft: document.getElementById('moveLeft'),
    moveRight: document.getElementById('moveRight'),
    stepSize: document.getElementById('stepSize'),
    // targetPosition: document.getElementById('targetPosition'),
    // goToPosition: document.getElementById('goToPosition'),
    stopBtn: document.getElementById('stopBtn'),
    
    // Memory
    memorySlotsContainer: document.querySelector('.memory-slots'),
    listPositions: document.getElementById('listPositions'),
    clearAllPositions: document.getElementById('clearAllPositions'),
    addmemoryslots: document.getElementById('addslots'),// button to add new slots.
    
    // New Video Controls
    saveAllBtn: document.getElementById('saveAllBtn'),
    openVideoPlayer: document.getElementById('openVideoPlayer'),
    
    // System
    testDirection: document.getElementById('testDirection'),
    clearLog: document.getElementById('clearLog'),
    
    // Log
    activityLog: document.getElementById('activityLog')
};

// Utility Functions
function formatTimestamp() {
    return new Date().toLocaleTimeString();
}

function logMessage(message, type = 'info') {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    
    const timestamp = document.createElement('span');
    timestamp.className = 'log-timestamp';
    timestamp.textContent = `[${formatTimestamp()}]`;
    
    logEntry.appendChild(timestamp);
    logEntry.appendChild(document.createTextNode(message));
    
    elements.activityLog.appendChild(logEntry);
    elements.activityLog.scrollTop = elements.activityLog.scrollHeight;
    
    // Limit log entries to 100
    const entries = elements.activityLog.children;
    if (entries.length > 100) {
        elements.activityLog.removeChild(entries[0]);
    }
}

// Helper function to get filename from path (browser-compatible)
function getFileName(filePath) {
    if (!filePath) return 'No file';
    return filePath.replace(/^.*[\\\/]/, '');
}

function updateConnectionStatus(connected) {
    isConnected = connected;
    connectionStatus = connected ? 'connected' : 'disconnected';
    
    elements.connectionIndicator.className = `status-indicator ${connectionStatus}`;
    elements.connectionText.textContent = connected ? 'Connected' : 'Disconnected';
    
    // Update button states
    elements.connectBtn.disabled = connected;
    elements.disconnectBtn.disabled = !connected;
    
    // Update control states
    updateControlStates();
}

function updateControlStates() {
    const disabled = !isConnected;
    
    // Movement controls
    elements.moveLeft.disabled = disabled;
    elements.moveRight.disabled = disabled;
    // elements.goToPosition.disabled = disabled;
    elements.homeBtn.disabled = disabled;
    elements.stopBtn.disabled = disabled;
    
    // Status controls
    elements.queryPosition.disabled = disabled;
    elements.queryLimits.disabled = disabled;
    
    // System controls
    elements.testDirection.disabled = disabled;
    
    // Memory slot controls
    document.querySelectorAll('.slot-save, .slot-goto, .slot-video').forEach(btn => {
        btn.disabled = disabled;
    });
    
    // Video controls are always enabled
    if (elements.saveAllBtn) elements.saveAllBtn.disabled = false;
    if (elements.openVideoPlayer) elements.openVideoPlayer.disabled = false;
}

async function sendCommand(command) {
    if (!isConnected) {
        logMessage('Not connected to device', 'error');
        return false;
    }
    
    try {
        logMessage(`> ${command}`, 'command');
        const result = await window.electronAPI.sendCommand(command);
        
        if (!result.success) {
            logMessage(`Failed to send command: ${result.error}`, 'error');
            return false;
        }
        
        return true;
    } catch (error) {
        logMessage(`Command error: ${error.message}`, 'error');
        return false;
    }
}

// Port Management
async function refreshPorts() {
    try {
        const ports = await window.electronAPI.listPorts();
        
        // Clear existing options
        elements.portSelect.innerHTML = '<option value="">Select Port...</option>';
        
        // Add port options
        ports.forEach(port => {
            const option = document.createElement('option');
            option.value = port.path;
            option.textContent = `${port.path}${port.manufacturer ? ` (${port.manufacturer})` : ''}`;
            elements.portSelect.appendChild(option);
        });
        
        logMessage(`Found ${ports.length} available ports`);
    } catch (error) {
        logMessage(`Failed to refresh ports: ${error.message}`, 'error');
    }
}

async function connectSerial() {
    const selectedPort = elements.portSelect.value;
    const selectedBaud = parseInt(elements.baudRate.value);
    
    if (!selectedPort) {
        await window.electronAPI.showErrorDialog('Connection Error', 'Please select a COM port');
        return;
    }
    
    logMessage(`Connecting to ${selectedPort} at ${selectedBaud} baud...`);
    
    try {
        const result = await window.electronAPI.connectSerial(selectedPort, selectedBaud);
        
        if (result.success) {
            updateConnectionStatus(true);
            logMessage('Successfully connected to device', 'info');
        } else {
            logMessage(`Connection failed: ${result.error}`, 'error');
            await window.electronAPI.showErrorDialog('Connection Failed', result.error);
        }
    } catch (error) {
        logMessage(`Connection error: ${error.message}`, 'error');
    }
}

async function disconnectSerial() {
    try {
        await window.electronAPI.disconnectSerial();
        updateConnectionStatus(false);
        logMessage('Disconnected from device');
    } catch (error) {
        logMessage(`Disconnect error: ${error.message}`, 'error');
    }
}

// Movement Functions
async function moveLeft() {
    const stepSize = parseInt(elements.stepSize.value);
    const newPosition = currentPosition - stepSize;
    await sendCommand(`MOVE:${newPosition}`);
}

async function moveRight() {
    const stepSize = parseInt(elements.stepSize.value);
    const newPosition = currentPosition + stepSize;
    await sendCommand(`MOVE:${newPosition}`);
}

// async function goToPosition() {
//     const target = parseInt(elements.targetPosition.value);
    
//     if (isNaN(target)) {
//         await window.electronAPI.showErrorDialog('Invalid Position', 'Please enter a valid position number');
//         return;
//     }
    
//     await sendCommand(`MOVE:${target}`);
//     elements.targetPosition.value = '';
// }

// Load saved settings data
async function loadSavedData() {
    try {
        const settings = await window.electronAPI.getAllSettings();
        memorySlots = settings.positions || {};
        slotVideos = settings.videos || {};
        totalSlots = settings.totalSlots || 5; // Load total slots from backend
        renderMemorySlots();
        logMessage('Settings loaded from disk');
    } catch (error) {
        logMessage(`Failed to load settings: ${error.message}`, 'error');
    }
}

// Enhanced memory slot creation with video functionality
function createMemorySlot(slotNumber) {
    const slot = document.createElement('div');
    slot.className = 'memory-slot';
    slot.setAttribute('data-slot', slotNumber);
    
    const hasPosition = memorySlots[slotNumber] !== undefined;
    const hasVideo = slotVideos[slotNumber] !== undefined;
    
    if (hasPosition || hasVideo) {
        slot.classList.add('has-position');
    }
    
    slot.innerHTML = `
        <div class="slot-header">
            <span class="slot-number">Slot ${slotNumber}</span>
            <button class="btn-icon btn-delete-slot" title="Delete this slot">✕</button>
            <span class="slot-position ${hasPosition ? '' : 'empty'}">
                ${hasPosition ? `Position: ${memorySlots[slotNumber]}` : 'No Position'}
            </span>
        </div>
        <div class="slot-video">
            <span class="video-info ${hasVideo ? '' : 'empty'}">
                ${hasVideo ? `📹 ${getFileName(slotVideos[slotNumber])}` : '📹 No Video Selected'}
            </span>
        </div>
        <div class="slot-controls">
            <button class="btn btn-info btn-small slot-save">💾 Save Pos</button>
            <button class="btn btn-primary btn-small slot-goto" ${!hasPosition ? 'disabled' : ''}>➤ Go To</button>
            <button class="btn btn-secondary btn-small slot-video">📁 Add Video</button>
            <button class="btn btn-danger btn-small slot-clear" ${(!hasPosition && !hasVideo) ? 'disabled' : ''}>🗑️ Clear</button>
        </div>
    `;
    
    // Add event listeners
    const saveBtn = slot.querySelector('.slot-save');
    const gotoBtn = slot.querySelector('.slot-goto');
    const videoBtn = slot.querySelector('.slot-video');
    const clearBtn = slot.querySelector('.slot-clear');
     const deleteBtn = slot.querySelector('.btn-delete-slot'); 
    
    saveBtn.addEventListener('click', () => savePosition(slotNumber));
    gotoBtn.addEventListener('click', () => goToSavedPosition(slotNumber));
    clearBtn.addEventListener('click', () => clearSlot(slotNumber));
    deleteBtn.addEventListener('click', () => deleteSlot(slotNumber)); 
    
    return slot;
}

// Video selection function
async function selectVideoForSlot(slotNumber) {
    console.log('selectVideoForSlot outside try');
    try {
        console.log('selectVideoForSlot');
        const result = await window.electronAPI.selectVideoFile();
        
        if (result.success) {
            slotVideos[slotNumber] = result.filePath;
            renderMemorySlots();
            logMessage(`Video selected for slot ${slotNumber}: ${getFileName(result.filePath)}`);
            
            // Save immediately
            await window.electronAPI.saveSlotData(slotNumber, memorySlots[slotNumber], result.filePath);
        }
    } catch (error) {
        console.log('selectVideoForSlot outside try inside catch');
        logMessage(`Failed to select video: ${error.message}`, 'error');
    }
}

// Enhanced clear function for both position and video
function clearSlot(slotNumber) {
    const hasPosition = memorySlots[slotNumber] !== undefined;
    const hasVideo = slotVideos[slotNumber] !== undefined;
    // console.log('clearSlot outside try');
    if (!hasPosition && !hasVideo) return;
    
    const confirmMessage = hasPosition && hasVideo 
        ? `Clear slot ${slotNumber}? This will remove both position and video data.`
        : hasPosition
        ? `Clear position data for slot ${slotNumber}?`
        : `Clear video data for slot ${slotNumber}?`;
    
    if (confirm(confirmMessage)) {
        delete memorySlots[slotNumber];
        delete slotVideos[slotNumber];
        renderMemorySlots();
        logMessage(`Cleared slot ${slotNumber}`);
    }
}

// Save all settings and navigate to video player
async function saveAllSettings() {
    try {
        const settingsData = {
            positions: memorySlots,
            videos: slotVideos,
            totalSlots: totalSlots, // Save total slots
            lastSaved: new Date().toISOString()
        };  
        
        const result = await window.electronAPI.saveAllSettings(settingsData);
        
        if (result.success) {
            logMessage('All settings saved successfully! 🎉', 'info');
            await window.electronAPI.showInfoDialog('Settings Saved', 'All position and video settings have been saved successfully!');
        } else {
            throw new Error('Failed to save settings');
        }
    } catch (error) {
        logMessage(`Failed to save settings: ${error.message}`, 'error');
        await window.electronAPI.showErrorDialog('Save Failed', 'Failed to save settings. Please try again.');
    }
}

// Open video player
async function openVideoPlayer() {
    // Check if any positions/videos are configured
    const hasPositions = Object.keys(memorySlots).length > 0;
    const hasVideos = Object.keys(slotVideos).length > 0;
    
    if (!hasPositions && !hasVideos) {
        await window.electronAPI.showErrorDialog(
            'No Data Configured', 
            'Please save some positions and select videos before opening the video player.'
        );
        return;
    }
    
    // Save current settings first
    await saveAllSettings();
    
    // Then open video player
    try {
        await window.electronAPI.openVideoPlayer();
        logMessage('Opening video player...', 'info');
    } catch (error) {
        logMessage(`Failed to open video player: ${error.message}`, 'error');
    }
}

function renderMemorySlots() {
    if (!elements.memorySlotsContainer) {
        console.error('Memory slots container not found');
        return;
    }
    
    elements.memorySlotsContainer.innerHTML = '';

    for (let i = 0; i < totalSlots; i++) {
        const slot = createMemorySlot(i);
        elements.memorySlotsContainer.appendChild(slot);
    }
    
    updateControlStates();
}

async function savePosition(slotNumber) {
    const success = await sendCommand(`SAVE:${slotNumber}`);
    if (success) {
        logMessage(`Saving current position to slot ${slotNumber}...`);
    }
}

async function goToSavedPosition(slotNumber) {
    if (memorySlots[slotNumber] === undefined) {
        await window.electronAPI.showErrorDialog('Empty Slot', `Slot ${slotNumber} is empty. Save a position first.`);
        return;
    }
    
    await sendCommand(`GOTO:${slotNumber}`);
}

function clearPosition(slotNumber) {
    delete memorySlots[slotNumber];
    renderMemorySlots();
    logMessage(`Cleared slot ${slotNumber}`);
}

async function listAllPositions() {
    await sendCommand('LIST');
}

async function clearAllPositions() {
    if (confirm('Are you sure you want to clear all saved positions and videos?')) {
        memorySlots = {};
        slotVideos = {};
        totalSlots = 5; 
        // Save the reset state to backend
        await window.electronAPI.saveAllSettings({
            positions: {},
            videos: {},
            totalSlots: 10,
            lastSaved: new Date().toISOString()
        });

        renderMemorySlots();
        logMessage('Cleared all saved positions and videos');
    }
}

async function addNewSlot() {
    try {
        const result = await window.electronAPI.addNewSlot();
        
        if (result.success) {
            totalSlots = result.totalSlots;
            
            // Create and append only the new slot
            const newSlot = createMemorySlot(result.slotNumber);
            elements.memorySlotsContainer.appendChild(newSlot);
            
            logMessage(`Created new slot ${result.slotNumber}`, 'info');
        } else {
            logMessage('Failed to create new slot', 'error');
        }
    } catch (error) {
        logMessage(`Error creating slot: ${error.message}`, 'error');
    }
}

// Add new deleteSlot function
async function deleteSlot(slotNumber) {
    const hasPosition = memorySlots[slotNumber] !== undefined;
    const hasVideo = slotVideos[slotNumber] !== undefined;
    
    const confirmMessage = `Are you sure you want to delete Slot ${slotNumber}? All slots after this will be renumbered.`;
    
    if (confirm(confirmMessage)) {
        try {
            // Delete from backend (backend handles renumbering)
            const result = await window.electronAPI.deleteSlot(slotNumber);
            
            if (result.success) {
                // Create new objects for renumbered slots
                const newMemorySlots = {};
                const newSlotVideos = {};
                
                // Renumber local state
                Object.keys(memorySlots).forEach(key => {
                    const slotNum = parseInt(key);
                    if (slotNum < slotNumber) {
                        newMemorySlots[slotNum] = memorySlots[slotNum];
                    } else if (slotNum > slotNumber) {
                        newMemorySlots[slotNum - 1] = memorySlots[slotNum];
                    }
                });
                
                Object.keys(slotVideos).forEach(key => {
                    const slotNum = parseInt(key);
                    if (slotNum < slotNumber) {
                        newSlotVideos[slotNum] = slotVideos[slotNum];
                    } else if (slotNum > slotNumber) {
                        newSlotVideos[slotNum - 1] = slotVideos[slotNum];
                    }
                });
                
                // Update global state
                memorySlots = newMemorySlots;
                slotVideos = newSlotVideos;
                totalSlots = result.newTotalSlots;
                
                // Re-render all slots to show new numbering
                renderMemorySlots();
                
                logMessage(`Deleted slot ${slotNumber} and renumbered remaining slots`, 'info');
            } else {
                throw new Error('Failed to delete slot');
            }
        } catch (error) {
            logMessage(`Error deleting slot: ${error.message}`, 'error');
            await window.electronAPI.showErrorDialog('Delete Failed', `Could not delete slot ${slotNumber}. Please try again.`);
        }
    }
}

// Serial Data Handlers
function handleSerialData(event, data) {
    logMessage(`< ${data}`, 'response');
    
    // Parse different types of responses
    if (data.startsWith('POS:')) {
        currentPosition = parseInt(data.substring(4));
        elements.currentPosition.textContent = currentPosition;
    } else if (data.startsWith('Total Rotations:')) {
        totalRotations = parseFloat(data.substring(16));
        elements.totalRotations.textContent = totalRotations.toFixed(2);
    } else if (data.startsWith('Saved at position:')) {
        const match = data.match(/Saved at position:\s*(\d+)/);
        if (match) {
            const position = parseInt(match[1]);
            // Extract slot number from previous SAVE command
            const logEntries = elements.activityLog.children;
            for (let i = logEntries.length - 1; i >= 0; i--) {
                const entry = logEntries[i];
                if (entry.classList.contains('command') && entry.textContent.includes('SAVE:')) {
                    const slotMatch = entry.textContent.match(/SAVE:(\d)/);
                    if (slotMatch) {
                        const slotNumber = parseInt(slotMatch[1]);
                        memorySlots[slotNumber] = position;
                        
                        // Save to persistent storage
                        window.electronAPI.saveSlotData(slotNumber, position, slotVideos[slotNumber]);
                        
                        renderMemorySlots();
                        break;
                    }
                }
            }
        }
    } else if (data.startsWith('START:') && data.includes('END:')) {
        // Parse limit switch status
        const startMatch = data.match(/START:\s*(\w+)/);
        const endMatch = data.match(/END:\s*(\w+)/);
        
        if (startMatch) {
            elements.startLimit.textContent = `START: ${startMatch[1]}`;
        }
        if (endMatch) {
            elements.endLimit.textContent = `END: ${endMatch[1]}`;
        }
    } else if (data.startsWith('POS ')) {
        // Parse LIST command response
        const match = data.match(/POS\s+(\d+):\s*(.+)/);
        if (match) {
            const slotNumber = parseInt(match[1]);
            const value = match[2].trim();
            
            if (value !== 'EMPTY') {
                memorySlots[slotNumber] = parseInt(value);
            }
        }
    }
    
    // Handle completion of LIST command
    const logEntries = Array.from(elements.activityLog.children);
    const hasListCommand = logEntries.some(entry => 
        entry.textContent && 
        entry.textContent.includes('LIST') &&
        entry.classList.contains('command')
    );
    
    if (hasListCommand) {
        // Delay to allow all LIST responses to be processed
        setTimeout(() => {
            renderMemorySlots();
        }, 100);
    }
}

function handleSerialError(event, error) {
    logMessage(`Serial error: ${error}`, 'error');
    updateConnectionStatus(false);
}

function handleSerialDisconnected() {
    logMessage('Serial connection lost', 'error');
    updateConnectionStatus(false);
}

// Helper to fetch local IP from server
async function getServerIp() {
    try {
        const res = await fetch('http://localhost:3000/api/ip');
        const data = await res.json();
        return data.ip;
    } catch (e) {
        return 'localhost';
    }
}

// Add QR code UI logic
async function showQRCode() {
    let qrModal = document.getElementById('qrModal');
    // const ip = await getServerIp();
    const qrUrl = `http://localhost:3000/qrcode.png`;
    if (!qrModal) {
        qrModal = document.createElement('div');
        qrModal.id = 'qrModal';
        qrModal.style.position = 'fixed';
        qrModal.style.top = '0';
        qrModal.style.left = '0';
        qrModal.style.width = '100vw';
        qrModal.style.height = '100vh';
        qrModal.style.background = 'rgba(0,0,0,0.7)';
        qrModal.style.display = 'flex';
        qrModal.style.alignItems = 'center';
        qrModal.style.justifyContent = 'center';
        qrModal.style.zIndex = '9999';
        qrModal.innerHTML = `<div style="background:#fff;padding:24px;border-radius:12px;box-shadow:0 2px 16px #0003;text-align:center;max-width:90vw;max-height:90vh;">
            <h2 style='color:#222'>Scan to Control from Mobile</h2>
            <img id="qrImage" src="${qrUrl}" alt="QR Code" style="width:250px;height:250px;" />
            <br><button id="closeQRBtn" style="margin-top:16px;padding:8px 20px;font-size:1em;border-radius:6px;border:none;background:#4caf50;color:#fff;cursor:pointer;">Close</button>
        </div>`;
        document.body.appendChild(qrModal);
        document.getElementById('closeQRBtn').onclick = () => qrModal.remove();
    } else {
        document.getElementById('qrImage').src = qrUrl;
        qrModal.style.display = 'flex';
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    logMessage('Rotoscope Controller started');
    
    // Load saved data first
    await loadSavedData();
    
    // Initialize memory slots
    renderMemorySlots();
    
    // Refresh ports on startup
    await refreshPorts();
    
    // Set up serial event listeners
    window.electronAPI.onSerialData(handleSerialData);
    window.electronAPI.onSerialError(handleSerialError);
    window.electronAPI.onSerialDisconnected(handleSerialDisconnected);
    
    // Connection controls
    elements.refreshPorts.addEventListener('click', refreshPorts);
    elements.connectBtn.addEventListener('click', connectSerial);
    elements.disconnectBtn.addEventListener('click', disconnectSerial);
    
    // Status controls
    elements.queryPosition.addEventListener('click', () => sendCommand('POS?'));
    elements.queryLimits.addEventListener('click', () => sendCommand('LIMITS'));
    elements.homeBtn.addEventListener('click', () => sendCommand('HOME'));
    
    // Movement controls
    elements.moveLeft.addEventListener('click', moveLeft);
    elements.moveRight.addEventListener('click', moveRight);
    // elements.goToPosition.addEventListener('click', goToPosition);
    elements.stopBtn.addEventListener('click', disconnectSerial);
    
    // Allow Enter key for go to position
    // elements.targetPosition.addEventListener('keypress', (e) => {
    //     if (e.key === 'Enter') {
    //         goToPosition();
    //     }
    // });
    
    // Memory controls
    elements.listPositions.addEventListener('click', listAllPositions);
    elements.clearAllPositions.addEventListener('click', clearAllPositions);
    elements.addmemoryslots.addEventListener('click', addNewSlot);//to add new slot
    
    // Video controls
    if (elements.saveAllBtn) {
        elements.saveAllBtn.addEventListener('click', saveAllSettings);
    }
    
    if (elements.openVideoPlayer) {
        elements.openVideoPlayer.addEventListener('click', openVideoPlayer);
    }

    // Event delegation for Add Video button
    elements.memorySlotsContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('slot-video')) {
            const slotDiv = event.target.closest('.memory-slot');
            const slotNumber = parseInt(slotDiv.getAttribute('data-slot'), 10);
            selectVideoForSlot(slotNumber);
        }
    });
    
    // System controls
    elements.testDirection.addEventListener('click', () => sendCommand('TEST'));
    elements.clearLog.addEventListener('click', () => {
        elements.activityLog.innerHTML = '';
        logMessage('Log cleared');
    });
    
    // Add a button to show QR code (e.g., after connection panel)
    let qrBtn = document.getElementById('showQRBtn');
    if (!qrBtn) {
        qrBtn = document.createElement('button');
        qrBtn.id = 'showQRBtn';
        qrBtn.textContent = '📱 Show Mobile QR';
        qrBtn.className = 'btn btn-info';
        const connPanel = document.querySelector('.connection-panel .connection-controls');
        if (connPanel) connPanel.appendChild(qrBtn);
        qrBtn.onclick = showQRCode;
    }
    
    logMessage('All event listeners initialized');
});

// Clean up event listeners when window is closed
window.addEventListener('beforeunload', () => {
    window.electronAPI.removeAllListeners('serial-data');
    window.electronAPI.removeAllListeners('serial-error');
    window.electronAPI.removeAllListeners('serial-disconnected');
});

console.log('🎬 Rotoscope Controller app initialized');
