#!/usr/bin/env python3
"""
NGKs ExecLedger Desktop UI Launcher

Simple launcher script for the PySide6 desktop application.
Usage: python launch_ui.py
"""
import sys
from pathlib import Path

# Add the project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# Import and run the desktop UI
if __name__ == "__main__":
    try:
        # Add the desktop-companion directory to path and import
        desktop_ui_path = project_root / "desktop-companion"
        sys.path.insert(0, str(desktop_ui_path))
        
        from ui.app import main
        main()
    except ImportError as e:
        print(f"Failed to import desktop UI: {e}")
        print("Make sure PySide6 is installed: pip install PySide6")
        sys.exit(1)
    except Exception as e:
        print(f"Failed to launch desktop UI: {e}")
        sys.exit(1)