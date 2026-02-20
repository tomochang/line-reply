#!/usr/bin/env node
// Send messages to LINE/Messenger via Matrix bridge
// Usage: node send-reply.js <roomId> <message>
// or:    node send-reply.js --room-name "Name" --message "Hello"
//
// Sends as the Matrix admin user directly.
// The bridge forwards messages to LINE via admin's UserLogin session.
// NOTE: as_token + ghost user approach silently drops in mautrix bridge v2

const http = require('http');

const CONFIG = {
  matrixUrl: process.env.MATRIX_URL || 'http://127.0.0.1:8008',
  accessToken: process.env.MATRIX_TOKEN,
};

if (!CONFIG.accessToken) {
  console.error('Error: MATRIX_TOKEN environment variable is required.');
  console.error('Set it to your Matrix admin access token.');
  process.exit(1);
}

function matrixRequest(method, endpoint, body) {
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
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function findRoomByName(name) {
  const data = await matrixRequest('GET', '/_synapse/admin/v1/rooms?limit=200');
  const rooms = data.rooms || [];
  let match = rooms.find(r => r.name === name);
  if (!match) {
    match = rooms.find(r => (r.name || '').includes(name));
  }
  return match;
}

async function ensureJoined(roomId) {
  const encoded = encodeURIComponent(roomId);
  const result = await matrixRequest('POST',
    `/_matrix/client/v3/rooms/${encoded}/join`, {});
  if (result.errcode) {
    console.error('Join warning:', result.error);
  }
}

async function sendMessage(roomId, message) {
  await ensureJoined(roomId);

  const encoded = encodeURIComponent(roomId);
  const txnId = `send_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  return matrixRequest('PUT',
    `/_matrix/client/v3/rooms/${encoded}/send/m.room.message/${txnId}`,
    { msgtype: 'm.text', body: message });
}

async function main() {
  const args = process.argv.slice(2);
  let roomId, message;

  if (args.includes('--room-name')) {
    const nameIdx = args.indexOf('--room-name') + 1;
    const msgIdx = args.indexOf('--message') + 1;
    if (!nameIdx || !msgIdx) {
      console.error('Usage: send-reply.js --room-name <name> --message <text>');
      process.exit(1);
    }
    const roomName = args[nameIdx];
    message = args[msgIdx];

    const room = await findRoomByName(roomName);
    if (!room) {
      console.error(`Room not found: ${roomName}`);
      const data = await matrixRequest('GET', '/_synapse/admin/v1/rooms?limit=200');
      const similar = (data.rooms || [])
        .filter(r => (r.name || '').toLowerCase().includes(roomName.toLowerCase()))
        .map(r => r.name);
      if (similar.length) console.error(`Similar: ${similar.join(', ')}`);
      process.exit(1);
    }
    roomId = room.room_id;
    console.log(`Found room: ${room.name} (${roomId})`);
  } else if (args.length >= 2) {
    roomId = args[0];
    message = args.slice(1).join(' ');
  } else {
    console.error('Usage: send-reply.js <roomId> <message>');
    console.error('   or: send-reply.js --room-name <name> --message <text>');
    process.exit(1);
  }

  const result = await sendMessage(roomId, message);
  if (result.event_id) {
    console.log(`Sent: ${result.event_id}`);
  } else {
    console.error('Send failed:', JSON.stringify(result));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
