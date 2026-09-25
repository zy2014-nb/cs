// ====== Game Client ======
const socket = io();

// DOM Elements
const menuScreen = document.getElementById('menu');
const gameScreen = document.getElementById('gameScreen');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const nicknameInput = document.getElementById('nickname');
const roomCodeInput = document.getElementById('roomCode');
const menuError = document.getElementById('menuError');
const hpBar = document.getElementById('hpBar');
const hpText = document.getElementById('hpText');
const weaponNameEl = document.getElementById('weaponName');
const ammoDisplay = document.getElementById('ammoDisplay');
const playerList = document.getElementById('playerList');
const killFeed = document.getElementById('killFeed');
const respawnOverlay = document.getElementById('respawnOverlay');
const killMessage = document.getElementById('killMessage');
const respawnCountdown = document.getElementById('respawnCountdown');
const reloadOverlay = document.getElementById('reloadOverlay');
const displayRoomCode = document.getElementById('displayRoomCode');
const btnLeave = document.getElementById('btnLeave');

// Game state
let myPlayerId = null;
let myRoomCode = null;
let gameState = { players: [], bullets: [], walls: [] };
let keys = {};
let mouse = { x: 0, y: 0, down: false };
let camera = { x: 0, y: 0 };
let myPlayer = null;
let lastShotTime = 0;
let isReloading = false;
let reloadStartTime = 0;
const RELOAD_DURATION = 1500; // ms

// Map dimensions (must match server)
const MAP_WIDTH = 1600;
const MAP_HEIGHT = 800;

// ====== Canvas Setup ======
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ====== Input Handling ======
document.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key.toLowerCase() === 'r') startReload();
  if (e.key === '1') switchWeapon('pistol');
  if (e.key === '2') switchWeapon('rifle');
});
document.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) mouse.down = true;
});
canvas.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouse.down = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ====== Menu Buttons ======
document.getElementById('btnCreate').addEventListener('click', () => {
  const nick = nicknameInput.value.trim() || 'Player';
  socket.emit('createRoom', nick);
});

document.getElementById('btnJoin').addEventListener('click', () => {
  const nick = nicknameInput.value.trim() || 'Player';
  const code = roomCodeInput.value.trim();
  if (!code || code.length !== 6) {
    menuError.textContent = '请输入6位房间码';
    return;
  }
  socket.emit('joinRoom', { roomCode: code, nickname: nick });
});

btnLeave.addEventListener('click', () => {
  location.reload();
});

// ====== Socket Events ======
socket.on('roomCreated', (code) => {
  myRoomCode = code;
  enterGame();
});

socket.on('roomJoined', (data) => {
  myRoomCode = data.roomCode;
  myPlayerId = data.playerId;
  enterGame();
});

socket.on('error', (msg) => {
  menuError.textContent = msg;
});

socket.on('gameState', (state) => {
  gameState = state;
  updateMyPlayer();
  updateHUD();
});

socket.on('playerDied', (data) => {
  // Show kill feed
  const feedItem = document.createElement('div');
  feedItem.className = 'kill-feed-item';
  feedItem.innerHTML = `<span style="color:${getPlayerColor(data.killerId)}">${data.killerName}</span> <span style="color:#888">▶</span> <span style="color:${getPlayerColor(data.deadId)}">${data.deadName}</span>`;
  killFeed.appendChild(feedItem);
  setTimeout(() => feedItem.remove(), 5000);

  // If I died
  if (data.deadId === myPlayerId) {
    killMessage.textContent = `${data.killerName} 击杀了你`;
    respawnOverlay.classList.remove('hidden');
    startRespawnCountdown();
  }
});

function getPlayerColor(id) {
  const p = gameState.players.find(p => p.id === id);
  return p ? p.color : '#888';
}

function enterGame() {
  menuScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  displayRoomCode.textContent = myRoomCode;
  gameLoop();
}

function updateMyPlayer() {
  myPlayer = gameState.players.find(p => p.id === myPlayerId);
  if (myPlayer && myPlayer.alive) {
    respawnOverlay.classList.add('hidden');
  }
}

function startRespawnCountdown() {
  let count = 3;
  respawnCountdown.textContent = count;
  const interval = setInterval(() => {
    count--;
    if (count <= 0) {
      clearInterval(interval);
    } else {
      respawnCountdown.textContent = count;
    }
  }, 1000);
}

function startReload() {
  if (isReloading) return;
  if (!myPlayer || !myPlayer.alive) return;
  if (myPlayer.ammo >= myPlayer.maxAmmo || myPlayer.reserveAmmo <= 0) return;

  isReloading = true;
  reloadStartTime = Date.now();
  reloadOverlay.classList.remove('hidden');

  setTimeout(() => {
    isReloading = false;
    reloadOverlay.classList.add('hidden');
    socket.emit('reload');
  }, RELOAD_DURATION);
}

function switchWeapon(weapon) {
  if (!myPlayer || !myPlayer.alive) return;
  if (myPlayer.weapon === weapon) return;
  isReloading = false;
  reloadOverlay.classList.add('hidden');
  socket.emit('switchWeapon', weapon);
}

// ====== Local Player Movement & Input ======
const PLAYER_SPEED = 4;
const PLAYER_RADIUS = 14;

function updateLocalPlayer() {
  if (!myPlayer || !myPlayer.alive) return;

  let dx = 0, dy = 0;
  if (keys['w']) dy -= 1;
  if (keys['s']) dy += 1;
  if (keys['a']) dx -= 1;
  if (keys['d']) dx += 1;

  // Normalize diagonal movement
  if (dx !== 0 || dy !== 0) {
    const len = Math.sqrt(dx * dx + dy * dy);
    dx = (dx / len) * PLAYER_SPEED;
    dy = (dy / len) * PLAYER_SPEED;
  }

  let newX = myPlayer.x + dx;
  let newY = myPlayer.y + dy;

  // Resolve collisions with walls and map bounds
  const resolved = resolveCollision(newX, newY);
  myPlayer.x = resolved.x;
  myPlayer.y = resolved.y;

  // Calculate aim angle from camera
  const worldMouseX = mouse.x + camera.x;
  const worldMouseY = mouse.y + camera.y;
  myPlayer.angle = Math.atan2(worldMouseY - myPlayer.y, worldMouseX - myPlayer.x);

  // Send position to server
  socket.emit('updatePosition', {
    x: myPlayer.x,
    y: myPlayer.y,
    angle: myPlayer.angle
  });

  // Shooting
  if (mouse.down && !isReloading) {
    const now = Date.now();
    const fireRate = myPlayer.weapon === 'rifle' ? 100 : 250;
    if (now - lastShotTime >= fireRate && myPlayer.ammo > 0) {
      lastShotTime = now;
      socket.emit('shoot', { angle: myPlayer.angle });
    }
  }
}

function resolveCollision(x, y) {
  // Map boundaries
  x = Math.max(PLAYER_RADIUS + 40, Math.min(MAP_WIDTH - PLAYER_RADIUS - 40, x));
  y = Math.max(PLAYER_RADIUS + 40, Math.min(MAP_HEIGHT - PLAYER_RADIUS - 40, y));

  // Circle vs wall collision resolution
  for (const wall of gameState.walls) {
    const closestX = Math.max(wall.x, Math.min(x, wall.x + wall.w));
    const closestY = Math.max(wall.y, Math.min(y, wall.y + wall.h));
    const dx = x - closestX;
    const dy = y - closestY;
    const distSq = dx * dx + dy * dy;
    if (distSq < PLAYER_RADIUS * PLAYER_RADIUS) {
      const dist = Math.sqrt(distSq);
      if (dist < 0.001) {
        // Player center is inside wall - push out along smallest axis
        const left = x - wall.x;
        const right = wall.x + wall.w - x;
        const top = y - wall.y;
        const bottom = wall.y + wall.h - y;
        const minDist = Math.min(left, right, top, bottom);
        if (minDist === left) x = wall.x - PLAYER_RADIUS;
        else if (minDist === right) x = wall.x + wall.w + PLAYER_RADIUS;
        else if (minDist === top) y = wall.y - PLAYER_RADIUS;
        else y = wall.y + wall.h + PLAYER_RADIUS;
      } else {
        const push = (PLAYER_RADIUS - dist) / dist;
        x += dx * push;
        y += dy * push;
      }
    }
  }
  return { x, y };
}

// ====== Camera ======
function updateCamera() {
  if (!myPlayer) return;
  camera.x = myPlayer.x - canvas.width / 2;
  camera.y = myPlayer.y - canvas.height / 2;
  // Clamp camera to map
  camera.x = Math.max(0, Math.min(MAP_WIDTH - canvas.width, camera.x));
  camera.y = Math.max(0, Math.min(MAP_HEIGHT - canvas.height, camera.y));
}

// ====== Rendering ======
function render() {
  // Clear
  ctx.fillStyle = '#1a2530';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  // Draw ground grid
  drawGround();

  // Draw walls
  drawWalls();

  // Draw bullets
  drawBullets();

  // Draw players
  for (const player of gameState.players) {
    if (player.alive) {
      drawPlayer(player);
    }
  }

  ctx.restore();

  // Draw crosshair
  drawCrosshair();

  // Draw map border indicator if at edge
}

function drawGround() {
  // Draw a subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  const gridSize = 40;
  const startX = Math.floor(camera.x / gridSize) * gridSize;
  const startY = Math.floor(camera.y / gridSize) * gridSize;
  const endX = camera.x + canvas.width + gridSize;
  const endY = camera.y + canvas.height + gridSize;

  for (let x = startX; x < endX; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, camera.y);
    ctx.lineTo(x, camera.y + canvas.height);
    ctx.stroke();
  }
  for (let y = startY; y < endY; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(camera.x, y);
    ctx.lineTo(camera.x + canvas.width, y);
    ctx.stroke();
  }

  // Map border
  ctx.strokeStyle = '#3a5a7a';
  ctx.lineWidth = 4;
  ctx.strokeRect(40, 40, MAP_WIDTH - 80, MAP_HEIGHT - 80);
}

function drawWalls() {
  for (const wall of gameState.walls) {
    // Wall body
    ctx.fillStyle = '#3a4a5a';
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    // Wall top highlight
    ctx.fillStyle = '#4a5a6a';
    ctx.fillRect(wall.x, wall.y, wall.w, 4);
    // Wall border
    ctx.strokeStyle = '#2a3a4a';
    ctx.lineWidth = 2;
    ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
  }
}

function drawBullets() {
  for (const bullet of gameState.bullets) {
    ctx.fillStyle = '#ffe040';
    ctx.shadowColor = '#ffcc00';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawPlayer(player) {
  const isMe = player.id === myPlayerId;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(player.x, player.y + 12, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body circle
  ctx.fillStyle = player.color;
  ctx.beginPath();
  ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = isMe ? '#fff' : 'rgba(255,255,255,0.3)';
  ctx.lineWidth = isMe ? 2 : 1;
  ctx.stroke();

  // Direction indicator (gun)
  const gunLen = 22;
  const gunX = player.x + Math.cos(player.angle) * gunLen;
  const gunY = player.y + Math.sin(player.angle) * gunLen;
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(gunX, gunY);
  ctx.stroke();

  // Head
  ctx.fillStyle = '#e0c0a0';
  ctx.beginPath();
  ctx.arc(player.x, player.y, 7, 0, Math.PI * 2);
  ctx.fill();

  // Name tag
  ctx.fillStyle = '#fff';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(player.nickname, player.x, player.y - 24);

  // HP bar above name
  const hpWidth = 30;
  const hpPct = player.hp / player.maxHp;
  ctx.fillStyle = '#333';
  ctx.fillRect(player.x - hpWidth / 2, player.y - 20, hpWidth, 4);
  ctx.fillStyle = hpPct > 0.5 ? '#4aca5a' : hpPct > 0.25 ? '#f0a030' : '#f06060';
  ctx.fillRect(player.x - hpWidth / 2, player.y - 20, hpWidth * hpPct, 4);
}

function drawCrosshair() {
  const cx = mouse.x;
  const cy = mouse.y;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  const gap = 6;
  const len = 8;

  ctx.beginPath();
  ctx.moveTo(cx - gap - len, cy);
  ctx.lineTo(cx - gap, cy);
  ctx.moveTo(cx + gap, cy);
  ctx.lineTo(cx + gap + len, cy);
  ctx.moveTo(cx, cy - gap - len);
  ctx.lineTo(cx, cy - gap);
  ctx.moveTo(cx, cy + gap);
  ctx.lineTo(cx, cy + gap + len);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

// ====== HUD Updates ======
function updateHUD() {
  if (!myPlayer) return;

  // HP
  const hpPct = Math.max(0, myPlayer.hp / myPlayer.maxHp);
  hpBar.style.width = (hpPct * 100) + '%';
  hpText.textContent = Math.ceil(myPlayer.hp);
  if (hpPct > 0.5) hpBar.style.background = 'linear-gradient(90deg, #2a9a3a, #4aca5a)';
  else if (hpPct > 0.25) hpBar.style.background = 'linear-gradient(90deg, #c08020, #f0a030)';
  else hpBar.style.background = 'linear-gradient(90deg, #a03030, #f06060)';

  // Weapon
  weaponNameEl.textContent = myPlayer.weapon === 'pistol' ? 'USP-S' : 'AK-47';
  ammoDisplay.textContent = `${myPlayer.ammo} / ${myPlayer.reserveAmmo}`;

  // Player list
  const sorted = [...gameState.players].sort((a, b) => b.kills - a.kills);
  playerList.innerHTML = sorted.map(p => `
    <div class="scoreboard-row">
      <div class="name">
        <span class="dot" style="background:${p.color}"></span>
        ${p.nickname}${p.id === myPlayerId ? ' (你)' : ''}
      </div>
      <div class="stats">${p.kills} / ${p.deaths}</div>
    </div>
  `).join('');
}

// ====== Game Loop ======
function gameLoop() {
  updateLocalPlayer();
  updateCamera();
  render();
  requestAnimationFrame(gameLoop);
}
