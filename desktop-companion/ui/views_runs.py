"""
NGKs ExecLedger Desktop - Runs List View
Shows exec_ folders and their sessions for navigation
"""
import os
from pathlib import Path
from PySide6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QListWidget, 
                               QListWidgetItem, QLabel, QPushButton, QSplitter)
from PySide6.QtCore import Qt, Signal

from .widgets import LogDisplay
from .models import ExecFolder, SessionInfo

class RunsView(QWidget):
    """View for browsing exec_ folders and sessions"""
    sessionSelected = Signal(str, str)  # exec_id, session_id
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.artifacts_root = ""
        self.setup_ui()
    
    def setup_ui(self):
        layout = QVBoxLayout(self)
        
        # Header
        header = QHBoxLayout()
        header.addWidget(QLabel("Artifact Runs"))
        self.refresh_button = QPushButton("Refresh")
        self.refresh_button.clicked.connect(self.refresh_runs)
        header.addWidget(self.refresh_button)
        layout.addLayout(header)
        
        # Splitter for exec folders and sessions
        splitter = QSplitter(Qt.Horizontal)
        layout.addWidget(splitter)
        
        # Left: Exec folders list
        exec_widget = QWidget()
        exec_layout = QVBoxLayout(exec_widget)
        exec_layout.addWidget(QLabel("Exec Folders:"))
        
        self.exec_list = QListWidget()
        self.exec_list.currentItemChanged.connect(self.on_exec_selected)
        exec_layout.addWidget(self.exec_list)
        
        splitter.addWidget(exec_widget)
        
        # Right: Sessions list
        session_widget = QWidget()
        session_layout = QVBoxLayout(session_widget)
        session_layout.addWidget(QLabel("Sessions:"))
        
        self.session_list = QListWidget()
        self.session_list.currentItemChanged.connect(self.on_session_selected)
        session_layout.addWidget(self.session_list)
        
        splitter.addWidget(session_widget)
        
        # Log display
        layout.addWidget(QLabel("Runs Log:"))
        self.log = LogDisplay()
        layout.addWidget(self.log)
    
    def set_artifacts_root(self, artifacts_root: str):
        """Set the artifacts root directory and refresh"""
        self.artifacts_root = artifacts_root
        self.refresh_runs()
    
    def refresh_runs(self):
        """Refresh the list of exec_ folders"""
        self.log.clear_log()
        self.exec_list.clear()
        self.session_list.clear()
        
        if not self.artifacts_root:
            self.log.log_warning("No artifacts root set")
            return
        
        artifacts_path = Path(self.artifacts_root)
        if not artifacts_path.exists():
            self.log.log_error(f"Artifacts root does not exist: {self.artifacts_root}")
            return
        
        try:
            # Find exec_ directories
            exec_folders = []
            for item in artifacts_path.iterdir():
                if item.is_dir() and item.name.startswith('exec_'):
                    exec_folders.append(item.name)
            
            exec_folders.sort(reverse=True)  # Newest first
            
            if not exec_folders:
                self.log.log_info("No exec_ folders found")
                return
            
            for exec_name in exec_folders:
                item = QListWidgetItem(exec_name)
                item.setData(Qt.UserRole, exec_name)
                self.exec_list.addItem(item)
            
            self.log.log_info(f"Found {len(exec_folders)} exec folders")
            
        except Exception as e:
            self.log.log_error(f"Failed to scan artifacts root: {e}")
    
    def on_exec_selected(self, current, previous):
        """Handle exec folder selection"""
        self.session_list.clear()
        
        if not current:
            return
        
        exec_name = current.data(Qt.UserRole)
        self.load_sessions(exec_name)
    
    def load_sessions(self, exec_name: str):
        """Load sessions for the selected exec folder"""
        try:
            exec_path = Path(self.artifacts_root) / exec_name / "milestone"
            
            if not exec_path.exists():
                self.log.log_warning(f"No milestone folder in {exec_name}")
                return
            
            sessions = []
            for item in exec_path.iterdir():
                if item.is_dir():
                    sessions.append(item.name)
            
            sessions.sort(reverse=True)  # Newest first (by name)
            
            for session_name in sessions:
                item = QListWidgetItem(session_name)
                item.setData(Qt.UserRole, (exec_name, session_name))
                self.session_list.addItem(item)
            
            self.log.log_info(f"Found {len(sessions)} sessions in {exec_name}")
            
        except Exception as e:
            self.log.log_error(f"Failed to load sessions for {exec_name}: {e}")
    
    def on_session_selected(self, current, previous):
        """Handle session selection"""
        if not current:
            return
        
        exec_name, session_name = current.data(Qt.UserRole)
        self.log.log_info(f"Selected session: {exec_name}/{session_name}")
        self.sessionSelected.emit(exec_name, session_name)