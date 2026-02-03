"use strict";
const difficulties = {
    easy: { rows: 9, cols: 9, mines: 10 },
    medium: { rows: 16, cols: 16, mines: 40 },
    hard: { rows: 16, cols: 30, mines: 99 },
};
const SETTINGS_KEY = 'minesweeper_settings_v1';
const LEADERBOARD_KEY = 'minesweeper_leaderboard_v1';
const LEADERBOARD_LIMIT = 5;
const MAX_NICKNAME_LENGTH = 12;
const DEFAULT_NICKNAME = '玩家';
function mustGetById(id) {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`缺少必要的 DOM 元素: #${id}`);
    }
    return element;
}
function mustQuery(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`缺少必要的 DOM 元素: ${selector}`);
    }
    return element;
}
const boardEl = mustGetById('board');
const timerEl = mustGetById('timer');
const minesLeftEl = mustGetById('mines-left');
const statusEl = mustGetById('status');
const difficultyEl = mustGetById('difficulty');
const customFieldsEl = mustGetById('custom-fields');
const customColsEl = mustGetById('custom-cols');
const customRowsEl = mustGetById('custom-rows');
const customMinesEl = mustGetById('custom-mines');
const nicknameEl = mustGetById('nickname');
const newGameBtn = mustGetById('new-game');
const resetBtn = mustGetById('reset');
const boardPanelEl = mustQuery('.board-panel');
const soundToggleEl = mustGetById('sound-toggle');
const hintBtn = mustGetById('hint-btn');
const hintInfoEl = mustGetById('hint-info');
const leaderboardEl = mustGetById('leaderboard');
const leaderboardLabelEl = mustGetById('leaderboard-label');
const clearRecordsBtn = mustGetById('clear-records');
const soundSequences = {
    open: [{ frequency: 620, duration: 0.08, volume: 0.08, type: 'triangle' }],
    flag: [{ frequency: 320, duration: 0.12, volume: 0.07, type: 'square' }],
    hint: [{ frequency: 520, duration: 0.1, volume: 0.06, type: 'sine' }],
    win: [
        { frequency: 520, duration: 0.12, volume: 0.08, type: 'triangle' },
        { frequency: 660, duration: 0.18, volume: 0.08, type: 'triangle', offset: 0.12 },
    ],
    lose: [{ frequency: 140, duration: 0.45, volume: 0.12, type: 'sawtooth' }],
};
let settings = loadSettings();
let leaderboard = loadLeaderboard();
let audioContext = null;
let hintMessageTimer = null;
let state = createInitialState(difficulties.medium);
function createInitialState(config) {
    return {
        config,
        board: createEmptyBoard(config.rows, config.cols),
        cellEls: [],
        flags: 0,
        openCount: 0,
        minesPlaced: false,
        isGameOver: false,
        didWin: false,
        timerId: null,
        startTime: null,
        elapsed: 0,
        activeRow: 0,
        activeCol: 0,
        hintsUsed: 0,
    };
}
function createEmptyBoard(rows, cols) {
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({
        isMine: false,
        isOpen: false,
        isFlagged: false,
        adjacent: 0,
        isWrongFlag: false,
    })));
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
function formatCounter(value) {
    const absValue = Math.abs(value);
    const padded = absValue.toString().padStart(3, '0');
    return value < 0 ? `-${padded}` : padded;
}
function formatTime(seconds) {
    if (seconds < 60)
        return `${seconds} 秒`;
    const minutes = Math.floor(seconds / 60);
    const remain = seconds % 60;
    return `${minutes}:${remain.toString().padStart(2, '0')}`;
}
function normalizeNickname(value) {
    if (typeof value !== 'string')
        return DEFAULT_NICKNAME;
    const trimmed = value.trim();
    if (!trimmed)
        return DEFAULT_NICKNAME;
    return trimmed.slice(0, MAX_NICKNAME_LENGTH);
}
function setStatus(text, tone) {
    statusEl.textContent = text;
    statusEl.dataset.tone = tone;
}
function updateMinesLeft() {
    const remaining = state.config.mines - state.flags;
    minesLeftEl.textContent = formatCounter(remaining);
}
function updateTimer() {
    if (state.startTime === null)
        return;
    const now = Date.now();
    const seconds = Math.floor((now - state.startTime) / 1000);
    state.elapsed = clamp(seconds, 0, 999);
    timerEl.textContent = formatCounter(state.elapsed);
}
function startTimer() {
    if (state.timerId !== null)
        return;
    state.startTime = Date.now();
    state.timerId = window.setInterval(updateTimer, 1000);
    updateTimer();
}
function stopTimer() {
    if (state.timerId === null)
        return;
    window.clearInterval(state.timerId);
    state.timerId = null;
}
function resetTimerOnly() {
    state.elapsed = 0;
    timerEl.textContent = formatCounter(0);
    if (state.timerId !== null) {
        state.startTime = Date.now();
    }
    else {
        state.startTime = null;
    }
}
function getConfigFromUI() {
    const selected = difficultyEl.value;
    if (selected !== 'custom') {
        return { ...difficulties[selected] };
    }
    const cols = clamp(Number(customColsEl.value || 12), 6, 40);
    const rows = clamp(Number(customRowsEl.value || 12), 6, 30);
    const maxMines = rows * cols - 1;
    const mines = clamp(Number(customMinesEl.value || 10), 1, maxMines);
    customColsEl.value = String(cols);
    customRowsEl.value = String(rows);
    customMinesEl.value = String(mines);
    return { rows, cols, mines };
}
function findDifficultyKey(config) {
    const match = Object.entries(difficulties).find(([, value]) => (value.rows === config.rows && value.cols === config.cols && value.mines === config.mines));
    return (match ? match[0] : 'custom');
}
function getConfigLabel(config, key) {
    const resolvedKey = key ?? findDifficultyKey(config);
    if (resolvedKey !== 'custom') {
        const option = difficultyEl.querySelector(`option[value="${resolvedKey}"]`);
        const text = option?.textContent?.trim();
        if (text)
            return text;
    }
    return `自訂 ${config.cols}x${config.rows} / ${config.mines}`;
}
function applyBoardSizing() {
    const { cols } = state.config;
    const panelWidth = boardPanelEl.clientWidth - 32;
    const gap = Number.parseInt(getComputedStyle(boardEl).gap || '4', 10);
    const maxCell = 36;
    const minCell = 18;
    const cellSize = clamp(Math.floor((panelWidth - gap * (cols - 1)) / cols), minCell, maxCell);
    boardEl.style.setProperty('--cell-size', `${cellSize}px`);
    boardEl.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
    boardEl.style.gridAutoRows = `${cellSize}px`;
}
function buildBoardElements() {
    boardEl.innerHTML = '';
    state.cellEls = Array.from({ length: state.config.rows }, () => []);
    boardEl.setAttribute('aria-rowcount', String(state.config.rows));
    boardEl.setAttribute('aria-colcount', String(state.config.cols));
    const fragment = document.createDocumentFragment();
    for (let row = 0; row < state.config.rows; row += 1) {
        for (let col = 0; col < state.config.cols; col += 1) {
            const cellEl = document.createElement('button');
            cellEl.type = 'button';
            cellEl.className = 'cell';
            cellEl.dataset.row = String(row);
            cellEl.dataset.col = String(col);
            cellEl.setAttribute('aria-label', '未開啟');
            cellEl.setAttribute('role', 'gridcell');
            cellEl.tabIndex = -1;
            cellEl.addEventListener('click', () => {
                if (cellEl.dataset.longPress === '1') {
                    delete cellEl.dataset.longPress;
                    return;
                }
                setActiveCell(row, col, false);
                handleCellClick(row, col);
            });
            cellEl.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                setActiveCell(row, col, false);
                toggleFlag(row, col);
            });
            cellEl.addEventListener('focus', () => {
                setActiveCell(row, col, false);
            });
            cellEl.addEventListener('pointerdown', (event) => {
                if (event.pointerType !== 'touch')
                    return;
                const timer = window.setTimeout(() => {
                    cellEl.dataset.longPress = '1';
                    toggleFlag(row, col);
                }, 420);
                cellEl.dataset.pressTimer = String(timer);
            });
            const cancelPress = () => {
                const timerId = Number(cellEl.dataset.pressTimer || '0');
                if (timerId)
                    window.clearTimeout(timerId);
                delete cellEl.dataset.pressTimer;
            };
            cellEl.addEventListener('pointerup', cancelPress);
            cellEl.addEventListener('pointerleave', cancelPress);
            cellEl.addEventListener('pointercancel', cancelPress);
            state.cellEls[row][col] = cellEl;
            fragment.appendChild(cellEl);
        }
    }
    boardEl.appendChild(fragment);
    applyBoardSizing();
    setActiveCell(0, 0, false);
}
function setActiveCell(row, col, focus = true) {
    const next = state.cellEls[row]?.[col];
    if (!next)
        return;
    const prev = state.cellEls[state.activeRow]?.[state.activeCol];
    if (prev) {
        prev.classList.remove('active');
        prev.tabIndex = -1;
    }
    next.classList.add('active');
    next.tabIndex = 0;
    if (focus) {
        next.focus();
    }
    state.activeRow = row;
    state.activeCol = col;
}
function moveActiveCell(deltaRow, deltaCol) {
    const nextRow = clamp(state.activeRow + deltaRow, 0, state.config.rows - 1);
    const nextCol = clamp(state.activeCol + deltaCol, 0, state.config.cols - 1);
    if (nextRow === state.activeRow && nextCol === state.activeCol)
        return;
    setActiveCell(nextRow, nextCol);
}
function startNewGame(config) {
    stopTimer();
    state = createInitialState(config);
    buildBoardElements();
    updateMinesLeft();
    resetTimerOnly();
    updateHintInfo();
    setStatus('就緒', 'ready');
    updateLeaderboardUI(config, difficultyEl.value);
}
function placeMines(excludeRow, excludeCol) {
    const { rows, cols, mines } = state.config;
    const exclusions = new Set();
    for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
            const nr = excludeRow + dr;
            const nc = excludeCol + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                exclusions.add(nr * cols + nc);
            }
        }
    }
    if (rows * cols - exclusions.size < mines) {
        exclusions.clear();
        exclusions.add(excludeRow * cols + excludeCol);
    }
    const positions = [];
    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const index = row * cols + col;
            if (!exclusions.has(index))
                positions.push(index);
        }
    }
    for (let i = positions.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    for (let i = 0; i < mines; i += 1) {
        const index = positions[i];
        const row = Math.floor(index / cols);
        const col = index % cols;
        state.board[row][col].isMine = true;
    }
    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            if (state.board[row][col].isMine)
                continue;
            state.board[row][col].adjacent = countAdjacentMines(row, col);
        }
    }
    state.minesPlaced = true;
}
function countAdjacentMines(row, col) {
    let count = 0;
    for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
            if (dr === 0 && dc === 0)
                continue;
            const nr = row + dr;
            const nc = col + dc;
            if (nr < 0 || nr >= state.config.rows || nc < 0 || nc >= state.config.cols)
                continue;
            if (state.board[nr][nc].isMine)
                count += 1;
        }
    }
    return count;
}
function handleCellClick(row, col) {
    if (state.isGameOver)
        return;
    const cell = state.board[row][col];
    if (cell.isOpen || cell.isFlagged)
        return;
    unlockAudio();
    if (!state.minesPlaced) {
        placeMines(row, col);
        startTimer();
        setStatus('進行中', 'playing');
    }
    const opened = openCell(row, col);
    if (state.isGameOver)
        return;
    if (checkWin())
        return;
    if (opened)
        playSound('open');
}
function toggleFlag(row, col) {
    if (state.isGameOver)
        return;
    const cell = state.board[row][col];
    if (cell.isOpen)
        return;
    unlockAudio();
    cell.isFlagged = !cell.isFlagged;
    state.flags += cell.isFlagged ? 1 : -1;
    renderCell(row, col);
    updateMinesLeft();
    playSound('flag');
}
function openCell(row, col) {
    const cell = state.board[row][col];
    if (cell.isOpen || cell.isFlagged)
        return false;
    cell.isOpen = true;
    state.openCount += 1;
    if (cell.isMine) {
        renderCell(row, col);
        endGame(false);
        return false;
    }
    if (cell.adjacent === 0) {
        floodOpen(row, col);
    }
    renderCell(row, col);
    return true;
}
function floodOpen(startRow, startCol) {
    const stack = [[startRow, startCol]];
    while (stack.length > 0) {
        const [row, col] = stack.pop();
        for (let dr = -1; dr <= 1; dr += 1) {
            for (let dc = -1; dc <= 1; dc += 1) {
                const nr = row + dr;
                const nc = col + dc;
                if (nr < 0 || nr >= state.config.rows || nc < 0 || nc >= state.config.cols)
                    continue;
                const neighbor = state.board[nr][nc];
                if (neighbor.isOpen || neighbor.isFlagged || neighbor.isMine)
                    continue;
                neighbor.isOpen = true;
                state.openCount += 1;
                renderCell(nr, nc);
                if (neighbor.adjacent === 0)
                    stack.push([nr, nc]);
            }
        }
    }
}
function revealMines() {
    for (let row = 0; row < state.config.rows; row += 1) {
        for (let col = 0; col < state.config.cols; col += 1) {
            const cell = state.board[row][col];
            if (cell.isMine) {
                cell.isOpen = true;
            }
            else if (cell.isFlagged) {
                cell.isOpen = true;
                cell.isWrongFlag = true;
            }
            renderCell(row, col);
        }
    }
}
function checkWin() {
    const safeCells = state.config.rows * state.config.cols - state.config.mines;
    if (state.openCount >= safeCells) {
        endGame(true);
        return true;
    }
    return false;
}
function endGame(didWin) {
    state.isGameOver = true;
    state.didWin = didWin;
    stopTimer();
    if (didWin) {
        recordWin(state.elapsed);
        setStatus('勝利', 'win');
        playSound('win');
    }
    else {
        setStatus('踩到地雷', 'lose');
        playSound('lose');
        revealMines();
    }
}
function renderCell(row, col) {
    const cell = state.board[row][col];
    const cellEl = state.cellEls[row][col];
    const isActive = row === state.activeRow && col === state.activeCol;
    cellEl.className = 'cell';
    cellEl.textContent = '';
    cellEl.removeAttribute('data-num');
    if (isActive) {
        cellEl.classList.add('active');
    }
    if (cell.isOpen) {
        cellEl.classList.add('open');
        if (cell.isMine) {
            cellEl.classList.add('mine');
            cellEl.setAttribute('aria-label', '地雷');
            return;
        }
        if (cell.isWrongFlag) {
            cellEl.classList.add('wrong');
            cellEl.textContent = '錯';
            cellEl.setAttribute('aria-label', '旗子錯誤');
            return;
        }
        if (cell.adjacent > 0) {
            cellEl.textContent = String(cell.adjacent);
            cellEl.dataset.num = String(cell.adjacent);
            cellEl.setAttribute('aria-label', `鄰近 ${cell.adjacent} 顆地雷`);
        }
        else {
            cellEl.setAttribute('aria-label', '空白');
        }
        return;
    }
    if (cell.isFlagged) {
        cellEl.classList.add('flagged');
        cellEl.setAttribute('aria-label', '已插旗');
        return;
    }
    cellEl.setAttribute('aria-label', '未開啟');
}
function handleDifficultyChange() {
    const selected = difficultyEl.value;
    if (selected === 'custom') {
        customFieldsEl.hidden = false;
    }
    else {
        customFieldsEl.hidden = true;
    }
    const previewConfig = getConfigFromUI();
    updateLeaderboardUI(previewConfig, selected);
}
function handleHint() {
    if (state.isGameOver)
        return;
    unlockAudio();
    if (!state.minesPlaced) {
        const row = Math.floor(Math.random() * state.config.rows);
        const col = Math.floor(Math.random() * state.config.cols);
        handleCellClick(row, col);
        state.hintsUsed += 1;
        updateHintInfo();
        showHintMessage('提示已幫你開局');
        playSound('hint');
        return;
    }
    const hint = findHintCell();
    if (!hint) {
        showHintMessage('沒有可提示的安全格');
        return;
    }
    showHint(hint[0], hint[1]);
    state.hintsUsed += 1;
    updateHintInfo();
    showHintMessage('已標示安全格');
    playSound('hint');
}
function findHintCell() {
    const zeros = [];
    const candidates = [];
    for (let row = 0; row < state.config.rows; row += 1) {
        for (let col = 0; col < state.config.cols; col += 1) {
            const cell = state.board[row][col];
            if (cell.isOpen || cell.isFlagged || cell.isMine)
                continue;
            if (cell.adjacent === 0) {
                zeros.push([row, col]);
            }
            else {
                candidates.push([row, col]);
            }
        }
    }
    const pool = zeros.length > 0 ? zeros : candidates;
    if (pool.length === 0)
        return null;
    return pool[Math.floor(Math.random() * pool.length)];
}
function showHint(row, col) {
    const cellEl = state.cellEls[row][col];
    cellEl.classList.add('hint');
    window.setTimeout(() => {
        cellEl.classList.remove('hint');
    }, 1200);
}
function updateHintInfo() {
    hintInfoEl.textContent = `提示次數 ${state.hintsUsed}`;
}
function showHintMessage(message) {
    if (hintMessageTimer !== null) {
        window.clearTimeout(hintMessageTimer);
    }
    hintInfoEl.textContent = message;
    hintMessageTimer = window.setTimeout(() => {
        updateHintInfo();
        hintMessageTimer = null;
    }, 1800);
}
function handleKeyDown(event) {
    if (isTypingTarget(event.target))
        return;
    switch (event.key) {
        case 'ArrowUp':
            event.preventDefault();
            moveActiveCell(-1, 0);
            break;
        case 'ArrowDown':
            event.preventDefault();
            moveActiveCell(1, 0);
            break;
        case 'ArrowLeft':
            event.preventDefault();
            moveActiveCell(0, -1);
            break;
        case 'ArrowRight':
            event.preventDefault();
            moveActiveCell(0, 1);
            break;
        case ' ': {
            event.preventDefault();
            handleCellClick(state.activeRow, state.activeCol);
            break;
        }
        case 'Enter':
            event.preventDefault();
            handleCellClick(state.activeRow, state.activeCol);
            break;
        case 'f':
        case 'F':
            event.preventDefault();
            toggleFlag(state.activeRow, state.activeCol);
            break;
        default:
            break;
    }
}
function isTypingTarget(target) {
    if (!(target instanceof HTMLElement))
        return false;
    const tagName = target.tagName;
    if (tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA')
        return true;
    return target.isContentEditable;
}
function getConfigKey(config) {
    return `${config.cols}x${config.rows}-${config.mines}`;
}
function updateLeaderboardUI(config = state.config, key) {
    leaderboardLabelEl.textContent = getConfigLabel(config, key);
    const storeKey = getConfigKey(config);
    const records = leaderboard[storeKey] ?? [];
    leaderboardEl.innerHTML = '';
    if (records.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = '尚無紀錄';
        leaderboardEl.appendChild(empty);
        return;
    }
    records.slice(0, LEADERBOARD_LIMIT).forEach((record, index) => {
        const item = document.createElement('li');
        const displayName = record.name || DEFAULT_NICKNAME;
        item.textContent = `#${index + 1}  ${displayName}  ${formatTime(record.time)}`;
        leaderboardEl.appendChild(item);
    });
}
function recordWin(time) {
    const key = getConfigKey(state.config);
    const records = leaderboard[key] ?? [];
    records.push({ name: normalizeNickname(settings.nickname), time });
    records.sort((a, b) => a.time - b.time);
    leaderboard[key] = records.slice(0, LEADERBOARD_LIMIT);
    saveLeaderboard(leaderboard);
    updateLeaderboardUI(state.config, findDifficultyKey(state.config));
}
function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw)
            return { soundEnabled: true, nickname: DEFAULT_NICKNAME };
        const parsed = JSON.parse(raw);
        return {
            soundEnabled: parsed.soundEnabled !== false,
            nickname: normalizeNickname(parsed.nickname),
        };
    }
    catch {
        return { soundEnabled: true, nickname: DEFAULT_NICKNAME };
    }
}
function saveSettings(next) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    }
    catch {
        // 忽略寫入失敗
    }
}
function setSoundEnabled(enabled) {
    settings = { ...settings, soundEnabled: enabled };
    saveSettings(settings);
    if (!audioContext)
        return;
    if (enabled) {
        audioContext.resume().catch(() => undefined);
    }
    else {
        audioContext.suspend().catch(() => undefined);
    }
}
function setNickname(value) {
    const normalized = normalizeNickname(value);
    settings = { ...settings, nickname: normalized };
    saveSettings(settings);
    if (nicknameEl.value !== normalized) {
        nicknameEl.value = normalized;
    }
}
function handleNicknameInput() {
    const trimmed = nicknameEl.value.slice(0, MAX_NICKNAME_LENGTH);
    if (trimmed !== nicknameEl.value) {
        nicknameEl.value = trimmed;
    }
    settings = { ...settings, nickname: normalizeNickname(trimmed) };
    saveSettings(settings);
}
function loadLeaderboard() {
    try {
        const raw = localStorage.getItem(LEADERBOARD_KEY);
        if (!raw)
            return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }
        const sanitized = {};
        let migrated = false;
        for (const [key, value] of Object.entries(parsed)) {
            if (!Array.isArray(value))
                continue;
            const entries = [];
            value.forEach((item) => {
                if (typeof item === 'number' || typeof item === 'string') {
                    const time = Math.floor(Number(item));
                    if (Number.isFinite(time) && time >= 0 && time <= 999) {
                        entries.push({ name: DEFAULT_NICKNAME, time });
                        migrated = true;
                    }
                    return;
                }
                if (!item || typeof item !== 'object')
                    return;
                const candidate = item;
                const time = Math.floor(Number(candidate.time));
                if (!Number.isFinite(time) || time < 0 || time > 999)
                    return;
                const name = normalizeNickname(candidate.name);
                if (candidate.name !== name) {
                    migrated = true;
                }
                entries.push({ name, time });
            });
            if (entries.length > 0) {
                entries.sort((a, b) => a.time - b.time);
                sanitized[key] = entries.slice(0, LEADERBOARD_LIMIT);
            }
        }
        if (migrated) {
            saveLeaderboard(sanitized);
        }
        return sanitized;
    }
    catch {
        return {};
    }
}
function saveLeaderboard(store) {
    try {
        localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(store));
    }
    catch {
        // 忽略寫入失敗
    }
}
function getAudioContext() {
    if (!settings.soundEnabled)
        return null;
    if (!audioContext) {
        audioContext = new AudioContext();
    }
    return audioContext;
}
function unlockAudio() {
    const context = getAudioContext();
    if (!context)
        return;
    if (context.state === 'suspended') {
        context.resume().catch(() => undefined);
    }
}
function playSound(key) {
    const context = getAudioContext();
    if (!context)
        return;
    if (context.state === 'suspended') {
        context.resume().catch(() => undefined);
    }
    const now = context.currentTime;
    const tones = soundSequences[key];
    tones.forEach((tone) => {
        const startTime = now + (tone.offset ?? 0);
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = tone.type;
        oscillator.frequency.value = tone.frequency;
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(tone.volume, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + tone.duration);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(startTime);
        oscillator.stop(startTime + tone.duration + 0.05);
    });
}
function init() {
    difficultyEl.value = 'medium';
    soundToggleEl.checked = settings.soundEnabled;
    nicknameEl.value = settings.nickname;
    handleDifficultyChange();
    startNewGame(getConfigFromUI());
    difficultyEl.addEventListener('change', handleDifficultyChange);
    nicknameEl.addEventListener('input', handleNicknameInput);
    nicknameEl.addEventListener('blur', () => setNickname(nicknameEl.value));
    newGameBtn.addEventListener('click', () => {
        startNewGame(getConfigFromUI());
    });
    resetBtn.addEventListener('click', resetTimerOnly);
    soundToggleEl.addEventListener('change', () => {
        setSoundEnabled(soundToggleEl.checked);
    });
    hintBtn.addEventListener('click', handleHint);
    clearRecordsBtn.addEventListener('click', () => {
        leaderboard = {};
        saveLeaderboard(leaderboard);
        updateLeaderboardUI(getConfigFromUI(), difficultyEl.value);
        showHintMessage('排行榜已清除');
    });
    window.addEventListener('resize', () => {
        applyBoardSizing();
    });
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', () => unlockAudio(), { once: true });
}
init();
