// ===== BLOP BATTLE Game Engine =====

const COLS = 6;
const ROWS = 12;
const CELL = 40; // px per cell
const COLORS = ['#ff4466', '#44aaff', '#44dd88', '#ffcc00', '#cc44ff'];
const COLOR_NAMES = ['red', 'blue', 'green', 'yellow', 'purple'];
const NUM_COLORS = 4; // use first N colors
const MIN_CHAIN = 4;
const GARBAGE_PER_CHAIN = [0, 0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55];
const DROP_INTERVAL_NORMAL = 800; // ms
const DROP_INTERVAL_FAST = 80;
const LOCK_DELAY = 300;

// ===== Utility =====
function rndColor() { return Math.floor(Math.random() * NUM_COLORS); }

function makePair() {
  return [rndColor(), rndColor()];
}

// ===== Blop Drawing =====
function drawBlop(ctx, x, y, colorIdx, size = CELL, alpha = 1) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * 0.42;
  const col = COLORS[colorIdx];

  ctx.save();
  ctx.globalAlpha = alpha;

  // Shadow glow
  ctx.shadowColor = col;
  ctx.shadowBlur = 10;

  // Body gradient
  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.05, cx, cy, r);
  grad.addColorStop(0, lighten(col, 0.5));
  grad.addColorStop(0.6, col);
  grad.addColorStop(1, darken(col, 0.5));

  ctx.beginPath();
  // Blob shape: circle with slight wobbly radius
  for (let a = 0; a <= Math.PI * 2; a += 0.05) {
    const wobble = 1 + 0.06 * Math.sin(a * 3 + colorIdx);
    const px = cx + Math.cos(a) * r * wobble;
    const py = cy + Math.sin(a) * r * wobble;
    if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Highlight
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.25, cy - r * 0.28, r * 0.22, r * 0.14, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();

  // Eyes
  const eyeR = r * 0.1;
  const eyeY = cy - r * 0.05;
  [-1, 1].forEach(side => {
    ctx.beginPath();
    ctx.arc(cx + side * r * 0.22, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
    // eye shine
    ctx.beginPath();
    ctx.arc(cx + side * r * 0.22 + eyeR * 0.3, eyeY - eyeR * 0.3, eyeR * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();
  });

  // Mouth (smile)
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.15, r * 0.2, 0.1, Math.PI - 0.1);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + Math.round(255 * amt));
  const g = Math.min(255, ((n >> 8) & 0xff) + Math.round(255 * amt));
  const b = Math.min(255, (n & 0xff) + Math.round(255 * amt));
  return `rgb(${r},${g},${b})`;
}
function darken(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - Math.round(255 * amt));
  const g = Math.max(0, ((n >> 8) & 0xff) - Math.round(255 * amt));
  const b = Math.max(0, (n & 0xff) - Math.round(255 * amt));
  return `rgb(${r},${g},${b})`;
}

function drawGarbage(ctx, x, y, size = CELL) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * 0.40;
  ctx.save();
  ctx.shadowColor = '#888';
  ctx.shadowBlur = 6;
  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.05, cx, cy, r);
  grad.addColorStop(0, '#bbb');
  grad.addColorStop(1, '#444');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.shadowBlur = 0;
  // X mark
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 2;
  const d = r * 0.4;
  ctx.beginPath();
  ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d);
  ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d);
  ctx.stroke();
  ctx.restore();
}

// ===== Board =====
class Board {
  constructor() {
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    // null = empty, number 0-4 = color, -1 = garbage
  }

  get(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return undefined;
    return this.grid[r][c];
  }

  set(r, c, val) { this.grid[r][c] = val; }

  isEmpty(r, c) { return this.get(r, c) === null; }

  // Apply gravity: drop all cells down
  applyGravity() {
    let moved = false;
    for (let c = 0; c < COLS; c++) {
      let writeRow = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (this.grid[r][c] !== null) {
          if (r !== writeRow) {
            this.grid[writeRow][c] = this.grid[r][c];
            this.grid[r][c] = null;
            moved = true;
          }
          writeRow--;
        }
      }
    }
    return moved;
  }

  // Find connected groups of same-color blops (min size)
  findGroups(minSize = MIN_CHAIN) {
    const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    const groups = [];
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const val = this.grid[r][c];
        if (val === null || val < 0 || visited[r][c]) continue;
        // BFS
        const group = [];
        const queue = [[r, c]];
        visited[r][c] = true;
        while (queue.length) {
          const [cr, cc] = queue.shift();
          group.push([cr, cc]);
          for (const [dr, dc] of dirs) {
            const nr = cr + dr, nc = cc + dc;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
            if (!visited[nr][nc] && this.grid[nr][nc] === val) {
              visited[nr][nc] = true;
              queue.push([nr, nc]);
            }
          }
        }
        if (group.length >= minSize) groups.push({ cells: group, color: val });
      }
    }
    return groups;
  }

  clearGroups(groups) {
    for (const g of groups) {
      for (const [r, c] of g.cells) {
        this.grid[r][c] = null;
      }
    }
    // Clear adjacent garbage
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    let garbageCleared = 0;
    for (const g of groups) {
      for (const [r, c] of g.cells) {
        for (const [dr, dc] of dirs) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && this.grid[nr][nc] === -1) {
            this.grid[nr][nc] = null;
            garbageCleared++;
          }
        }
      }
    }
    return garbageCleared;
  }

  addGarbage(count) {
    // Add garbage rows from top
    while (count > 0) {
      const row = this.grid.shift();
      // If the popped row wasn't empty, game might be over soon
      const garbageRow = Array(COLS).fill(-1);
      // Leave one gap randomly so it's beatable
      garbageRow[Math.floor(Math.random() * COLS)] = null;
      this.grid.unshift(garbageRow);
      // Shift existing rows up
      count--;
    }
  }

  isGameOver() {
    // Game over if any cell in top 2 rows has a blop
    for (let c = 0; c < COLS; c++) {
      if (this.grid[0][c] !== null || this.grid[1][c] !== null) return true;
    }
    return false;
  }
}

// ===== Piece (pair of blops) =====
// pivot is at [row, col], satellite offset by rotation
// rotation 0: satellite below, 1: right, 2: above, 3: left
class Piece {
  constructor(colors) {
    this.colors = colors; // [pivot, satellite]
    this.row = 0;
    this.col = Math.floor(COLS / 2) - 1;
    this.rot = 0; // 0=down,1=right,2=up,3=left
  }

  satelliteOffset() {
    return [[1,0],[0,1],[-1,0],[0,-1]][this.rot];
  }

  cells() {
    const [dr, dc] = this.satelliteOffset();
    return [
      [this.row, this.col, this.colors[0]],
      [this.row + dr, this.col + dc, this.colors[1]],
    ];
  }

  clone() {
    const p = new Piece(this.colors.slice());
    p.row = this.row; p.col = this.col; p.rot = this.rot;
    return p;
  }
}

// ===== Player =====
class Player {
  constructor(id, canvas, nextCanvas, isAI = false) {
    this.id = id;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nextCanvas = nextCanvas;
    this.nextCtx = nextCanvas.getContext('2d');
    this.isAI = isAI;
    this.reset();
  }

  reset() {
    this.board = new Board();
    this.queue = [makePair(), makePair(), makePair()];
    this.current = null;
    this.score = 0;
    this.chainCount = 0;
    this.pendingGarbage = 0;
    this.dropTimer = 0;
    this.lockTimer = 0;
    this.locking = false;
    this.state = 'spawning'; // spawning | falling | locking | clearing | dead
    this.clearAnim = null; // { groups, timer, chainNum }
    this.aiTimer = 0;
    this.aiTarget = null;
    this.totalGarbageSent = 0;
  }

  spawn() {
    const pair = this.queue.shift();
    this.queue.push(makePair());
    this.current = new Piece(pair);
    if (!this.canPlace(this.current)) {
      this.state = 'dead';
      return;
    }
    this.state = 'falling';
    this.locking = false;
    this.lockTimer = 0;
    this.dropTimer = 0;
  }

  canPlace(piece) {
    for (const [r, c] of piece.cells().map(([r,c]) => [r,c])) {
      if (c < 0 || c >= COLS || r >= ROWS) return false;
      if (r >= 0 && !this.board.isEmpty(r, c)) return false;
    }
    return true;
  }

  tryMove(dr, dc) {
    const p = this.current.clone();
    p.row += dr; p.col += dc;
    if (this.canPlace(p)) { this.current = p; return true; }
    return false;
  }

  tryRotate(dir) {
    const p = this.current.clone();
    p.rot = (p.rot + dir + 4) % 4;
    if (this.canPlace(p)) { this.current = p; return true; }
    // Wall kick
    for (const dc of [-1, 1]) {
      const pk = p.clone(); pk.col += dc;
      if (this.canPlace(pk)) { this.current = pk; return true; }
    }
    return false;
  }

  lock() {
    if (!this.current) return;
    for (const [r, c, col] of this.current.cells()) {
      if (r >= 0) this.board.set(r, c, col);
    }
    this.current = null;
    // Drop garbage after locking
    if (this.pendingGarbage > 0) {
      this.board.addGarbage(this.pendingGarbage);
      this.pendingGarbage = 0;
    }
    this.board.applyGravity();
    this.state = 'clearing';
    this.chainCount = 0;
    this.startClearing();
  }

  startClearing() {
    const groups = this.board.findGroups(MIN_CHAIN);
    if (groups.length === 0) {
      // Done clearing
      if (this.board.isGameOver()) {
        this.state = 'dead';
      } else {
        this.state = 'spawning';
      }
      return;
    }
    this.chainCount++;
    const cleared = groups.reduce((s, g) => s + g.cells.length, 0);
    const bonus = this.chainCount > 1 ? this.chainCount * 50 : 0;
    this.score += cleared * 10 + bonus;

    // Calculate garbage to send
    const garbageAmount = calcGarbage(cleared, this.chainCount);
    this.totalGarbageSent += garbageAmount;

    this.clearAnim = {
      groups,
      timer: 0,
      duration: 500,
      chainNum: this.chainCount,
      garbageToSend: garbageAmount,
    };
  }

  update(dt, fastDrop) {
    if (this.state === 'dead') return;

    if (this.state === 'clearing' && this.clearAnim) {
      this.clearAnim.timer += dt;
      if (this.clearAnim.timer >= this.clearAnim.duration) {
        // Apply clear
        this.board.clearGroups(this.clearAnim.groups);
        const g = this.clearAnim.garbageToSend;
        this.clearAnim = null;
        this.board.applyGravity();
        // Signal garbage to opponent
        if (g > 0) this._onGarbage && this._onGarbage(g);
        // Continue chain check
        this.startClearing();
      }
      return;
    }

    if (this.state === 'spawning') {
      this.spawn();
      return;
    }

    if (this.state !== 'falling') return;

    const interval = fastDrop ? DROP_INTERVAL_FAST : DROP_INTERVAL_NORMAL;
    this.dropTimer += dt;

    if (this.dropTimer >= interval) {
      this.dropTimer = 0;
      if (!this.tryMove(1, 0)) {
        // Can't move down — lock
        this.lockTimer += interval;
        if (!this.locking) { this.locking = true; this.lockTimer = 0; }
        if (this.lockTimer >= LOCK_DELAY) {
          this.lock();
        }
      } else {
        this.locking = false;
        this.lockTimer = 0;
      }
    }

    // AI logic
    if (this.isAI && this.current) {
      this.aiTimer += dt;
      if (this.aiTimer > 120) {
        this.aiTimer = 0;
        this.doAIStep();
      }
    }
  }

  doAIStep() {
    if (!this.aiTarget) {
      this.aiTarget = findBestMove(this.board, this.current);
    }
    const t = this.aiTarget;
    if (!t) return;
    if (this.current.rot !== t.rot) {
      const diff = (t.rot - this.current.rot + 4) % 4;
      this.tryRotate(diff <= 2 ? 1 : -1);
    } else if (this.current.col < t.col) {
      this.tryMove(0, 1);
    } else if (this.current.col > t.col) {
      this.tryMove(0, -1);
    } else {
      this.aiTarget = null;
    }
  }

  receiveGarbage(amount) {
    this.pendingGarbage += amount;
  }

  draw(fastDrop) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(W, r * CELL); ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, H); ctx.stroke();
    }

    // Board cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const val = this.board.get(r, c);
        if (val === null) continue;
        if (val === -1) {
          drawGarbage(ctx, c * CELL, r * CELL);
        } else {
          // Check if in clearing animation
          let alpha = 1;
          if (this.clearAnim) {
            const inGroup = this.clearAnim.groups.some(g => g.cells.some(([gr,gc]) => gr===r && gc===c));
            if (inGroup) {
              const t = this.clearAnim.timer / this.clearAnim.duration;
              alpha = 1 - t * 0.8 + 0.2 * Math.sin(t * Math.PI * 6);
            }
          }
          drawBlop(ctx, c * CELL, r * CELL, val, CELL, alpha);
        }
      }
    }

    // Current piece
    if (this.current) {
      for (const [r, c, col] of this.current.cells()) {
        if (r >= 0) drawBlop(ctx, c * CELL, r * CELL, col, CELL, fastDrop ? 0.7 : 1);
      }
      // Ghost piece
      const ghost = this.current.clone();
      while (this.canPlace({ cells: () => ghost.cells().map(([r,c,co]) => [r+1,c,co]) })) ghost.row++;
      // draw ghost lightly if different from current
      if (ghost.row !== this.current.row) {
        for (const [r, c, col] of ghost.cells()) {
          if (r >= 0) drawBlop(ctx, c * CELL, r * CELL, col, CELL, 0.2);
        }
      }
    }

    // Pending garbage indicator
    if (this.pendingGarbage > 0) {
      ctx.fillStyle = 'rgba(255,68,68,0.8)';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`⚡ ${this.pendingGarbage}`, W - 4, 16);
    }

    // Draw next
    this.drawNext();
  }

  drawNext() {
    const ctx = this.nextCtx;
    const W = this.nextCanvas.width, H = this.nextCanvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!this.queue[0]) return;
    const pair = this.queue[0];
    const s = 36;
    const ox = (W - s) / 2, oy = 4;
    drawBlop(ctx, ox, oy, pair[0], s);
    drawBlop(ctx, ox, oy + s + 2, pair[1], s);
  }
}

// ===== Garbage calculation =====
function calcGarbage(cleared, chain) {
  // chain bonus multiplier
  const chainBonus = chain <= 1 ? 1 : chain * 1.5;
  return Math.floor((cleared - MIN_CHAIN + 1) * chainBonus * 0.6);
}

// ===== Simple AI: find best column/rotation =====
function findBestMove(board, piece) {
  let bestScore = -Infinity;
  let bestTarget = null;

  for (let rot = 0; rot < 4; rot++) {
    for (let col = 0; col < COLS; col++) {
      const p = piece.clone();
      p.rot = rot; p.col = col; p.row = 0;
      if (!isValidPiecePlacement(board, p)) continue;
      // Drop to bottom
      while (isValidPiecePlacement(board, { cells: () => p.cells().map(([r,c,co]) => [r+1,c,co]) })) p.row++;
      // Simulate placement
      const simBoard = cloneBoard(board);
      for (const [r, c, color] of p.cells()) {
        if (r >= 0 && r < ROWS) simBoard.set(r, c, color);
      }
      simBoard.applyGravity();
      const score = evaluateBoard(simBoard);
      if (score > bestScore) { bestScore = score; bestTarget = { col, rot }; }
    }
  }
  return bestTarget;
}

function isValidPiecePlacement(board, piece) {
  for (const [r, c] of piece.cells().map(([r,c]) => [r,c])) {
    if (c < 0 || c >= COLS || r >= ROWS) return false;
    if (r >= 0 && board.get(r, c) !== null) return false;
  }
  return true;
}

function cloneBoard(board) {
  const b = new Board();
  b.grid = board.grid.map(row => row.slice());
  return b;
}

function evaluateBoard(board) {
  // Score based on: potential chains, height, holes
  const groups = board.findGroups(2); // potential connections
  const chainScore = groups.reduce((s, g) => s + g.cells.length * g.cells.length, 0);
  // Height penalty
  let heightPenalty = 0;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (board.get(r, c) !== null) { heightPenalty += (ROWS - r); break; }
    }
  }
  // Hole penalty
  let holes = 0;
  for (let c = 0; c < COLS; c++) {
    let hasBlop = false;
    for (let r = 0; r < ROWS; r++) {
      if (board.get(r, c) !== null) hasBlop = true;
      else if (hasBlop) holes++;
    }
  }
  return chainScore * 3 - heightPenalty * 0.5 - holes * 2 + Math.random() * 5;
}

// ===== Game Manager =====
class Game {
  constructor() {
    this.mode = null; // 'cpu' | '2p'
    this.players = [];
    this.running = false;
    this.lastTime = 0;
    this.keys = {};

    this.p1Fast = false;
    this.p2Fast = false;

    this.initUI();
    this.setupKeys();
  }

  initUI() {
    document.getElementById('btn-vs-cpu').addEventListener('click', () => this.start('cpu'));
    document.getElementById('btn-vs-2p').addEventListener('click', () => this.start('2p'));
    document.getElementById('btn-menu').addEventListener('click', () => this.goMenu());
    document.getElementById('btn-retry').addEventListener('click', () => this.start(this.mode));
    window.addEventListener('resize', () => this.scaleGameArea());
    this.isMobile = ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }

  setupTouchControls(mode) {
    const tc = document.getElementById('touch-controls');
    if (!this.isMobile) { tc.classList.add('hidden'); return; }

    tc.classList.remove('hidden');
    const p2pad = document.getElementById('touch-p2');
    if (mode === '2p') {
      p2pad.classList.remove('hidden');
      tc.classList.add('mode-2p');
    } else {
      p2pad.classList.add('hidden');
      tc.classList.remove('mode-2p');
    }

    // Remove old listeners by replacing nodes
    const rebind = (id, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      const clone = el.cloneNode(true);
      el.parentNode.replaceChild(clone, el);
      return clone;
    };

    const addRepeat = (id, action) => {
      const el = rebind(id);
      if (!el) return;
      let timer = null, interval = null;
      const start = (e) => {
        e.preventDefault();
        action();
        timer = setTimeout(() => { interval = setInterval(action, 80); }, 200);
      };
      const stop = (e) => {
        e.preventDefault();
        clearTimeout(timer); clearInterval(interval);
      };
      el.addEventListener('touchstart', start, { passive: false });
      el.addEventListener('touchend', stop, { passive: false });
      el.addEventListener('touchcancel', stop, { passive: false });
    };

    const addTap = (id, action) => {
      const el = rebind(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); action(); }, { passive: false });
    };

    const addHold = (id, onStart, onEnd) => {
      const el = rebind(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); onStart(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); onEnd(); }, { passive: false });
      el.addEventListener('touchcancel', (e) => { e.preventDefault(); onEnd(); }, { passive: false });
    };

    const p = (i) => this.players[i];
    addRepeat('t-p1-left',  () => { if (p(0)?.state==='falling') p(0).tryMove(0,-1); });
    addRepeat('t-p1-right', () => { if (p(0)?.state==='falling') p(0).tryMove(0, 1); });
    addTap('t-p1-rotl',     () => { if (p(0)?.state==='falling') p(0).tryRotate(-1); });
    addTap('t-p1-rotr',     () => { if (p(0)?.state==='falling') p(0).tryRotate( 1); });
    addHold('t-p1-drop',    () => { this.p1Fast = true; }, () => { this.p1Fast = false; });

    addRepeat('t-p2-left',  () => { if (p(1)?.state==='falling') p(1).tryMove(0,-1); });
    addRepeat('t-p2-right', () => { if (p(1)?.state==='falling') p(1).tryMove(0, 1); });
    addTap('t-p2-rotl',     () => { if (p(1)?.state==='falling') p(1).tryRotate(-1); });
    addTap('t-p2-rotr',     () => { if (p(1)?.state==='falling') p(1).tryRotate( 1); });
    addHold('t-p2-drop',    () => { this.p2Fast = true; }, () => { this.p2Fast = false; });
  }

  goMenu() {
    this.running = false;
    document.getElementById('screen-game').classList.remove('active');
    document.getElementById('screen-menu').classList.add('active');
  }

  start(mode) {
    this.mode = mode;
    document.getElementById('screen-menu').classList.remove('active');
    document.getElementById('screen-game').classList.add('active');
    this.setupTouchControls(mode);
    // Scale after DOM update (double rAF ensures layout is complete)
    requestAnimationFrame(() => requestAnimationFrame(() => this.scaleGameArea()));
    document.getElementById('result-display').classList.add('hidden');
    document.getElementById('result-display').className = 'result-display hidden';
    document.getElementById('p2-label').textContent = mode === 'cpu' ? 'CPU' : 'PLAYER 2';

    const p1 = new Player(1,
      document.getElementById('p1-field'),
      document.getElementById('p1-next'),
      false
    );
    const p2 = new Player(2,
      document.getElementById('p2-field'),
      document.getElementById('p2-next'),
      mode === 'cpu'
    );

    // Wire garbage exchange
    p1._onGarbage = (n) => p2.receiveGarbage(n);
    p2._onGarbage = (n) => p1.receiveGarbage(n);

    this.players = [p1, p2];
    this.running = true;
    this.lastTime = performance.now();

    // Countdown
    this.players.forEach(p => { p.state = 'waiting'; });
    let cd = 3;
    const cdEl = document.getElementById('countdown');
    cdEl.classList.remove('hidden');
    cdEl.textContent = cd;
    const tick = setInterval(() => {
      cd--;
      if (cd <= 0) {
        clearInterval(tick);
        cdEl.classList.add('hidden');
        this.players.forEach(p => { p.state = 'spawning'; });
      } else {
        cdEl.textContent = cd;
      }
    }, 700);

    requestAnimationFrame((t) => this.loop(t));
  }

  setupKeys() {
    document.addEventListener('keydown', e => {
      if (!this.running) return;
      const p1 = this.players[0], p2 = this.players[1];

      switch (e.code) {
        case 'ArrowLeft':  if (p1?.state==='falling') p1.tryMove(0,-1); break;
        case 'ArrowRight': if (p1?.state==='falling') p1.tryMove(0, 1); break;
        case 'ArrowDown':  this.p1Fast = true; break;
        case 'KeyZ':       if (p1?.state==='falling') p1.tryRotate(-1); break;
        case 'KeyX':       if (p1?.state==='falling') p1.tryRotate(1); break;

        case 'KeyA': if (!p2?.isAI && p2?.state==='falling') p2.tryMove(0,-1); break;
        case 'KeyD': if (!p2?.isAI && p2?.state==='falling') p2.tryMove(0, 1); break;
        case 'KeyS': if (!p2?.isAI) this.p2Fast = true; break;
        case 'KeyQ': if (!p2?.isAI && p2?.state==='falling') p2.tryRotate(-1); break;
        case 'KeyE': if (!p2?.isAI && p2?.state==='falling') p2.tryRotate(1); break;
      }
    });
    document.addEventListener('keyup', e => {
      if (e.code === 'ArrowDown') this.p1Fast = false;
      if (e.code === 'KeyS') this.p2Fast = false;
    });
  }

  loop(time) {
    if (!this.running) return;
    const dt = Math.min(time - this.lastTime, 100);
    this.lastTime = time;

    const [p1, p2] = this.players;

    if (p1.state !== 'waiting') p1.update(dt, this.p1Fast);
    if (p2.state !== 'waiting') p2.update(dt, this.p2Fast);

    p1.draw(this.p1Fast);
    p2.draw(this.p2Fast);

    // Update score display
    document.getElementById('p1-score').textContent = p1.score.toLocaleString();
    document.getElementById('p2-score').textContent = p2.score.toLocaleString();

    // Chain display
    const p1Chain = document.getElementById('p1-chain');
    const p2Chain = document.getElementById('p2-chain');
    if (p1.clearAnim && p1.clearAnim.chainNum > 1) {
      p1Chain.textContent = `${p1.clearAnim.chainNum} CHAIN!`;
    } else if (!p1.clearAnim) {
      p1Chain.textContent = '';
    }
    if (p2.clearAnim && p2.clearAnim.chainNum > 1) {
      p2Chain.textContent = `${p2.clearAnim.chainNum} CHAIN!`;
    } else if (!p2.clearAnim) {
      p2Chain.textContent = '';
    }

    // Check game over
    if (p1.state === 'dead' || p2.state === 'dead') {
      this.running = false;
      this.showResult(p1, p2);
      return;
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  showResult(p1, p2) {
    const el = document.getElementById('result-display');
    el.classList.remove('hidden');
    if (p1.state === 'dead' && p2.state === 'dead') {
      el.textContent = 'DRAW!';
      el.classList.add('draw');
    } else if (p1.state === 'dead') {
      el.textContent = this.mode === 'cpu' ? 'CPU WIN...' : 'P2 WIN!';
      el.classList.add('p2-win');
    } else {
      el.textContent = 'P1 WIN!';
      el.classList.add('p1-win');
    }
  }

  scaleGameArea() {
    const scaler = document.getElementById('game-scaler');
    const area = document.querySelector('.game-area');
    const tc = document.getElementById('touch-controls');
    if (!scaler || !area) return;

    // Reset to measure natural size
    area.style.transform = '';
    area.style.marginLeft = '';
    const naturalW = area.scrollWidth;
    const naturalH = area.scrollHeight;

    const availW = scaler.clientWidth;
    const tcH = (tc && !tc.classList.contains('hidden')) ? tc.offsetHeight : 0;
    const headerH = document.querySelector('header')?.offsetHeight || 0;
    const availH = window.innerHeight - headerH - tcH - 24; // 24px padding

    const scaleW = availW / naturalW;
    const scaleH = availH / naturalH;
    const scale = Math.min(1, scaleW, scaleH);

    if (scale < 1) {
      area.style.transform = `scale(${scale})`;
      area.style.transformOrigin = 'top left';
      const offset = (availW - naturalW * scale) / 2;
      area.style.marginLeft = offset + 'px';
      scaler.style.height = Math.ceil(naturalH * scale) + 'px';
    } else {
      area.style.marginLeft = '';
      scaler.style.height = '';
    }
  }
}

// ===== Boot =====
window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
