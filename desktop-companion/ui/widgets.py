"""
NGKs ExecLedger Desktop - Shared Widgets
"""
from PySide6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QTextEdit, 
                               QLabel, QPushButton, QLineEdit, QFileDialog,
                               QComboBox, QFrame, QDialog, QDialogButtonBox,
                               QFormLayout, QMessageBox)
from PySide6.QtCore import Qt, Signal
from pathlib import Path

class PathSelector(QWidget):
    """Widget for selecting paths with browse button"""
    pathChanged = Signal(str)
    
    def __init__(self, label_text: str = "Path:", parent=None):
        super().__init__(parent)
        self.setup_ui(label_text)
    
    def setup_ui(self, label_text: str):
        layout = QHBoxLayout(self)
        
        self.label = QLabel(label_text)
        self.line_edit = QLineEdit()
        self.browse_button = QPushButton("Browse...")
        
        layout.addWidget(self.label)
        layout.addWidget(self.line_edit, 1)
        layout.addWidget(self.browse_button)
        
        self.browse_button.clicked.connect(self.browse_path)
        self.line_edit.textChanged.connect(self.pathChanged.emit)
    
    def browse_path(self):
        """Open file dialog to select directory"""
        path = QFileDialog.getExistingDirectory(self, "Select Directory", self.line_edit.text())
        if path:
            self.set_path(path)
    
    def set_path(self, path: str):
        """Set the current path"""
        self.line_edit.setText(path)
    
    def get_path(self) -> str:
        """Get the current path"""
        return self.line_edit.text()

class LogDisplay(QTextEdit):
    """Text area for displaying logs and status messages"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setReadOnly(True)
        self.setMaximumHeight(150)
    
    def log_info(self, message: str):
        """Add info message to log"""
        self.append(f"[INFO] {message}")
    
    def log_error(self, message: str):
        """Add error message to log"""
        self.append(f"[ERROR] {message}")
    
    def log_warning(self, message: str):
        """Add warning message to log"""
        self.append(f"[WARNING] {message}")
    
    def clear_log(self):
        """Clear the log display"""
        self.clear()

class TierSelector(QWidget):
    """Widget for selecting tier level (development simulation)"""
    tierChanged = Signal(str)
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setup_ui()
    
    def setup_ui(self):
        layout = QHBoxLayout(self)
        
        self.label = QLabel("Tier (DEV):")
        self.combo = QComboBox()
        self.combo.addItems(["FREE", "PRO", "PREMIUM"])
        
        layout.addWidget(self.label)
        layout.addWidget(self.combo)
        
        self.combo.currentTextChanged.connect(self.tierChanged.emit)
    
    def set_tier(self, tier: str):
        """Set the current tier"""
        index = self.combo.findText(tier)
        if index >= 0:
            self.combo.setCurrentIndex(index)
    
    def get_tier(self) -> str:
        """Get the current tier"""
        return self.combo.currentText()

class SeparatorLine(QFrame):
    """Horizontal separator line"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFrameShape(QFrame.HLine)

class ProjectSelector(QWidget):
    """Widget for selecting projects with management buttons"""
    projectChanged = Signal(str)  # Emits project name
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setup_ui()
    
    def setup_ui(self):
        layout = QHBoxLayout(self)
        
        # Project dropdown
        self.label = QLabel("Project:")
        self.combo = QComboBox()
        self.combo.setMinimumWidth(150)
        
        # Management buttons
        self.add_edit_button = QPushButton("Add/Edit")
        self.remove_button = QPushButton("Remove")
        
        layout.addWidget(self.label)
        layout.addWidget(self.combo)
        layout.addWidget(self.add_edit_button)
        layout.addWidget(self.remove_button)
        
        # Connect signals
        self.combo.currentTextChanged.connect(self.projectChanged.emit)
    
    def update_projects(self, projects: list, active_project: str):
        """Update the project list and set active project"""
        self.combo.blockSignals(True)
        self.combo.clear()
        
        project_names = [proj["name"] for proj in projects]
        self.combo.addItems(project_names)
        
        # Set active project
        if active_project in project_names:
            index = project_names.index(active_project)
            self.combo.setCurrentIndex(index)
        
        self.combo.blockSignals(False)
    
    def get_current_project(self) -> str:
        """Get currently selected project name"""
        return self.combo.currentText()
    
    def set_current_project(self, project_name: str):
        """Set current project selection"""
        index = self.combo.findText(project_name)
        if index >= 0:
            self.combo.setCurrentIndex(index)

class ProjectEditDialog(QDialog):
    """Dialog for adding/editing projects"""
    
    def __init__(self, project_name: str = "", project_root: str = "", parent=None):
        super().__init__(parent)
        self.setWindowTitle("Add/Edit Project")
        self.setModal(True)
        self.setMinimumSize(500, 300)
        
        self.setup_ui()
        
        # Pre-fill if editing
        if project_name:
            self.name_edit.setText(project_name)
            self.path_selector.set_path(project_root)
            self.update_artifacts_preview()
    
    def setup_ui(self):
        layout = QVBoxLayout(self)
        
        # Form layout
        form_layout = QFormLayout()
        
        self.name_edit = QLineEdit()
        self.path_selector = PathSelector("")
        
        # Add artifacts root preview
        self.artifacts_preview = QLabel("(will be derived from project root)")
        self.artifacts_preview.setStyleSheet("color: #666; font-style: italic;")
        
        form_layout.addRow("Project Name:", self.name_edit)
        form_layout.addRow("Project Root:", self.path_selector)
        form_layout.addRow("Artifacts Root:", self.artifacts_preview)
        
        layout.addLayout(form_layout)
        
        # Button box
        self.button_box = QDialogButtonBox(
            QDialogButtonBox.Ok | QDialogButtonBox.Cancel,
            Qt.Horizontal
        )
        layout.addWidget(self.button_box)
        
        # Connect signals
        self.button_box.accepted.connect(self.validate_and_accept)
        self.button_box.rejected.connect(self.reject)
        
        # Update artifacts preview when path changes
        self.path_selector.pathChanged.connect(self.update_artifacts_preview)
    
    def validate_and_accept(self):
        """Validate input and accept dialog"""
        name = self.name_edit.text().strip()
        path = self.path_selector.get_path().strip()
        
        if not name:
            QMessageBox.warning(self, "Invalid Input", "Project name cannot be empty.")
            return
        
        if not path:
            QMessageBox.warning(self, "Invalid Input", "Project root path cannot be empty.")
            return
        
        self.accept()
    
    def update_artifacts_preview(self):
        """Update the artifacts root preview based on current project root"""
        project_root = self.path_selector.get_path().strip()
        if project_root:
            # Import config module to use normalization and derive functions
            from .config import Config
            try:
                config = Config()
                # Normalize project root (auto-correct if _artifacts or execledger selected)
                normalized_project_root = config.normalize_project_root(project_root)
                artifacts_root = config.derive_artifacts_root(normalized_project_root)
                
                # Update the path selector if normalization changed the path
                if normalized_project_root != project_root:
                    self.path_selector.set_path(normalized_project_root)
                
                self.artifacts_preview.setText(artifacts_root)
            except Exception:
                self.artifacts_preview.setText("(invalid project root path)")
        else:
            self.artifacts_preview.setText("(will be derived from project root)")
    
    def get_project_data(self) -> tuple:
        """Get project name and project root"""
        return self.name_edit.text().strip(), self.path_selector.get_path().strip()
        self.setFrameShadow(QFrame.Sunken)