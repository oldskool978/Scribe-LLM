# Copyright (c) 2026 Hector Nunez. Licensed under PolyForm Shield License 1.0.0. See LICENSE.md.

import os
import sys
import json
import stat
import shutil
import urllib.request
import urllib.error
import zipfile
import re
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.resolve()
FONTS_DIR = PROJECT_ROOT / "static" / "lib" / "fonts"
CSS_DIR = PROJECT_ROOT / "static" / "css"
CSS_FILE = CSS_DIR / "fonts.css"

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
            return True
        except (PermissionError, OSError):
            if attempt == retries - 1:
                raise
            time.sleep(delay)
            delay *= 2
    return False

def fetch_from_github(name: str, repo: str, keywords: list) -> str:
    print_status(f"Querying upstream release channel for {name} ({repo})...")
    api_url = f"https://api.github.com/repos/{repo}/releases/latest"
    ctx = urllib.request.Request(api_url, headers={"User-Agent": "Scribe-Orchestrator"})
    download_url = None

    try:
        with urllib.request.urlopen(ctx, timeout=15) as r:
            data = json.loads(r.read().decode())
        asset = next((a for a in data.get('assets', []) if a['name'].endswith('.zip')), None)
        if asset:
            download_url = asset['browser_download_url']
    except Exception:
        print_status("Upstream API tracking throttled or rate-limited. Engaging direct fallback link...", "WARN")
        if repo == "rsms/inter":
            download_url = "https://github.com/rsms/inter/releases/download/v4.0/Inter-4.0.zip"

    if not download_url:
        return None

    zip_path = FONTS_DIR / "temp_font.zip"
    try:
        with urllib.request.urlopen(urllib.request.Request(download_url, headers={"User-Agent": "Scribe-Orchestrator"}), timeout=30) as response, open(zip_path, 'wb') as out:
            while chunk := response.read(65536):
                out.write(chunk)

        extracted_name = None
        with zipfile.ZipFile(zip_path, 'r') as z:
            candidates = [f for f in z.namelist() if "__macosx" not in f.lower()]
            target = next((f for f in candidates if all(k in f.lower() for k in keywords)), None)
            
            if target:
                final_name = f"{name}-Variable.woff2"
                with z.open(target) as source, open(FONTS_DIR / final_name, 'wb') as dest:
                    while chunk := source.read(65536):
                        dest.write(chunk)
                extracted_name = final_name
                print_status(f"Extracted dynamic font payload: {final_name}", "SUCCESS")
            else:
                print_status("Target variant missing inside font archive.", "WARN")

        resilient_purge(zip_path)
        return extracted_name
    except Exception as e:
        print_status(f"Font archive acquisition fault: {e}", "ERROR")
        if zip_path.exists():
            resilient_purge(zip_path)
        return None

def fetch_from_google_fonts(name: str, family_param: str) -> str:
    print_status(f"Intercepting typography sheets for {name}...")
    css_url = f"https://fonts.googleapis.com/css2?family={family_param}&display=swap"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
    ctx = urllib.request.Request(css_url, headers=headers)
    
    try:
        with urllib.request.urlopen(ctx, timeout=15) as r:
            css_content = r.read().decode()

        urls = re.findall(r'src:\s*url\((https://[^\)]+\.woff2)\)', css_content)
        if not urls:
            print_status("Failed to parse localized font assets from document schema.", "ERROR")
            return None
            
        target_url = urls[-1] 
        final_name = f"{name}-Variable.woff2"
        
        with urllib.request.urlopen(urllib.request.Request(target_url, headers=headers), timeout=30) as response, open(FONTS_DIR / final_name, 'wb') as out:
            while chunk := response.read(65536):
                out.write(chunk)
                
        print_status(f"Downloaded variable font structure: {final_name}", "SUCCESS")
        return final_name
    except Exception as e:
        print_status(f"Google Fonts retrieval fault: {e}", "ERROR")
        return None

def generate_css(fonts: dict):
    print_status("Generating atomic CSS Typography Manifest...")
    css = "/* SCRIBE-LLM TYPOGRAPHY MANIFEST */\n/* Generated automatically via tools/setup_fonts.py */\n\n"
    
    if fonts.get('Inter'):
        css += """@font-face {
    font-family: 'Inter';
    src: url('../lib/fonts/Inter-Variable.woff2') format('woff2-variations');
    font-weight: 100 900;
    font-style: normal;
    font-display: swap;
}\n\n"""

    if fonts.get('JetBrainsMono'):
        css += """@font-face {
    font-family: 'JetBrains Mono';
    src: url('../lib/fonts/JetBrainsMono-Variable.woff2') format('woff2-variations');
    font-weight: 100 800;
    font-style: normal;
    font-display: swap;
}\n"""

    CSS_FILE.write_text(css, encoding="utf-8")
    print_status(f"Manifest layer written: {CSS_FILE.name}", "SUCCESS")

def main():
    print("="*60)
    print("      SCRIBE-LLM TYPOGRAPHY HYDRATION PROTOCOL      ")
    print("="*60)
    
    FONTS_DIR.mkdir(parents=True, exist_ok=True)
    CSS_DIR.mkdir(parents=True, exist_ok=True)
    
    installed = {}
    installed['Inter'] = fetch_from_github("Inter", "rsms/inter", ["inter", "variable", "woff2"])
    installed['JetBrainsMono'] = fetch_from_google_fonts("JetBrainsMono", "JetBrains+Mono:wght@100..800")
    
    generate_css(installed)
    
    if all(installed.values()):
        print_status("Typography Subsystem Online (WOFF2 Optimized).", "SUCCESS")
    else:
        print_status("Typography Hydration Partial.", "WARN")

if __name__ == "__main__":
    main()