"use strict";

/* ==========================================================================
   Snake Game — main script
   Organized into: config, state, DOM refs, storage, grid, audio,
   game flow (countdown/start/pause/gameover), input handling.
   ========================================================================== */

/* ---------------------------------------------------------------------- */
/* Config                                                                  */
/* ---------------------------------------------------------------------- */

const DIFFICULTY_SPEEDS = {
    easy: 220,
    medium: 170,
    hard: 120
};

const FOODS_PER_TIER = 5;      // every N foods, speed/level increase
const SPEED_DECREASE_PER_TIER = 20; // ms shaved off per tier
const MIN_SPEED = 70;          // fastest allowed tick (ms)

const STORAGE_KEY = "snakeGameStats";

/* ---------------------------------------------------------------------- */
/* DOM references                                                          */
/* ---------------------------------------------------------------------- */

const board = document.getElementById("board");
const modal = document.getElementById("modal");
const startScreen = document.getElementById("start-screen");
const countdownScreen = document.getElementById("countdown-screen");
const gameOverScreen = document.getElementById("game-over-screen");
const countdownNumber = document.getElementById("countdown-number");
const pauseOverlay = document.getElementById("pause-overlay");

const startButton = document.getElementById("start-btn");
const restartButton = document.getElementById("restart-btn");
const difficultySelect = document.getElementById("difficulty-select");
const gridToggleInput = document.getElementById("grid-toggle-input");
const touchControls = document.getElementById("touch-controls");

const highScoreElement = document.getElementById("high-score");
const scoreElement = document.getElementById("score");
const levelElement = document.getElementById("level");
const timeElement = document.getElementById("time");

const finalScoreElement = document.getElementById("final-score");
const goHighScoreElement = document.getElementById("go-high-score");
const finalTimeElement = document.getElementById("final-time");
const finalLengthElement = document.getElementById("final-length");
const medalElement = document.getElementById("medal");

const statGamesElement = document.getElementById("stat-games");
const statHighScoreElement = document.getElementById("stat-highscore");
const statBestTimeElement = document.getElementById("stat-besttime");
const statLongestElement = document.getElementById("stat-longest");
const statTotalFoodElement = document.getElementById("stat-totalfood");

/* ---------------------------------------------------------------------- */
/* Persistent stats (localStorage)                                         */
/* ---------------------------------------------------------------------- */

function loadStats(){
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw){
        return {
            gamesPlayed: 0,
            highScore: 0,
            bestTimeSeconds: 0,
            longestSnake: 1,
            totalFoodEaten: 0
        };
    }
    try{
        return JSON.parse(raw);
    }catch(err){
        // corrupted data — reset rather than crash the game
        return {
            gamesPlayed: 0,
            highScore: 0,
            bestTimeSeconds: 0,
            longestSnake: 1,
            totalFoodEaten: 0
        };
    }
}

function saveStats(stats){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

function formatTime(totalSeconds){
    const min = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const sec = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
    return `${min}:${sec}`;
}

function renderStatsPanel(){
    const stats = loadStats();
    statGamesElement.textContent = stats.gamesPlayed;
    statHighScoreElement.textContent = stats.highScore;
    statBestTimeElement.textContent = formatTime(stats.bestTimeSeconds);
    statLongestElement.textContent = stats.longestSnake;
    statTotalFoodElement.textContent = stats.totalFoodEaten;
    highScoreElement.textContent = stats.highScore;
}

/* ---------------------------------------------------------------------- */
/* Audio (WebAudio beeps — no external files needed)                       */
/* ---------------------------------------------------------------------- */

let audioCtx = null;

function getAudioContext(){
    if (!audioCtx){
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
    }
    return audioCtx;
}

function playTone(frequency, duration, type = "sine", volume = 0.12){
    try{
        const ctx = getAudioContext();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        gain.gain.value = volume;
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        oscillator.stop(ctx.currentTime + duration);
    }catch(err){
        // audio not available (e.g. autoplay restrictions) — fail silently
    }
}

const sound = {
    eat: () => playTone(660, 0.12, "square"),
    gameOver: () => { playTone(200, 0.35, "sawtooth"); },
    click: () => playTone(440, 0.06, "triangle", 0.08)
};

/* ---------------------------------------------------------------------- */
/* Game state                                                              */
/* ---------------------------------------------------------------------- */

const state = {
    difficulty: "medium",
    cols: 0,
    rows: 0,
    blocks: {},          // "row-col" -> DOM element
    snake: [],
    direction: "down",
    pendingDirections: [], // queued direction inputs, applied one per tick
    food: { x: 0, y: 0 },
    score: 0,
    level: 1,
    baseSpeed: DIFFICULTY_SPEEDS.medium,
    currentSpeed: DIFFICULTY_SPEEDS.medium,
    foodEatenThisGame: 0,
    isPaused: false,
    isRunning: false,
    gameLoopTimeoutId: null,
    startTimestamp: 0,
    pausedAccumulatedMs: 0,
    pauseStartedAt: 0,
    timerIntervalId: null
};

/* ---------------------------------------------------------------------- */
/* Grid construction                                                       */
/* ---------------------------------------------------------------------- */

function getBlockSizePx(){
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--block-size");
    return parseInt(raw, 10) || 24;
}

function buildGrid(){
    board.innerHTML = "";
    state.blocks = {};

    const blockSize = getBlockSizePx();
    state.cols = Math.max(5, Math.floor(board.clientWidth / blockSize));
    state.rows = Math.max(5, Math.floor(board.clientHeight / blockSize));

    const fragment = document.createDocumentFragment();
    for (let row = 0; row < state.rows; row++){
        for (let col = 0; col < state.cols; col++){
            const cell = document.createElement("div");
            cell.classList.add("block");
            fragment.appendChild(cell);
            state.blocks[`${row}-${col}`] = cell;
        }
    }
    board.appendChild(fragment);
}

function cellAt(x, y){
    return state.blocks[`${x}-${y}`];
}

/* ---------------------------------------------------------------------- */
/* Food                                                                     */
/* ---------------------------------------------------------------------- */

function isOnSnake(x, y){
    return state.snake.some(segment => segment.x === x && segment.y === y);
}

function spawnFood(){
    const totalCells = state.rows * state.cols;

    // If the snake fills (almost) the whole board, avoid an infinite loop.
    if (state.snake.length >= totalCells){
        return;
    }

    let position;
    do{
        position = {
            x: Math.floor(Math.random() * state.rows),
            y: Math.floor(Math.random() * state.cols)
        };
    } while (isOnSnake(position.x, position.y));

    state.food = position;
}

/* ---------------------------------------------------------------------- */
/* Rendering                                                                */
/* ---------------------------------------------------------------------- */

function clearBoardClasses(){
    Object.values(state.blocks).forEach(cell => {
        cell.classList.remove("fill", "food", "head", "head-up", "head-top", "head-down", "head-left", "head-right");
    });
}

function drawSnakeAndFood(){
    // clear previous frame
    Object.values(state.blocks).forEach(cell => {
        cell.classList.remove("fill", "food", "head", "head-top", "head-down", "head-left", "head-right");
    });

    state.snake.forEach((segment, index) => {
        const cell = cellAt(segment.x, segment.y);
        if (!cell) return;
        if (index === 0){
            cell.classList.add("head", `head-${state.direction}`);
        }else{
            cell.classList.add("fill");
        }
    });

    const foodCell = cellAt(state.food.x, state.food.y);
    if (foodCell){
        foodCell.classList.add("food");
    }
}

function updateHud(){
    scoreElement.textContent = state.score;
    levelElement.textContent = state.level;
}

/* ---------------------------------------------------------------------- */
/* Direction handling                                                      */
/* ---------------------------------------------------------------------- */

const OPPOSITES = { top: "down", down: "top", left: "right", right: "left" };

function queueDirection(newDirection){
    if (!state.isRunning || state.isPaused) return;

    const lastQueued = state.pendingDirections.length
        ? state.pendingDirections[state.pendingDirections.length - 1]
        : state.direction;

    // Ignore no-op and illegal reversals (prevents the snake from
    // "colliding" with itself by turning 180 degrees in one tick).
    if (newDirection === lastQueued) return;
    if (OPPOSITES[newDirection] === lastQueued) return;

    // Keep only a small buffer so rapid key mashing doesn't queue up
    // more turns than there are ticks to consume them.
    if (state.pendingDirections.length < 2){
        state.pendingDirections.push(newDirection);
    }
}

function nextHeadPosition(){
    if (state.pendingDirections.length){
        state.direction = state.pendingDirections.shift();
    }

    const head = state.snake[0];
    switch (state.direction){
        case "left": return { x: head.x, y: head.y - 1 };
        case "right": return { x: head.x, y: head.y + 1 };
        case "top": return { x: head.x - 1, y: head.y };
        case "down": return { x: head.x + 1, y: head.y };
        default: return { x: head.x, y: head.y };
    }
}

/* ---------------------------------------------------------------------- */
/* Collision checks                                                        */
/* ---------------------------------------------------------------------- */

function isWallCollision(pos){
    return pos.x < 0 || pos.x >= state.rows || pos.y < 0 || pos.y >= state.cols;
}

function isSelfCollision(pos, segments){
    return segments.some(segment => segment.x === pos.x && segment.y === pos.y);
}

/* ---------------------------------------------------------------------- */
/* Speed / level progression                                               */
/* ---------------------------------------------------------------------- */

function speedForFoodCount(foodCount){
    const tier = Math.floor(foodCount / FOODS_PER_TIER);
    const speed = state.baseSpeed - tier * SPEED_DECREASE_PER_TIER;
    return Math.max(MIN_SPEED, speed);
}

function levelForFoodCount(foodCount){
    return Math.floor(foodCount / FOODS_PER_TIER) + 1;
}

/* ---------------------------------------------------------------------- */
/* Core game loop                                                          */
/* ---------------------------------------------------------------------- */

function moveSnake(){
    const head = nextHeadPosition();

    if (isWallCollision(head)){
        gameOver();
        return;
    }

    const willEat = head.x === state.food.x && head.y === state.food.y;

    // The tail cell vacates this same tick unless the snake is eating
    // (in which case it stays put and a collision there is real).
    const collisionSegments = willEat ? state.snake : state.snake.slice(0, -1);
    if (isSelfCollision(head, collisionSegments)){
        gameOver();
        return;
    }

    state.snake.unshift(head);

    if (willEat){
        handleFoodEaten();
    }else{
        state.snake.pop();
    }

    drawSnakeAndFood();
}

function handleFoodEaten(){
    state.foodEatenThisGame += 1;
    state.score += 10;

    sound.eat();

    const newSpeed = speedForFoodCount(state.foodEatenThisGame);
    const newLevel = levelForFoodCount(state.foodEatenThisGame);

    if (newSpeed !== state.currentSpeed){
        state.currentSpeed = newSpeed;
    }
    state.level = newLevel;

    updateHud();
    spawnFood();
}

function scheduleNextTick(){
    clearTimeout(state.gameLoopTimeoutId);
    state.gameLoopTimeoutId = setTimeout(gameLoopTick, state.currentSpeed);
}

function gameLoopTick(){
    if (!state.isRunning || state.isPaused) return;
    moveSnake();
    if (state.isRunning){
        scheduleNextTick();
    }
}

/* ---------------------------------------------------------------------- */
/* Timer                                                                    */
/* ---------------------------------------------------------------------- */

function getElapsedSeconds(){
    const now = state.isPaused ? state.pauseStartedAt : Date.now();
    const elapsedMs = now - state.startTimestamp - state.pausedAccumulatedMs;
    return Math.max(0, Math.floor(elapsedMs / 1000));
}

function startTimer(){
    state.startTimestamp = Date.now();
    state.pausedAccumulatedMs = 0;
    clearInterval(state.timerIntervalId);
    state.timerIntervalId = setInterval(() => {
        timeElement.textContent = formatTime(getElapsedSeconds());
    }, 250);
}

function stopTimer(){
    clearInterval(state.timerIntervalId);
    state.timerIntervalId = null;
}

/* ---------------------------------------------------------------------- */
/* Pause / resume                                                          */
/* ---------------------------------------------------------------------- */

function pauseGame(){
    if (!state.isRunning || state.isPaused) return;
    state.isPaused = true;
    state.pauseStartedAt = Date.now();
    clearTimeout(state.gameLoopTimeoutId);
    pauseOverlay.classList.add("is-visible");
    sound.click();
}

function resumeGame(){
    if (!state.isRunning || !state.isPaused) return;
    state.pausedAccumulatedMs += Date.now() - state.pauseStartedAt;
    state.isPaused = false;
    pauseOverlay.classList.remove("is-visible");
    scheduleNextTick();
    sound.click();
}

function togglePause(){
    if (state.isPaused){
        resumeGame();
    }else{
        pauseGame();
    }
}

/* ---------------------------------------------------------------------- */
/* Screen management                                                       */
/* ---------------------------------------------------------------------- */

function showModal(){
    modal.style.display = "flex";
}

function hideModal(){
    modal.style.display = "none";
}

function showPanel(panel){
    [startScreen, countdownScreen, gameOverScreen].forEach(p => p.classList.remove("is-visible"));
    panel.classList.add("is-visible");
    showModal();
}

/* ---------------------------------------------------------------------- */
/* Game lifecycle: init -> countdown -> play -> game over -> restart       */
/* ---------------------------------------------------------------------- */

function resetGameState(){
    clearTimeout(state.gameLoopTimeoutId);
    stopTimer();

    state.snake = [{ x: 1, y: 3 }, { x: 1, y: 2 }, { x: 1, y: 1 }]
        .filter(seg => seg.y >= 0); // guard on very narrow boards
    state.direction = "down";
    state.pendingDirections = [];
    state.score = 0;
    state.level = 1;
    state.foodEatenThisGame = 0;
    state.currentSpeed = state.baseSpeed;
    state.isPaused = false;
    state.isRunning = false;

    updateHud();
    timeElement.textContent = "00:00";
    pauseOverlay.classList.remove("is-visible");
}

function initBoardForNewGame(){
    buildGrid();
    board.classList.toggle("show-grid", gridToggleInput.checked);
    resetGameState();
    clearBoardClasses();
    spawnFood();
    drawSnakeAndFood();
}

function runCountdown(onComplete){
    showPanel(countdownScreen);
    let count = 3;
    countdownNumber.textContent = count;

    const step = () => {
        count -= 1;
        if (count > 0){
            countdownNumber.textContent = count;
            setTimeout(step, 700);
        }else{
            countdownNumber.textContent = "GO!";
            setTimeout(() => {
                hideModal();
                onComplete();
            }, 500);
        }
    };
    setTimeout(step, 700);
}

function beginGame(){
    initBoardForNewGame();
    runCountdown(() => {
        state.isRunning = true;
        startTimer();
        scheduleNextTick();
    });
}

function gameOver(){
    state.isRunning = false;
    clearTimeout(state.gameLoopTimeoutId);
    stopTimer();
    sound.gameOver();

    const timePlayed = getElapsedSeconds();
    const stats = loadStats();

    stats.gamesPlayed += 1;
    stats.totalFoodEaten += state.foodEatenThisGame;
    stats.highScore = Math.max(stats.highScore, state.score);
    stats.bestTimeSeconds = Math.max(stats.bestTimeSeconds, timePlayed);
    stats.longestSnake = Math.max(stats.longestSnake, state.snake.length);
    saveStats(stats);

    finalScoreElement.textContent = state.score;
    goHighScoreElement.textContent = stats.highScore;
    finalTimeElement.textContent = formatTime(timePlayed);
    finalLengthElement.textContent = state.snake.length;
    highScoreElement.textContent = stats.highScore;

    medalElement.className = "medal";
    if (state.score >= 300){
        medalElement.classList.add("gold");
    }else if (state.score >= 150){
        medalElement.classList.add("silver");
    }else if (state.score >= 50){
        medalElement.classList.add("bronze");
    }

    showPanel(gameOverScreen);
}

function restartGame(){
    sound.click();
    beginGame();
}

/* ---------------------------------------------------------------------- */
/* Input handling                                                          */
/* ---------------------------------------------------------------------- */

const KEY_TO_DIRECTION = {
    ArrowUp: "top",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "top",
    s: "down",
    a: "left",
    d: "right"
};

document.addEventListener("keydown", event => {
    if (event.key === " "){
        event.preventDefault();
        if (state.isRunning) togglePause();
        return;
    }

    if (event.key === "Escape"){
        if (state.isRunning && !state.isPaused) pauseGame();
        else if (state.isRunning && state.isPaused) resumeGame();
        return;
    }

    if (event.key.toLowerCase() === "r" && !startScreen.classList.contains("is-visible")){
        restartGame();
        return;
    }

    const direction = KEY_TO_DIRECTION[event.key];
    if (direction){
        event.preventDefault();
        queueDirection(direction);
    }
});

// On-screen touch controls (tap d-pad)
touchControls.addEventListener("click", event => {
    const button = event.target.closest(".touch-btn");
    if (!button) return;
    queueDirection(button.dataset.dir);
});

// Swipe gestures directly on the board
let touchStartX = 0;
let touchStartY = 0;

board.addEventListener("touchstart", event => {
    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
}, { passive: true });

board.addEventListener("touchend", event => {
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    const SWIPE_THRESHOLD = 24;

    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < SWIPE_THRESHOLD) return;

    if (Math.abs(deltaX) > Math.abs(deltaY)){
        queueDirection(deltaX > 0 ? "right" : "left");
    }else{
        queueDirection(deltaY > 0 ? "down" : "top");
    }
}, { passive: true });

/* ---------------------------------------------------------------------- */
/* Start-screen controls                                                   */
/* ---------------------------------------------------------------------- */

difficultySelect.addEventListener("click", event => {
    const button = event.target.closest(".difficulty-btn");
    if (!button) return;

    sound.click();
    difficultySelect.querySelectorAll(".difficulty-btn").forEach(btn => btn.classList.remove("is-selected"));
    button.classList.add("is-selected");

    state.difficulty = button.dataset.difficulty;
    state.baseSpeed = DIFFICULTY_SPEEDS[state.difficulty];
});

startButton.addEventListener("click", () => {
    sound.click();
    beginGame();
});

restartButton.addEventListener("click", restartGame);

gridToggleInput.addEventListener("change", () => {
    board.classList.toggle("show-grid", gridToggleInput.checked);
});

/* ---------------------------------------------------------------------- */
/* Boot                                                                     */
/* ---------------------------------------------------------------------- */

function init(){
    state.baseSpeed = DIFFICULTY_SPEEDS[state.difficulty];
    state.currentSpeed = state.baseSpeed;
    renderStatsPanel();
    buildGrid();
    showPanel(startScreen);

    // Keep the grid sized correctly if the window is resized while on
    // the start screen (avoids a stale/mismatched grid before play).
    let resizeTimeoutId = null;
    window.addEventListener("resize", () => {
        if (state.isRunning) return;
        clearTimeout(resizeTimeoutId);
        resizeTimeoutId = setTimeout(buildGrid, 200);
    });
}

if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
}else{
    init();
}
