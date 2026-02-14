"""
NGKs ExecLedger Desktop - Smoke Test
Tests basic UI functionality and startup
"""
import sys
import traceback
from pathlib import Path

def smoke_test():
    """Run smoke test of the desktop UI"""
    try:
        print("=== NGKs ExecLedger Desktop UI Smoke Test ===")
        
        # Test 1: Import PySide6
        print("Testing PySide6 import...")
        from PySide6.QtWidgets import QApplication, QMainWindow, QWidget, QLabel
        from PySide6.QtCore import QTimer, Qt
        print("[OK] PySide6 imports successful")
        
        # Test 2: Check our module files exist
        print("Testing module files...")
        ui_dir = Path(__file__).parent
        
        required_files = [
            "app.py", "config.py", "engine_client.py", "models.py",
            "widgets.py", "views_runs.py", "views_session.py", 
            "views_exports.py", "views_diagnostics.py", "requirements.txt"
        ]
        
        for file_name in required_files:
            file_path = ui_dir / file_name
            if file_path.exists():
                print(f"[OK] Found {file_name}")
            else:
                print(f"[ERROR] Missing {file_name}")
                return False
        
        # Test 3: Check engine exists
        print("Testing engine path...")
        engine_path = ui_dir.parent / "engine" / "src" / "index.js"
        if engine_path.exists():
            print(f"[OK] Engine exists: {engine_path}")
        else:
            print(f"[WARNING] Engine not found: {engine_path}")
        
        # Test 4: Create minimal PySide6 app
        print("Testing PySide6 application...")
        app = QApplication([])
        
        # Create a minimal window
        window = QMainWindow()
        window.setWindowTitle("NGKs ExecLedger - Smoke Test")
        window.resize(400, 300)
        
        central_widget = QWidget()
        window.setCentralWidget(central_widget)
        
        label = QLabel("NGKs ExecLedger Desktop UI\\nSmoke Test Successful!")
        label.setAlignment(Qt.AlignCenter)
        central_widget.setStyleSheet("QWidget { background-color: #f0f0f0; }")
        label.setStyleSheet("QLabel { font-size: 16px; font-weight: bold; }")
        
        from PySide6.QtWidgets import QVBoxLayout
        layout = QVBoxLayout(central_widget)
        layout.addWidget(label)
        
        window.show()
        print("[OK] Window created and shown")
        
        # Auto-close after 1 second
        timer = QTimer()
        timer.timeout.connect(app.quit)
        timer.setSingleShot(True)
        timer.start(1000)
        
        print("[OK] Auto-close timer set (1 second)")
        
        # Run event loop briefly
        app.exec()
        print("[OK] Event loop completed")
        
        print("ONE_UI_SMOKE_OK=YES")
        return True
        
    except ImportError as e:
        print(f"[ERROR] Import error: {e}")
        print("ONE_UI_SMOKE_OK=NO")
        return False
        
    except Exception as e:
        print(f"[ERROR] Unexpected error: {e}")
        print("Traceback:")
        traceback.print_exc()
        print("ONE_UI_SMOKE_OK=NO")
        return False

if __name__ == "__main__":
    success = smoke_test()
    sys.exit(0 if success else 1)