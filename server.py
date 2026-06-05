# Copyright (c) 2026 Hector Nunez. Licensed under PolyForm Shield License 1.0.0. See LICENSE.md.

import os
import sys
import time
import json
import socket
import threading
import subprocess
import requests
import struct
import re
import argparse
import queue
import shutil
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from typing import Dict, Tuple, Optional, List, Any
from requests.adapters import HTTPAdapter

if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

STATIC_DIR = os.path.join(BASE_DIR, "static")
MODELS_DIR = os.path.join(BASE_DIR, "models")
BIN_DIR = os.path.join(BASE_DIR, "LMCPP")
ACQ_ENGINE_DIR = os.path.join(BASE_DIR, "acquisition_engine")
PID_LOCK_FILE = os.path.join(BASE_DIR, ".scribe.pid")

LLAMA_PORT = 28080
PROXY_PORT = 28000

os.makedirs(MODELS_DIR, exist_ok=True)

parser = argparse.ArgumentParser(description="Scribe-LLM Node Agent")
parser.add_argument("-v", "--verbose", action="store_true")
args_cli = parser.parse_args()
VERBOSE_MODE = args_cli.verbose

PROXY_SESSION = requests.Session()
_adapter = HTTPAdapter(pool_connections=100, pool_maxsize=100)
PROXY_SESSION.mount('http://', _adapter)
PROXY_SESSION.mount('https://', _adapter)

_LOCKED_TOPOLOGY = None 
_HERMETIC_HIP_PATH = None
_CACHED_AMD_STATIC = None

def find_hermetic_hipinfo() -> Optional[str]:
    global _HERMETIC_HIP_PATH
    if _HERMETIC_HIP_PATH:
        return _HERMETIC_HIP_PATH
    
    search_roots = [os.path.join(BASE_DIR, ".venv"), os.path.join(BASE_DIR, "venv"), BASE_DIR]
    names = ["hipInfo.exe", "hipinfo.exe", "hipInfo", "hipinfo"] if os.name == 'nt' else ["rocminfo"]
    
    for root in search_roots:
        site_pkgs = os.path.join(root, "Lib", "site-packages")
        if not os.path.exists(site_pkgs) and os.path.exists(os.path.join(root, "lib")):
            for item in os.listdir(os.path.join(root, "lib")):
                if item.startswith("python"):
                    sp = os.path.join(root, "lib", item, "site-packages")
                    if os.path.exists(sp):
                        site_pkgs = sp
                        break
                        
        if os.path.exists(site_pkgs):
            try:
                for pkg_dir in os.listdir(site_pkgs):
                    full_pkg = os.path.join(site_pkgs, pkg_dir)
                    if os.path.isdir(full_pkg):
                        for sub in ["", "bin"]:
                            target = os.path.join(full_pkg, sub) if sub else full_pkg
                            if os.path.exists(target):
                                for name in names:
                                    path = os.path.join(target, name)
                                    if os.path.exists(path) and os.path.isfile(path):
                                        _HERMETIC_HIP_PATH = path
                                        return path
            except Exception: pass
    return None

def query_nvidia_cuda(kwargs) -> Optional[dict]:
    if sys.platform == "darwin":
        return None
    if not shutil.which("nvidia-smi"):
        return None
    try:
        res = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"], timeout=2, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, **kwargs)
        if res.stdout:
            data = res.stdout.strip().split('\n')[0].split(',')
            if len(data) >= 3:
                return {"type": data[0].strip(), "vram_total": float(data[1].strip()), "vram_free": float(data[2].strip())}
    except Exception: pass
    return None

def query_amd_hip(kwargs) -> Optional[dict]:
    global _CACHED_AMD_STATIC, _LOCKED_TOPOLOGY
    
    hip_path = find_hermetic_hipinfo()
    if not hip_path:
        return None
        
    if os.name == 'nt':
        try:
            res = subprocess.run([hip_path], timeout=3, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, **kwargs)
            if res.stdout:
                total_mb, free_mb, device_names = 0.0, 0.0, []
                current_name = "AMD HIP Device"
                for line in res.stdout.splitlines():
                    line = line.strip()
                    if ":" in line:
                        key, val = [s.strip() for s in line.split(":", 1)]
                        if key == "Name": current_name = val
                        elif key == "gcnArchName": device_names.append(f"{current_name} [{val}]")
                        elif key == "memInfo.total": total_mb += float(val.split()[0]) * (1024.0 if "GB" in val else 1.0)
                        elif key == "memInfo.free": free_mb += float(val.split()[0]) * (1024.0 if "GB" in val else 1.0)
                if total_mb > 0:
                    unique_names = list(set(device_names)) or [current_name]
                    gpu_type = f"{len(device_names)}x {unique_names[0]}" if len(device_names) > 1 and len(unique_names) == 1 else " + ".join(unique_names)
                    return {"type": gpu_type, "vram_total": total_mb, "vram_free": free_mb}
        except Exception: pass
        return None

    if _CACHED_AMD_STATIC is None:
        gpu_type = "AMD ROCm Accelerated SoC"
        try:
            res = subprocess.run([hip_path], timeout=3, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, **kwargs)
            if res.stdout:
                gpu_agents = []
                current_agent = None
                
                for line in res.stdout.splitlines():
                    stripped = line.strip()
                    if re.match(r'^Agent\s+\d+', stripped) or (stripped.startswith('Agent') and len(stripped.split()) == 2):
                        if current_agent and current_agent.get("Device Type") == "GPU":
                            gpu_agents.append(current_agent)
                        current_agent = {}
                        continue
                    
                    if current_agent is None:
                        continue
                        
                    if ":" in line:
                        key, val = [s.strip() for s in line.split(":", 1)]
                        if key in ["Name", "Marketing Name", "Device Type", "gcnArchName"]:
                            current_agent[key] = val
                            
                if current_agent and current_agent.get("Device Type") == "GPU":
                    gpu_agents.append(current_agent)
                    
                if gpu_agents:
                    agent = gpu_agents[0]
                    name = agent.get("Marketing Name") or agent.get("Name") or "AMD ROCm Device"
                    arch = agent.get("gcnArchName")
                    gpu_type = f"{name} [{arch}]" if arch else name
        except Exception:
            pass
            
        _CACHED_AMD_STATIC = {"type": gpu_type}
        _LOCKED_TOPOLOGY = "AMD_HIP"

    try:
        m_total, m_avail = 0.0, 0.0
        with open("/proc/meminfo", "r") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    m_total = float(line.split()[1]) / 1024.0
                elif line.startswith("MemAvailable:"):
                    m_avail = float(line.split()[1]) / 1024.0
                    break
                    
        if m_total > 0.0:
            return {
                "type": _CACHED_AMD_STATIC["type"],
                "vram_total": round(m_total, 2),
                "vram_free": round(m_avail, 2)
            }
    except Exception: 
        pass

    return {"type": _CACHED_AMD_STATIC["type"], "vram_total": 0.0, "vram_free": 0.0}

def query_intel_xpu(kwargs) -> Optional[dict]:
    try:
        if os.name == 'nt':
            cmd = ["powershell", "-NoProfile", "-Command", "Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match 'Intel' -and ($_.Name -match 'Arc' -or $_.Name -match 'Iris' -or $_.Name -match 'Ultra' -or $_.Name -match 'Graphics') } | Select-Object Name, AdapterRAM | ConvertTo-Json -Compress"]
            res = subprocess.run(cmd, timeout=3, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, **kwargs)
            if res.stdout:
                cim_data = json.loads(res.stdout.strip())
                cim_data = [cim_data] if isinstance(cim_data, dict) else cim_data
                if cim_data and cim_data[0].get("Name"):
                    ram_val = float(cim_data[0].get("AdapterRAM", 0))
                    if ram_val < 0 or ram_val == 4294967295 or ram_val == 2147483647:
                        ram_val = 8589934592  
                    total_mb = ram_val / (1024 * 1024)
                    return {"type": cim_data[0]["Name"], "vram_total": total_mb, "vram_free": total_mb * 0.70}
        else:
            drm_dir = "/sys/class/drm"
            if os.path.exists(drm_dir):
                for card in os.listdir(drm_dir):
                    if card.startswith("card"):
                        uevent_path = os.path.join(drm_dir, card, "device", "uevent")
                        if os.path.exists(uevent_path):
                            with open(uevent_path, "r", errors="ignore") as f:
                                content = f.read()
                            if "DRIVER=i915" in content or "DRIVER=xe" in content:
                                return {"type": "Intel XPU Graphics (Native)", "vram_total": 4096.0, "vram_free": 2048.0}
    except Exception: pass
    return None

def query_apple_metal() -> Optional[dict]:
    if sys.platform != "darwin":
        return None
    try:
        res = subprocess.run(["sysctl", "hw.memsize"], timeout=2, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        if res.stdout:
            total_ram = float(res.stdout.strip().split(' ')[1]) / (1024 * 1024)
            return {"type": "Apple Metal (Unified)", "vram_total": total_ram, "vram_free": total_ram * 0.75}
    except Exception: pass
    return None

class SystemProfiler:
    _cache = {"type": "CPU Native", "vram_total": 0.0, "vram_free": 0.0, "ram_total": 0.0, "ram_free": 0.0}
    _lock = threading.Lock()
    _probe_thread = None
    _first_init = True

    @classmethod
    def detect_accelerator(cls) -> dict:
        with cls._lock:
            if cls._probe_thread is None or not cls._probe_thread.is_alive():
                cls._probe_thread = threading.Thread(target=cls._run_probe, daemon=True)
                cls._probe_thread.start()
                if cls._first_init:
                    cls._first_init = False
                    cls._lock.release()
                    cls._probe_thread.join(timeout=2.0)
                    cls._lock.acquire()
            return cls._cache.copy()

    @classmethod
    def _run_probe(cls):
        global _LOCKED_TOPOLOGY
        telemetry = {"type": "CPU Native", "vram_total": 0.0, "vram_free": 0.0, "ram_total": 0.0, "ram_free": 0.0}
        kwargs = {'creationflags': subprocess.CREATE_NO_WINDOW | 0x04000000} if os.name == 'nt' else {}

        try:
            if os.name == 'nt':
                cmd_ram = ["powershell", "-NoProfile", "-Command", "Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize, FreePhysicalMemory | ConvertTo-Json -Compress"]
                res_ram = subprocess.run(cmd_ram, timeout=3, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, **kwargs)
                if res_ram.stdout:
                    mem_data = json.loads(res_ram.stdout.strip())
                    telemetry["ram_total"] = round(float(mem_data.get("TotalVisibleMemorySize", 0)) / 1024.0, 2)
                    telemetry["ram_free"] = round(float(mem_data.get("FreePhysicalMemory", 0)) / 1024.0, 2)
            elif sys.platform == "darwin":
                res_ram = subprocess.run(["sysctl", "hw.memsize"], timeout=3, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
                if res_ram.stdout:
                    total_bytes = float(res_ram.stdout.strip().split(' ')[1])
                    telemetry["ram_total"] = round(total_bytes / (1024 * 1024), 2)
                    res_vm = subprocess.run(["vm_stat"], timeout=3, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
                    if res_vm.stdout:
                        pages_free, pages_inactive, page_size = 0, 0, 4096
                        for line in res_vm.stdout.splitlines():
                            if "page size of" in line: page_size = int(line.split()[-2])
                            elif "Pages free:" in line: pages_free = int(line.split()[-1].strip('.'))
                            elif "Pages inactive:" in line: pages_inactive = int(line.split()[-1].strip('.'))
                        telemetry["ram_free"] = round(((pages_free + pages_inactive) * page_size) / (1024 * 1024), 2)
            else:
                if os.path.exists("/proc/meminfo"):
                    with open("/proc/meminfo", "r") as f: lines = f.readlines()
                    m_total, m_avail = 0.0, 0.0
                    for line in lines:
                        if line.startswith("MemTotal:"): m_total = float(line.split()[1]) / 1024.0
                        elif line.startswith("MemAvailable:"): m_avail = float(line.split()[1]) / 1024.0
                    telemetry["ram_total"] = round(m_total, 2)
                    telemetry["ram_free"] = round(m_avail, 2)
        except Exception: pass

        if _LOCKED_TOPOLOGY is not None:
            if _LOCKED_TOPOLOGY == "NVIDIA_CUDA":
                gpu_data = query_nvidia_cuda(kwargs)
            elif _LOCKED_TOPOLOGY == "AMD_HIP":
                gpu_data = query_amd_hip(kwargs)
            elif _LOCKED_TOPOLOGY == "INTEL_XPU":
                gpu_data = query_intel_xpu(kwargs)
            elif _LOCKED_TOPOLOGY == "APPLE_METAL":
                gpu_data = query_apple_metal()
            else:
                gpu_data = None
            
            if gpu_data:
                telemetry.update(gpu_data)
        else:
            ui_log = "CPU Native"
            if os.name != 'nt' and find_hermetic_hipinfo():
                gpu_data = query_amd_hip(kwargs)
                if gpu_data:
                    _LOCKED_TOPOLOGY = "AMD_HIP"
                    telemetry.update(gpu_data)
                    ui_log = "AMD HIP"
            else:
                gpu_data = query_nvidia_cuda(kwargs)
                if gpu_data:
                    _LOCKED_TOPOLOGY = "NVIDIA_CUDA"
                    telemetry.update(gpu_data)
                    ui_log = "NVIDIA CUDA"
                else:
                    gpu_data = query_amd_hip(kwargs)
                    if gpu_data:
                        _LOCKED_TOPOLOGY = "AMD_HIP"
                        telemetry.update(gpu_data)
                        ui_log = "AMD HIP"
                    else:
                        gpu_data = query_intel_xpu(kwargs)
                        if gpu_data:
                            _LOCKED_TOPOLOGY = "INTEL_XPU"
                            telemetry.update(gpu_data)
                            ui_log = "Intel XPU"
                        else:
                            gpu_data = query_apple_metal()
                            if gpu_data:
                                _LOCKED_TOPOLOGY = "APPLE_METAL"
                                telemetry.update(gpu_data)
                                ui_log = "Apple Metal"
                            else:
                                _LOCKED_TOPOLOGY = "CPU_NATIVE"
                                ui_log = "CPU Native"
                                
            sys.stdout.write(f"\033[95m[TOPOLOGY] Compute Graph Locked to: {ui_log}\033[0m\n")

        with cls._lock:
            cls._cache = telemetry
            
GGUF_META_CACHE = {}

def get_gguf_metadata(filepath: str) -> dict:
    try:
        stat_info = os.stat(filepath)
        cache_key = f"{filepath}_{stat_info.st_size}_{stat_info.st_mtime}"
        
        if cache_key in GGUF_META_CACHE:
            return GGUF_META_CACHE[cache_key]
            
        meta = parse_gguf_metadata(filepath)
        GGUF_META_CACHE[cache_key] = meta
        return meta
    except Exception:
        return {"ctx": 8192, "layers": 99, "expert_count": 0, "expert_used": 0, "has_template": False, "embed_dim": 4096, "head_count": 32, "head_count_kv": 8}

def parse_gguf_metadata(filepath: str) -> dict:
    meta = {"ctx": 8192, "layers": 99, "expert_count": 0, "expert_used": 0, "has_template": False, "embed_dim": 4096, "head_count": 32, "head_count_kv": 8}
    try:
        gguf_py_path = os.path.join(BIN_DIR, "gguf-py")
        if gguf_py_path not in sys.path:
            sys.path.insert(0, gguf_py_path)
            
        from gguf import GGUFReader
        reader = GGUFReader(filepath)
        
        def extract_val(field_key):
            field = reader.fields.get(field_key)
            if not field or not field.parts:
                return None
            part = field.parts[-1]
            if hasattr(part, 'tobytes'):
                return part.tobytes().decode('utf-8', errors='ignore').strip('\x00')
            if isinstance(part, (bytes, bytearray)):
                return part.decode('utf-8', errors='ignore').strip('\x00')
            if isinstance(part, list) or hasattr(part, '__getitem__'):
                return part[0]
            return part

        ctx = extract_val("llama.context_length")
        if ctx is not None: meta["ctx"] = int(ctx)
        
        layers = extract_val("llama.block_count")
        if layers is not None: meta["layers"] = int(layers)
        
        exp_cnt = extract_val("llama.expert_count")
        if exp_cnt is not None: meta["expert_count"] = int(exp_cnt)
        
        exp_used = extract_val("llama.expert_used_count")
        if exp_used is not None: meta["expert_used"] = int(exp_used)
        
        if "tokenizer.chat_template" in reader.fields:
            meta["has_template"] = True
            
        emb = extract_val("llama.embedding_length")
        if emb is not None: meta["embed_dim"] = int(emb)
        
        hc = extract_val("llama.attention.head_count")
        if hc is not None: meta["head_count"] = int(hc)
        
        hckv = extract_val("llama.attention.head_count_kv")
        if hckv is not None: meta["head_count_kv"] = int(hckv)

    except Exception:
        pass
    return meta

class TelemetryDaemon(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.cache = {"type": "Probing Accelerator...", "vram_total": 0.0, "vram_free": 0.0, "ram_total": 0.0, "ram_free": 0.0, "models": []}
        self.lock = threading.Lock()
        self._last_hw_scan = 0.0

    def _update_telemetry(self):
        now = time.time()
        
        is_engine_active = dispatcher.state["status"] in ["ready", "booting", "inferring"]
        hw_scan_interval = 4.0 if is_engine_active else 15.0
        
        hw_data = None
        if now - self._last_hw_scan >= hw_scan_interval:
            hw_data = SystemProfiler.detect_accelerator()
            self._last_hw_scan = now
        
        models_data = []
        try:
            for m in dispatcher.list_models():
                if "mmproj" not in m.lower():
                    filepath = os.path.join(MODELS_DIR, m)
                    meta = get_gguf_metadata(filepath)
                    sz_mb = os.path.getsize(filepath) / (1024 * 1024) if os.path.exists(filepath) else 0
                    models_data.append({
                        "name": m, 
                        "size_mb": sz_mb,
                        "native_ctx": meta.get("ctx", 8192), 
                        "max_layers": meta.get("layers", 99),
                        "expert_count": meta.get("expert_count", 0),
                        "expert_used": meta.get("expert_used", 0),
                        "embed_dim": meta.get("embed_dim", 4096),
                        "head_count": meta.get("head_count", 32),
                        "head_count_kv": meta.get("head_count_kv", 8)
                    })
        except Exception: pass
        
        dispatcher.state["available_models"] = models_data
        
        with self.lock:
            if hw_data:
                self.cache.update(hw_data)
            self.cache["models"] = models_data

    def run(self):
        while True:
            try:
                self._update_telemetry()
            except Exception:
                pass
            time.sleep(2.5)

class EngineDispatcher:
    def __init__(self):
        self.process, self.monitor_thread, self.health_thread = None, None, None
        self.shutdown_event = threading.Event()
        self.state = {"status": "offline", "current_model": None, "error_msg": "", "logs": [], "available_models": []}

    def list_models(self) -> List[str]: return [f for f in os.listdir(MODELS_DIR) if f.endswith(".gguf")]
    
    def _find_mmproj(self, model_name: str) -> Optional[str]:
        model_low = model_name.lower().replace(".gguf", "")
        if "mmproj" in model_low:
            return None

        all_files = self.list_models()
        best_projector = None
        best_current_score = 0

        for f in all_files:
            f_low = f.lower()
            if "mmproj" not in f_low:
                continue

            proj_base = f_low.split("mmproj")[0].rstrip("-_ .")
            if not proj_base:
                continue

            current_model_score = 0
            for c1, c2 in zip(model_low, proj_base):
                if c1 == c2:
                    current_model_score += 1
                else:
                    break

            if current_model_score == 0:
                continue

            has_superior_claim = False
            for workspace_file in all_files:
                if workspace_file == model_name or "mmproj" in workspace_file.lower():
                    continue
                
                wf_low = workspace_file.lower().replace(".gguf", "")
                
                other_score = 0
                for c1, c2 in zip(wf_low, proj_base):
                    if c1 == c2:
                        other_score += 1
                    else:
                        break
                
                if other_score > current_model_score:
                    has_superior_claim = True
                    break

            if has_superior_claim:
                continue

            if current_model_score > best_current_score:
                best_current_score = current_model_score
                best_projector = f

        if best_projector:
            sys.stdout.write(f"\033[92m[VISION] Match assigned: {best_projector} (Prefix Score: {best_current_score})\033[0m\n")
            return os.path.join(MODELS_DIR, best_projector)

        return None

    def _find_draft_model(self, model_name: str) -> Optional[str]:
        ggufs = self.list_models()
        base_name = model_name.lower().split('-')[0]
        for f in ggufs:
            if "draft" in f.lower() and base_name in f.lower() and f != model_name:
                return os.path.join(MODELS_DIR, f)
        return None

    def _is_port_in_use(self) -> bool:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s: return s.connect_ex(('127.0.0.1', LLAMA_PORT)) == 0

    def _slay_zombies(self):
        if os.path.exists(PID_LOCK_FILE):
            sys.stdout.write(f"\033[93m[DISPATCH] Engaging targeted PID isolation purge...\033[0m\n")
            try:
                with open(PID_LOCK_FILE, "r") as f:
                    pid = int(f.read().strip())
                    
                if os.name == 'nt': 
                    subprocess.run(["taskkill", "/F", "/PID", str(pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else: 
                    subprocess.run(["kill", "-9", str(pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                time.sleep(0.5) 
            except Exception: pass
            finally:
                try: os.remove(PID_LOCK_FILE)
                except Exception: pass

        if self._is_port_in_use():
            sys.stdout.write(f"\033[93m[DISPATCH] Port {LLAMA_PORT} still locked. Executing surgical port strike...\033[0m\n")
            try:
                if os.name == 'nt':
                    output = subprocess.check_output(["netstat", "-ano"], text=True, timeout=5)
                    target_sig = f":{LLAMA_PORT}"
                    for line in output.splitlines():
                        if target_sig in line and ("LISTENING" in line or "ESTABLISHED" in line):
                            parts = line.strip().split()
                            if len(parts) >= 5:
                                rogue_pid = parts[-1]
                                subprocess.run(["taskkill", "/F", "/PID", rogue_pid], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    output = subprocess.check_output(["lsof", "-t", f"-i:{LLAMA_PORT}"], text=True, timeout=5)
                    for rogue_pid in output.splitlines():
                        if rogue_pid.strip():
                            subprocess.run(["kill", "-9", rogue_pid.strip()], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                time.sleep(1.0)
            except Exception: pass

    def boot_engine(self, config: dict):
        self.terminate()
        self.shutdown_event.clear()
        
        if acquisition_dispatcher.is_running:
            self.state.update({"status": "error", "error_msg": "Hardware Mutex Lock: Acquisition Engine is currently monopolizing system resources."})
            return
            
        if self._is_port_in_use():
            self._slay_zombies()
            if self._is_port_in_use(): 
                self.state.update({"status": "error", "error_msg": f"Port {LLAMA_PORT} critically locked."})
                return

        bin_path, llm_path = os.path.join(BIN_DIR, "llama-server.exe" if os.name == "nt" else "llama-server"), os.path.join(MODELS_DIR, config.get("model"))
        if not os.path.exists(bin_path): self.state.update({"status": "error", "error_msg": "Missing inference binary."}); return

        self.state.update({"status": "booting", "current_model": config.get("model"), "error_msg": "", "logs": []})
        
        meta = get_gguf_metadata(llm_path)
        requested_ctx = config.get("ctx_size", 8192)

        target_layers = config.get("gpu_layers", 99)
        threads = config.get("threads", 8)
        parallel_slots = config.get("parallel_slots", 6)
        
        batch_size = max(config.get("batch_size", 2048), 2048)
        u_batch = min(batch_size, config.get("u_batch", batch_size))

        args = [
            bin_path, "--model", llm_path, "--host", "127.0.0.1", "--port", str(LLAMA_PORT), 
            "-ngl", str(target_layers), 
            "-c", str(requested_ctx), 
            "-b", str(batch_size), 
            "-ub", str(u_batch),
            "-t", str(threads),
            "-np", str(parallel_slots), 
            "--context-shift",
            "-cb"
        ]

        if draft_path := self._find_draft_model(config.get("model")):
            args.extend(["--model-draft", draft_path])

        kv_k = config.get("kv_quant_k", config.get("kv_quant", "auto"))
        kv_v = config.get("kv_quant_v", config.get("kv_quant", "auto"))
        if kv_k != "auto": args.extend(["-ctk", kv_k])
        if kv_v != "auto": args.extend(["-ctv", kv_v])
        
        fa_val = str(config.get("flash_attn", "auto")).lower()
        if fa_val in ["true", "on", "1"]: args.extend(["--flash-attn", "on"])
        elif fa_val in ["false", "off", "0"]: args.extend(["--flash-attn", "off"])

        if str(config.get("mlock", False)).lower() == "true": args.append("--mlock")
        if str(config.get("no_mmap", False)).lower() == "true": args.append("--no-mmap")
        if str(config.get("swa_full", False)).lower() == "true": args.append("--swa-full")
        
        max_physical_layers = meta.get("layers", 99)
        if target_layers < max_physical_layers:
            args.extend(["--numa", "distribute"])
        
        if (mmproj := self._find_mmproj(config.get("model"))): args.extend(["--mmproj", mmproj])

        sys.stdout.write(f"\033[94m[DISPATCH] Igniting Compute Graph (Slots: {parallel_slots}, Batch: {batch_size}, U-Batch: {u_batch}):\n  {' '.join(args)}\033[0m\n")
        
        try:
            kwargs = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
            self.process = subprocess.Popen(
                args, 
                stdout=subprocess.PIPE if VERBOSE_MODE else subprocess.DEVNULL, 
                stderr=subprocess.STDOUT if VERBOSE_MODE else subprocess.PIPE, 
                text=True, 
                bufsize=1, 
                encoding='utf-8', 
                errors='replace', 
                **kwargs
            )
            
            with open(PID_LOCK_FILE, "w") as f:
                f.write(str(self.process.pid))
                
            self.monitor_thread = threading.Thread(target=self._telemetry_daemon, daemon=True)
            self.health_thread = threading.Thread(target=self._health_probe, daemon=True)
            self.monitor_thread.start()
            self.health_thread.start()
        except Exception as e: self.state.update({"status": "error", "error_msg": str(e)})

    def _health_probe(self):
        start_time = time.time()
        while not self.shutdown_event.is_set() and self.process and self.process.poll() is None and self.state["status"] == "booting":
            try:
                if requests.get(f"http://127.0.0.1:{LLAMA_PORT}/health", timeout=1).status_code == 200: 
                    self.state["status"] = "ready"
                    sys.stdout.write("\033[92m[DISPATCH] Handshake verified. API Active.\033[0m\n")
                    break
            except Exception:
                if self.shutdown_event.wait(0.5): break
            if time.time() - start_time > 60: 
                self.state.update({"status": "error", "error_msg": "Boot Timeout."})
                break

    def _telemetry_daemon(self):
        pipe_to_read = self.process.stdout if VERBOSE_MODE else self.process.stderr
        if not pipe_to_read: return
        try:
            while not self.shutdown_event.is_set() and self.process and self.process.poll() is None:
                if not (line := pipe_to_read.readline()): break
                if line := line.strip():
                    if VERBOSE_MODE: print(f"\033[90m[LLM] {line}\033[0m")
                    self.state["logs"].append(line)
                    if len(self.state["logs"]) > 20: self.state["logs"].pop(0)
                    
                    lower_line = line.lower()
                    if "out of memory" in lower_line or "bad allocation" in lower_line: 
                        self.state.update({
                            "status": "error", 
                            "error_msg": "Physical Hardware Limits Exceeded. Teardown active graph, reduce Context Horizon or GPU Offload layers, and reignite."
                        })
        except Exception: pass
        finally:
            if not self.shutdown_event.is_set() and self.state["status"] == "booting": 
                self.state.update({"status": "error", "error_msg": f"Engine initialization fault: {' | '.join(self.state['logs'][-3:])}"})
            if self.process: 
                try: pipe_to_read.close()
                except Exception: pass

    def terminate(self):
        self.shutdown_event.set()
        if self.process:
            try: self.process.terminate(); self.process.wait(timeout=3)
            except Exception: self.process.kill() 
            self.process = None
        self._slay_zombies()
        self.state.update({"status": "offline", "current_model": None})

class AcquisitionDispatcher:
    def __init__(self):
        self.process = None
        self.log_queue = queue.Queue()
        self.is_running = False

    def probe(self, repo: str, token: str) -> dict:
        worker_path = os.path.join(ACQ_ENGINE_DIR, "gguf_worker.py")
        cmd = [sys.executable, worker_path, "--action", "probe", "--repo", repo]
        if token: cmd.extend(["--token", token])
            
        try:
            kwargs = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
            proc = subprocess.run(cmd, capture_output=True, text=True, **kwargs)
            for line in proc.stdout.splitlines():
                if line.startswith("[DATA]"):
                    return json.loads(line[6:].strip())
            return {"status": "error", "message": "Headless worker failed to return topology data."}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def start_pipeline(self, repo: str, token: str, profile: str, is_direct: bool, requires_jinja: bool) -> Tuple[bool, str]:
        if self.is_running:
            return False, "An acquisition pipeline is already active."
        
        self.is_running = True
        
        while not self.log_queue.empty():
            try: self.log_queue.get_nowait()
            except queue.Empty: break
            
        t = threading.Thread(target=self._run_worker, args=(repo, token, profile, is_direct, requires_jinja), daemon=True)
        t.start()
        return True, "Pipeline Engaged"

    def _run_worker(self, repo, token, profile, is_direct, requires_jinja):
        worker_path = os.path.join(ACQ_ENGINE_DIR, "gguf_worker.py")
        cmd = [sys.executable, worker_path, "--action", "execute", "--repo", repo]
        if token: cmd.extend(["--token", token])
        if profile: cmd.extend(["--profile", profile])
        if is_direct: cmd.append("--direct")
        if requires_jinja: cmd.append("--jinja")
            
        try:
            kwargs = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
            self.process = subprocess.Popen(
                cmd, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.STDOUT, 
                text=True, 
                bufsize=1, 
                encoding='utf-8', 
                errors='replace', 
                **kwargs
            )
            
            for line in self.process.stdout:
                clean_line = line.strip()
                if clean_line: self.log_queue.put(clean_line)
                
            self.process.wait()
            if self.process.returncode != 0:
                self.log_queue.put(f"[ERROR] Subprocess terminated abnormally with code {self.process.returncode}")
                
        except Exception as e:
            self.log_queue.put(f"[SYSTEM ERROR] Subprocess execution fault: {str(e)}")
        finally:
            self.log_queue.put("[EOF]")
            self.is_running = False
            self.process = None

    def stop_pipeline(self):
        if self.process:
            try: 
                self.process.kill()
                dispatcher._slay_zombies()
            except Exception: pass
            
        self.is_running = False
        self.log_queue.put("[SYSTEM ERROR] Pipeline forcefully aborted by operator.")
        self.log_queue.put("[EOF]")
        return {"status": "success", "message": "Pipeline aborted."}

    def terminate(self):
        self.stop_pipeline()

dispatcher = EngineDispatcher()
acquisition_dispatcher = AcquisitionDispatcher()
telemetry_daemon = TelemetryDaemon()

class ScribeGatewayHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs): 
        super().__init__(*args, directory=STATIC_DIR, **kwargs)
        
    def log_message(self, format, *args): pass 
    
    def _send_json(self, data: dict, status: int = 200):
        try:
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode('utf-8'))
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError): pass

    def _proxy_request(self, target_path: str, payload: dict, is_streaming: bool = False):
        if isinstance(payload, dict):
            if target_path in ['/completion', '/infill']:
                payload["cache_prompt"] = True
                
            def _excise_harmful_parameters(obj: Any):
                if isinstance(obj, dict):
                    obj.pop("top_k", None)
                    for k, v in obj.items():
                        _excise_harmful_parameters(v)
                elif isinstance(obj, list):
                    for item in obj:
                        _excise_harmful_parameters(item)
            _excise_harmful_parameters(payload)

        if "messages" in payload and isinstance(payload["messages"], list):
            for msg in payload["messages"]:
                if "content" in msg and (msg["content"] is None or str(msg["content"]).strip() == ""):
                    msg["content"] = " "
                    
        try:
            with PROXY_SESSION.post(f"http://127.0.0.1:{LLAMA_PORT}{target_path}", json=payload, stream=is_streaming, timeout=600) as res:
                if not res.ok:
                    error_msg = res.text
                    try:
                        err_json = res.json()
                        error_msg = err_json.get("error", err_json.get("message", error_msg))
                        if isinstance(error_msg, dict): error_msg = error_msg.get("message", str(error_msg))
                    except Exception: pass
                    
                    self._send_json({"error": f"C++ Node Rejected Payload ({res.status_code}): {error_msg}"}, res.status_code)
                    return

                if is_streaming:
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/event-stream')
                    self.send_header('Cache-Control', 'no-cache')
                    self.send_header('Connection', 'close')
                    self.end_headers()
                    try:
                        for chunk in res.iter_content(chunk_size=None):
                            if chunk: 
                                self.wfile.write(chunk)
                                self.wfile.flush()
                    except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
                        res.close()
                        if VERBOSE_MODE: sys.stdout.write("\033[93m[SEVERANCE] Active compute slot terminated by Operator UI override.\033[0m\n")
                        return
                else:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(res.content)
        except requests.exceptions.RequestException as e:
            self._send_json({"error": f"Graph Compute Socket Offline: {str(e)}"}, 500)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError): pass

    def do_GET(self):
        if self.path == '/api/system': 
            try:
                with telemetry_daemon.lock:
                    live_telemetry = telemetry_daemon.cache.copy()
                
                return self._send_json({
                    "accelerator": live_telemetry.get("type", "Offline / Error"), 
                    "default_layers": 99, 
                    "vram_total": live_telemetry.get("vram_total", 0.0),
                    "vram_free": live_telemetry.get("vram_free", 0.0),
                    "ram_total": live_telemetry.get("ram_total", 0.0),
                    "ram_free": live_telemetry.get("ram_free", 0.0),
                    "models": live_telemetry.get("models", [])
                })
            except Exception as e:
                return self._send_json({"error": f"System Telemetry Fault: {str(e)}"}, 500)
            
        elif self.path == '/api/status': return self._send_json(dispatcher.state)
        
        elif self.path == '/api/status/stream':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()
            last_state_str = ""
            try:
                while True:
                    current_state_str = json.dumps(dispatcher.state)
                    if current_state_str != last_state_str:
                        self.wfile.write(f"data: {current_state_str}\n\n".encode('utf-8'))
                        self.wfile.flush()
                        last_state_str = current_state_str
                    time.sleep(0.5)
            except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
                pass
            return
        
        elif self.path == '/api/slots':
            if dispatcher.state["status"] != "ready": return self._send_json({"error": "Engine is offline."}, 503)
            try:
                res = PROXY_SESSION.get(f"http://127.0.0.1:{LLAMA_PORT}/slots", timeout=5)
                return self._send_json(res.json())
            except Exception as e: return self._send_json({"error": str(e)}, 500)
            
        elif self.path == '/api/acquisition/stream':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()
            try:
                while True:
                    msg = acquisition_dispatcher.log_queue.get()
                    if msg == "[EOF]":
                        self.wfile.write(b"data: {\"text\": \"[EOF]\"}\n\n")
                        self.wfile.flush()
                        break
                    else:
                        payload = json.dumps({"text": msg})
                        self.wfile.write(f"data: {payload}\n\n".encode('utf-8'))
                        self.wfile.flush()
            except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
                pass
            return

        super().do_GET()

    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length) if content_length > 0 else b"{}"
        except Exception:
            return self._send_json({"error": "Invalid request stream data"}, 400)

        if self.path == '/api/engine/boot':
            try: dispatcher.boot_engine(json.loads(post_data.decode('utf-8'))); return self._send_json({"status": "booting"})
            except Exception as e: return self._send_json({"error": str(e)}, 500)
                
        elif self.path == '/api/engine/stop':
            dispatcher.terminate(); return self._send_json({"status": "offline"})

        elif self.path == '/api/chat':
            if dispatcher.state["status"] != "ready": return self._send_json({"error": "Engine is offline."}, 503)
            try: payload = json.loads(post_data.decode('utf-8'))
            except Exception: return self._send_json({"error": "Invalid payload format"}, 400)
            self._proxy_request('/v1/chat/completions', payload, is_streaming=payload.get("stream", True))
            return

        elif self.path == '/api/cognition':
            if dispatcher.state["status"] != "ready": return self._send_json({"error": "Engine is offline."}, 503)
            try: payload = json.loads(post_data.decode('utf-8'))
            except Exception: return self._send_json({"error": "Invalid payload format"}, 400)
            self._proxy_request('/completion', payload, is_streaming=payload.get("stream", True))
            return

        elif self.path == '/api/infill':
            if dispatcher.state["status"] != "ready": return self._send_json({"error": "Engine is offline."}, 503)
            try: payload = json.loads(post_data.decode('utf-8'))
            except Exception: return self._send_json({"error": "Invalid payload format"}, 400)
            self._proxy_request('/infill', payload, is_streaming=payload.get("stream", True))
            return

        elif self.path == '/api/tokenize':
            if dispatcher.state["status"] != "ready": return self._send_json({"error": "Engine is offline."}, 503)
            try: payload = json.loads(post_data.decode('utf-8'))
            except Exception: return self._send_json({"error": "Invalid payload format"}, 400)
            self._proxy_request('/tokenize', payload, is_streaming=False)
            return

        elif self.path == '/api/detokenize':
            if dispatcher.state["status"] != "ready": return self._send_json({"error": "Engine is offline."}, 503)
            try: payload = json.loads(post_data.decode('utf-8'))
            except Exception: return self._send_json({"error": "Invalid payload format"}, 400)
            self._proxy_request('/detokenize', payload, is_streaming=False)
            return
            
        elif self.path == '/api/acquisition/probe':
            try: 
                payload = json.loads(post_data.decode('utf-8'))
                res = acquisition_dispatcher.probe(payload.get("repo", ""), payload.get("token"))
                return self._send_json(res)
            except Exception as e: 
                return self._send_json({"status": "error", "message": str(e)}, 500)
                
        elif self.path == '/api/acquisition/start':
            if dispatcher.state["status"] not in ["offline", "error"]:
                return self._send_json({"error": "Hardware Mutex Locked: Teardown active neural core before compiling new tensors."}, 409)
                
            try:
                payload = json.loads(post_data.decode('utf-8'))
                success, msg = acquisition_dispatcher.start_pipeline(
                    repo=payload.get("repo", ""),
                    token=payload.get("token"),
                    profile=payload.get("profile"),
                    is_direct=payload.get("is_direct", False),
                    requires_jinja=payload.get("requires_jinja", False)
                )
                if success: return self._send_json({"status": "success"})
                else: return self._send_json({"error": msg}, 409)
            except Exception as e: 
                return self._send_json({"error": str(e)}, 500)
                
        elif self.path == '/api/acquisition/stop':
            return self._send_json(acquisition_dispatcher.stop_pipeline())
        
        self.send_response(404); self.end_headers()

def main():
    print("="*60 + "\n    SCRIBE-LLM NODE AGENT (DISPATCHER MODE)    \n" + "="*60)
    dispatcher._slay_zombies()
    
    telemetry_daemon.start()
    
    try:
        server = ThreadingHTTPServer(('0.0.0.0', PROXY_PORT), ScribeGatewayHandler)
        sys.stdout.write(f"\033[92m[ACTIVE] Control Plane Gateway bounded to http://127.0.0.1:{PROXY_PORT}\033[0m\n")
        
        if VERBOSE_MODE:
            sys.stdout.write(f"\033[93m[MODE] Verbosity Pipeline is ONLINE.\033[0m\n")
            
        if sys.platform == 'win32': os.startfile(f"http://127.0.0.1:{PROXY_PORT}")
        server.serve_forever()
    except KeyboardInterrupt: 
        sys.stdout.write("\n\033[93m[WARN] Operator interrupt. Executing teardown sequence...\033[0m\n")
    finally: 
        dispatcher.terminate()
        acquisition_dispatcher.terminate()
        sys.stdout.write("\033[94m[INFO] Node Agent deactivated. Subsystems offline.\033[0m\n")
        sys.exit(0)

if __name__ == '__main__': main()