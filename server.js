const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// Game state
const rooms = new Map(); // roomCode -> { players: Map, bullets: [], walls: [], gameTime: 0 }
const MAX_PLAYERS = 10;
const TICK_RATE = 30; // server tick rate

// Map walls (cover obstacles) - shared map for all rooms
const MAP_WALLS = [
  // Outer walls
  { x: 0, y: 0, w: 1600, h: 40 },
  { x: 0, y: 760, w: 1600, h: 40 },
  { x: 0, y: 0, w: 40, h: 800 },
  { x: 1560, y: 0, w: 40, h: 800 },
  // Inner walls / cover
  { x: 300, y: 200, w: 200, h: 40 },
  { x: 300, y: 560, w: 40, h: 200 },
  { x: 600, y: 380, w: 40, h: 200 },
  { x: 600, y: 100, w: 200, h: 40 },
  { x: 900, y: 460, w: 200, h: 40 },
  { x: 900, y: 200, w: 40, h: 160 },
  { x: 1200, y: 300, w: 40, h: 200 },
  { x: 1200, y: 600, w: 200, h: 40 },
  { x: 450, y: 400, w: 40, h: 120 },
  { x: 1050, y: 100, w: 40, h: 120 },
  { x: 750, y: 600, w: 160, h: 40 },
];

function generateRoomCode() {
  let code;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(code));
  return code;
}

function createRoom() {
  const code = generateRoomCode();
  rooms.set(code, {
    players: new Map(),
    bullets: [],
    walls: MAP_WALLS,
    createdAt: Date.now()
  });
  return code;
}

function getSpawnPoint() {
  // Random spawn points around the map
  const spawns = [
    { x: 100, y: 400 },
    { x: 1500, y: 400 },
    { x: 800, y: 100 },
    { x: 800, y: 700 },
    { x: 200, y: 100 },
    { x: 1400, y: 700 },
    { x: 200, y: 700 },
    { x: 1400, y: 100 },
  ];
  return spawns[Math.floor(Math.random() * spawns.length)];
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  let currentRoom = null;

  // Create room
  socket.on('createRoom', (nickname) => {
    const code = createRoom();
    currentRoom = code;
    socket.join(code);

    const spawn = getSpawnPoint();
    rooms.get(code).players.set(socket.id, {
      id: socket.id,
      nickname: nickname || 'Player',
      x: spawn.x,
      y: spawn.y,
      angle: 0,
      hp: 100,
      maxHp: 100,
      weapon: 'pistol',
      ammo: 12,
      maxAmmo: 12,
      reserveAmmo: 36,
      kills: 0,
      deaths: 0,
      lastShot: 0,
      color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`,
      alive: true,
      respawnTime: 0
    });

    socket.emit('roomCreated', code);
    broadcastRoomState(code);
  });

  // Join room
  socket.on('joinRoom', (data) => {
    const { roomCode, nickname } = data;
    if (!rooms.has(roomCode)) {
      socket.emit('error', '房间不存在');
      return;
    }
    const room = rooms.get(roomCode);
    if (room.players.size >= MAX_PLAYERS) {
      socket.emit('error', '房间已满');
      return;
    }

    currentRoom = roomCode;
    socket.join(roomCode);

    const spawn = getSpawnPoint();
    room.players.set(socket.id, {
      id: socket.id,
      nickname: nickname || 'Player',
      x: spawn.x,
      y: spawn.y,
      angle: 0,
      hp: 100,
      maxHp: 100,
      weapon: 'pistol',
      ammo: 12,
      maxAmmo: 12,
      reserveAmmo: 36,
      kills: 0,
      deaths: 0,
      lastShot: 0,
      color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`,
      alive: true,
      respawnTime: 0
    });

    socket.emit('roomJoined', { roomCode, playerId: socket.id });
    broadcastRoomState(roomCode);
  });

  // Player movement update
  socket.on('updatePosition', (data) => {
    if (!currentRoom || !rooms.has(currentRoom)) return;
    const room = rooms.get(currentRoom);
    const player = room.players.get(socket.id);
    if (!player || !player.alive) return;

    player.x = data.x;
    player.y = data.y;
    player.angle = data.angle;
  });

  // Shooting
  socket.on('shoot', (data) => {
    if (!currentRoom || !rooms.has(currentRoom)) return;
    const room = rooms.get(currentRoom);
    const player = room.players.get(socket.id);
    if (!player || !player.alive) return;

    const now = Date.now();
    const fireRate = player.weapon === 'rifle' ? 100 : 250; // ms between shots
    if (now - player.lastShot < fireRate) return;
    if (player.ammo <= 0) return;

    player.lastShot = now;
    player.ammo--;

    const bulletSpeed = player.weapon === 'rifle' ? 12 : 10;
    const damage = player.weapon === 'rifle' ? 25 : 35;

    room.bullets.push({
      x: player.x + Math.cos(data.angle) * 20,
      y: player.y + Math.sin(data.angle) * 20,
      vx: Math.cos(data.angle) * bulletSpeed,
      vy: Math.sin(data.angle) * bulletSpeed,
      ownerId: socket.id,
      damage: damage,
      life: 60 // frames
    });

    // Auto reload when empty
    if (player.ammo === 0 && player.reserveAmmo > 0) {
      const reloadAmount = Math.min(player.maxAmmo, player.reserveAmmo);
      player.ammo = reloadAmount;
      player.reserveAmmo -= reloadAmount;
    }
  });

  // Reload
  socket.on('reload', () => {
    if (!currentRoom || !rooms.has(currentRoom)) return;
    const room = rooms.get(currentRoom);
    const player = room.players.get(socket.id);
    if (!player || !player.alive) return;
    if (player.ammo >= player.maxAmmo || player.reserveAmmo <= 0) return;

    const need = player.maxAmmo - player.ammo;
    const reloadAmount = Math.min(need, player.reserveAmmo);
    player.ammo += reloadAmount;
    player.reserveAmmo -= reloadAmount;
  });

  // Switch weapon
  socket.on('switchWeapon', (weapon) => {
    if (!currentRoom || !rooms.has(currentRoom)) return;
    const room = rooms.get(currentRoom);
    const player = room.players.get(socket.id);
    if (!player || !player.alive) return;
    if (weapon !== 'pistol' && weapon !== 'rifle') return;

    player.weapon = weapon;
    if (weapon === 'pistol') {
      player.maxAmmo = 12;
      player.ammo = player.ammo > 12 ? 12 : player.ammo;
    } else {
      player.maxAmmo = 30;
      player.ammo = player.ammo > 30 ? 30 : player.ammo;
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.players.delete(socket.id);
      if (room.players.size === 0) {
        rooms.delete(currentRoom);
        console.log('Room closed:', currentRoom);
      } else {
        broadcastRoomState(currentRoom);
      }
    }
  });
});

function broadcastRoomState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const players = Array.from(room.players.values()).map(p => ({
    id: p.id,
    nickname: p.nickname,
    x: p.x,
    y: p.y,
    angle: p.angle,
    hp: p.hp,
    maxHp: p.maxHp,
    weapon: p.weapon,
    ammo: p.ammo,
    maxAmmo: p.maxAmmo,
    reserveAmmo: p.reserveAmmo,
    kills: p.kills,
    deaths: p.deaths,
    color: p.color,
    alive: p.alive,
    respawnTime: p.respawnTime
  }));

  io.to(roomCode).emit('gameState', {
    players,
    bullets: room.bullets,
    walls: room.walls,
    serverTime: Date.now()
  });
}

// Game loop - server side physics for bullets and collisions
setInterval(() => {
  for (const [roomCode, room] of rooms) {
    // Update bullets
    for (let i = room.bullets.length - 1; i >= 0; i--) {
      const b = room.bullets[i];
      b.x += b.vx;
      b.y += b.vy;
      b.life--;

      let hit = false;

      // Check wall collision
      for (const wall of room.walls) {
        if (b.x > wall.x && b.x < wall.x + wall.w &&
            b.y > wall.y && b.y < wall.y + wall.h) {
          hit = true;
          break;
        }
      }

      // Check player collision
      if (!hit) {
        for (const player of room.players.values()) {
          if (!player.alive || player.id === b.ownerId) continue;
          const dx = b.x - player.x;
          const dy = b.y - player.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 18) {
            player.hp -= b.damage;
            hit = true;

            // Handle death
            if (player.hp <= 0) {
              player.alive = false;
              player.hp = 0;
              player.deaths++;
              player.respawnTime = Date.now() + 3000; // 3 second respawn

              const killer = room.players.get(b.ownerId);
              if (killer) killer.kills++;

              io.to(roomCode).emit('playerDied', {
                deadId: player.id,
                deadName: player.nickname,
                killerId: b.ownerId,
                killerName: killer ? killer.nickname : 'Unknown'
              });
            }
            break;
          }
        }
      }

      if (hit || b.life <= 0) {
        room.bullets.splice(i, 1);
      }
    }

    // Check respawn
    for (const player of room.players.values()) {
      if (!player.alive && Date.now() >= player.respawnTime) {
        const spawn = getSpawnPoint();
        player.x = spawn.x;
        player.y = spawn.y;
        player.hp = player.maxHp;
        player.alive = true;
        player.ammo = player.weapon === 'pistol' ? 12 : 30;
        player.reserveAmmo = player.weapon === 'pistol' ? 36 : 90;
      }
    }

    broadcastRoomState(roomCode);
  }
}, 1000 / TICK_RATE);

server.listen(PORT, () => {
  console.log(`CS2D Server running on http://localhost:${PORT}`);
});
