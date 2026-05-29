# Copyright (c) 2026 Hector Nunez. Licensed under PolyForm Shield License 1.0.0. See LICENSE.md.

import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.resolve()
TARGET_DIR = PROJECT_ROOT / "static" / "lib" / "markdown"

ASSETS = {
    "marked.min.js": "https://cdn.jsdelivr.net/npm/marked@12.0.1/marked.min.js",
    "purify.min.js": "https://cdn.jsdelivr.net/npm/dompurify@3.0.9/dist/purify.min.js"
}

def print_status(msg: str, status="INFO"):
    colors = {"INFO": "\033[94m", "SUCCESS": "\033[92m", "ERROR": "\033[91m", "RESET": "\033[0m"}
    if os.name == 'nt' and not os.environ.get("WT_SESSION"):
        print(f"[{status}] {msg}")
    else:
        print(f"{colors.get(status, '')}[{status}] {msg}{colors['RESET']}")

def download_file(url: str, dest: Path) -> bool:
    try:
        ctx = urllib.request.Request(url, headers={"User-Agent": "Scribe-Orchestrator"})
        with urllib.request.urlopen(ctx, timeout=15) as response, open(dest, 'wb') as out_file:
            while chunk := response.read(65536):
                out_file.write(chunk)
        return True
    except urllib.error.URLError as e:
        print_status(f"Network error fetching {url}: {e}", "ERROR")
        return False
    except OSError as e:
        print_status(f"IO error writing to {dest.name}: {e}", "ERROR")
        return False

def main():
    print("="*60)
    print("       SCRIBE-LLM MARKDOWN HYDRATION PROTOCOL       ")
    print("="*60)

    TARGET_DIR.mkdir(parents=True, exist_ok=True)

    for filename, url in ASSETS.items():
        dest_path = TARGET_DIR / filename
        print_status(f"Fetching {filename}...", "INFO")
        
        if download_file(url, dest_path):
            print_status(f"Localized: {filename}", "SUCCESS")
        else:
            print_status("Hydration failed. Aborting.", "ERROR")
            sys.exit(1)

    print_status("Markdown components successfully localized.", "SUCCESS")

if __name__ == "__main__":
    main()