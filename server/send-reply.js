#!/usr/bin/env node
// Send messages to LINE/Messenger via Matrix bridge
// Usage: node send-reply.js <roomId> <message>
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
  if (args.length < 2) {
    console.error('Usage: send-reply.js <roomId> <message>');
    process.exit(1);
  }
  const roomId = args[0];
  const message = args.slice(1).join(' ');

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
