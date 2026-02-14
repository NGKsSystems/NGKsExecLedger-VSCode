"""
NGKs ExecLedger Desktop - Exports View
Export actions and tools
"""
import os
import sys
import subprocess
from pathlib import Path
from PySide6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QGridLayout,
                               QPushButton, QLabel, QFileDialog, QMessageBox)
from PySide6.QtCore import Qt

from .widgets import LogDisplay
from .engine_client import EngineClient

class ExportsView(QWidget):
    """View for export actions and tools"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.engine_client = EngineClient()
        self.artifacts_root = ""
        self.current_contract = None
        self.setup_ui()
    
    def setup_ui(self):
        layout = QVBoxLayout(self)
        
        # Header
        layout.addWidget(QLabel("Export Actions"))
        
        # Export buttons in grid
        grid = QGridLayout()
        
        # Row 1: Artifact Bundle actions
        self.open_latest_bundle_btn = QPushButton("Open Latest Artifacts Bundle")
        self.open_latest_bundle_btn.clicked.connect(self.open_latest_artifacts_bundle)
        grid.addWidget(self.open_latest_bundle_btn, 0, 0)
        
        self.export_contract_btn = QPushButton("Export Contract JSON")
        self.export_contract_btn.clicked.connect(self.export_contract_json)
        grid.addWidget(self.export_contract_btn, 0, 1)
        
        # Row 2: Future export actions (placeholder)
        self.export_summary_btn = QPushButton("Export Summary (Future)")
        self.export_summary_btn.setEnabled(False)
        grid.addWidget(self.export_summary_btn, 1, 0)
        
        self.export_report_btn = QPushButton("Export Report (Future)")
        self.export_report_btn.setEnabled(False)
        grid.addWidget(self.export_report_btn, 1, 1)
        
        # Row 3: Advanced exports (placeholder)
        self.create_bundle_btn = QPushButton("Create Artifacts Bundle (Future)")
        self.create_bundle_btn.setEnabled(False)
        grid.addWidget(self.create_bundle_btn, 2, 0)
        
        self.export_audit_btn = QPushButton("Export Audit Package (Future)")
        self.export_audit_btn.setEnabled(False)
        grid.addWidget(self.export_audit_btn, 2, 1)
        
        layout.addLayout(grid)
        
        # Separator
        layout.addWidget(QLabel(""))
        
        # Quick actions
        quick_layout = QHBoxLayout()
        quick_layout.addWidget(QLabel("Quick Actions:"))
        
        self.open_artifacts_root_btn = QPushButton("Open Artifacts Root")
        self.open_artifacts_root_btn.clicked.connect(self.open_artifacts_root_folder)
        quick_layout.addWidget(self.open_artifacts_root_btn)
        
        quick_layout.addStretch()
        layout.addLayout(quick_layout)
        
        layout.addStretch()
        
        # Log display
        layout.addWidget(QLabel("Export Log:"))
        self.log = LogDisplay()
        layout.addWidget(self.log)
    
    def set_artifacts_root(self, artifacts_root: str):
        """Set the artifacts root directory"""
        self.artifacts_root = artifacts_root
        self.log.log_info(f"Artifacts root set: {artifacts_root}")
    
    def set_current_contract(self, contract_dict: dict):
        """Set the current session contract"""
        self.current_contract = contract_dict
        self.export_contract_btn.setEnabled(True)
        self.log.log_info("Contract available for export")
    
    def open_latest_artifacts_bundle(self):
        """Open latest artifacts folder in OS file explorer"""
        if not self.artifacts_root:
            QMessageBox.warning(self, "Error", "No artifacts root set")
            return
        
        try:
            # Use engine to get latest session
            result = self.engine_client.get_latest_session(self.artifacts_root)
            
            if not result.ok:
                QMessageBox.critical(self, "Error", f"Failed to get latest session: {result.stderr}")
                self.log.log_error("Failed to get latest session")
                return
            
            artifacts_folder = result.contract.get('artifactsFolder', '')
            if artifacts_folder:
                folder_path = Path(artifacts_folder)
                if folder_path.exists():
                    self._open_path(folder_path)
                    self.log.log_info("Opened latest artifacts bundle")
                else:
                    QMessageBox.warning(self, "Error", "Artifacts folder does not exist")
            else:
                QMessageBox.warning(self, "Error", "No artifacts folder in contract")
                
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to open artifacts bundle: {e}")
            self.log.log_error(f"Failed to open artifacts bundle: {e}")
    
    def export_contract_json(self):
        """Export current contract to JSON file"""
        if not self.current_contract:
            QMessageBox.warning(self, "Error", "No contract to export")
            return
        
        try:
            # Open save dialog
            file_path, _ = QFileDialog.getSaveFileName(
                self,
                "Export Contract JSON",
                f"contract_{self.current_contract.get('sessionId', 'unknown')}.json",
                "JSON Files (*.json);;All Files (*)"
            )
            
            if not file_path:
                return
            
            # Use engine to export contract
            result = self.engine_client.export_contract_to_file(
                self.artifacts_root,
                file_path,
                # Extract exec/session from contract if available
                exec_id=self._extract_exec_id(),
                session_id=self.current_contract.get('sessionId')
            )
            
            if result.ok:
                self.log.log_info(f"Contract exported to: {file_path}")
                QMessageBox.information(self, "Success", f"Contract exported to: {file_path}")
            else:
                self.log.log_error("Failed to export contract")
                QMessageBox.critical(self, "Error", f"Failed to export contract: {result.stderr}")
                
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to export contract: {e}")
            self.log.log_error(f"Failed to export contract: {e}")
    
    def _extract_exec_id(self) -> str:
        """Extract exec ID from contract session root"""
        if not self.current_contract:
            return ""
        
        try:
            session_root = self.current_contract.get('sessionRoot', '')
            path_parts = Path(session_root).parts
            
            # Find exec_ folder in path
            for part in path_parts:
                if part.startswith('exec_'):
                    return part
            return ""
            
        except Exception:
            return ""
    
    def open_artifacts_root_folder(self):
        """Open artifacts root folder in OS file explorer"""
        if not self.artifacts_root:
            QMessageBox.warning(self, "Error", "No artifacts root set")
            return
        
        try:
            root_path = Path(self.artifacts_root)
            if root_path.exists():
                self._open_path(root_path)
                self.log.log_info("Opened artifacts root folder")
            else:
                QMessageBox.warning(self, "Error", "Artifacts root folder does not exist")
                
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to open artifacts root: {e}")
            self.log.log_error(f"Failed to open artifacts root: {e}")
    
    def _open_path(self, path: Path):
        """Open path in OS using appropriate method"""
        if sys.platform == "win32":
            os.startfile(str(path))
        elif sys.platform == "darwin":
            subprocess.run(["open", str(path)])
        else:
            subprocess.run(["xdg-open", str(path)])
    
    def clear_contract(self):
        """Clear current contract"""
        self.current_contract = None
        self.export_contract_btn.setEnabled(False)
        self.log.log_info("Contract cleared")