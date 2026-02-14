"""
NGKs ExecLedger Desktop - Data Models
"""
from dataclasses import dataclass
from typing import Dict, List, Optional

@dataclass
class ExecFolder:
    """Represents an exec_ folder"""
    name: str
    path: str
    sessions: List[str] = None
    
    def __post_init__(self):
        if self.sessions is None:
            self.sessions = []

@dataclass
class SessionInfo:
    """Represents a session within an exec folder"""
    exec_id: str
    session_id: str
    path: str

@dataclass
class artifactsContract:
    """Represents the artifacts contract returned by engine"""
    session_root: str
    summary_file: str
    report_file: str
    artifacts_folder: str
    session_id: str
    created_at: str
    warnings: Optional[List[str]] = None
    hashes: Optional[Dict] = None
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'artifactsContract':
        """Create artifactsContract from engine JSON response"""
        return cls(
            session_root=data.get('sessionRoot', ''),
            summary_file=data.get('summaryFile', ''),
            report_file=data.get('reportFile', ''),
            artifacts_folder=data.get('artifactsFolder', ''),
            session_id=data.get('sessionId', ''),
            created_at=data.get('createdAt', ''),
            warnings=data.get('warnings'),
            hashes=data.get('hashes')
        )