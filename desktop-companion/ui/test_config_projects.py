#!/usr/bin/env python3
"""
NGKs ExecLedger Desktop - Config Projects Test
Tests configuration project management functionality
"""
import sys
import traceback
from pathlib import Path

def test_config_projects():
    """Test configuration project management"""
    try:
        print("=== NGKs ExecLedger Desktop Config Projects Test ===")
        
        # Test 1: Import config module
        print("Testing config import...")
        from config import Config
        print("[OK] Config import successful")
        
        # Test 2: Create config instance
        print("Testing config instantiation...")
        config = Config()
        print("[OK] Config instance created")
        
        # Test 3: Test default projects
        print("Testing default projects...")
        projects = config.get_projects()
        print(f"[INFO] Found {len(projects)} default projects")
        
        if len(projects) >= 1:
            print(f"[OK] Default project: {projects[0]}")
        else:
            print("[ERROR] No default projects found")
            return False
        
        # Test 4: Test active project
        print("Testing active project...")
        active_name = config.get_active_project_name()
        active_project = config.get_active_project()
        print(f"[INFO] Active project: {active_name}")
        
        if active_project:
            print(f"[OK] Active project details: {active_project}")
        else:
            print("[ERROR] No active project found")
            return False
        
        # Test 5: Test normalize_project_root functionality
        print("Testing normalize_project_root...")
        
        # Test case: giving project_root = ".../ngks-vscode-autologger/_artifacts" 
        # should normalize to parent, artifacts_root should end with "\_artifacts" once
        test_repo_root = str(Path(__file__).parent.parent.parent)
        test_artifacts_path = str(Path(test_repo_root) / "_artifacts")
        
        normalized = config.normalize_project_root(test_artifacts_path)
        if normalized == test_repo_root:
            print(f"[OK] Normalize _artifacts path: {test_artifacts_path} -> {normalized}")
        else:
            print(f"[ERROR] Normalize _artifacts failed. Expected: {test_repo_root}, Got: {normalized}")
            print("CONFIG_NORMALIZE_OK=NO")
            return False
        
        # Test artifacts root derivation
        artifacts_root = config.derive_artifacts_root(test_artifacts_path)
        expected_artifacts = str(Path(test_repo_root) / "_artifacts")
        if artifacts_root == expected_artifacts:
            print(f"[OK] Artifacts root derived correctly: {artifacts_root}")
            # Check that it ends with _artifacts only once
            if artifacts_root.endswith("_artifacts") and not artifacts_root.endswith("_artifacts/_artifacts"):
                print(f"[OK] Artifacts root ends with _artifacts exactly once")
                print("CONFIG_NORMALIZE_OK=YES")
            else:
                print(f"[ERROR] Artifacts root has multiple _artifacts: {artifacts_root}")
                print("CONFIG_NORMALIZE_OK=NO")
                return False
        else:
            print(f"[ERROR] Artifacts root wrong. Expected: {expected_artifacts}, Got: {artifacts_root}")
            print("CONFIG_NORMALIZE_OK=NO")
            return False
        
        # Test 6: Test upsert project
        print("Testing upsert project...")
        test_project_name = "TEST_PROJECT"
        test_artifacts_root = "/tmp/test_artifacts"
        
        config.upsert_project(test_project_name, test_artifacts_root)
        print(f"[OK] Upserted project: {test_project_name}")
        
        # Test 7: Set active to test project
        print("Testing set active project...")
        result = config.set_active_project_by_name(test_project_name)
        if result:
            print(f"[OK] Set active project: {test_project_name}")
        else:
            print(f"[ERROR] Failed to set active project: {test_project_name}")
            return False
        
        # Test 8: Reload config and verify persistence
        print("Testing config persistence...")
        config2 = Config()  # New instance to test persistence
        active_name2 = config2.get_active_project_name()
        active_project2 = config2.get_active_project()
        
        if active_name2 == test_project_name:
            print(f"[OK] Active project persisted: {active_name2}")
        else:
            print(f"[ERROR] Active project not persisted. Expected: {test_project_name}, Got: {active_name2}")
            return False
        
        if active_project2 and active_project2["project_root"] == test_artifacts_root:
            print(f"[OK] Project details persisted: {active_project2}")
        else:
            print(f"[ERROR] Project details not persisted correctly: {active_project2}")
            return False
        
        # Test 9: Test remove project (cleanup)
        print("Testing remove project...")
        remove_result = config.remove_project(test_project_name)
        if remove_result:
            print(f"[OK] Removed test project: {test_project_name}")
        else:
            print(f"[WARNING] Could not remove test project (might be last project): {test_project_name}")
        
        print("CONFIG_PROJECTS_OK=YES")
        return True
        
    except ImportError as e:
        print(f"[ERROR] Import error: {e}")
        print("CONFIG_PROJECTS_OK=NO")
        return False
        
    except Exception as e:
        print(f"[ERROR] Unexpected error: {e}")
        print("Traceback:")
        traceback.print_exc()
        print("CONFIG_PROJECTS_OK=NO")
        return False

if __name__ == "__main__":
    success = test_config_projects()
    sys.exit(0 if success else 1)