// Video Player Application Logic

let currentSettings = {};
let currentPosition = 0;
let currentVideo = null;
let overlayVisible = false;
let overlayTimeout;
const movingPlaceholder = document.getElementById('movingPlaceholder');
let isMoving = false;
let lastMovingTimeout = null;

// DOM Elements
const videoPlayer = document.getElementById('videoPlayer');
const overlay = document.getElementById('overlay');
const currentPosDisplay = document.getElementById('currentPosDisplay');
const settingsBtn = document.getElementById('settingsBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const noVideo = document.getElementById('noVideo');
const loading = document.getElementById('loading');

// Initialize video player
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎬 Video player initialized');
    
    loading.style.display = 'block';
    
    // Set up event listeners
    settingsBtn.addEventListener('click', openSettings);
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    
    // Mouse movement to show/hide overlay
    document.addEventListener('mousemove', showOverlay);
    document.addEventListener('click', showOverlay);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);
    
    // Wait for settings data
    window.electronAPI.onSettingsData(handleSettingsData);
    window.electronAPI.onSerialData(handleSerialData);
    
    // Hide loading after 3 seconds if no data received
    setTimeout(() => {
        if (loading.style.display !== 'none') {
            loading.style.display = 'none';
            noVideo.style.display = 'block';
        }
    }, 3000);
});

// Handle settings data from main process
function handleSettingsData(event, settings) {
    console.log('📂 Received settings data:', settings);
    currentSettings = settings;
    loading.style.display = 'none';
    
    // If no positions/videos configured
    if (!settings.positions || Object.keys(settings.positions).length === 0) {
        noVideo.style.display = 'block';
        return;
    }
    
    noVideo.style.display = 'none';
    console.log('✅ Settings loaded, waiting for position updates...');
}

// Handle serial data for position updates
function handleSerialData(event, data) {
    console.log('📨 Serial data:', data);
    
    if (data.startsWith('POS:')) {
        const newPosition = parseInt(data.substring(4));
        updatePosition(newPosition);
    } else if (data.startsWith('Moving to position:')) {
        showMovingPlaceholder();
    } else if (data.startsWith('Successfully reached position:')) {
        hideMovingPlaceholder();
        // Optionally, update position if needed
    }
}

// Update position and check for video changes
function updatePosition(position) {
    currentPosition = position;
    currentPosDisplay.textContent = `Position: ${position}`;
    
    // Check if this position matches any saved slot
    const matchingSlot = findMatchingSlot(position);
    
    if (matchingSlot !== null && currentSettings.videos && currentSettings.videos[matchingSlot]) {
        const videoPath = currentSettings.videos[matchingSlot];
        if (currentVideo !== videoPath) {
            playVideo(videoPath);
        }
    } else {
        // No video for this position
        stopVideo();
    }
}

// Find matching slot for current position (with tolerance)
function findMatchingSlot(position) {
    const tolerance = 5; // Allow ±5 encoder counts tolerance
    
    for (const [slot, savedPosition] of Object.entries(currentSettings.positions || {})) {
        if (Math.abs(position - savedPosition) <= tolerance) {
            return parseInt(slot);
        }
    }
    
    return null;
}

// Play video
function playVideo(videoPath) {
    console.log('🎥 Playing video:', videoPath);
    
    currentVideo = videoPath;
    videoPlayer.src = `file://${videoPath}`;
    videoPlayer.style.display = 'block';
    noVideo.style.display = 'none';
    
    videoPlayer.load();
    if (!isMoving) {
        videoPlayer.classList.add('fade-in');
        videoPlayer.classList.remove('fade-out');
        videoPlayer.play().catch(error => {
            console.error('Error playing video:', error);
            showError(`Failed to play video: ${error.message}`);
        });
    }
}

// Stop video
function stopVideo() {
    if (currentVideo) {
        console.log('⏹️ Stopping video');
        videoPlayer.pause();
        videoPlayer.src = '';
        currentVideo = null;
        videoPlayer.style.display = 'none';
        noVideo.style.display = 'block';
    }
}

// Show overlay with auto-hide
function showOverlay() {
    overlay.classList.add('visible');
    overlayVisible = true;
    
    // Clear existing timeout
    if (overlayTimeout) {
        clearTimeout(overlayTimeout);
    }
    
    // Hide after 3 seconds
    overlayTimeout = setTimeout(() => {
        overlay.classList.remove('visible');
        overlayVisible = false;
    }, 3000);
}

// Toggle fullscreen
function toggleFullscreen() {
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        document.documentElement.requestFullscreen();
    }
}

// Open settings window
async function openSettings() {
    try {
        // This would need to be implemented to show settings window
        console.log('Opening settings...');
        // You can implement this to show the settings window or overlay
    } catch (error) {
        console.error('Failed to open settings:', error);
    }
}

// Keyboard shortcuts
function handleKeyboard(event) {
    switch (event.key) {
        case 'Escape':
            if (document.fullscreenElement) {
                document.exitFullscreen();
            }
            break;
        case 'f':
        case 'F':
            toggleFullscreen();
            break;
        case ' ':
            event.preventDefault();
            if (videoPlayer.paused) {
                videoPlayer.play();
            } else {
                videoPlayer.pause();
            }
            break;
        case 's':
        case 'S':
            showOverlay();
            break;
    }
}

// Error handling
function showError(message) {
    console.error(message);
    // You could show an error overlay here
}

// Clean up when page unloads
window.addEventListener('beforeunload', () => {
    if (overlayTimeout) {
        clearTimeout(overlayTimeout);
    }
});

function showMovingPlaceholder() {
    isMoving = true;
    // Fade out video, fade in placeholder
    videoPlayer.classList.add('fade-out');
    videoPlayer.classList.remove('fade-in');
    movingPlaceholder.style.display = 'block';
    movingPlaceholder.classList.add('fade-in');
    movingPlaceholder.classList.remove('fade-out');
    // Pause video
    videoPlayer.pause();
}

function hideMovingPlaceholder() {
    isMoving = false;
    // Fade in video, fade out placeholder
    videoPlayer.classList.remove('fade-out');
    videoPlayer.classList.add('fade-in');
    movingPlaceholder.classList.remove('fade-in');
    movingPlaceholder.classList.add('fade-out');
    setTimeout(() => {
        if (!isMoving) movingPlaceholder.style.display = 'none';
    }, 500);
    // Resume video if available
    if (videoPlayer.src) {
        videoPlayer.play().catch(()=>{});
    }
}
