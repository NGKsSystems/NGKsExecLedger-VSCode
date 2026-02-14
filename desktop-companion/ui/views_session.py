"""
NGKs ExecLedger Desktop - Session Detail View
Shows contract, summary, and report for selected session
"""
import json
import os
import subprocess
import sys
from pathlib import Path
from PySide6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QTabWidget, 
                               QTextEdit, QLabel, QPushButton, QMessageBox)
from PySide6.QtCore import Qt

from .widgets import LogDisplay
from .models import artifactsContract

class SessionView(QWidget):
    """View for displaying session details"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.current_contract: artifactsContract = None
        self.setup_ui()
    
    def setup_ui(self):
        layout = QVBoxLayout(self)
        
        # Header with buttons
        header = QHBoxLayout()
        header.addWidget(QLabel("Session Details"))
        
        # Action buttons
        self.open_folder_btn = QPushButton("Open Artifacts Folder")
        self.open_summary_btn = QPushButton("Open Summary File")
        self.open_report_btn = QPushButton("Open Report File")
        
        self.open_folder_btn.clicked.connect(self.open_artifacts_folder)
        self.open_summary_btn.clicked.connect(self.open_summary_file)
        self.open_report_btn.clicked.connect(self.open_report_file)
        
        # Initially disabled until session is loaded
        self.open_folder_btn.setEnabled(False)
        self.open_summary_btn.setEnabled(False)
        self.open_report_btn.setEnabled(False)
        
        header.addStretch()
        header.addWidget(self.open_folder_btn)
        header.addWidget(self.open_summary_btn)
        header.addWidget(self.open_report_btn)
        
        layout.addLayout(header)
        
        # Tab widget for different views
        self.tab_widget = QTabWidget()
        layout.addWidget(self.tab_widget)
        
        # Contract tab
        self.contract_text = QTextEdit()
        self.contract_text.setReadOnly(True)
        self.contract_text.setFont(self._get_monospace_font())
        self.tab_widget.addTab(self.contract_text, "Contract")
        
        # Summary tab
        self.summary_text = QTextEdit()
        self.summary_text.setReadOnly(True)
        self.tab_widget.addTab(self.summary_text, "Summary")
        
        # Report tab
        self.report_text = QTextEdit()
        self.report_text.setReadOnly(True)
        self.tab_widget.addTab(self.report_text, "Report")
        
        # Log display
        layout.addWidget(QLabel("Session Log:"))
        self.log = LogDisplay()
        layout.addWidget(self.log)
    
    def _get_monospace_font(self):
        """Get monospace font for JSON display"""
        from PySide6.QtGui import QFont
        font = QFont("Consolas", 10)
        if not font.exactMatch():
            font = QFont("Courier New", 10)
        return font
    
    def load_contract(self, contract_dict: dict):
        """Load session contract and populate UI"""
        try:
            self.current_contract = artifactsContract.from_dict(contract_dict)
            
            # Display contract JSON
            contract_json = json.dumps(contract_dict, indent=2)
            self.contract_text.setPlainText(contract_json)
            
            # Load summary file content
            self.load_summary_content()
            
            # Load report file content  
            self.load_report_content()
            
            # Enable action buttons
            self.open_folder_btn.setEnabled(True)
            self.open_summary_btn.setEnabled(True)
            self.open_report_btn.setEnabled(True)
            
            # Show any warnings
            if self.current_contract.warnings:
                for warning in self.current_contract.warnings:
                    self.log.log_warning(warning)
            
            self.log.log_info(f"Loaded session: {self.current_contract.session_id}")
            
        except Exception as e:
            self.log.log_error(f"Failed to load contract: {e}")
    
    def load_summary_content(self):
        """Load summary file content if it exists"""
        if not self.current_contract:
            return
        
        try:
            summary_path = Path(self.current_contract.summary_file)
            if summary_path.exists():
                with open(summary_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                self.summary_text.setPlainText(content)
                self.log.log_info("Summary content loaded")
            else:
                self.summary_text.setPlainText("Summary file not found")
                self.log.log_warning("Summary file missing")
                
        except Exception as e:
            self.summary_text.setPlainText(f"Error loading summary: {e}")
            self.log.log_error(f"Failed to load summary: {e}")
    
    def load_report_content(self):
        """Load report file content if it exists"""
        if not self.current_contract:
            return
        
        try:
            report_path = Path(self.current_contract.report_file)
            if report_path.exists():
                with open(report_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                self.report_text.setPlainText(content)
                self.log.log_info("Report content loaded")
            else:
                self.report_text.setPlainText("Report file not found")
                self.log.log_warning("Report file missing")
                
        except Exception as e:
            self.report_text.setPlainText(f"Error loading report: {e}")
            self.log.log_error(f"Failed to load report: {e}")
    
    def open_artifacts_folder(self):
        """Open artifacts folder in OS file explorer"""
        if not self.current_contract:
            return
        
        try:
            folder_path = Path(self.current_contract.artifacts_folder)
            if folder_path.exists():
                self._open_path(folder_path)
                self.log.log_info("Opened artifacts folder")
            else:
                QMessageBox.warning(self, "Error", "Artifacts folder does not exist")
                
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to open artifacts folder: {e}")
            self.log.log_error(f"Failed to open artifacts folder: {e}")
    
    def open_summary_file(self):
        """Open summary file in default application"""
        if not self.current_contract:
            return
        
        try:
            file_path = Path(self.current_contract.summary_file)
            if file_path.exists():
                self._open_path(file_path)
                self.log.log_info("Opened summary file")
            else:
                QMessageBox.warning(self, "Error", "Summary file does not exist")
                
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to open summary file: {e}")
            self.log.log_error(f"Failed to open summary file: {e}")
    
    def open_report_file(self):
        """Open report file in default application"""
        if not self.current_contract:
            return
        
        try:
            file_path = Path(self.current_contract.report_file)
            if file_path.exists():
                self._open_path(file_path)
                self.log.log_info("Opened report file")
            else:
                QMessageBox.warning(self, "Error", "Report file does not exist")
                
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to open report file: {e}")
            self.log.log_error(f"Failed to open report file: {e}")
    
    def _open_path(self, path: Path):
        """Open path in OS using appropriate method"""
        if sys.platform == "win32":
            os.startfile(str(path))
        elif sys.platform == "darwin":
            subprocess.run(["open", str(path)])
        else:
            subprocess.run(["xdg-open", str(path)])
    
    def clear_session(self):
        """Clear the current session display"""
        self.current_contract = None
        self.contract_text.clear()
        self.summary_text.clear()
        self.report_text.clear()
        self.log.clear_log()
        
        # Disable action buttons
        self.open_folder_btn.setEnabled(False)
        self.open_summary_btn.setEnabled(False)
        self.open_report_btn.setEnabled(False)