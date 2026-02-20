---
description: Send a LINE message via Matrix bridge
argument-hint: <recipient name> <message>
allowed-tools:
  - Read
  - Bash
  - Grep
  - AskUserQuestion
---

# /line-reply - Send LINE message

Arguments: $ARGUMENTS

## Rules

**Sending to the wrong recipient is irreversible. Always follow this flow.**

1. Never send using room_name alone. **Always identify the room_id first.**
2. Even if there's only one match, **confirm with the user before sending.**
3. If there are 0 or 2+ matches, let the user choose.

## Flow

### Step 1: Parse arguments

Extract "recipient name" and "message body" from arguments.
- If empty, use AskUserQuestion to ask for both.

### Step 2: Search rooms

```bash
~/line-reply/bin/line-rooms.sh "<search keyword>"
```

- Search with **both Japanese and romaji** names if applicable.
- Results are JSON with `name` and `members` fields.

### Step 3: Show candidates to user (mandatory, never skip)

Display search results in a table:

```
## Confirm LINE recipient

| # | Room name | Members | Type |
|---|-----------|---------|------|
| 1 | Example   | 3       | 1:1 DM |
| 2 | Group     | 5       | Group |

Message: Hello!
```

Type heuristic:
- Members 2-3 = `1:1 DM` (bridge bot + ghost + admin)
- Members 4+ = `Group`

**Use AskUserQuestion to let user select.** Always confirm, even with 1 result.

### Step 4: Send (using room_id)

Send using the **room_id** of the user's selection:

```bash
~/line-reply/bin/line-send.sh "<room_id>" "<message>"
```

**Never use `--room-name`. Always use room_id.**

### Step 5: Report result

- Success: `Sent: <event_id>` -> "Sent to <room name>"
- Failure: Show error message and explain

## Notes

- SSH connections to the VPS may be unstable. Scripts auto-retry (max 2 times, 10s interval).
- Message path: Matrix admin user -> Matrix -> LINE bridge -> LINE API
- Requires active LINE bridge session (E2EE/Letter Sealing).
