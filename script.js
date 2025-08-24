// Firebase SDK
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getDatabase, ref, set, onValue } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

// --- Global variables ---
let people = [];
let app, database;
let isUpdatingFromFirebase = false;
let isDragging = false, isPanning = false, isMarqueeSelecting = false;
let dragPerson = null;
let dragOffset = { x: 0, y: 0, calculated: false };
let panStart = { x: 0, y: 0 };
let scale = 1.0;
let viewPos = { x: 0, y: 0 };
let isMultiSelectMode = false;
let selectedIndices = new Set();
let selectionBox = null;
let marqueeStartPos = { x: 0, y: 0 };

// 【★★★ 新增變數 - 觸控專用 ★★★】
let isPinching = false;
let initialPinchDistance = 0;
let longPressTimer = null;
const LONG_PRESS_DURATION = 250; // 長按 250 毫秒觸發拖曳

// --- DOM Elements (will be assigned once DOM is loaded) ---
let mapContainer, peopleCountEl, coordsEl, newItemNameInput, itemTypeSelect, itemColorSelect, connectionStatusEl, multiSelectBtn, deleteSelectedBtn;

// --- Constants ---
const MAP_WIDTH = 7500;
const MAP_HEIGHT = 6000;
const GRID_ORIGIN_X = MAP_WIDTH / 2;
const GRID_ORIGIN_Y = MAP_HEIGHT / 2;

// --- Main App Logic ---
document.addEventListener('DOMContentLoaded', () => {
    mapContainer = document.getElementById('mapContainer');
    peopleCountEl = document.getElementById('peopleCount');
    coordsEl = document.getElementById('coords');
    newItemNameInput = document.getElementById('newItemName');
    itemTypeSelect = document.getElementById('itemType');
    itemColorSelect = document.getElementById('itemColor');
    connectionStatusEl = document.getElementById('connectionStatus');
    multiSelectBtn = document.getElementById('multiSelectBtn');
    deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    
    if (checkPassword()) {
        initialize();
    }
});

function initialize() {
    const initialX = (window.innerWidth / 2) - (MAP_WIDTH / 2) * scale;
    const initialY = (window.innerHeight / 2) - (MAP_HEIGHT / 2) * scale;
    viewPos = { x: initialX, y: initialY };
    updateMapTransform();
    setupFirebase();
    setupGlobalEventListeners();
}

function checkPassword() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayPassword = `bear${year}${month}${day}`;
    const password = prompt('🔐 請輸入編輯密碼：');
    if (password !== todayPassword) {
        alert('❌ 密碼錯誤！');
        window.location.href = 'view.html';
        return false;
    }
    return true;
}

// --- Firebase ---
const firebaseConfig = { apiKey: "AIzaSyAi-O6LCpI36s7qm28zxt-Xk39cQVGOp78", authDomain: "tt-c3fc7.firebaseapp.com", projectId: "tt-c3fc7", storageBucket: "tt-c3fc7.firebasestorage.app", messagingSenderId: "238993348253", appId: "1:238993348253:web:1a8de018837f0c48e12674" };
function setupFirebase() { try { app = initializeApp(firebaseConfig); database = getDatabase(app); connectionStatusEl.textContent = '已連接'; connectionStatusEl.className = 'status connected'; setupFirebaseListener(); } catch (error) { console.warn('Firebase 連接失敗:', error); connectionStatusEl.textContent = '離線模式'; renderPeople(); } }
function saveToFirebase() { if (!database || isUpdatingFromFirebase) return; try { const layoutRef = ref(database, 'bearDenLayout'); set(layoutRef, { people: people, lastUpdated: Date.now() }); } catch (error) { console.warn('Firebase 儲存失敗:', error); } }
function setupFirebaseListener() { const layoutRef = ref(database, 'bearDenLayout'); onValue(layoutRef, (snapshot) => { isUpdatingFromFirebase = true; const data = snapshot.val(); people = (data && data.people) ? data.people : []; renderPeople(); isUpdatingFromFirebase = false; }); }

// --- Coordinate Transformation ---
function gridToPixel(gridX, gridY) { const gridStep = 40; const rotatedX = (gridX - gridY) * gridStep / 2; const rotatedY = (gridX + gridY) * gridStep / 2; return { x: GRID_ORIGIN_X + rotatedX, y: GRID_ORIGIN_Y + rotatedY }; }
function pixelToGrid(pixelX, pixelY) { const deltaX = pixelX - GRID_ORIGIN_X; const deltaY = pixelY - GRID_ORIGIN_Y; const gridStep = 40; const gridX = Math.round((deltaX + deltaY) / gridStep); const gridY = Math.round((deltaY - deltaX) / gridStep); return {gridX, gridY}; }

// --- Core UI Functions ---
window.addItem = function () { const type = itemTypeSelect.value; let name = (type === 'alliance-flag') ? '旗子' : newItemNameInput.value.trim(); if (!name) { alert('請輸入名稱！'); return; } people.push({ name, gridX: 6, gridY: 6, type, color: itemColorSelect.value, locked: false }); if (type !== 'alliance-flag') newItemNameInput.value = ''; renderPeople(); }
function deleteItem(index) { if (people[index]?.locked) { alert('❌ 無法刪除，此項目已被鎖定！'); return; } if (confirm(`確定要刪除 "${people[index].name}" 嗎？`)) { people.splice(index, 1); renderPeople(); } }
function renameItem(index) { if (people[index]?.locked) { alert('❌ 無法改名，此項目已被鎖定！'); return; } const newName = prompt('請輸入新的名稱：', people[index].name); if (newName && newName.trim()) { people[index].name = newName.trim(); renderPeople(); } }
function changeColor(index) { if (people[index]?.locked) return; const colors = ['green', 'blue', 'purple', 'orange', 'pink', 'yellow', 'cyan', 'red']; const currentColor = people[index].color || 'green'; const nextIndex = (colors.indexOf(currentColor) + 1) % colors.length; people[index].color = colors[nextIndex]; renderPeople(); }
function toggleLock(index) { if (people[index]) { people[index].locked = !people[index].locked; renderPeople(); } }
window.unlockAllItems = function () { if (confirm('確定要解鎖地圖上所有項目嗎？')) { people.forEach(item => item.locked = false); renderPeople(); } }
window.toggleMultiSelectMode = function () { isMultiSelectMode = !isMultiSelectMode; mapContainer.classList.toggle('multi-select-mode', isMultiSelectMode); multiSelectBtn.classList.toggle('active', isMultiSelectMode); if (!isMultiSelectMode) { renderPeople(); } }
function toggleItemSelection(index) { if (people[index].locked) return; selectedIndices.has(index) ? selectedIndices.delete(index) : selectedIndices.add(index); deleteSelectedBtn.style.display = selectedIndices.size > 0 ? 'inline-block' : 'none'; renderPeople(); }
window.deleteSelected = function () { if (selectedIndices.size === 0 || !confirm(`確定要刪除選取的 ${selectedIndices.size} 個項目嗎？`)) return; const sortedIndices = Array.from(selectedIndices).sort((a, b) => b - a); sortedIndices.forEach(index => people.splice(index, 1)); selectedIndices.clear(); deleteSelectedBtn.style.display = 'none'; renderPeople(); }

// --- Rendering ---
function renderPeople() {
    // 省略未變更的 renderPeople 函數內容... (與您原本的檔案相同)
    mapContainer.innerHTML = '';
    peopleCountEl.textContent = people.length;

    people.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = `person ${item.color || 'green'}`;
        div.dataset.index = index;

        if (selectedIndices.has(index)) div.classList.add('selected');
        if (item.locked) div.classList.add('locked');
        if ((item.type === 'alliance-flag' || item.type === 'flag') && item.locked) div.classList.add('send-to-back');

        const lockBtn = document.createElement('div');
        lockBtn.className = 'lock-btn';
        lockBtn.innerHTML = '🔒';
        lockBtn.onclick = (e) => { e.stopPropagation(); toggleLock(index); };
        div.appendChild(lockBtn);

        const renameBtn = document.createElement('div');
        renameBtn.className = 'rename-btn';
        renameBtn.innerHTML = '✏️';
        renameBtn.onclick = (e) => { e.stopPropagation(); renameItem(index); };
        div.appendChild(renameBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '×';
        deleteBtn.onclick = (e) => { e.stopPropagation(); deleteItem(index); };
        div.appendChild(deleteBtn);

        const textDiv = document.createElement('div');
        textDiv.className = 'text';
        textDiv.textContent = item.name;
        div.appendChild(textDiv);

        const gridSpacing = 40;
        let width, height;
        switch (item.type) {
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

        div.addEventListener('contextmenu', (e) => { e.preventDefault(); changeColor(index); });

        mapContainer.appendChild(div);
    });
    if (!isUpdatingFromFirebase) saveToFirebase();
}


// --- Global Event Listeners ---
function setupGlobalEventListeners() {
    // --- 滑鼠事件 (電腦版) ---
    const handleMouseDown = (e) => {
        if (e.button !== 0 || e.touches) return; // 忽略左鍵以外的點擊和觸控事件
        const target = e.target;

        if (target.classList.contains('person')) {
            const index = parseInt(target.dataset.index, 10);
            if (isMultiSelectMode) {
                toggleItemSelection(index);
            } else {
                isDragging = true;
                dragPerson = index;
                if (!selectedIndices.has(index)) {
                    selectedIndices.clear();
                    deleteSelectedBtn.style.display = 'none';
                    selectedIndices.add(index);
                    renderPeople();
                }
            }
        } else if (isMultiSelectMode && target === mapContainer) {
            isMarqueeSelecting = true;
            if (!e.shiftKey) {
                selectedIndices.clear();
                deleteSelectedBtn.style.display = 'none';
            }
            const rect = mapContainer.getBoundingClientRect();
            marqueeStartPos = { x: e.clientX, y: e.clientY };
            selectionBox = document.createElement('div');
            selectionBox.className = 'selection-box';
            selectionBox.style.left = `${(e.clientX - rect.left) / scale}px`;
            selectionBox.style.top = `${(e.clientY - rect.top) / scale}px`;
            mapContainer.appendChild(selectionBox);
        } else if (target === mapContainer) {
            isPanning = true;
            panStart = { x: e.clientX, y: e.clientY };
            mapContainer.style.cursor = 'grabbing';
            if (!e.shiftKey && !isMultiSelectMode) {
                selectedIndices.clear();
                deleteSelectedBtn.style.display = 'none';
                renderPeople();
            }
        }
    };

    const handleMouseMove = (e) => {
        const clientX = e.clientX;
        const clientY = e.clientY;
        
        // ... (滑鼠移動邏輯與您原本的檔案相同，此處省略)
        if (isPanning) {
            const dx = clientX - panStart.x;
            const dy = clientY - panStart.y;
            viewPos.x += dx;
            viewPos.y += dy;
            updateMapTransform();
            panStart = { x: clientX, y: clientY };
        } else if (isMarqueeSelecting) {
            const rect = mapContainer.getBoundingClientRect();
            const currentX = (clientX - rect.left) / scale;
            const currentY = (clientY - rect.top) / scale;
            const startX = (marqueeStartPos.x - rect.left) / scale;
            const startY = (marqueeStartPos.y - rect.top) / scale;
            selectionBox.style.left = `${Math.min(startX, currentX)}px`;
            selectionBox.style.top = `${Math.min(startY, currentY)}px`;
            selectionBox.style.width = `${Math.abs(startX - currentX)}px`;
            selectionBox.style.height = `${Math.abs(startY - currentY)}px`;
        } else if (isDragging && selectedIndices.size > 0) {
            const rect = mapContainer.getBoundingClientRect();
            if (!dragOffset.calculated) {
                const firstItem = people[dragPerson];
                const firstItemPos = gridToPixel(firstItem.gridX, firstItem.gridY);
                dragOffset.x = clientX - (firstItemPos.x * scale + viewPos.x);
                dragOffset.y = clientY - (firstItemPos.y * scale + viewPos.y);
                dragOffset.calculated = true;
                selectedIndices.forEach(idx => {
                    people[idx].initialGridX = people[idx].gridX;
                    people[idx].initialGridY = people[idx].gridY;
                });
            }
            const newBasePixelX = (clientX - viewPos.x - dragOffset.x) / scale;
            const newBasePixelY = (clientY - viewPos.y - dragOffset.y) / scale;
            const newBaseGrid = pixelToGrid(newBasePixelX, newBasePixelY);
            const gridDeltaX = newBaseGrid.gridX - people[dragPerson].initialGridX;
            const gridDeltaY = newBaseGrid.gridY - people[dragPerson].initialGridY;
            selectedIndices.forEach(idx => {
                if (!people[idx].locked) {
                    people[idx].gridX = people[idx].initialGridX + gridDeltaX;
                    people[idx].gridY = people[idx].initialGridY + gridDeltaY;
                }
            });
            renderPeople();
        } else {
            const rect = mapContainer.getBoundingClientRect();
            const pixelX = (clientX - rect.left) / scale;
            const pixelY = (clientY - rect.top) / scale;
            const grid = pixelToGrid(pixelX, pixelY);
            coordsEl.textContent = `座標: ${Math.round(pixelX)}, ${Math.round(pixelY)} | 格線: (${grid.gridX}, ${grid.gridY})`;
        }
    };

    const handleMouseUp = () => {
        // ... (滑鼠放開邏輯與您原本的檔案相同，此處省略)
        if (isPanning) {
            isPanning = false;
            mapContainer.style.cursor = 'grab';
        }
        if (isMarqueeSelecting) {
            const boxRect = selectionBox.getBoundingClientRect();
            mapContainer.querySelectorAll('.person').forEach(p => {
                const personRect = p.getBoundingClientRect();
                if (checkIntersection(boxRect, personRect)) {
                    const index = parseInt(p.dataset.index, 10);
                    if (!people[index].locked) selectedIndices.add(index);
                }
            });
            mapContainer.removeChild(selectionBox);
            selectionBox = null;
            isMarqueeSelecting = false;
            deleteSelectedBtn.style.display = selectedIndices.size > 0 ? 'inline-block' : 'none';
            renderPeople();
        }
        if (isDragging) {
            isDragging = false;
            dragOffset.calculated = false;
        }
    };

    const handleWheel = (e) => {
        // ... (滑鼠滾輪邏輯與您原本的檔案相同，此處省略)
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

    // 【★★★ 以下是本次新增的觸控事件 ★★★】

    // --- 觸控事件 (手機版) ---
    const handleTouchStart = (e) => {
        if (e.touches.length === 2) { // 雙指 -> 縮放
            isPanning = false; // 確保停止平移
            isPinching = true;
            initialPinchDistance = getPinchDistance(e);
            return;
        }

        if (e.touches.length === 1) { // 單指
            const target = e.target;
            const touch = e.touches[0];

            if (target.classList.contains('person')) {
                const index = parseInt(target.dataset.index, 10);
                
                // 設定長按計時器來啟動拖曳
                longPressTimer = setTimeout(() => {
                    if (isMultiSelectMode) return; // 多選模式下長按無效
                    
                    isDragging = true;
                    dragPerson = index;
                    if (!selectedIndices.has(index)) {
                        selectedIndices.clear();
                        deleteSelectedBtn.style.display = 'none';
                        selectedIndices.add(index);
                        renderPeople(); // 重新渲染以顯示選取狀態
                    }
                    // 標記目標為 dragging
                    const el = mapContainer.querySelector(`[data-index="${index}"]`);
                    if (el) el.classList.add('dragging');

                }, LONG_PRESS_DURATION);

            } else if (target === mapContainer) {
                // 如果點擊背景，則開始平移
                isPanning = true;
                panStart = { x: touch.clientX, y: touch.clientY };
            }
        }
    };

    const handleTouchMove = (e) => {
        e.preventDefault(); // 阻止頁面滾動

        // 如果移動了手指，就取消長按計時器 (避免誤觸拖曳)
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        if (isPinching && e.touches.length === 2) { // 雙指縮放
            const newDistance = getPinchDistance(e);
            const oldScale = scale;
            scale *= newDistance / initialPinchDistance;
            scale = Math.max(0.1, Math.min(scale, 5));

            const rect = mapContainer.getBoundingClientRect();
            const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            const mouseX = centerX - viewPos.x;
            const mouseY = centerY - viewPos.y;
            viewPos.x = centerX - mouseX * (scale / oldScale);
            viewPos.y = centerY - mouseY * (scale / oldScale);

            updateMapTransform();
            initialPinchDistance = newDistance;

        } else if (isDragging && selectedIndices.size > 0) { // 拖曳項目
            const touch = e.touches[0];
            const clientX = touch.clientX;
            const clientY = touch.clientY;
            
            // ... (拖曳邏輯與滑鼠版 handleMouseMove 相同)
            const rect = mapContainer.getBoundingClientRect();
            if (!dragOffset.calculated) {
                const firstItem = people[dragPerson];
                const firstItemPos = gridToPixel(firstItem.gridX, firstItem.gridY);
                dragOffset.x = clientX - (firstItemPos.x * scale + viewPos.x);
                dragOffset.y = clientY - (firstItemPos.y * scale + viewPos.y);
                dragOffset.calculated = true;
                selectedIndices.forEach(idx => {
                    people[idx].initialGridX = people[idx].gridX;
                    people[idx].initialGridY = people[idx].gridY;
                });
            }
            const newBasePixelX = (clientX - viewPos.x - dragOffset.x) / scale;
            const newBasePixelY = (clientY - viewPos.y - dragOffset.y) / scale;
            const newBaseGrid = pixelToGrid(newBasePixelX, newBasePixelY);
            const gridDeltaX = newBaseGrid.gridX - people[dragPerson].initialGridX;
            const gridDeltaY = newBaseGrid.gridY - people[dragPerson].initialGridY;
            selectedIndices.forEach(idx => {
                if (!people[idx].locked) {
                    people[idx].gridX = people[idx].initialGridX + gridDeltaX;
                    people[idx].gridY = people[idx].initialGridY + gridDeltaY;
                }
            });
            renderPeople();

        } else if (isPanning) { // 平移地圖
            const touch = e.touches[0];
            const dx = touch.clientX - panStart.x;
            const dy = touch.clientY - panStart.y;
            viewPos.x += dx;
            viewPos.y += dy;
            updateMapTransform();
            panStart = { x: touch.clientX, y: touch.clientY };
        }
    };

    const handleTouchEnd = (e) => {
        // 清除長按計時器
        clearTimeout(longPressTimer);
        longPressTimer = null;

        // 如果不是在拖曳狀態，且是點擊，則觸發選取
        if (!isDragging && e.changedTouches.length === 1) {
             const target = e.target;
             if (target.classList.contains('person') && isMultiSelectMode) {
                 const index = parseInt(target.dataset.index, 10);
                 toggleItemSelection(index);
             }
        }
        
        // 結束拖曳
        if (isDragging) {
            isDragging = false;
            dragOffset.calculated = false;
            // 移除 dragging class
            mapContainer.querySelectorAll('.person.dragging').forEach(el => el.classList.remove('dragging'));
        }

        // 結束縮放或平移
        if (e.touches.length < 2) isPinching = false;
        if (e.touches.length < 1) isPanning = false;
    };
    
    // 計算雙指距離
    function getPinchDistance(e) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    // --- 註冊事件監聽 ---
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('wheel', handleWheel, { passive: false });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && newItemNameInput === document.activeElement) addItem();
    });
    
    // 註冊觸控事件
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchEnd);
}

function updateMapTransform() {
    mapContainer.style.transform = `translate(${viewPos.x}px, ${viewPos.y}px) scale(${scale})`;
}

function checkIntersection(rect1, rect2) {
    return !(rect1.right < rect2.left || rect1.left > rect2.right || rect1.bottom < rect2.top || rect1.top > rect2.bottom);
}
