// Firebase SDK
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getDatabase, ref, onValue } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

// --- DOM Elements ---
const mapContainer = document.getElementById('mapContainer');
const peopleCountEl = document.getElementById('peopleCount');
const coordsEl = document.getElementById('coords');
const connectionStatusEl = document.getElementById('connectionStatus');

// --- Constants ---
const MAP_WIDTH = 7500;
const MAP_HEIGHT = 6000;
const GRID_ORIGIN_X = MAP_WIDTH / 2;
const GRID_ORIGIN_Y = MAP_HEIGHT / 2;

// --- State Variables ---
let people = [];
let app, database;
let isPanning = false;
let panStart = { x: 0, y: 0 };
let scale = 1.0;
let viewPos = { x: 0, y: 0 };

// Mobile touch handling
let lastTouchDistance = 0;
let isZooming = false;
let touchStartTime = 0;
let isMobile = false;

// --- Device Detection ---
function detectMobile() {
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
               window.innerWidth <= 768 ||
               ('ontouchstart' in window);
}

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyAi-O6LCpI36s7qm28zxt-Xk39cQVGOp78",
    authDomain: "tt-c3fc7.firebaseapp.com",
    projectId: "tt-c3fc7",
    storageBucket: "tt-c3fc7.firebasestorage.app",
    messagingSenderId: "238993348253",
    appId: "1:238993348253:web:1a8de018837f0c48e12674"
};

// --- Firebase Functions ---
function setupFirebase() {
    try {
        app = initializeApp(firebaseConfig);
        database = getDatabase(app);
        connectionStatusEl.textContent = '已連接';
        connectionStatusEl.className = 'status connected';
        setupFirebaseListener();
    } catch (error) {
        console.warn('Firebase 連接失敗:', error);
        connectionStatusEl.textContent = '離線模式';
        renderPeople();
    }
}

function setupFirebaseListener() {
    const layoutRef = ref(database, 'bearDenLayout');
    onValue(layoutRef, (snapshot) => {
        const data = snapshot.val();
        people = (data && data.people) ? data.people : [];
        renderPeople();
    });
}

// --- Coordinate Transformation ---
function gridToPixel(gridX, gridY) {
    const gridStep = 40;
    const rotatedX = (gridX - gridY) * gridStep / 2;
    const rotatedY = (gridX + gridY) * gridStep / 2;
    return { x: GRID_ORIGIN_X + rotatedX, y: GRID_ORIGIN_Y + rotatedY };
}

function pixelToGrid(pixelX, pixelY) {
    const deltaX = pixelX - GRID_ORIGIN_X;
    const deltaY = pixelY - GRID_ORIGIN_Y;
    const gridStep = 40;
    const gridX = Math.round((deltaX + deltaY) / gridStep);
    const gridY = Math.round((deltaY - deltaX) / gridStep);
    return {gridX, gridY};
}

// --- Touch Helper Functions ---
function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function getTouchCenter(touches) {
    return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2
    };
}

// --- Rendering ---
function renderPeople() {
    mapContainer.innerHTML = '';
    peopleCountEl.textContent = people.length;

    people.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = `person ${item.color || 'green'}`;
        if (item.locked) div.classList.add('locked');
        if ((item.type === 'alliance-flag' || item.type === 'flag') && item.locked) div.classList.add('send-to-back');

        const textDiv = document.createElement('div');
        textDiv.className = 'text';
        textDiv.textContent = item.name;
        div.appendChild(textDiv);

        const gridSpacing = 40;
        let width, height;
        switch(item.type) {
            case 'small': width = height = gridSpacing * Math.sqrt(2); break;
            case 'person': width = height = gridSpacing * 2 * Math.sqrt(2); break;
            case 'center': width = height = gridSpacing * 3 * Math.sqrt(2); break;
            case 'large': width = height = gridSpacing * 4 * Math.sqrt(2); break;
            case 'flag':
                div.classList.add('flag-container');
                width = height = gridSpacing * 15 * Math.sqrt(2); 
                break;
            case 'alliance-flag': 
                div.classList.add('alliance-flag-container'); 
                width = height = gridSpacing * 7 * Math.sqrt(2); 
                break;
            default: width = height = gridSpacing * 2 * Math.sqrt(2);
        }

        const centerPos = gridToPixel(item.gridX, item.gridY);
        div.style.width = `${width}px`;
        div.style.height = `${height}px`;
        div.style.left = `${centerPos.x - width / 2}px`;
        div.style.top = `${centerPos.y - height / 2}px`;
        
        mapContainer.appendChild(div);
    });
}

// --- Event Listeners ---
function setupEventListeners() {
    if (isMobile) {
        setupTouchEventListeners();
    } else {
        setupMouseEventListeners();
    }
}

function setupMouseEventListeners() {
    const handleMouseDown = (e) => {
        if (e.button !== 0) return;
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };
        mapContainer.style.cursor = 'grabbing';
    };

    const handleMouseMove = (e) => {
        if (isPanning) {
            const dx = e.clientX - panStart.x;
            const dy = e.clientY - panStart.y;
            viewPos.x += dx;
            viewPos.y += dy;
            updateMapTransform();
            panStart = { x: e.clientX, y: e.clientY };
        }
        updateCoordinates(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
        isPanning = false;
        mapContainer.style.cursor = 'grab';
    };

    const handleWheel = (e) => {
        e.preventDefault();
        const zoomIntensity = 0.1;
        const oldScale = scale;
        if (e.deltaY < 0) {
            scale *= (1 + zoomIntensity);
        } else {
            scale /= (1 + zoomIntensity);
        }
        scale = Math.max(0.1, Math.min(scale, 5));
        const mouseX = e.clientX - viewPos.x;
        const mouseY = e.clientY - viewPos.y;
        viewPos.x = e.clientX - mouseX * (scale / oldScale);
        viewPos.y = e.clientY - mouseY * (scale / oldScale);
        updateMapTransform();
    };
    
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('wheel', handleWheel, { passive: false });
}

function setupTouchEventListeners() {
    const handleTouchStart = (e) => {
        // 如果觸控的是按鈕或連結，不要攔截事件
        if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON' || 
            e.target.closest('.btn') || e.target.closest('.header')) {
            return; // 讓按鈕正常工作
        }
        
        e.preventDefault();
        touchStartTime = Date.now();
        
        if (e.touches.length === 1) {
            // Single finger - panning
            isPanning = true;
            panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.touches.length === 2) {
            // Two fingers - zooming
            isPanning = false;
            isZooming = true;
            lastTouchDistance = getTouchDistance(e.touches);
        }
    };

    const handleTouchMove = (e) => {
        // 如果觸控的是按鈕或連結，不要攔截事件
        if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON' || 
            e.target.closest('.btn') || e.target.closest('.header')) {
            return;
        }
        
        e.preventDefault();
        
        if (e.touches.length === 1 && isPanning && !isZooming) {
            // Single finger panning
            const dx = e.touches[0].clientX - panStart.x;
            const dy = e.touches[0].clientY - panStart.y;
            viewPos.x += dx;
            viewPos.y += dy;
            updateMapTransform();
            panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            
            // Update coordinates for single touch
            updateCoordinates(e.touches[0].clientX, e.touches[0].clientY);
        } else if (e.touches.length === 2 && isZooming) {
            // Two finger zooming
            const currentDistance = getTouchDistance(e.touches);
            const center = getTouchCenter(e.touches);
            
            if (lastTouchDistance > 0) {
                const zoomRatio = currentDistance / lastTouchDistance;
                const oldScale = scale;
                scale *= zoomRatio;
                scale = Math.max(0.1, Math.min(scale, 5));
                
                // Zoom towards the center of the two fingers
                const centerX = center.x - viewPos.x;
                const centerY = center.y - viewPos.y;
                viewPos.x = center.x - centerX * (scale / oldScale);
                viewPos.y = center.y - centerY * (scale / oldScale);
                
                updateMapTransform();
            }
            
            lastTouchDistance = currentDistance;
        }
    };

    const handleTouchEnd = (e) => {
        // 如果觸控的是按鈕或連結，不要攔截事件
        if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON' || 
            e.target.closest('.btn') || e.target.closest('.header')) {
            return;
        }
        
        e.preventDefault();
        
        if (e.touches.length === 0) {
            // All fingers lifted
            isPanning = false;
            isZooming = false;
            lastTouchDistance = 0;
            
            // Double tap to zoom (if it was a quick tap)
            const touchDuration = Date.now() - touchStartTime;
            if (touchDuration < 300 && !isPanning && !isZooming) {
                // This was a quick tap, could implement double-tap zoom here
            }
        } else if (e.touches.length === 1 && isZooming) {
            // Back to single finger after zooming
            isZooming = false;
            lastTouchDistance = 0;
            isPanning = true;
            panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    };

    // 只對地圖容器添加觸控事件監聽器，不影響按鈕
    mapContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
    mapContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
    mapContainer.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    // 防止context menu on long press，但不影響按鈕
    mapContainer.addEventListener('contextmenu', (e) => {
        if (isMobile) e.preventDefault();
    });
    
    // 防止zoom on double tap for better control，但不影響按鈕
    let lastTap = 0;
    mapContainer.addEventListener('touchend', (e) => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        if (tapLength < 500 && tapLength > 0) {
            e.preventDefault();
        }
        lastTap = currentTime;
    });
}

function updateCoordinates(clientX, clientY) {
    const rect = mapContainer.getBoundingClientRect();
    const pixelX = (clientX - rect.left) / scale;
    const pixelY = (clientY - rect.top) / scale;
    const grid = pixelToGrid(pixelX, pixelY);
    coordsEl.textContent = `座標: ${Math.round(pixelX)}, ${Math.round(pixelY)} | 格線: (${grid.gridX}, ${grid.gridY})`;
}

function updateMapTransform() {
    mapContainer.style.transform = `translate(${viewPos.x}px, ${viewPos.y}px) scale(${scale})`;
}

// --- App Initialization ---
function initialize() {
    detectMobile();
    
    // Better initial positioning for mobile
    let initialScale = isMobile ? 0.3 : 1.0;
    scale = initialScale;
    
    const initialX = (window.innerWidth / 2) - (MAP_WIDTH / 2) * scale;
    const initialY = (window.innerHeight / 2) - (MAP_HEIGHT / 2) * scale;
    viewPos = { x: initialX, y: initialY };
    
    updateMapTransform();
    
    setupFirebase();
    setupEventListeners();
    
    // Add mobile-specific optimizations
    if (isMobile) {
        document.body.style.overflow = 'hidden';
        // Prevent bounce scrolling on iOS
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
        document.body.style.height = '100%';
    }
}

// Handle orientation changes on mobile
window.addEventListener('orientationchange', () => {
    if (isMobile) {
        setTimeout(() => {
            const initialX = (window.innerWidth / 2) - (MAP_WIDTH / 2) * scale;
            const initialY = (window.innerHeight / 2) - (MAP_HEIGHT / 2) * scale;
            viewPos = { x: initialX, y: initialY };
            updateMapTransform();
        }, 100);
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    if (isMobile) {
        const initialX = (window.innerWidth / 2) - (MAP_WIDTH / 2) * scale;
        const initialY = (window.innerHeight / 2) - (MAP_HEIGHT / 2) * scale;
        viewPos = { x: initialX, y: initialY };
        updateMapTransform();
    }
});

// Start the application
initialize();
