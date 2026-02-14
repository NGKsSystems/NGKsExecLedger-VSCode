"""
NGKs ExecLedger Desktop - Diagnostics View
Development diagnostics and debugging (DEV_MODE only)
"""
import json
from PySide6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QTextEdit,
                               QLabel, QPushButton, QSplitter, QGroupBox)
from PySide6.QtCore import Qt
from PySide6.QtGui import QFont

from .widgets import LogDisplay
from .engine_client import EngineClient

class DiagnosticsView(QWidget):
    """View for development diagnostics and debugging"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.engine_client = None
        self.setup_ui()
    
    def setup_ui(self):
        layout = QVBoxLayout(self)
        
        # Header
        header = QHBoxLayout()
        header.addWidget(QLabel("Development Diagnostics"))
        
        self.clear_btn = QPushButton("Clear All")
        self.clear_btn.clicked.connect(self.clear_diagnostics)
        header.addWidget(self.clear_btn)
        
        layout.addLayout(header)
        
        # Splitter for different diagnostic sections
        splitter = QSplitter(Qt.Vertical)
        layout.addWidget(splitter)
        
        # Last Engine Command section
        cmd_group = QGroupBox("Last Engine Command")
        cmd_layout = QVBoxLayout(cmd_group)
        
        self.command_text = QTextEdit()
        self.command_text.setReadOnly(True)
        self.command_text.setMaximumHeight(60)
        self.command_text.setFont(self._get_monospace_font())
        cmd_layout.addWidget(self.command_text)
        
        splitter.addWidget(cmd_group)
        
        # Engine Output section
        output_group = QGroupBox("Engine Output")
        output_layout = QVBoxLayout(output_group)
        
        # Stdout/Stderr tabs
        output_splitter = QSplitter(Qt.Horizontal)
        
        # Stdout
        stdout_widget = QWidget()
        stdout_layout = QVBoxLayout(stdout_widget)
        stdout_layout.addWidget(QLabel("STDOUT:"))
        self.stdout_text = QTextEdit()
        self.stdout_text.setReadOnly(True)
        self.stdout_text.setFont(self._get_monospace_font())
        stdout_layout.addWidget(self.stdout_text)
        output_splitter.addWidget(stdout_widget)
        
        # Stderr
        stderr_widget = QWidget()
        stderr_layout = QVBoxLayout(stderr_widget)
        stderr_layout.addWidget(QLabel("STDERR:"))
        self.stderr_text = QTextEdit()
        self.stderr_text.setReadOnly(True)
        self.stderr_text.setFont(self._get_monospace_font())
        stderr_layout.addWidget(self.stderr_text)
        output_splitter.addWidget(stderr_widget)
        
        output_layout.addWidget(output_splitter)
        
        # Exit code
        exit_layout = QHBoxLayout()
        exit_layout.addWidget(QLabel("Exit Code:"))
        self.exit_code_label = QLabel("N/A")
        self.exit_code_label.setStyleSheet("font-weight: bold;")
        exit_layout.addWidget(self.exit_code_label)
        exit_layout.addStretch()
        output_layout.addLayout(exit_layout)
        
        splitter.addWidget(output_group)
        
        # Contract JSON section
        json_group = QGroupBox("Last Contract JSON")
        json_layout = QVBoxLayout(json_group)
        
        self.json_text = QTextEdit()
        self.json_text.setReadOnly(True)
        self.json_text.setFont(self._get_monospace_font())
        json_layout.addWidget(self.json_text)
        
        splitter.addWidget(json_group)
        
        # Warnings section
        warnings_group = QGroupBox("Contract Warnings")
        warnings_layout = QVBoxLayout(warnings_group)
        
        self.warnings_text = QTextEdit()
        self.warnings_text.setReadOnly(True)
        self.warnings_text.setMaximumHeight(80)
        warnings_layout.addWidget(self.warnings_text)
        
        splitter.addWidget(warnings_group)
        
        # Set splitter proportions
        splitter.setStretchFactor(0, 0)  # Command (minimal)
        splitter.setStretchFactor(1, 2)  # Output (medium)
        splitter.setStretchFactor(2, 3)  # JSON (large)
        splitter.setStretchFactor(3, 1)  # Warnings (small)
        
        # Log display
        layout.addWidget(QLabel("Diagnostics Log:"))
        self.log = LogDisplay()
        layout.addWidget(self.log)
    
    def _get_monospace_font(self) -> QFont:
        """Get monospace font for code display"""
        font = QFont("Consolas", 9)
        if not font.exactMatch():
            font = QFont("Courier New", 9)
        return font
    
    def set_engine_client(self, engine_client: EngineClient):
        """Set engine client for diagnostics"""
        self.engine_client = engine_client
        self.refresh_diagnostics()
    
    def refresh_diagnostics(self):
        """Refresh diagnostics from last engine result"""
        if not self.engine_client:
            self.log.log_warning("No engine client set")
            return
        
        last_result = self.engine_client.get_last_diagnostic()
        if not last_result:
            self.log.log_info("No engine execution results available")
            self.clear_diagnostics()
            return
        
        try:
            # Command
            cmd_str = " ".join(last_result.cmd)
            self.command_text.setPlainText(cmd_str)
            
            # Output
            self.stdout_text.setPlainText(last_result.stdout or "")
            self.stderr_text.setPlainText(last_result.stderr or "")
            
            # Exit code with color coding
            exit_code = last_result.code
            self.exit_code_label.setText(str(exit_code))
            
            if exit_code == 0:
                self.exit_code_label.setStyleSheet("color: green; font-weight: bold;")
            else:
                self.exit_code_label.setStyleSheet("color: red; font-weight: bold;")
            
            # Contract JSON
            if last_result.contract:
                json_str = json.dumps(last_result.contract, indent=2)
                self.json_text.setPlainText(json_str)
                
                # Extract warnings
                warnings = last_result.contract.get('warnings', [])
                if warnings:
                    warnings_str = "\\n".join(f"• {w}" for w in warnings)
                    self.warnings_text.setPlainText(warnings_str)
                    self.warnings_text.setStyleSheet("color: orange;")
                else:
                    self.warnings_text.setPlainText("No warnings")
                    self.warnings_text.setStyleSheet("color: green;")
            else:
                self.json_text.setPlainText("No contract data (engine failed)")
                self.warnings_text.setPlainText("Contract failed to generate")
                self.warnings_text.setStyleSheet("color: red;")
            
            self.log.log_info("Diagnostics refreshed")
            
        except Exception as e:
            self.log.log_error(f"Failed to refresh diagnostics: {e}")
    
    def clear_diagnostics(self):
        """Clear all diagnostic displays"""
        self.command_text.clear()
        self.stdout_text.clear()
        self.stderr_text.clear()
        self.json_text.clear()
        self.warnings_text.clear()
        self.exit_code_label.setText("N/A")
        self.exit_code_label.setStyleSheet("font-weight: bold;")
        self.log.clear_log()
        self.log.log_info("Diagnostics cleared")