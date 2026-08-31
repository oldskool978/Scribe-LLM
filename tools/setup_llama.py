from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

REPO_OWNER = "ggml-org"
REPO_NAME = "llama.cpp"
TOOLS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = TOOLS_DIR.parent
TARGET_DIR = PROJECT_ROOT / "LMCPP"
STAGING_DIR = PROJECT_ROOT / "staging_lmcpp"
VERSION_MANIFEST = TARGET_DIR / ".version"
RELEASES_LIST_URL = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/releases?per_page=10"
LATEST_RELEASE_URL = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/releases/latest"
TIMEOUT = 30

EXE_EXT = ".exe" if os.name == "nt" else ""
SYSTEM_EXPECTED_SERVER = f"llama-server{EXE_EXT}"
SYSTEM_EXPECTED_QUANT = f"llama-quantize{EXE_EXT}"
SYSTEM_EXPECTED_IMATRIX = f"llama-imatrix{EXE_EXT}"

POSSIBLE_SERVER_NAMES = [f"llama-server{EXE_EXT}", f"server{EXE_EXT}"]
POSSIBLE_QUANT_NAMES = [f"llama-quantize{EXE_EXT}", f"quantize{EXE_EXT}"]
POSSIBLE_IMATRIX_NAMES = [f"llama-imatrix{EXE_EXT}", f"imatrix{EXE_EXT}"]

CRITICAL_DLLS = {
    "cuda": ["cudart64", "cublas64", "ggml-cuda"] if os.name == "nt" else ["libcudart", "libcublas", "libggml-cuda"],
    "rocm": ["amdhip64", "hip", "ggml-hip", "ggml-rocm", "amd_comgr"] if os.name == "nt" else ["libamdhip", "libggml-hip", "libggml-rocm"],
    "vulkan": ["ggml-vulkan"] if os.name == "nt" else ["libggml-vulkan"],
    "metal": [],
    "cpu": []
}

def print_status(msg: str, status: str = "INFO") -> None:
    colors = {"INFO": "\033[94m", "SUCCESS": "\033[92m", "WARN": "\033[93m", "ERROR": "\033[91m", "RESET": "\033[0m"}
    print(f"{colors.get(status, '')}[{status}] {msg}{colors['RESET']}")

def resilient_fs_op(func, *args, retries=5, delay=0.5, **kwargs):
    for attempt in range(retries):
        try:
            return func(*args, **kwargs)
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(delay)

def resilient_purge(path: Path) -> None:
    if not path.exists():
        return
    def remove_readonly(func, p, exc_info):
        try:
            os.chmod(p, stat.S_IWRITE)
            func(p)
        except Exception:
            pass
    if path.is_dir():
        resilient_fs_op(shutil.rmtree, str(path), onerror=remove_readonly)
    else:
        for _ in range(5):
            try:
                os.chmod(str(path), stat.S_IWRITE if os.name == "nt" else 0o755)
                path.unlink()
                return
            except Exception:
                time.sleep(0.5)

def safe_subprocess(cmd: list[str]) -> str:
    try:
        kwargs = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}
        return subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=5, **kwargs).decode("utf-8", errors="ignore").strip().lower()
    except Exception:
        return ""

def detect_hardware_profile() -> dict:
    print_status("Probing local compute platform...", "INFO")
    if sys.platform == "darwin":
        uname = safe_subprocess(["uname", "-m"])
        if "arm64" in uname:
            print_status("Apple Silicon (Metal Core)", "SUCCESS")
            return {"type": "metal", "ver": None}
        return {"type": "vulkan", "ver": None}

    if os.name == "nt":
        nv_out = safe_subprocess(["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"])
        if nv_out:
            try:
                major_ver = float(nv_out.split(".")[0])
                if major_ver >= 520:
                    print_status("NVIDIA CUDA Accelerated Runtime (v12)", "SUCCESS")
                    return {"type": "cuda", "ver": "12"}
                if major_ver >= 450:
                    print_status("NVIDIA CUDA Accelerated Runtime (v11)", "SUCCESS")
                    return {"type": "cuda", "ver": "11"}
            except ValueError:
                pass

        cim_out = safe_subprocess(["powershell", "-NoProfile", "-Command", "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"])
        if any(x in cim_out for x in ["amd", "radeon", "ryzen", "gfx"]):
            print_status("AMD ROCm Native Runtime Detected", "SUCCESS")
            return {"type": "rocm", "ver": None}
        if "intel" in cim_out and any(x in cim_out for x in ["arc", "iris", "ultra"]):
            print_status("Intel GPU (Vulkan Pipeline)", "SUCCESS")
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
                except Exception:
                    pass

        if has_nvidia:
            print_status("NVIDIA CUDA Runtime (Linux)", "SUCCESS")
            return {"type": "cuda", "ver": "12"}
        if has_amd:
            print_status("AMD ROCm Runtime (Linux)", "SUCCESS")
            return {"type": "rocm", "ver": None}
        if has_intel:
            print_status("Intel Arc (Linux Vulkan)", "SUCCESS")
            return {"type": "vulkan", "ver": None}

    print_status("Universal CPU/Vulkan Fallback Profile.", "WARN")
    return {"type": "vulkan", "ver": None}

def fetch_json(url: str) -> dict | list:
    headers = {"User-Agent": "Scribe-LMCPP-Hydrator"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 403:
                print_status("GitHub API Rate Limit. Export GITHUB_TOKEN environment variable.", "ERROR")
                sys.exit(1)
            time.sleep(2)
        except Exception as e:
            if attempt == 2:
                print_status(f"API Failure: {e}", "ERROR")
                sys.exit(1)
            time.sleep(2)
    return {}

def get_latest_binary_release() -> dict:
    data = fetch_json(RELEASES_LIST_URL)
    if isinstance(data, list) and len(data) > 0:
        for rel in data:
            if len(rel.get("assets", [])) > 5:
                return rel
    fallback = fetch_json(LATEST_RELEASE_URL)
    if isinstance(fallback, dict) and fallback.get("assets"):
        return fallback
    raise RuntimeError("Failed to resolve a release with compiled binary assets.")

def download_file(url: str, path: Path, expected_hash: str | None = None) -> bool:
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    for _ in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Scribe-LMCPP-Hydrator"})
            with urllib.request.urlopen(req, timeout=300) as response, open(tmp_path, "wb") as out_file:
                shutil.copyfileobj(response, out_file)
            if expected_hash:
                sha256 = hashlib.sha256()
                with open(tmp_path, "rb") as f:
                    while chunk := f.read(65536):
                        sha256.update(chunk)
                if sha256.hexdigest().lower() != expected_hash.lower():
                    raise ValueError("Checksum mismatch")
            resilient_fs_op(os.replace, str(tmp_path), str(path))
            return True
        except Exception:
            resilient_purge(tmp_path)
            time.sleep(2)
    return False

def extract_source_topology(tag_name: str) -> bool:
    print_status("Extracting hermetic conversion scripts (gguf-py)...", "INFO")
    source_url = f"https://github.com/{REPO_OWNER}/{REPO_NAME}/archive/refs/tags/{tag_name}.zip"
    zip_path = STAGING_DIR / "source.zip"
    if not download_file(source_url, zip_path):
        return False
    extract_dir = STAGING_DIR / "source_extracted"
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(extract_dir)
    extracted_items = list(extract_dir.iterdir())
    if not extracted_items:
        return False
    root_folder = extracted_items[0]
    for target in ["convert_hf_to_gguf.py", "gguf-py", "conversion", "convert"]:
        source = root_folder / target
        if source.exists():
            dest = TARGET_DIR / target
            if dest.exists():
                resilient_purge(dest)
            shutil.move(str(source), str(dest))
    return True

def extract_binary_topology(asset_url: str, expected_hash: str | None) -> bool:
    print_status(f"Acquiring binary asset: {Path(asset_url).name}...", "INFO")
    archive_path = STAGING_DIR / "binaries.archive"
    if not download_file(asset_url, archive_path, expected_hash):
        return False
    extract_dir = STAGING_DIR / "bin_extracted"
    extract_dir.mkdir(parents=True, exist_ok=True)
    if asset_url.lower().endswith(".zip"):
        with zipfile.ZipFile(archive_path, "r") as z:
            z.extractall(extract_dir)
    else:
        with tarfile.open(archive_path, "r:gz") as t:
            t.extractall(extract_dir)
    extracted_items = list(extract_dir.iterdir())
    if not extracted_items:
        return False
    root_folder = extracted_items[0] if extracted_items[0].is_dir() else extract_dir
    for item in root_folder.iterdir():
        dst = TARGET_DIR / item.name
        if item.is_dir():
            if dst.exists():
                for subitem in item.iterdir():
                    sub_dst = dst / subitem.name
                    if not sub_dst.exists():
                        shutil.move(str(subitem), str(sub_dst))
            else:
                shutil.move(str(item), str(dst))
        else:
            if not dst.exists():
                shutil.move(str(item), str(dst))
    return True

def converge_structure() -> None:
    print_status("Normalizing binary topology...", "INFO")
    for candidate in POSSIBLE_SERVER_NAMES:
        current_loc = TARGET_DIR / candidate
        expected_loc = TARGET_DIR / SYSTEM_EXPECTED_SERVER
        if current_loc.exists() and current_loc != expected_loc:
            resilient_purge(expected_loc)
            current_loc.rename(expected_loc)
            break
    for candidate in POSSIBLE_QUANT_NAMES:
        current_loc = TARGET_DIR / candidate
        expected_loc = TARGET_DIR / SYSTEM_EXPECTED_QUANT
        if current_loc.exists() and current_loc != expected_loc:
            resilient_purge(expected_loc)
            current_loc.rename(expected_loc)
            break
    for candidate in POSSIBLE_IMATRIX_NAMES:
        current_loc = TARGET_DIR / candidate
        expected_loc = TARGET_DIR / SYSTEM_EXPECTED_IMATRIX
        if current_loc.exists() and current_loc != expected_loc:
            resilient_purge(expected_loc)
            current_loc.rename(expected_loc)
            break
    for item in TARGET_DIR.iterdir():
        if item.is_file():
            if os.name != "nt" and item.name in [SYSTEM_EXPECTED_SERVER, SYSTEM_EXPECTED_QUANT, SYSTEM_EXPECTED_IMATRIX]:
                os.chmod(str(item), item.stat().st_mode | stat.S_IEXEC)
            elif os.name == "nt" and item.suffix.lower() == ".exe" and item.name not in [SYSTEM_EXPECTED_SERVER, SYSTEM_EXPECTED_QUANT, SYSTEM_EXPECTED_IMATRIX]:
                resilient_purge(item)

def verify_ensemble(backend_type: str) -> tuple[bool, str]:
    if not (TARGET_DIR / SYSTEM_EXPECTED_SERVER).exists():
        return False, f"Inference engine '{SYSTEM_EXPECTED_SERVER}' missing"
    if not (TARGET_DIR / SYSTEM_EXPECTED_QUANT).exists():
        return False, f"Quantization engine '{SYSTEM_EXPECTED_QUANT}' missing"
    if not (TARGET_DIR / "convert_hf_to_gguf.py").exists():
        return False, "Converter payload missing"
    required_stubs = CRITICAL_DLLS.get(backend_type, [])
    if required_stubs and os.name == "nt":
        found_dlls = [f.name.lower() for f in TARGET_DIR.glob("*.dll")]
        has_dep = any(any(stub in dll for stub in required_stubs) for dll in found_dlls)
        if not has_dep:
            return False, f"Missing runtime acceleration libraries for {backend_type}"
    return True, "Ready"

def select_assets(release_assets: list[dict], profile: dict) -> tuple[list[dict], str]:
    assets_to_fetch = []
    target_backend = profile["type"]

    def match_any(keywords: list[str]) -> dict | None:
        for a in release_assets:
            n = a.get("name", "").lower()
            if all(k in n for k in keywords) and n.endswith((".zip", ".tar.gz")):
                return a
        return None

    if os.name == "nt":
        if target_backend == "rocm":
            for rocm_keys in [["bin-win", "rocm", "x64"], ["bin-win", "hip", "x64"]]:
                if matched := match_any(rocm_keys):
                    assets_to_fetch.append(matched)
                    return assets_to_fetch, "rocm"
            target_backend = "vulkan"
        elif target_backend == "cuda":
            if bin_cu := (match_any(["bin-win", "cuda", "x64"]) or match_any(["bin-win", "cu", "x64"])):
                assets_to_fetch.append(bin_cu)
            if cudart := match_any(["cudart", "bin-win"]):
                assets_to_fetch.append(cudart)
            if assets_to_fetch:
                return assets_to_fetch, "cuda"
            target_backend = "vulkan"
        if target_backend == "vulkan":
            if bin_vk := match_any(["bin-win", "vulkan", "x64"]):
                assets_to_fetch.append(bin_vk)
                return assets_to_fetch, "vulkan"
        for a in release_assets:
            n = a.get("name", "").lower()
            if "bin-win" in n and ("avx2" in n or "x64" in n) and not any(x in n for x in ["cuda", "rocm", "hip", "vulkan", "arm64"]) and n.endswith(".zip"):
                assets_to_fetch.append(a)
                return assets_to_fetch, "cpu"
    elif sys.platform == "darwin":
        if bin_mac := (match_any(["bin-macos", "arm64"]) or match_any(["bin-macos", "universal"])):
            assets_to_fetch.append(bin_mac)
            return assets_to_fetch, "metal"
    else:
        if target_backend == "rocm":
            if bin_lrocm := (match_any(["ubuntu", "rocm"]) or match_any(["linux", "rocm"])):
                assets_to_fetch.append(bin_lrocm)
                return assets_to_fetch, "rocm"
        elif target_backend == "cuda":
            if bin_lcuda := (match_any(["ubuntu", "cuda"]) or match_any(["linux", "cuda"])):
                assets_to_fetch.append(bin_lcuda)
                return assets_to_fetch, "cuda"
        if bin_lvk := (match_any(["ubuntu", "vulkan"]) or match_any(["linux", "vulkan"])):
            assets_to_fetch.append(bin_lvk)
            return assets_to_fetch, "vulkan"
        if bin_lcpu := (match_any(["ubuntu", "x64"]) or match_any(["linux", "x64"])):
            assets_to_fetch.append(bin_lcpu)
            return assets_to_fetch, "cpu"

    return assets_to_fetch, target_backend

def main() -> None:
    parser = argparse.ArgumentParser(description="Hermetic LMCPP Binary Synchronizer")
    parser.add_argument("-f", "--force", action="store_true", help="Force complete re-hydration of binary artifacts")
    args = parser.parse_args()

    profile = detect_hardware_profile()
    try:
        release = get_latest_binary_release()
        latest_tag = release["tag_name"]
        assets = release.get("assets", [])
    except Exception as e:
        print_status(f"Failed to fetch release metadata: {e}", "ERROR")
        sys.exit(1)

    assets_to_fetch, effective_backend = select_assets(assets, profile)
    if not assets_to_fetch:
        print_status("No matching binary assets found in upstream release.", "ERROR")
        sys.exit(1)

    if not args.force and VERSION_MANIFEST.exists() and (TARGET_DIR / SYSTEM_EXPECTED_SERVER).exists():
        with open(VERSION_MANIFEST, "r") as f:
            current_version = f.read().strip()
        if current_version == latest_tag:
            is_valid, msg = verify_ensemble(effective_backend)
            if is_valid:
                print_status(f"LMCPP engine synchronized to latest upstream ({latest_tag}).", "SUCCESS")
                sys.exit(0)
            print_status(f"Local topology compromised ({msg}). Re-hydrating...", "WARN")

    print_status(f"Hydrating upstream build {latest_tag} ({effective_backend})...", "INFO")
    resilient_purge(TARGET_DIR)
    resilient_purge(STAGING_DIR)
    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    STAGING_DIR.mkdir(parents=True, exist_ok=True)

    try:
        if not extract_source_topology(latest_tag):
            raise RuntimeError("Source payload acquisition failed.")
        for asset in assets_to_fetch:
            pattern = re.escape(asset["name"]) + r".*?sha256:\s*([a-fA-F0-9]{64})"
            match = re.search(pattern, release.get("body", ""), re.DOTALL | re.IGNORECASE)
            expected_hash = match.group(1).lower() if match else None
            if not extract_binary_topology(asset["browser_download_url"], expected_hash):
                raise RuntimeError(f"Binary asset extraction failed: {asset['name']}")
        converge_structure()
        is_valid, msg = verify_ensemble(effective_backend)
        if is_valid:
            with open(VERSION_MANIFEST, "w") as f:
                f.write(latest_tag)
            print_status(f"Engine Hydration Complete ({latest_tag})", "SUCCESS")
        else:
            raise RuntimeError(f"Verification check failed: {msg}")
    except Exception as e:
        print_status(str(e), "ERROR")
        sys.exit(1)
    finally:
        resilient_purge(STAGING_DIR)

if __name__ == "__main__":
    main()