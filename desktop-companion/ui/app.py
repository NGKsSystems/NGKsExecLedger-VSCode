"""
NGKs ExecLedger Desktop - Main Application
PySide6 desktop UI for Premium ExecLedger access
"""
import sys
from pathlib import Path
from PySide6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                               QHBoxLayout, QStackedWidget, QListWidget, 
                               QListWidgetItem, QPushButton, QLabel, QSplitter,
                               QStatusBar, QMessageBox, QDialog)
from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QIcon

from .config import config
from .engine_client import EngineClient
from .widgets import PathSelector, TierSelector, SeparatorLine, ProjectSelector, ProjectEditDialog
from .views_runs import RunsView
from .views_session import SessionView
from .views_exports import ExportsView
from .views_diagnostics import DiagnosticsView

class MainWindow(QMainWindow):
    """Main application window"""
    
    def __init__(self):
        super().__init__()
        self.engine_client = EngineClient()
        self.setup_ui()
        self.connect_signals()
        self.load_initial_state()
    
    def setup_ui(self):
        """Setup the main UI"""
        self.setWindowTitle("NGKs ExecLedger — Desktop")
        self.setMinimumSize(1200, 800)
        
        # Central widget
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        layout = QVBoxLayout(central_widget)
        
        # Top bar
        self.setup_top_bar(layout)
        
        # Main content area
        main_splitter = QSplitter(Qt.Horizontal)
        layout.addWidget(main_splitter)
        
        # Left navigation
        self.setup_navigation(main_splitter)
        
        # Right content area
        self.setup_content_area(main_splitter)
        
        # Set splitter proportions
        main_splitter.setStretchFactor(0, 0)  # Navigation (fixed-ish)
        main_splitter.setStretchFactor(1, 1)  # Content (expandable)
        main_splitter.setSizes([200, 1000])
        
        # Status bar
        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)
        self.status_bar.showMessage("Ready")
    
    def setup_top_bar(self, parent_layout):
        """Setup top toolbar with project selector"""
        top_widget = QWidget()
        top_layout = QHBoxLayout(top_widget)
        
        # Project selector section
        self.project_selector = ProjectSelector()
        top_layout.addWidget(self.project_selector)
        
        # Separator
        top_layout.addWidget(SeparatorLine())
        
        # Artifacts root selector
        self.artifacts_root_selector = PathSelector("Artifacts Root:")
        top_layout.addWidget(self.artifacts_root_selector)
        
        # Actions
        self.refresh_button = QPushButton("Refresh")
        self.load_latest_button = QPushButton("Load Latest")
        
        top_layout.addWidget(self.refresh_button)
        top_layout.addWidget(self.load_latest_button)
        
        # Tier selector (dev mode)
        if config.dev_mode:
            top_layout.addWidget(SeparatorLine())
            self.tier_selector = TierSelector()
            top_layout.addWidget(self.tier_selector)
        else:
            self.tier_selector = None
        
        parent_layout.addWidget(top_widget)
    
    def setup_navigation(self, parent_splitter):
        """Setup left navigation panel"""
        nav_widget = QWidget()
        nav_layout = QVBoxLayout(nav_widget)
        
        nav_layout.addWidget(QLabel("Views:"))
        
        self.nav_list = QListWidget()
        self.nav_list.setMaximumWidth(180)
        
        # Add navigation items
        self.add_nav_item("Runs", 0)
        self.add_nav_item("Session", 1)
        self.add_nav_item("Exports", 2)
        
        # Diagnostics only in dev mode
        if config.dev_mode:
            self.add_nav_item("Diagnostics", 3)
        
        nav_layout.addWidget(self.nav_list)
        nav_layout.addStretch()
        
        parent_splitter.addWidget(nav_widget)
    
    def add_nav_item(self, name: str, index: int):
        """Add navigation item"""
        item = QListWidgetItem(name)
        item.setData(Qt.UserRole, index)
        self.nav_list.addItem(item)
    
    def setup_content_area(self, parent_splitter):
        """Setup right content area"""
        self.content_stack = QStackedWidget()
        
        # Create views
        self.runs_view = RunsView()
        self.session_view = SessionView()
        self.exports_view = ExportsView()
        self.diagnostics_view = DiagnosticsView()
        
        # Add to stack
        self.content_stack.addWidget(self.runs_view)      # 0
        self.content_stack.addWidget(self.session_view)   # 1
        self.content_stack.addWidget(self.exports_view)   # 2
        
        if config.dev_mode:
            self.content_stack.addWidget(self.diagnostics_view)  # 3
        
        parent_splitter.addWidget(self.content_stack)
    
    def connect_signals(self):
        """Connect UI signals"""
        # Navigation
        self.nav_list.currentItemChanged.connect(self.on_nav_changed)
        
        # Project management
        self.project_selector.projectChanged.connect(self.on_project_changed)
        self.project_selector.add_edit_button.clicked.connect(self.on_add_edit_project)
        self.project_selector.remove_button.clicked.connect(self.on_remove_project)
        
        # Top bar
        self.artifacts_root_selector.pathChanged.connect(self.on_artifacts_root_changed)
        self.refresh_button.clicked.connect(self.refresh_current_view)
        self.load_latest_button.clicked.connect(self.load_latest_session)
        
        if self.tier_selector:
            self.tier_selector.tierChanged.connect(self.on_tier_changed)
        
        # Cross-view communication
        self.runs_view.sessionSelected.connect(self.on_session_selected)
    
    def load_initial_state(self):
        """Load initial application state"""
        # Load projects and set active project
        self.refresh_project_selector()
        
        # Set initial artifacts root from active project
        self.artifacts_root_selector.set_path(config.artifacts_root)
        
        # Set initial tier
        if self.tier_selector:
            self.tier_selector.set_tier(config.tier)
        
        # Select first navigation item
        if self.nav_list.count() > 0:
            self.nav_list.setCurrentRow(0)
        
        # Set engine client for diagnostics
        if config.dev_mode:
            self.diagnostics_view.set_engine_client(self.engine_client)
        
        self.update_status_display()
    
    def on_nav_changed(self, current, previous):
        """Handle navigation change"""
        if current:
            index = current.data(Qt.UserRole)
            self.content_stack.setCurrentIndex(index)
            
            view_names = ["Runs", "Session", "Exports", "Diagnostics"]
            if index < len(view_names):
                self.status_bar.showMessage(f"View: {view_names[index]}")
    
    def on_artifacts_root_changed(self, path: str):
        """Handle artifacts root path change"""
        config.artifacts_root = path
        
        # Update all views
        self.runs_view.set_artifacts_root(path)
        self.exports_view.set_artifacts_root(path)
        
        self.status_bar.showMessage(f"Artifacts root: {path}")
    
    def on_tier_changed(self, tier: str):
        """Handle tier change"""
        config.tier = tier
        self.status_bar.showMessage(f"Tier changed: {tier}")
    
    def refresh_current_view(self):
        """Refresh the current view"""
        current_index = self.content_stack.currentIndex()
        
        if current_index == 0:  # Runs
            self.runs_view.refresh_runs()
        elif current_index == 3 and config.dev_mode:  # Diagnostics
            self.diagnostics_view.refresh_diagnostics()
        
        self.status_bar.showMessage("Refreshed")
    
    def load_latest_session(self):
        """Load latest session using engine"""
        if not config.artifacts_root:
            QMessageBox.warning(self, "Error", "No artifacts root set")
            return
        
        try:
            self.status_bar.showMessage("Loading latest session...")
            
            result = self.engine_client.get_latest_session(config.artifacts_root)
            
            if result.ok:
                # Update session view
                self.session_view.load_contract(result.contract)
                
                # Update exports view
                self.exports_view.set_current_contract(result.contract)
                
                # Switch to session view
                self.nav_list.setCurrentRow(1)
                
                # Update diagnostics if in dev mode
                if config.dev_mode:
                    self.diagnostics_view.refresh_diagnostics()
                
                session_id = result.contract.get('sessionId', 'unknown')
                self.status_bar.showMessage(f"Loaded latest session: {session_id}")
                
            else:
                QMessageBox.critical(self, "Error", f"Failed to load latest session: {result.stderr}")
                self.status_bar.showMessage("Failed to load latest session")
                
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to load latest session: {e}")
            self.status_bar.showMessage("Error loading latest session")
    
    def on_session_selected(self, exec_id: str, session_id: str):
        """Handle session selection from runs view"""
        if not config.artifacts_root:
            return
        
        try:
            self.status_bar.showMessage(f"Loading session: {exec_id}/{session_id}")
            
            result = self.engine_client.get_specific_session(config.artifacts_root, exec_id, session_id)
            
            if result.ok:
                # Update session view
                self.session_view.load_contract(result.contract)
                
                # Update exports view
                self.exports_view.set_current_contract(result.contract)
                
                # Switch to session view
                self.nav_list.setCurrentRow(1)
                
                # Update diagnostics if in dev mode
                if config.dev_mode:
                    self.diagnostics_view.refresh_diagnostics()
                
                self.status_bar.showMessage(f"Loaded session: {session_id}")
                
            else:
                QMessageBox.critical(self, "Error", f"Failed to load session: {result.stderr}")
                self.status_bar.showMessage("Failed to load session")
                
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to load session: {e}")
            self.status_bar.showMessage("Error loading session")

    # Project Management Methods
    def refresh_project_selector(self):
        """Refresh the project selector with current projects"""
        projects = config.get_projects()
        active_project = config.get_active_project_name()
        self.project_selector.update_projects(projects, active_project)
    
    def on_project_changed(self, project_name: str):
        """Handle project selection change"""
        if not project_name:
            return
        
        # Set active project in config
        config.set_active_project_by_name(project_name)
        
        # Update artifacts root display
        self.artifacts_root_selector.set_path(config.artifacts_root)
        
        # Clear current session data
        self.clear_session_data()
        
        # Refresh runs view if it exists
        if hasattr(self, 'runs_view'):
            self.runs_view.set_artifacts_root(config.artifacts_root)
        
        # Update other views
        if hasattr(self, 'exports_view'):
            self.exports_view.set_artifacts_root(config.artifacts_root)
        
        self.update_status_display()
    
    def on_add_edit_project(self):
        """Handle add/edit project button click"""
        current_project_name = self.project_selector.get_current_project()
        current_project = None
        
        # Check if we're editing an existing project
        if current_project_name:
            projects = config.get_projects()
            for project in projects:
                if project["name"] == current_project_name:
                    current_project = project
                    break
        
        # Show dialog
        dialog = ProjectEditDialog(
            current_project["name"] if current_project else "",
            current_project["project_root"] if current_project else "",
            self
        )
        
        if dialog.exec() == QDialog.Accepted:
            name, project_root = dialog.get_project_data()
            
            # Upsert project
            config.upsert_project(name, project_root)
            
            # Set as active project
            config.set_active_project_by_name(name)
            
            # Refresh UI
            self.refresh_project_selector()
            self.artifacts_root_selector.set_path(config.artifacts_root)
            
            # Clear and refresh views
            self.clear_session_data()
            self.update_views_for_new_project()
            
            self.update_status_display()
    
    def on_remove_project(self):
        """Handle remove project button click"""
        current_project = self.project_selector.get_current_project()
        
        if not current_project:
            return
        
        # Confirm deletion
        reply = QMessageBox.question(
            self,
            "Remove Project",
            f"Are you sure you want to remove project '{current_project}'?",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        
        if reply == QMessageBox.Yes:
            if config.remove_project(current_project):
                # Refresh UI
                self.refresh_project_selector()
                self.artifacts_root_selector.set_path(config.artifacts_root)
                
                # Clear and refresh views
                self.clear_session_data()
                self.update_views_for_new_project()
                
                self.update_status_display()
            else:
                QMessageBox.information(
                    self,
                    "Cannot Remove",
                    "Cannot remove the last remaining project."
                )
    
    def clear_session_data(self):
        """Clear current session data from views"""
        if hasattr(self, 'session_view'):
            self.session_view.clear_session()
        if hasattr(self, 'exports_view'):
            self.exports_view.clear_contract()
    
    def update_views_for_new_project(self):
        """Update views with new project artifacts root"""
        artifacts_root = config.artifacts_root
        
        if hasattr(self, 'runs_view'):
            self.runs_view.set_artifacts_root(artifacts_root)
        if hasattr(self, 'exports_view'):
            self.exports_view.set_artifacts_root(artifacts_root)
    
    def update_status_display(self):
        """Update status bar with current project and tier info"""
        active_project = config.get_active_project_name()
        tier = config.tier
        self.status_bar.showMessage(f"Project: {active_project} | Tier: {tier}")

class ExecLedgerApp(QApplication):
    """Main application class"""
    
    def __init__(self, argv):
        super().__init__(argv)
        self.setApplicationName("NGKs ExecLedger Desktop")
        self.setApplicationVersion("0.1.0")
        
        self.main_window = MainWindow()
    
    def run(self):
        """Run the application"""
        self.main_window.show()
        return self.exec()

def main():
    """Main entry point"""
    app = ExecLedgerApp(sys.argv)
    return app.run()

if __name__ == "__main__":
    sys.exit(main())