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

// --- Rendering ---
function renderPeople() {
    mapContainer.innerHTML = '';
    peopleCountEl.textContent = people.length;

    people.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = `person ${item.color || 'green'}`;
        if (item.locked) div.classList.add('locked');
        if (item.type === 'alliance-flag' && item.locked) div.classList.add('send-to-back');

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
            case 'flag':div.classList.add('flag-container');width = height = gridSpacing * 15 * Math.sqrt(2); break;
            case 'alliance-flag': div.classList.add('alliance-flag-container'); width = height = gridSpacing * 7 * Math.sqrt(2); break;
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
        const rect = mapContainer.getBoundingClientRect();
        const pixelX = (e.clientX - rect.left) / scale;
        const pixelY = (e.clientY - rect.top) / scale;
        const grid = pixelToGrid(pixelX, pixelY);
        coordsEl.textContent = `座標: ${Math.round(pixelX)}, ${Math.round(pixelY)} | 格線: (${grid.gridX}, ${grid.gridY})`;
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

function updateMapTransform() {
    mapContainer.style.transform = `translate(${viewPos.x}px, ${viewPos.y}px) scale(${scale})`;
}

// --- App Initialization ---
function initialize() {
    const initialX = (window.innerWidth / 2) - (MAP_WIDTH / 2) * scale;
    const initialY = (window.innerHeight / 2) - (MAP_HEIGHT / 2) * scale;
    viewPos = { x: initialX, y: initialY };
    updateMapTransform();
    
    setupFirebase();
    setupEventListeners();
}

// Start the application
initialize();
