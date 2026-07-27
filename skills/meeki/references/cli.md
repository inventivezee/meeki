# CLI commands

Use `--json` for agent-readable output.

```bash
meeki --json doctor
meeki --json meetings list --query "planning" --limit 20 --offset 0
meeki --json meetings get MEETING_ID
meeki --json meetings note MEETING_ID --kind note
meeki --json meetings note MEETING_ID --kind summary
meeki --json meetings history MEETING_ID --limit 20 --offset 0
```

`doctor` exits with status 1 when its response contains `ready: false`.

Read transcripts in bounded word pages:

```bash
meeki --json meetings transcript MEETING_ID --limit 200 --offset 0
```

JSON success responses contain `schema_version`, `command`, `data`, and optional `pagination`. Continue from `pagination.next_offset` only when more context is necessary.

Export is intended for an explicit user request to save or transfer a complete meeting:

```bash
meeki meetings export MEETING_ID --format markdown --output meeting.md
meeki meetings export MEETING_ID --format json --output meeting.json
```

Export refuses to replace an existing file. Pass `--force` only after the user explicitly approves overwriting that exact path.

Global database overrides:

```bash
meeki --db-path /path/to/app.db --json meetings list
meeki --base /path/to/meeki-data --json meetings list
```
