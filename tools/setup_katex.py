# Copyright (c) 2026 Hector Nunez. Licensed under PolyForm Shield License 1.0.0. See LICENSE.md.

import os
import sys
import stat
import shutil
import urllib.request
import urllib.error
import zipfile
import time
from pathlib import Path

KATEX_VERSION = "v0.16.9"
KATEX_URL = f"https://github.com/KaTeX/KaTeX/releases/download/{KATEX_VERSION}/katex.zip"

PROJECT_ROOT = Path(__file__).parent.parent.resolve()
TARGET_DIR = PROJECT_ROOT / "static" / "lib" / "katex"
TEMP_ZIP = PROJECT_ROOT / "temp_katex_payload.zip"
TEMP_EXTRACT = PROJECT_ROOT / "temp_katex_extracted"

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
                raise OSError(f"Path {target_path.name} persisted post-purge.")
            return True
        except (PermissionError, OSError):
            if attempt == retries - 1:
                raise
            time.sleep(delay)
            delay *= 2
    return False

def download_payload() -> bool:
    print_status(f"Acquiring KaTeX Mathematical Engine ({KATEX_VERSION})...")
    try:
        ctx = urllib.request.Request(KATEX_URL, headers={"User-Agent": "Scribe-Orchestrator"})
        with urllib.request.urlopen(ctx, timeout=30) as response, open(TEMP_ZIP, 'wb') as out_file:
            while chunk := response.read(65536):
                out_file.write(chunk)
        return True
    except Exception as e:
        print_status(f"Network Fault during acquisition: {e}", "ERROR")
        return False

def extract_and_install() -> bool:
    print_status("Extracting and compiling font matrices...")
    try:
        if TARGET_DIR.exists():
            resilient_purge(TARGET_DIR)
        TARGET_DIR.mkdir(parents=True, exist_ok=True)
        TEMP_EXTRACT.mkdir(parents=True, exist_ok=True)

        with zipfile.ZipFile(TEMP_ZIP, 'r') as z:
            z.extractall(TEMP_EXTRACT)

        extracted_root = TEMP_EXTRACT / "katex"
        if not extracted_root.exists():
            extracted_root = TEMP_EXTRACT

        for item in extracted_root.iterdir():
            dst = TARGET_DIR / item.name
            if item.is_dir():
                shutil.copytree(item, dst)
            else:
                shutil.copy2(item, dst)
        return True
    except Exception as e:
        print_status(f"Extraction Fault: {e}", "ERROR")
        return False
    finally:
        resilient_purge(TEMP_ZIP)
        resilient_purge(TEMP_EXTRACT)

def main():
    print("="*60)
    print("       SCRIBE-LLM KATEX HYDRATION PROTOCOL        ")
    print("="*60)

    resilient_purge(TEMP_ZIP)
    resilient_purge(TEMP_EXTRACT)

    if not download_payload():
        sys.exit(1)

    if extract_and_install():
        print_status("KaTeX Engine and Typography successfully air-gapped.", "SUCCESS")
    else:
        print_status("Hydration failed.", "ERROR")
        sys.exit(1)

if __name__ == "__main__":
    main()