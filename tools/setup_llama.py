# Copyright (c) 2026 Hector Nunez. Licensed under PolyForm Shield License 1.0.0. See LICENSE.md.

import os
import sys
import stat
import json
import shutil
import subprocess
import urllib.request
import urllib.error
import zipfile
import tarfile
import hashlib
import re
import time
from pathlib import Path

REPO_OWNER = "ggml-org"
REPO_NAME = "llama.cpp"
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET_DIR = os.path.join(PROJECT_ROOT, "LMCPP")
STAGING_DIR = os.path.join(PROJECT_ROOT, "staging_lmcpp")
VERSION_MANIFEST = os.path.join(TARGET_DIR, ".version")
API_URL = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/releases/latest"
TIMEOUT = 15

EXE_EXT = ".exe" if os.name == 'nt' else ""
SYSTEM_EXPECTED_SERVER = f"llama-server{EXE_EXT}"
SYSTEM_EXPECTED_QUANT = f"llama-quantize{EXE_EXT}"
SYSTEM_EXPECTED_IMATRIX = f"llama-imatrix{EXE_EXT}"

POSSIBLE_SERVER_NAMES = [f"llama-server{EXE_EXT}", f"server{EXE_EXT}"]
POSSIBLE_QUANT_NAMES = [f"llama-quantize{EXE_EXT}", f"quantize{EXE_EXT}"]
POSSIBLE_IMATRIX_NAMES = [f"llama-imatrix{EXE_EXT}", f"imatrix{EXE_EXT}"]

CRITICAL_DLLS = {
    "cuda": ["cudart64", "cublas64"] if os.name == 'nt' else ["libcudart", "libcublas"],
    "hip": ["hip", "rocblas"] if os.name == 'nt' else ["libamdhip", "librocblas"],
    "vulkan": [],
    "metal": []
}

def print_status(msg, status="INFO"):
    colors = {"INFO": "\033[94m", "SUCCESS": "\033[92m", "WARN": "\033[93m", "ERROR": "\033[91m", "RESET": "\033[0m"}
    print(f"{colors.get(status, '')}[{status}] {msg}{colors['RESET']}")

def resilient_fs_op(func, *args, retries=5, delay=0.5, **kwargs):
    for attempt in range(retries):
        try:
            return func(*args, **kwargs)
        except Exception:
            if attempt == retries - 1: raise
            time.sleep(delay)

def resilient_purge(path):
    if not os.path.exists(path): return

    def remove_readonly(func, p, exc_info):
        try:
            os.chmod(p, stat.S_IWRITE)
            func(p)
        except Exception: pass

    if os.path.isdir(path):
        resilient_fs_op(shutil.rmtree, path, onerror=remove_readonly)
    else:
        for attempt in range(5):
            try:
                os.remove(path)
                return
            except PermissionError:
                try:
                    os.chmod(path, stat.S_IWRITE if os.name == 'nt' else 0o755)
                    os.remove(path)
                    return
                except Exception: pass
            except Exception: pass
            time.sleep(0.5)

def safe_subprocess(cmd):
    try:
        kwargs = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
        return subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=5, **kwargs).decode('utf-8', errors='ignore').strip().lower()
    except Exception:
        return ""

def detect_hardware_profile():
    print_status("Probing Hardware capabilities...", "INFO")
    
    if sys.platform == "darwin":
        uname = safe_subprocess(["uname", "-m"])
        if "arm64" in uname:
            print_status("Apple Silicon Detected (Metal Core Acceleration)", "SUCCESS")
            return {"type": "metal", "ver": None}
        return {"type": "vulkan", "ver": None}

    if os.name == 'nt':
        nv_out = safe_subprocess(["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"])
        if nv_out:
            try:
                major_ver = float(nv_out.split('.')[0])
                if major_ver >= 520: 
                    print_status("NVIDIA CUDA Detected (v12)", "SUCCESS")
                    return {"type": "cuda", "ver": "12"}
                if major_ver >= 450: 
                    print_status("NVIDIA CUDA Detected (v11)", "SUCCESS")
                    return {"type": "cuda", "ver": "11"}
            except ValueError: pass

        cim_out = safe_subprocess(["powershell", "-NoProfile", "-Command", "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"])
        if "amd" in cim_out or "radeon" in cim_out or "ryzen" in cim_out:
            print_status("AMD GPU Detected (HIP/ROCm)", "SUCCESS")
            return {"type": "hip", "ver": None}
        if "intel" in cim_out and ("arc" in cim_out or "iris" in cim_out or "ultra" in cim_out):
            print_status("Intel High-Performance GPU Detected (Vulkan)", "SUCCESS")
            return {"type": "vulkan", "ver": None}
    else:
        lspci = safe_subprocess(["lspci"])
        has_nvidia = "nvidia" in lspci
        has_amd = "amd" in lspci or "radeon" in lspci
        has_intel = "intel" in lspci and "arc" in lspci

        drm_path = Path("/sys/class/drm")
        if drm_path.exists():
            for uevent in drm_path.glob("card*/device/uevent"):
                try:
                    content = uevent.read_text()
                    if "DRIVER=amdgpu" in content: has_amd = True
                    if "DRIVER=nvidia" in content: has_nvidia = True
                    if "DRIVER=i915" in content or "DRIVER=xe" in content: has_intel = True
                except Exception: pass

        if has_nvidia:
            print_status("NVIDIA CUDA Detected (Linux)", "SUCCESS")
            return {"type": "cuda", "ver": "12"}
        if has_amd:
            print_status("AMD ROCm Detected (Linux)", "SUCCESS")
            return {"type": "hip", "ver": None}
        if has_intel:
            print_status("Intel Arc Detected (Linux)", "SUCCESS")
            return {"type": "vulkan", "ver": None}

    print_status("No Supported Compute GPU Detected. Defaulting to Universal CPU/Vulkan.", "WARN")
    return {"type": "vulkan", "ver": None}

def fetch_json(url):
    headers = {"User-Agent": "Scribe-LLM-Unified-Hydrator"}
    token = os.environ.get("GITHUB_TOKEN")
    if token: headers["Authorization"] = f"Bearer {token}"

    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 403:
                print_status("GitHub API Rate Limit Exceeded. Set GITHUB_TOKEN environment variable.", "ERROR")
                sys.exit(1)
            time.sleep(2)
        except Exception as e:
            if attempt == 2:
                print_status(f"API Failure: {e}", "ERROR")
                sys.exit(1)
            time.sleep(2)

def download_file(url, path, expected_hash=None):
    tmp_path = path + ".tmp"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Scribe-LLM-Unified-Hydrator"})
            with urllib.request.urlopen(req, timeout=300) as response, open(tmp_path, 'wb') as out_file:
                shutil.copyfileobj(response, out_file)
            
            if expected_hash:
                sha256 = hashlib.sha256()
                with open(tmp_path, 'rb') as f:
                    while chunk := f.read(65536): sha256.update(chunk)
                if sha256.hexdigest().lower() != expected_hash.lower():
                    raise ValueError("Checksum Mismatch")
            
            resilient_fs_op(os.replace, tmp_path, path)
            return True
        except Exception:
            resilient_purge(tmp_path)
            time.sleep(2)
    return False

def extract_source_topology(tag_name):
    print_status("Acquiring hermetic conversion scripts (gguf-py)...", "INFO")
    source_url = f"https://github.com/{REPO_OWNER}/{REPO_NAME}/archive/refs/tags/{tag_name}.zip"
    zip_path = os.path.join(STAGING_DIR, "source.zip")
    
    if not download_file(source_url, zip_path): return False

    extract_dir = os.path.join(STAGING_DIR, "source_extracted")
    with zipfile.ZipFile(zip_path, 'r') as z: z.extractall(extract_dir)
    
    extracted_items = os.listdir(extract_dir)
    if not extracted_items: return False
    
    root_folder = os.path.join(extract_dir, extracted_items[0])
    
    target_converter = os.path.join(root_folder, "convert_hf_to_gguf.py")
    target_gguf_py = os.path.join(root_folder, "gguf-py")
    
    if os.path.exists(target_converter):
        shutil.move(target_converter, os.path.join(TARGET_DIR, "convert_hf_to_gguf.py"))
    if os.path.exists(target_gguf_py):
        shutil.move(target_gguf_py, os.path.join(TARGET_DIR, "gguf-py"))
        
    for folder_name in ["conversion", "convert"]:
        target_path = os.path.join(root_folder, folder_name)
        if os.path.exists(target_path):
            shutil.move(target_path, os.path.join(TARGET_DIR, folder_name))
        
    return True

def extract_binary_topology(asset_url, expected_hash):
    print_status("Acquiring binary execution payload...", "INFO")
    archive_path = os.path.join(STAGING_DIR, "binaries.archive")
    
    if not download_file(asset_url, archive_path, expected_hash): return False

    extract_dir = os.path.join(STAGING_DIR, "bin_extracted")
    
    if asset_url.lower().endswith(".zip"):
        with zipfile.ZipFile(archive_path, 'r') as z: z.extractall(extract_dir)
    else:
        with tarfile.open(archive_path, "r:gz") as t: t.extractall(extract_dir)

    extracted_items = os.listdir(extract_dir)
    if not extracted_items: return False

    root_folder = os.path.join(extract_dir, extracted_items[0])
    if not os.path.isdir(root_folder):
        root_folder = extract_dir

    for item in os.listdir(root_folder):
        src = os.path.join(root_folder, item)
        dst = os.path.join(TARGET_DIR, item)
        if os.path.isdir(src):
            if os.path.exists(dst):
                for subitem in os.listdir(src):
                    sub_src = os.path.join(src, subitem)
                    sub_dst = os.path.join(dst, subitem)
                    if not os.path.exists(sub_dst):
                        shutil.move(sub_src, sub_dst)
            else:
                shutil.move(src, dst)
        else:
            if not os.path.exists(dst):
                shutil.move(src, dst)

    return True

def converge_structure():
    print_status("Normalizing binary nomenclature and purging bloat...", "INFO")
    
    for candidate in POSSIBLE_SERVER_NAMES:
        current_loc = os.path.join(TARGET_DIR, candidate)
        expected_loc = os.path.join(TARGET_DIR, SYSTEM_EXPECTED_SERVER)
        if os.path.exists(current_loc) and current_loc != expected_loc:
            resilient_purge(expected_loc)
            os.rename(current_loc, expected_loc)
            break
            
    for candidate in POSSIBLE_QUANT_NAMES:
        current_loc = os.path.join(TARGET_DIR, candidate)
        expected_loc = os.path.join(TARGET_DIR, SYSTEM_EXPECTED_QUANT)
        if os.path.exists(current_loc) and current_loc != expected_loc:
            resilient_purge(expected_loc)
            os.rename(current_loc, expected_loc)
            break

    for candidate in POSSIBLE_IMATRIX_NAMES:
        current_loc = os.path.join(TARGET_DIR, candidate)
        expected_loc = os.path.join(TARGET_DIR, SYSTEM_EXPECTED_IMATRIX)
        if os.path.exists(current_loc) and current_loc != expected_loc:
            resilient_purge(expected_loc)
            os.rename(current_loc, expected_loc)
            break

    for item in os.listdir(TARGET_DIR):
        item_path = os.path.join(TARGET_DIR, item)
        if os.path.isfile(item_path):
            if os.name != 'nt' and item in [SYSTEM_EXPECTED_SERVER, SYSTEM_EXPECTED_QUANT, SYSTEM_EXPECTED_IMATRIX]:
                os.chmod(item_path, os.stat(item_path).st_mode | stat.S_IEXEC)
            elif os.name == 'nt' and item.lower().endswith(".exe") and item not in [SYSTEM_EXPECTED_SERVER, SYSTEM_EXPECTED_QUANT, SYSTEM_EXPECTED_IMATRIX]:
                resilient_purge(item_path)

def verify_ensemble(profile):
    if not os.path.exists(os.path.join(TARGET_DIR, SYSTEM_EXPECTED_SERVER)):
        return False, f"Inference Engine '{SYSTEM_EXPECTED_SERVER}' Missing"
    if not os.path.exists(os.path.join(TARGET_DIR, SYSTEM_EXPECTED_QUANT)):
        return False, f"Quantization Engine '{SYSTEM_EXPECTED_QUANT}' Missing"
    if not os.path.exists(os.path.join(TARGET_DIR, "convert_hf_to_gguf.py")):
        return False, "HuggingFace Converter Payload Missing"
    
    required_stubs = CRITICAL_DLLS.get(profile['type'], [])
    if required_stubs and os.name == 'nt':
        found_dlls = [f.lower() for f in os.listdir(TARGET_DIR) if f.endswith(".dll")]
        has_dependency = any(any(stub in dll for stub in required_stubs) for dll in found_dlls)
        if not has_dependency:
            return False, f"Missing Runtime DLLs for {profile['type']}"
            
    return True, "Ready"

def main():
    print("="*60)
    print("      SCRIBE-LLM UNIFIED HYDRATION PROTOCOL      ")
    print("="*60)

    profile = detect_hardware_profile()

    try:
        release = fetch_json(API_URL)
        latest_tag = release['tag_name']
    except Exception as e:
        print_status(f"Failed to fetch upstream release data: {e}", "ERROR")
        sys.exit(1)

    if os.path.exists(VERSION_MANIFEST) and os.path.exists(os.path.join(TARGET_DIR, SYSTEM_EXPECTED_SERVER)):
        with open(VERSION_MANIFEST, 'r') as f:
            current_version = f.read().strip()
            
        if current_version == latest_tag:
            is_valid, msg = verify_ensemble(profile)
            if is_valid:
                print_status(f"Engine is already synchronized to latest version ({latest_tag}).", "SUCCESS")
                sys.exit(0)
            else:
                print_status(f"Local topology compromised ({msg}). Forcing re-hydration.", "WARN")

    print_status(f"Synchronizing to upstream version: {latest_tag}...", "INFO")
    
    resilient_purge(TARGET_DIR)
    resilient_purge(STAGING_DIR)
    os.makedirs(TARGET_DIR, exist_ok=True)
    os.makedirs(STAGING_DIR, exist_ok=True)

    try:
        assets_to_fetch = []
        def add_asset(keywords):
            for asset in release['assets']:
                name = asset['name'].lower()
                if all(k in name for k in keywords):
                    assets_to_fetch.append(asset)
                    return True
            return False

        if os.name == 'nt':
            if profile['type'] == 'cuda':
                add_asset(["llama-", "bin-win", "cuda"])
                add_asset(["cudart-", "bin-win", "cuda"])
            elif profile['type'] == 'hip':
                add_asset(["llama-", "bin-win", "hip"])
            elif profile['type'] == 'vulkan':
                add_asset(["llama-", "bin-win", "vulkan"])
            
            if not assets_to_fetch:
                if not add_asset(["bin-win", "cpu"]):
                    add_asset(["bin-win", "x64"])
        elif sys.platform == "darwin":
            if not add_asset(["bin-macos", "arm64"]):
                add_asset(["bin-macos", "universal"])
        else:
            if profile['type'] == 'cuda':
                if not add_asset(["bin-ubuntu", "cuda"]):
                    add_asset(["bin-linux", "cuda"])
            elif profile['type'] == 'hip':
                if not add_asset(["bin-ubuntu", "rocm"]):
                    add_asset(["bin-linux", "rocm"])
            elif profile['type'] == 'vulkan':
                if not add_asset(["bin-ubuntu", "vulkan"]):
                    add_asset(["bin-linux", "vulkan"])
            
            if not assets_to_fetch:
                if not add_asset(["bin-ubuntu", "x64"]):
                    add_asset(["bin-linux", "x64"])

        if not assets_to_fetch:
            raise RuntimeError("No matching hardware assets found in upstream release.")

        if not extract_source_topology(latest_tag):
            raise RuntimeError("Source payload acquisition failed.")

        for asset in assets_to_fetch:
            pattern = re.escape(asset['name']) + r".*?sha256:\s*([a-fA-F0-9]{64})"
            match = re.search(pattern, release.get('body', ''), re.DOTALL | re.IGNORECASE)
            expected_hash = match.group(1).lower() if match else None
            
            if not extract_binary_topology(asset['browser_download_url'], expected_hash):
                raise RuntimeError(f"Binary asset acquisition failed: {asset['name']}")

        converge_structure()
        
        is_valid, msg = verify_ensemble(profile)
        if is_valid:
            with open(VERSION_MANIFEST, 'w') as f:
                f.write(latest_tag)
            print_status(f"Unified Hydration Complete. (v{latest_tag})", "SUCCESS")
        else:
            raise RuntimeError(f"Post-hydration verification failed: {msg}")

    except Exception as e:
        print_status(str(e), "ERROR")
        sys.exit(1)
    finally:
        resilient_purge(STAGING_DIR)

if __name__ == "__main__":
    main()