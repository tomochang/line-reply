#!/usr/bin/env node
// Get LINE inbox (unread messages) from Matrix bridge
// Usage: node get-inbox.js
//
// Returns JSON array of rooms where the latest message is NOT from admin.
// These are "unread" — someone sent a message that hasn't been replied to.
//
// The admin can send messages via Matrix (@admin:matrix.local) OR directly
// from LINE (appears as a @line_* ghost user). Both are detected as "admin".

const http = require('http');

const CONFIG = {
  matrixUrl: process.env.MATRIX_URL || 'http://127.0.0.1:8008',
  accessToken: process.env.MATRIX_TOKEN,
};

if (!CONFIG.accessToken) {
  console.error('Error: MATRIX_TOKEN environment variable is required.');
  process.exit(1);
}

// Rooms to skip (system rooms, bots, etc.)
const SKIP_PATTERNS = [
  /^LINE Bridge Bot$/i,
  /^mautrix-meta$/i,
  /^Telegram Bridge$/i,
  /^Messenger Bridge$/i,
  /bridge bot/i,
  /^System Alerts$/i,
  /^Facebook Messenger/i,
];

function matrixRequest(method, endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, CONFIG.matrixUrl);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${CONFIG.accessToken}`,
        'Content-Type': 'application/json',
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function getAdminUserId() {
  const data = await matrixRequest('GET', '/_matrix/client/v3/account/whoami');
  return data.user_id;
}

async function getRooms() {
  const data = await matrixRequest('GET', '/_synapse/admin/v1/rooms?limit=200');
  return data.rooms || [];
}

async function getRecentMessages(roomId, limit = 5) {
  const encoded = encodeURIComponent(roomId);
  // Use Synapse admin API — reads messages from any room regardless of membership
  const data = await matrixRequest('GET',
    `/_synapse/admin/v1/rooms/${encoded}/messages?limit=${limit}&dir=b`);
  return (data.chunk || []).filter(e => e.type === 'm.room.message');
}

function shouldSkip(roomName) {
  if (!roomName) return true;
  return SKIP_PATTERNS.some(p => p.test(roomName));
}

// Detect admin's LINE ghost user by finding which @line_* sender appears
// in the most rooms. The admin chats with many people, so their ghost
// user will be the most frequent sender across rooms.
async function detectAdminGhost(rooms, adminUserId) {
  const senderRoomMap = {}; // sender -> Set of room_ids

  // Sample up to 30 rooms to find the pattern
  const sample = rooms.filter(r => r.name && r.joined_members >= 2).slice(0, 30);

  for (const room of sample) {
    try {
      const messages = await getRecentMessages(room.room_id, 5);
      for (const msg of messages) {
        if (msg.sender.startsWith('@line_') && msg.sender !== adminUserId) {
          if (!senderRoomMap[msg.sender]) senderRoomMap[msg.sender] = new Set();
          senderRoomMap[msg.sender].add(room.room_id);
        }
      }
    } catch { continue; }
  }

  // The ghost user appearing in the most rooms is the admin's
  let maxCount = 0;
  let ghostId = null;
  for (const [sender, roomSet] of Object.entries(senderRoomMap)) {
    if (roomSet.size > maxCount) {
      maxCount = roomSet.size;
      ghostId = sender;
    }
  }

  // Only trust detection if ghost appears in at least 3 rooms
  return maxCount >= 3 ? ghostId : null;
}

async function main() {
  const adminUserId = await getAdminUserId();
  const rooms = await getRooms();

  // Filter to DM rooms (members 2-4: admin + ghost + bridge bot(s))
  const dmRooms = rooms.filter(r => {
    const members = r.joined_members || 0;
    return members >= 2 && members <= 4 && !shouldSkip(r.name);
  });

  // Detect admin's LINE ghost user
  const adminGhost = await detectAdminGhost(dmRooms, adminUserId);

  const isAdmin = (sender) =>
    sender === adminUserId || (adminGhost && sender === adminGhost);

  const inbox = [];

  for (const room of dmRooms) {
    try {
      const messages = await getRecentMessages(room.room_id);
      if (messages.length === 0) continue;

      // Latest message
      const latest = messages[0];
      const sender = latest.sender;

      // If latest message is NOT from admin, it's "unread"
      if (!isAdmin(sender)) {
        const body = latest.content?.body || '';
        const ts = latest.origin_server_ts;

        inbox.push({
          room_id: room.room_id,
          room_name: room.name || '(unnamed)',
          sender: sender,
          message: body.length > 200 ? body.slice(0, 200) + '...' : body,
          timestamp: ts,
          time: ts ? new Date(ts).toISOString() : null,
        });
      }
    } catch (err) {
      // Skip rooms we can't read
      continue;
    }
  }

  // Sort by timestamp descending (newest first)
  inbox.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  console.log(JSON.stringify(inbox, null, 2));
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
