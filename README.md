# claude-quota

A cross-platform status line script for Claude Code (Windows / macOS / Linux).

```
Context ██████     69%  |  Opus 5.5 (1M context)  |  Daily $142.07/$400 ███        35%
```

- **Context**: context window usage
- **Model**: current model name
- **Daily**: today's cost from the gateway `/v1/usage`, against a daily limit

Bars are green below 60%, yellow from 60% to 84%, red from 85%.

## Requirements

- Node.js 18+
- A terminal with 256-color support

## Install

Copy `claude-quota.mjs` to `~/.claude/`.

## Configure `settings.json`

Edit `~/.claude/settings.json` and add a `statusLine` entry.

macOS / Linux:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/claude-quota.mjs"
  }
}
```

Windows (use an absolute path with forward slashes):

```json
{
  "statusLine": {
    "type": "command",
    "command": "node C:/Users/<your-name>/.claude/claude-quota.mjs"
  }
}
```

The gateway token is read from `ANTHROPIC_AUTH_TOKEN`, either from the environment or from the `env` section of `settings.json`:

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "<your-token>"
  }
}
```

Restart Claude Code after editing.

## Options

Edit the constants at the top of the script:

| Constant | Default | Description |
|---|---|---|
| `GATEWAY_BASE_URL` | empty | Gateway base URL. Falls back to `ANTHROPIC_BASE_URL` when empty |
| `DAILY_LIMIT` | `400` | Daily cost limit in USD |
| `BAR_WIDTH` | `10` | Bar width in cells |
| `WARN_PCT` / `CRIT_PCT` | `60` / `85` | Yellow / red thresholds |
| `CACHE_TTL_SECONDS` | `60` | Cost cache refresh interval |

The cost is cached in `~/.claude/cache/claude-quota.json` and refreshed in a background process, so rendering never waits on the network.
