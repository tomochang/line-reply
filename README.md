# line-reply

Send LINE messages via Matrix bridge. CLI tools + Claude Code slash command integration.

## How it works

```
Your machine                    VPS
 line-send.sh ---SSH--->  send-reply.js
                          (Matrix API)
                              |
                         LINE bridge
                              |
                           LINE API
                              |
                         Recipient's LINE
```

Messages are sent as a Matrix admin user. The [mautrix-meta](https://github.com/mautrix/meta) bridge forwards them to LINE via the admin's UserLogin session.

## Prerequisites

- [Matrix Synapse](https://github.com/element-hq/synapse) homeserver
- [mautrix-meta](https://github.com/mautrix/meta) bridge with LINE login configured
- Node.js (for `send-reply.js`)
- Python 3 (for room search filtering)

These can run on a VPS or locally via Docker on your Mac.

## Setup

### 1. Clone and configure

```bash
git clone https://github.com/tomochang/line-reply.git ~/line-reply
cd ~/line-reply
cp .env.example .env
# Edit .env with your values
```

### 2. Deploy server script to VPS

Copy `server/send-reply.js` to your VPS and set the `MATRIX_TOKEN` environment variable:

```bash
scp server/send-reply.js your-vps:/path/to/send-reply.js
```

On the VPS, make sure `MATRIX_TOKEN` is available to the script (e.g., via systemd environment, `.bashrc`, or a wrapper script).

### 3. Configure .env

```bash
# VPS connection
LINE_RELAY_HOST=root@YOUR_VPS_IP
LINE_RELAY_SCRIPT=/path/to/send-reply.js

# Matrix admin token (used for room search via Synapse Admin API)
MATRIX_ADMIN_TOKEN=your_matrix_admin_token

# Matrix Synapse URL on VPS (optional, default: http://127.0.0.1:8008)
# MATRIX_SYNAPSE_URL=http://127.0.0.1:8008

# SSH key path (optional, uses default if omitted)
# SSH_KEY=~/.ssh/id_rsa
```

### 4. Set SSH key permissions

```bash
chmod 600 ~/.ssh/id_rsa
```

## CLI Usage

### Search rooms

```bash
# List all bridged rooms
bin/line-rooms.sh

# Search by name (partial match)
bin/line-rooms.sh "Tanaka"

# Get room details by ID
bin/line-rooms.sh --id "!roomid:your.server"
```

### Send a message

```bash
# Send by room ID (recommended)
bin/line-send.sh "!roomid:your.server" "Hello!"

# Send by room name
bin/line-send.sh --room-name "Tanaka" --message "Hello!"
```

## Claude Code Integration

Copy the command definition to your Claude Code commands directory:

```bash
cp claude-code/line-reply.md ~/.claude/commands/
```

Then use it in Claude Code:

```
/line-reply Tanaka Hello!
```

Claude Code will search for the room, show you candidates for confirmation, and send the message.

> **Note:** If you cloned the repo to a path other than `~/line-reply`, update the script paths in `claude-code/line-reply.md`.

## Troubleshooting

- **SSH connection fails**: Scripts auto-retry up to 2 times with 10s intervals. Check that your SSH key is configured and the VPS is reachable.
- **"Room not found"**: The room name search is case-insensitive partial match. Try different keywords.
- **"Send failed"**: The LINE bridge session may have expired. Re-login via `mautrix-meta` on the VPS.
- **"MATRIX_TOKEN is required"**: Set the `MATRIX_TOKEN` environment variable on the VPS where `send-reply.js` runs.

## License

MIT
