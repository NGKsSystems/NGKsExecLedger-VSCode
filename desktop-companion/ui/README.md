<!-- markdownlint-disable MD004 MD009 MD012 MD022 MD024 MD026 MD028 MD029 MD032 MD047 MD031 MD033 MD034 MD036 MD040 MD041 MD056 MD058 MD060-->


# NGKs ExecLedger Desktop UI

Premium desktop application for accessing ExecLedger artifacts session artifacts.

## Overview
This PySide6 application provides a professional desktop interface for browsing and managing ExecLedger artifacts sessions. It calls the Node.js engine for all artifacts data access, ensuring consistency with the VS Code extension.

## Features
- **Runs View**: Browse exec_ folders and sessions
- **Session View**: Display contracts, summaries, and reports
- **Exports View**: Export contracts and access artifacts bundles  
- **Diagnostics View**: Development debugging (DEV_MODE only)

## Requirements
- Python 3.8+
- PySide6 6.6.0+
- Node.js 18+ (for engine)
- Existing Node.js engine at: `../engine/src/index.js`

## Installation
```bash
pip install -r requirements.txt
```

## Usage
```bash
# Run the application
python app.py

# Or as module
python -m desktop-companion.ui.app
```

## Configuration
Configuration is stored in `ui_config.json` (auto-created):
- `artifacts_root`: Root directory for artifacts outputs
- `dev_mode`: Enable diagnostics view (1/0)
- `tier`: Simulated tier level (FREE/PRO/PREMIUM)

## Development
The application runs in development mode by default (`dev_mode=1`), which:
- Shows the Diagnostics tab for debugging engine calls
- Displays tier selector in top bar
- Enables detailed logging

## Architecture
- **app.py**: Main application and window
- **config.py**: Configuration management
- **engine_client.py**: Node.js engine communication
- **models.py**: Data structures
- **widgets.py**: Shared UI components
- **views_*.py**: Individual view implementations

## Engine Integration
The UI does NOT implement filesystem logic. All artifacts data access goes through the Node.js engine:
- Latest session: `node engine/src/index.js --root <path> --latest`
- Specific session: `node engine/src/index.js --root <path> --exec <id> --session <id>`

## Future Enhancements
This UI is designed to evolve into the paid Premium product with:
- Licensing system integration
- Advanced export formats
- Audit package generation
- Enterprise features