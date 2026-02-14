"""
NGKs ExecLedger Desktop - Configuration Management
"""
import json
import os
from pathlib import Path
from typing import Dict, Any, List, Optional

class Config:
    def __init__(self):
        self.config_file = Path(__file__).parent / "ui_config.json"
        
        # Get repo root for defaults
        ui_dir = Path(__file__).parent
        repo_root = ui_dir.parent.parent
        default_project_root = str(repo_root)
        default_artifacts_root = self.derive_artifacts_root(default_project_root)
        
        self.defaults = {
            "artifacts_root": default_artifacts_root,  # Legacy compatibility
            "dev_mode": 1,
            "tier": "PREMIUM",
            "projects": [
                {
                    "name": "ExecLedger",
                    "project_root": default_project_root,
                    "artifacts_root": default_artifacts_root
                }
            ],
            "active_project": "ExecLedger"
        }
        self._config = self._load_config()
    
    def _get_default_artifacts_root(self) -> str:
        """Get default artifacts root: repo_root/execledger"""
        ui_dir = Path(__file__).parent
        repo_root = ui_dir.parent.parent
        return str(repo_root / "execledger")
    
    def derive_artifacts_root(self, project_root: str) -> str:
        """Derive artifacts root from project root"""
        project_root = self.normalize_project_root(project_root)
        return str(Path(project_root) / "execledger")
    
    def normalize_project_root(self, path: str) -> str:
        """Normalize project root path to prevent execledger/execledger/execledger issues"""
        normalized_path = os.path.normpath(path)
        path_obj = Path(normalized_path)
        
        # If basename is "_artifacts" or "execledger" (case-insensitive), return parent directory
        base_name = path_obj.name.lower()
        if base_name == "_artifacts" or base_name == "execledger":
            return str(path_obj.parent)
        
        return normalized_path
    
    def normalize_project_entry(self, entry: Dict[str, str]) -> Dict[str, str]:
        """Normalize project entry to have both project_root and artifacts_root"""
        if "project_root" in entry and "artifacts_root" in entry:
            # Already normalized - but apply normalization to project_root
            project_root = self.normalize_project_root(entry["project_root"])
            artifacts_root = self.derive_artifacts_root(project_root)
            return {
                "name": entry.get("name", "ExecLedger"),
                "project_root": project_root,
                "artifacts_root": artifacts_root
            }
        
        if "artifacts_root" in entry:
            # Legacy format - migrate according to new rules
            legacy_path = entry["artifacts_root"]
            if legacy_path.endswith("_artifacts") or legacy_path.endswith("execledger"):
                # artifacts_root/artifacts_root ends with _artifacts or execledger -> project_root = parent
                project_root = str(Path(legacy_path).parent)
            else:
                # Else: project_root = legacy value
                project_root = legacy_path
            
            # Apply normalization and derive new artifacts_root
            project_root = self.normalize_project_root(project_root)
            artifacts_root = self.derive_artifacts_root(project_root)
        else:
            # Use defaults
            repo_root = Path(__file__).parent.parent.parent
            project_root = self.normalize_project_root(str(repo_root))
            artifacts_root = self.derive_artifacts_root(project_root)
        
        return {
            "name": entry.get("name", "ExecLedger"),
            "project_root": project_root,
            "artifacts_root": artifacts_root
        }
    
    def _load_config(self) -> Dict[str, Any]:
        """Load config from file or create with defaults"""
        if self.config_file.exists():
            try:
                with open(self.config_file, 'r') as f:
                    config = json.load(f)
                
                # Migrate legacy config to projects format
                if "projects" not in config and "artifacts_root" in config:
                    config["projects"] = [
                        {
                            "name": "ExecLedger",
                            "artifacts_root": config["artifacts_root"]  # Will be normalized later
                        }
                    ]
                    config["active_project"] = "ExecLedger"
                
                # Normalize all projects to new schema
                if "projects" in config:
                    normalized_projects = []
                    for project in config["projects"]:
                        normalized_projects.append(self.normalize_project_entry(project))
                    config["projects"] = normalized_projects
                
                # Merge with defaults for any missing keys
                merged = self.defaults.copy()
                merged.update(config)
                return merged
            except Exception as e:
                print(f"Failed to load config: {e}, using defaults")
                return self.defaults.copy()
        else:
            return self.defaults.copy()
    
    def save_config(self):
        """Save current config to file"""
        try:
            with open(self.config_file, 'w') as f:
                json.dump(self._config, f, indent=2)
        except Exception as e:
            print(f"Failed to save config: {e}")
    
    @property
    def artifacts_root(self) -> str:
        # Use active project's artifacts_root if available, otherwise fallback to legacy setting
        return self.get_active_artifacts_root()
    
    @artifacts_root.setter
    def artifacts_root(self, value: str):
        # Update active project's artifacts_root by treating value as new project_root
        active_project = self.get_active_project()
        if active_project:
            # Derive new artifacts_root from the project_root
            projects = self.get_projects()
            for project in projects:
                if project["name"] == self.get_active_project_name():
                    project["project_root"] = value
                    project["artifacts_root"] = self.derive_artifacts_root(value)
                    break
            self.set_projects(projects)
        else:
            self._config["artifacts_root"] = value
            self.save_config()
    
    def get_active_artifacts_root(self) -> str:
        """Get active project's artifacts root"""
        active_project = self.get_active_project()
        if active_project:
            return active_project.get("artifacts_root", self.defaults["artifacts_root"])
        return self._config.get("artifacts_root", self.defaults["artifacts_root"])
    
    @property
    def dev_mode(self) -> bool:
        return bool(self._config["dev_mode"])
    
    @dev_mode.setter
    def dev_mode(self, value: bool):
        self._config["dev_mode"] = 1 if value else 0
        self.save_config()
    
    @property
    def tier(self) -> str:
        return self._config["tier"]
    
    @tier.setter
    def tier(self, value: str):
        if value in ["FREE", "PRO", "PREMIUM"]:
            self._config["tier"] = value
            self.save_config()
        else:
            raise ValueError(f"Invalid tier: {value}")

    # Project management methods
    def get_projects(self) -> List[Dict[str, str]]:
        """Get list of projects"""
        return self._config.get("projects", self.defaults["projects"].copy())
    
    def set_projects(self, projects: List[Dict[str, str]]):
        """Set projects list"""
        self._config["projects"] = projects
        self.save_config()
    
    def get_active_project_name(self) -> str:
        """Get active project name"""
        return self._config.get("active_project", self.defaults["active_project"])
    
    def set_active_project_name(self, name: str):
        """Set active project name"""
        self._config["active_project"] = name
        self.save_config()
    
    def get_active_project(self) -> Optional[Dict[str, str]]:
        """Get active project dict or None"""
        active_name = self.get_active_project_name()
        projects = self.get_projects()
        for project in projects:
            if project["name"] == active_name:
                return project
        return None
    
    def set_active_project_by_name(self, name: str):
        """Set active project by name (if it exists)"""
        projects = self.get_projects()
        for project in projects:
            if project["name"] == name:
                self.set_active_project_name(name)
                return True
        return False
    
    def upsert_project(self, name: str, project_root: str):
        """Add or update a project with project_root (artifacts_root derived)"""
        # Normalize project_root to prevent execledger\\execledger issues
        project_root = self.normalize_project_root(project_root)
        projects = self.get_projects()
        artifacts_root = self.derive_artifacts_root(project_root)
        
        # Find existing project
        for i, project in enumerate(projects):
            if project["name"] == name:
                projects[i]["project_root"] = project_root
                projects[i]["artifacts_root"] = artifacts_root
                break
        else:
            # Add new project
            projects.append({
                "name": name, 
                "project_root": project_root,
                "artifacts_root": artifacts_root
            })
        
        self.set_projects(projects)
    
    def remove_project(self, name: str) -> bool:
        """Remove a project by name. Returns False if it's the last project."""
        projects = self.get_projects()
        
        if len(projects) <= 1:
            return False  # Protect from removing last project
        
        # Remove project
        projects = [p for p in projects if p["name"] != name]
        self.set_projects(projects)
        
        # If removed project was active, switch to first available
        if self.get_active_project_name() == name:
            if projects:
                self.set_active_project_name(projects[0]["name"])
        
        return True

# Global config instance
config = Config()