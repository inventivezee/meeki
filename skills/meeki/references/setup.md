# Setup

## MCP

Run the local stdio server with:

```bash
meeki mcp
```

A generic client configuration is:

```json
{
  "mcpServers": {
    "meeki": {
      "command": "meeki",
      "args": ["mcp"]
    }
  }
}
```

Restart the client after changing its MCP configuration.

## CLI

The CLI currently installs from source:

```bash
git clone https://github.com/inventivezee/Meety.git
cd meeki
cargo install --locked --path apps/cli
meeki --version
```

Run the Meeki desktop app at least once so its local database exists. Homebrew, desktop-bundled, and Windows binary distribution are planned but not yet available.

Use `--db-path FILE` or `MEEKI_DB_PATH` only when the database is outside Meeki's default application-data location.
