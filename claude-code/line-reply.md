---
description: Send a LINE message via Matrix bridge
argument-hint: <recipient name> <message>
allowed-tools:
  - Read
  - Bash
  - Grep
  - AskUserQuestion
  - Write
---

# /line-reply - Send LINE message

Arguments: $ARGUMENTS

## Rules

**Sending to the wrong recipient is irreversible. Always follow this flow.**

1. Never send using room_name alone. **Always identify the room_id first.**
2. Even if there's only one match, **confirm with the user before sending.**
3. If there are 0 or 2+ matches, let the user choose.

## Flow

### If arguments are provided → Direct reply flow

#### Step 1: Parse arguments

Extract "recipient name" and "message body" from arguments.

#### Step 2: Search rooms

```bash
~/line-reply/bin/line-rooms.sh "<search keyword>"
```

- Search with **both Japanese and romaji** names if applicable.
- Results are JSON with `name` and `members` fields.

#### Step 3: Show candidates to user (mandatory, never skip)

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

#### Step 4: Send (using room_id)

```bash
~/line-reply/bin/line-send.sh "<room_id>" "<message>"
```

**Never use `--room-name`. Always use room_id.**

#### Step 5: Report result

- Success: `Sent: <event_id>` -> "Sent to <room name>"
- Failure: Show error message and explain

---

### If no arguments → Inbox triage flow

#### Step 1: Fetch unread messages

```bash
~/line-reply/bin/line-inbox.sh
```

Returns JSON array: `[{room_id, room_name, sender, message, timestamp, time}]`

If empty array → "No unread LINE messages" and stop.

#### Step 2: Build triage table

Create a progress tracking table (same format as Messenger triage):

```markdown
# LINE 未読対応 — YYYY-MM-DD

## 対応済み

| # | チャット | 内容 | 送信メッセージ | 後続処理 |
|---|---------|------|---------------|---------|

## スルー（対応不要）

| # | チャット | 理由 |
|---|---------|------|

## 未対応

| # | チャット | プレビュー | 優先度 |
|---|---------|-----------|--------|
| 1 | Name    | message... | —      |
```

Populate "未対応" with all inbox items. Show the table to the user.

#### Step 3: Process each item

For each unread item, in order:

1. **Read context**: Read `~/clawd/private/mizuno_relationships.md` for relationship context with the sender. Check calendar with `gog calendar list` if schedule-related.
2. **Draft reply**: Propose a reply message based on context.
3. **User decision** via AskUserQuestion:
   - **Send** (with optional edits) → Send via `~/line-reply/bin/line-send.sh "<room_id>" "<message>"`, move to 対応済み
   - **Skip** → Move to スルー with reason
   - **Later** → Keep in 未対応, move to next item
4. **Update triage table** after each decision.

#### Step 4: Save triage file

After all items are processed, save the triage table:

```bash
# Write to ~/clawd/private/line_triage_YYYY-MM-DD.md
```

Then commit:
```bash
cd ~/clawd && git add -A && git commit -m "docs: LINE triage YYYY-MM-DD" && git push
```

## Notes

- SSH connections to the VPS may be unstable. Scripts auto-retry (max 2 times, 10s interval).
- Message path: Matrix admin user -> Matrix -> LINE bridge -> LINE API
- Requires active LINE bridge session (E2EE/Letter Sealing).
