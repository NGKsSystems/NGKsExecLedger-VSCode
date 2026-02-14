"""
NGKs ExecLedger Desktop - Node Engine Client
Calls the Node.js engine and handles JSON responses
"""
import json
import subprocess
import sys
from pathlib import Path
from typing import Dict, Any, Optional, List

class EngineResult:
    def __init__(self, ok: bool, contract: Optional[Dict], stdout: str, stderr: str, code: int, cmd: List[str]):
        self.ok = ok
        self.contract = contract
        self.stdout = stdout
        self.stderr = stderr
        self.code = code
        self.cmd = cmd

class EngineClient:
    def __init__(self):
        self.engine_path = self._get_engine_path()
        self.last_result: Optional[EngineResult] = None
    
    def _get_engine_path(self) -> Path:
        """Get path to the Node.js engine"""
        ui_dir = Path(__file__).parent
        engine_path = ui_dir.parent / "engine" / "src" / "index.js"
        if not engine_path.exists():
            raise FileNotFoundError(f"Engine not found at: {engine_path}")
        return engine_path
    
    def get_latest_session(self, artifacts_root: str) -> EngineResult:
        """Get latest session contract using Node engine"""
        cmd = ["node", str(self.engine_path), "--root", artifacts_root, "--latest"]
        return self._execute_engine(cmd)
    
    def get_specific_session(self, artifacts_root: str, exec_id: str, session_id: str) -> EngineResult:
        """Get specific session contract using Node engine"""
        cmd = ["node", str(self.engine_path), "--root", artifacts_root, "--exec", exec_id, "--session", session_id]
        return self._execute_engine(cmd)
    
    def export_contract_to_file(self, artifacts_root: str, output_file: str, exec_id: str = None, session_id: str = None) -> EngineResult:
        """Export contract JSON to file"""
        cmd = ["node", str(self.engine_path), "--root", artifacts_root, "--out", output_file]
        
        if exec_id and session_id:
            cmd.extend(["--exec", exec_id, "--session", session_id])
        else:
            cmd.append("--latest")
        
        return self._execute_engine(cmd)
    
    def _execute_engine(self, cmd: List[str]) -> EngineResult:
        """Execute Node engine command and parse result"""
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
                encoding='utf-8'
            )
            
            stdout = result.stdout
            stderr = result.stderr
            code = result.returncode
            
            contract = None
            ok = False
            
            if code == 0:
                # Try to parse JSON from stdout
                try:
                    contract = json.loads(stdout)
                    ok = True
                except json.JSONDecodeError as e:
                    stderr = f"JSON parse error: {e}\\n{stderr}"
                    ok = False
            
            engine_result = EngineResult(ok, contract, stdout, stderr, code, cmd)
            self.last_result = engine_result
            return engine_result
            
        except subprocess.TimeoutExpired:
            error_msg = f"Engine timeout after 30s"
            engine_result = EngineResult(False, None, "", error_msg, -1, cmd)
            self.last_result = engine_result
            return engine_result
            
        except Exception as e:
            error_msg = f"Engine execution failed: {e}"
            engine_result = EngineResult(False, None, "", error_msg, -1, cmd)
            self.last_result = engine_result
            return engine_result
    
    def get_last_diagnostic(self) -> Optional[EngineResult]:
        """Get the last engine execution result for diagnostics"""
        return self.last_result