# Copyright (c) 2026 Hector Nunez. Licensed under PolyForm Shield License 1.0.0. See LICENSE.md.

import os
import sys
import stat
import shutil
import subprocess
import urllib.request
import zipfile
import time
from pathlib import Path

ACE_REPO_URL = "https://github.com/ajaxorg/ace-builds.git"
ACE_TAG = "v1.33.0"
PROJECT_ROOT = Path(__file__).parent.parent.resolve()
TARGET_DIR = PROJECT_ROOT / "static" / "lib" / "ace"

# Tracks both legacy and current temporary folder configurations to eliminate vestigial artifacts
TEMP_DIR_CURRENT = PROJECT_ROOT / "temp_ace_build"
TEMP_DIR_LEGACY = PROJECT_ROOT / "temp_ace_git_build"

def print_status(msg: str, status="INFO"):
    colors = {"INFO": "\033[94m", "SUCCESS": "\033[92m", "WARN": "\033[93m", "ERROR": "\033[91m", "RESET": "\033[0m"}
    if os.name == 'nt' and not os.environ.get("WT_SESSION"):
        print(f"[{status}] {msg}")
    else:
        print(f"{colors.get(status, '')}[{status}] {msg}{colors['RESET']}")

def resilient_purge(target_path: Path, retries=5, initial_delay=0.2):
    if not target_path.exists():
        return True

    def handle_exception(func, path, exc_info):
        try:
            os.chmod(path, stat.S_IWRITE if os.name == 'nt' else 0o755)
            func(path)
        except Exception:
            pass

    delay = initial_delay
    for attempt in range(retries):
        try:
            if target_path.is_dir():
                shutil.rmtree(target_path, onerror=handle_exception)
            else:
                try:
                    os.chmod(target_path, stat.S_IWRITE if os.name == 'nt' else 0o755)
                except Exception:
                    pass
                target_path.unlink()
            
            if target_path.exists():
                raise OSError(f"Target path {target_path.name} persisted post-execution.")
            return True
        except (PermissionError, OSError):
            if attempt == retries - 1:
                raise
            time.sleep(delay)
            delay *= 2
    return False

def acquire_assets():
    for old_dir in [TEMP_DIR_CURRENT, TEMP_DIR_LEGACY]:
        if old_dir.exists():
            resilient_purge(old_dir)
            
    TEMP_DIR_CURRENT.mkdir(parents=True, exist_ok=True)

    git_exe = shutil.which("git")
    if git_exe:
        print_status(f"Engaging Git subsystem for asset replication (Tag: {ACE_TAG})...")
        clone_args = [git_exe, "clone", "--depth", "1", "--branch", ACE_TAG, ACE_REPO_URL, str(TEMP_DIR_CURRENT)]
        try:
            subprocess.run(clone_args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            return TEMP_DIR_CURRENT / "src-min-noconflict"
        except subprocess.CalledProcessError:
            print_status("Git replication failed. Shifting to network stream fallback...", "WARN")

    archive_url = f"https://github.com/ajaxorg/ace-builds/archive/refs/tags/{ACE_TAG}.zip"
    archive_path = PROJECT_ROOT / f"ace-{ACE_TAG}.zip"
    print_status(f"Streaming standalone source archive from GitHub ({ACE_TAG})...")
    
    ctx = urllib.request.Request(archive_url, headers={"User-Agent": "Scribe-Orchestrator"})
    try:
        with urllib.request.urlopen(ctx, timeout=30) as response, open(archive_path, "wb") as out_file:
            while chunk := response.read(65536):
                out_file.write(chunk)
                
        print_status("Extracting zipped layout core...")
        with zipfile.ZipFile(archive_path, 'r') as zip_ref:
            zip_ref.extractall(TEMP_DIR_CURRENT)
        archive_path.unlink()
        
        nested_root = TEMP_DIR_CURRENT / f"ace-builds-{ACE_TAG.lstrip('v')}"
        return nested_root / "src-min-noconflict"
    except Exception as e:
        print_status(f"Network asset delivery fractured: {str(e)}", "ERROR")
        if archive_path.exists():
            archive_path.unlink()
        return None

def main():
    print_status("Initializing Ace Editor Protocol: RUNTIME_HYDRATION")
    
    if TARGET_DIR.exists():
        resilient_purge(TARGET_DIR)

    source_artifacts = acquire_assets()
    if not source_artifacts or not source_artifacts.exists():
        print_status("CRITICAL: Compilation targets missing or corrupted. Aborting build graph.", "ERROR")
        for clear_dir in [TEMP_DIR_CURRENT, TEMP_DIR_LEGACY]:
            if clear_dir.exists():
                resilient_purge(clear_dir)
        sys.exit(1)

    print_status("Moving production web assets to target destination...")
    try:
        TARGET_DIR.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source_artifacts, TARGET_DIR)
    except Exception as e:
        print_status(f"Asset distribution failed: {str(e)}", "ERROR")
        for clear_dir in [TEMP_DIR_CURRENT, TEMP_DIR_LEGACY]:
            if clear_dir.exists():
                resilient_purge(clear_dir)
        sys.exit(1)

    print_status("Incinerating temporary environment files...")
    for clear_dir in [TEMP_DIR_CURRENT, TEMP_DIR_LEGACY]:
        if clear_dir.exists():
            resilient_purge(clear_dir)

    print_status("-" * 60, "SUCCESS")
    print_status(f"SUCCESS: Ace Web Framework Installation Complete.", "SUCCESS")
    print_status(f"  Target Workspace: {TARGET_DIR.name}/", "SUCCESS")
    print_status("-" * 60, "SUCCESS")

if __name__ == "__main__":
    main()