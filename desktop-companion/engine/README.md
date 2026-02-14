<!-- markdownlint-disable MD004 MD009 MD012 MD022 MD024 MD026 MD028 MD029 MD032 MD047 MD031 MD033 MD034 MD036 MD040 MD041 MD056 MD058 MD060-->


# NGKs ExecLedger Desktop Engine

Premium tier CLI engine that provides desktop-class access to artifacts session artifacts.

## Purpose
This engine reads exec_* artifacts folders and emits standardized JSON contracts for desktop consumption.
No VS Code dependency - pure Node.js CLI.

## Usage
```bash
node src/index.js --root "<artifactsRoot>" [options]
```

### Options
- `--latest`: Use latest exec folder and session (default behavior)
- `--exec "<exec_id>"`: Specify exact exec folder (e.g., "exec_1234567890")
- `--session "<session_id>"`: Specify exact session within exec folder
- `--out "<path>"`: Output JSON to file instead of stdout
- `--root "<path>"`: artifacts root directory (default: workspace_root/_artifacts)

### Exit Codes
- `0`: Success
- `2`: Contract violation (malformed artifacts structure)
- `3`: No sessions found
- `4`: Invalid arguments

### Output Contract
Emits JSON matching desktop-companion/interfaceSpec.json:
```json
{
  "sessionRoot": "/path/to/exec_xxx/milestone/session_id",
  "summaryFile": "/path/to/summary.txt",
  "reportFile": "/path/to/report.txt", 
  "artifactsFolder": "/path/to/session_folder",
  "sessionId": "session_id_string",
  "createdAt": "ISO_timestamp",
  "warnings": ["optional", "warnings"],
  "hashes": {}
}
```

### Requirements
- Node.js 18+
- No external dependencies (pure fs/path)
- Must match RetrievalController behavior exactly