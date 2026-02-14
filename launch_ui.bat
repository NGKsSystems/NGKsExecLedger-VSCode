@echo off
REM NGKs ExecLedger Desktop UI Launcher (Windows)
REM Simple batch file to launch the PySide6 desktop application

echo Starting NGKs ExecLedger Desktop UI...
python launch_ui.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Failed to launch desktop UI. 
    echo Make sure Python and PySide6 are installed:
    echo   pip install PySide6
    pause
)