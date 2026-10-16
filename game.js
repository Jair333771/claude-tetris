'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Cada skin define colores por pieza (índice 1..7), fondos y cómo se dibuja un bloque.
const SKINS = {
  retro: {
    page: '#0f0f17', bg: '#1a1a25', grid: '#22222e',
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#7986cb', '#ffb74d'],
    drawBlock(ctx, x, y, color, size) {
      ctx.fillStyle = color;
      ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      // highlight
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x * size + 1, y * size + 1, size - 2, 4);
    },
  },
  neon: {
    page: '#000000', bg: '#000000', grid: '#14142a',
    colors: [null, '#00e5ff', '#ffea00', '#e040fb', '#76ff03', '#ff1744', '#2979ff', '#ff9100'],
    drawBlock(ctx, x, y, color, size) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = color;
      ctx.fillRect(x * size + 4, y * size + 4, size - 8, size - 8);
      ctx.shadowBlur = 0;
    },
  },
  pastel: {
    page: '#2b2740', bg: '#3a3450', grid: '#463f5e',
    colors: [null, '#a8e6cf', '#ffe8a3', '#d4b8f0', '#b5ead7', '#ffb3c1', '#b3c7f7', '#ffd1a3'],
    drawBlock(ctx, x, y, color, size) {
      ctx.fillStyle = color;
      roundRect(ctx, x * size + 2, y * size + 2, size - 4, size - 4, 6);
    },
  },
  pixel: {
    page: '#14141e', bg: '#1e1e2c', grid: '#2a2a3c',
    colors: [null, '#29b6f6', '#fdd835', '#ab47bc', '#66bb6a', '#ef5350', '#5c6bc0', '#ff7043'],
    drawBlock(ctx, x, y, color, size) {
      const px = x * size + 1, py = y * size + 1, s = size - 2, q = s / 4;
      ctx.fillStyle = color;
      ctx.fillRect(px, py, s, s);
      // textura: tablero 4x4 oscuro
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++)
          if ((i + j) % 2 === 0) ctx.fillRect(px + i * q, py + j * q, q, q);
      // sombra de borde
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(px, py + s - 3, s, 3);
      ctx.fillRect(px + s - 3, py, 3, s);
    },
  },
};

const SKIN_KEY = 'tetris-skin';
let skinKey = loadSkin();
let currentSkin = SKINS[skinKey];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const timerEl = document.getElementById('timer');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const controlsList = document.getElementById('controls-list');
const startLevelSel = document.getElementById('start-level');
const startOverlay = document.getElementById('start-overlay');
const startRecords = document.getElementById('start-records');
const startBtn = document.getElementById('start-btn');
const overExtra = document.getElementById('over-extra');
const topMsg = document.getElementById('top-msg');
const playerName = document.getElementById('player-name');
const saveRecordBtn = document.getElementById('save-record-btn');
const overRecords = document.getElementById('over-records');

const RECORDS_KEY = 'tetris-records';
const RECORDS_SHOWN = 5;
let recordsExpanded = false;
let highlightName = null;
let recordSaved = false;
let combo = 0;
let gameBestCombo = 0;
const skinSel = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, elapsed;
let startLevel = 1; // nivel elegido en el menú de pausa; aplica a la próxima partida

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = intervalFor(level);
    updateHUD();
  }
  return cleared;
}

function intervalFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  // combo: piezas seguidas que limpian líneas
  combo = clearLines() ? combo + 1 : 0;
  gameBestCombo = Math.max(gameBestCombo, combo);
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function updateTimer() {
  const text = formatTime(elapsed);
  if (timerEl.textContent !== text) timerEl.textContent = text;
}

function roundRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
  context.fill();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  currentSkin.drawBlock(context, x, y, currentSkin.colors[colorIndex], size);
  context.globalAlpha = 1;
}

function loadSkin() {
  try {
    const key = localStorage.getItem(SKIN_KEY);
    if (Object.prototype.hasOwnProperty.call(SKINS, key)) return key;
  } catch (e) {
    // sin almacenamiento: usa la skin por defecto
  }
  return 'retro';
}

function applySkin(key) {
  skinKey = key;
  currentSkin = SKINS[key];
  canvas.style.background = currentSkin.bg;
  nextCanvas.style.background = currentSkin.bg;
  document.body.style.background = currentSkin.page;
  skinSel.value = key;
  try {
    localStorage.setItem(SKIN_KEY, key);
  } catch (e) {
    // sin almacenamiento: la skin no se guarda
  }
  draw();
  drawNext();
}

function drawGrid() {
  ctx.strokeStyle = currentSkin.grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (data && Array.isArray(data.scores)) {
      return {
        scores: data.scores.filter(r => typeof r.name === 'string' && Number.isFinite(r.score)),
        bestCombo: Number(data.bestCombo) || 0,
        maxLines: Number(data.maxLines) || 0,
      };
    }
  } catch (e) {
    // dato corrupto o almacenamiento bloqueado: se arranca sin records
  }
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

function saveRecords(rec) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(rec));
  } catch (e) {
    // sin almacenamiento: el record no se persiste
  }
}

function saveScore(name, pts) {
  const rec = loadRecords();
  const key = name.toLowerCase();
  rec.scores = rec.scores.filter(r => r.name.toLowerCase() !== key); // mismo nombre sobrescribe
  rec.scores.push({ name, score: pts });
  rec.scores.sort((a, b) => b.score - a.score);
  saveRecords(rec);
}

function entersTop(pts) {
  const { scores } = loadRecords();
  return pts > 0 && (scores.length < RECORDS_SHOWN || pts > scores[RECORDS_SHOWN - 1].score);
}

function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function renderRecords(container) {
  const rec = loadRecords();
  const shown = recordsExpanded ? rec.scores : rec.scores.slice(0, RECORDS_SHOWN);
  container.textContent = '';
  if (rec.scores.length) {
    const list = makeEl('ol', recordsExpanded ? 'records-list expanded' : 'records-list');
    for (const r of shown) {
      const li = makeEl('li', r.name === highlightName ? 'highlight' : '');
      li.append(makeEl('span', 'rec-name', r.name), makeEl('span', 'rec-score', r.score.toLocaleString()));
      list.append(li);
    }
    container.append(list);
    if (rec.scores.length > RECORDS_SHOWN) {
      const more = makeEl('button', 'link-btn', recordsExpanded ? 'Ver menos' : 'Ver más');
      more.addEventListener('click', () => { recordsExpanded = !recordsExpanded; refreshRecordViews(); });
      container.append(more);
    }
  } else {
    container.append(makeEl('p', 'records-empty', 'Sin records todavía'));
  }
  container.append(makeEl('p', 'records-stats', `Mejor combo: ${rec.bestCombo} · Máx. líneas: ${rec.maxLines}`));
  const reset = makeEl('button', 'link-btn', 'Resetear records');
  reset.addEventListener('click', () => {
    if (!confirm('¿Borrar todos los records?')) return;
    try { localStorage.removeItem(RECORDS_KEY); } catch (e) { /* sin almacenamiento */ }
    highlightName = null;
    recordsExpanded = false;
    refreshRecordViews();
  });
  container.append(reset);
}

function refreshRecordViews() {
  renderRecords(startRecords);
  renderRecords(overRecords);
}

function showStart() {
  cancelAnimationFrame(animId);
  paused = true;
  refreshRecordViews();
  startOverlay.classList.remove('hidden');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()} · Tiempo: ${formatTime(elapsed)}`;
  const rec = loadRecords();
  rec.bestCombo = Math.max(rec.bestCombo, gameBestCombo);
  rec.maxLines = Math.max(rec.maxLines, lines);
  saveRecords(rec);
  topMsg.classList.toggle('hidden', !entersTop(score));
  playerName.value = '';
  recordSaved = false;
  highlightName = null;
  saveRecordBtn.disabled = false;
  saveRecordBtn.textContent = 'Guardar';
  overExtra.classList.remove('hidden');
  refreshRecordViews();
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    pauseMenu.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    pauseMenu.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (!gameOver) {
    elapsed += dt;
    updateTimer();
  }
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = intervalFor(level);
  dropAccum = 0;
  elapsed = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  updateTimer();
  combo = 0;
  gameBestCombo = 0;
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  controlsList.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

const BLOCKED_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];

document.addEventListener('keydown', e => {
  if (!startOverlay.classList.contains('hidden')) return;
  // no mover piezas ni bloquear teclas mientras se escribe o se usa un selector
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); togglePause(); return; }
  if (paused || gameOver) {
    // bloquea inputs de juego; evita scroll y activación de botones con Space
    if (BLOCKED_KEYS.includes(e.code)) e.preventDefault();
    return;
  }
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', () => { resumeBtn.blur(); togglePause(); });
pauseRestartBtn.addEventListener('click', () => { pauseRestartBtn.blur(); init(); });
controlsBtn.addEventListener('click', () => { controlsBtn.blur(); controlsList.classList.toggle('hidden'); });
startLevelSel.addEventListener('change', () => { startLevel = Number(startLevelSel.value); });
startBtn.addEventListener('click', () => {
  startOverlay.classList.add('hidden');
  init();
});
saveRecordBtn.addEventListener('click', () => {
  if (recordSaved) return;
  const name = playerName.value.trim().slice(0, 12) || 'Anónimo';
  saveScore(name, score);
  recordSaved = true;
  highlightName = name;
  saveRecordBtn.disabled = true;
  saveRecordBtn.textContent = 'Guardado';
  topMsg.classList.add('hidden');
  refreshRecordViews();
});
playerName.addEventListener('keydown', e => {
  if (e.key === 'Enter') saveRecordBtn.click();
});

skinSel.addEventListener('change', () => {
  applySkin(skinSel.value);
  skinSel.blur();
});

init();
showStart();
applySkin(skinKey);
