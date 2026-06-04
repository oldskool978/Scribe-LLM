# Copyright (c) 2026 Hector Nunez. Licensed under PolyForm Shield License 1.0.0. See LICENSE.md.

import os
import sys
import subprocess
import re
from pathlib import Path

def print_status(msg, status="INFO"):
    colors = {"INFO": "\033[94m", "SUCCESS": "\033[92m", "WARN": "\033[93m", "ERROR": "\033[91m", "RESET": "\033[0m"}
    print(f"{colors.get(status, '')}[{status}] {msg}{colors['RESET']}")

def safe_subprocess(cmd):
    try:
        kwargs = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
        return subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=10, text=True, **kwargs).strip()
    except Exception:
        return ""

def resolve_hardware_matrix():
    has_nvidia, has_amd, has_intel = False, False, False
    amd_target_gfx = "gfx1100"

    if os.name == 'nt':
        gpu_info = safe_subprocess(["powershell", "-NoProfile", "-Command", "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"])
        for line in gpu_info.splitlines():
            name = line.strip()
            if not name: continue
            if re.search(r'(?i)NVIDIA', name): has_nvidia = True
            if re.search(r'(?i)Intel.*(Arc|Iris|Ultra)', name): has_intel = True
            if re.search(r'(?i)AMD|Radeon|Ryzen', name):
                has_amd = True
                if re.search(r'(?i)R9700|R9\d00|AI\s*PRO\s*R|890M|880M|Strix|Ryzen\s*AI|RX\s*[89]\d{2,3}', name): amd_target_gfx = "gfx120X"
                elif re.search(r'(?i)7800|7700', name): amd_target_gfx = "gfx1101"
                elif re.search(r'(?i)7600|W7600|W7500', name): amd_target_gfx = "gfx1102"
                elif re.search(r'(?i)7900|W7900|7900M', name): amd_target_gfx = "gfx1100"
                elif re.search(r'(?i)780M|760M|740M|Phoenix|Hawk', name): amd_target_gfx = "gfx1103"
                elif re.search(r'(?i)680M|660M|Rembrandt', name): amd_target_gfx = "gfx1035"
                elif re.search(r'(?i)6900|6800|6700|W6800', name): amd_target_gfx = "gfx1030"
                elif re.search(r'(?i)MI325|MI350', name): amd_target_gfx = "gfx950"
                elif re.search(r'(?i)MI300', name): amd_target_gfx = "gfx942"
                elif re.search(r'(?i)MI250', name): amd_target_gfx = "gfx90a"
    else:
        lspci = safe_subprocess(["lspci"])
        if lspci:
            if re.search(r'(?i)NVIDIA', lspci): has_nvidia = True
            if re.search(r'(?i)AMD|Radeon', lspci): has_amd = True
            if re.search(r'(?i)Intel.*(Arc|Graphics)', lspci): has_intel = True
        
        drm_path = Path("/sys/class/drm")
        if drm_path.exists():
            for uevent in drm_path.glob("card*/device/uevent"):
                try:
                    content = uevent.read_text()
                    if "DRIVER=amdgpu" in content: has_amd = True
                    if "DRIVER=nvidia" in content: has_nvidia = True
                    if "DRIVER=i915" in content or "DRIVER=xe" in content: has_intel = True
                except Exception: pass

        if has_amd:
            if lspci and re.search(r'(?i)890M|880M', lspci):
                amd_target_gfx = "gfx120X"
            elif lspci and re.search(r'(?i)MI325|MI350', lspci):
                amd_target_gfx = "gfx950"
            elif lspci and re.search(r'(?i)7800|7700', lspci):
                amd_target_gfx = "gfx1101"
            elif lspci and re.search(r'(?i)7600|W7600|W7500', lspci):
                amd_target_gfx = "gfx1102"
            elif lspci and re.search(r'(?i)680M|660M|Rembrandt', lspci):
                amd_target_gfx = "gfx1035"
            else:
                rocm_info = safe_subprocess(["rocminfo"])
                gfx_match = re.search(r'gfx\d+', rocm_info)
                if gfx_match:
                    amd_target_gfx = gfx_match.group(0)

    if has_nvidia:
        smi = safe_subprocess(["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"])
        if smi:
            try:
                major = int(smi.split('.')[0])
                if major >= 620: return "CUDA_13_2", ""
                if major >= 600: return "CUDA_13_0", ""
                if major >= 560: return "CUDA_12_6", ""
                if major >= 520: return "CUDA_12_1", ""
                if major >= 450: return "CUDA_11_8", ""
            except: pass
        return "CUDA_12_6", "" 

    if has_amd: return "ROCM", amd_target_gfx
    if has_intel: return "INTEL_XPU", ""
    return "CPU", ""

def hydrate_pytorch():
    print("="*60)
    print("      SCRIBE-LLM PYTORCH HARDWARE ALIGNMENT PROTOCOL       ")
    print("="*60)

    profile, llvm_target = resolve_hardware_matrix()
    target_str = f" ({llvm_target})" if llvm_target else ""
    print_status(f"Hardware Profile Resolved: {profile}{target_str}", "INFO")

    pip_cmd = [sys.executable, "-m", "pip", "install", "--no-cache-dir", "--no-warn-script-location"]

    print_status("Bootstrapping core Python build engines (pip/setuptools/wheel)...", "INFO")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-U", "pip", "setuptools", "wheel", "--no-warn-script-location"])

    print_status(f"Injecting bleeding-edge compute binaries for {profile}...", "INFO")
    
    try:
        if profile == "ROCM":
            url_param = f"{llvm_target}-all"
            index_url = f"https://rocm.nightlies.amd.com/v2-staging/{url_param}/"
            if os.name == 'nt':
                subprocess.check_call(pip_cmd + ["--index-url", index_url, "--pre", "-U", "--no-build-isolation", "rocm[libraries,devel]"])
            subprocess.check_call(pip_cmd + ["--index-url", index_url, "--pre", "-U", "torch", "torchvision", "torchaudio"])
        
        elif profile.startswith("CUDA_"):
            cuda_urls = {
                "CUDA_13_2": "https://download.pytorch.org/whl/nightly/cu132",
                "CUDA_13_0": "https://download.pytorch.org/whl/nightly/cu130",
                "CUDA_12_6": "https://download.pytorch.org/whl/nightly/cu126",
                "CUDA_12_1": "https://download.pytorch.org/whl/cu121",
                "CUDA_11_8": "https://download.pytorch.org/whl/cu118"
            }
            index_url = cuda_urls.get(profile, "https://download.pytorch.org/whl/nightly/cu126")
            subprocess.check_call(pip_cmd + ["--index-url", index_url, "--pre", "-U", "torch", "torchvision", "torchaudio"])
        
        elif profile == "INTEL_XPU":
            subprocess.check_call(pip_cmd + ["--index-url", "https://pytorch-extension.intel.com/release-whl/stable/xpu/us/", "-U", "torch", "torchvision", "torchaudio", "intel-extension-for-pytorch"])
        
        else:
            subprocess.check_call(pip_cmd + ["--index-url", "https://download.pytorch.org/whl/cpu", "--pre", "-U", "torch", "torchvision", "torchaudio"])

        print_status("Bleeding-edge hardware alignment complete. VRAM execution paths secured.", "SUCCESS")
    
    except subprocess.CalledProcessError as e:
        print_status(f"Failed to align PyTorch binaries. Pip exit code: {e.returncode}", "ERROR")
        sys.exit(1)

if __name__ == "__main__":
    hydrate_pytorch()