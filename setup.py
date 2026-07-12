#!/usr/bin/env python3

# Copyright (c) 2026 Hector Nunez. Licensed under PolyForm Shield License 1.0.0. See LICENSE.md.

import os
import sys
import shutil
import argparse
import subprocess
import urllib.request
import zipfile
import tarfile
import stat
import time
import platform
from pathlib import Path

DEPENDENCY_GRAPH = {
    "tools/setup_pytorch.py": [],
    "tools/setup_llama.py": ["tools/setup_pytorch.py"],
    "tools/setup_markdown.py": [],
    "tools/setup_fonts.py": [],
    "tools/setup_katex.py": [],
    "tools/setup_ace.py": [],
}

UPSTREAM_MATRIX = {
    "1": "3.10.11",
    "2": "3.11.9",
    "3": "3.12.3",
    "4": "3.13.13",
    "5": "3.14.5",
}

def resolve_topological_order(graph: dict) -> list:
    visited = set()
    temp_marked = set()
    order = []

    def visit(node):
        if node in temp_marked:
            raise ValueError(f"CRITICAL: Cyclic dependency detected at: {node}")
        if node not in visited:
            temp_marked.add(node)
            for edge in graph.get(node, []):
                visit(edge)
            temp_marked.remove(node)
            visited.add(node)
            order.append(node)

    for current_node in graph:
        if current_node not in visited:
            visit(current_node)
    return order

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

def fetch_standalone_runtime(version: str, target_dir: Path) -> Path:
    if target_dir.exists():
        resilient_purge(target_dir)

    if os.name == 'nt':
        archive_name = f"python-{version}-embed-amd64.zip"
        url = f"https://www.python.org/ftp/python/{version}/{archive_name}"
        archive_path = target_dir.parent / archive_name

        print_status(f"Streaming standalone Windows core binary layout ({version})...")
        ctx = urllib.request.Request(url, headers={"User-Agent": "Scribe-Orchestrator"})
        
        target_dir.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(ctx, timeout=30) as response, open(archive_path, "wb") as out_file:
            while chunk := response.read(65536):
                out_file.write(chunk)

        with zipfile.ZipFile(archive_path, 'r') as zip_ref:
            zip_ref.extractall(target_dir)
        archive_path.unlink()

        for pth_file in target_dir.glob("*._pth"):
            orig_lines = pth_file.read_text(encoding="utf-8").splitlines()
            core_zips = [line.strip() for line in orig_lines if line.strip().endswith(".zip")]
            payload_paths = core_zips + [".", "Lib/site-packages", "import site"]
            pth_file.write_text("\n".join(payload_paths) + "\n", encoding="utf-8")
            
        executable = target_dir / "python.exe"
    else:
        raw_arch = platform.machine().lower()
        if raw_arch in ("x86_64", "amd64"):
            arch = "x86_64"
        elif raw_arch in ("aarch64", "arm64"):
            arch = "aarch64"
        elif raw_arch in ("i386", "i686"):
            arch = "i686"
        else:
            arch = raw_arch

        triple = f"{arch}-unknown-linux-gnu" if sys.platform.startswith("linux") else f"{arch}-apple-darwin"
        archive_name = f"cpython-{version}+20260510-{triple}-install_only.tar.gz"
        url = f"https://github.com/astral-sh/python-build-standalone/releases/download/20260510/{archive_name}"
        archive_path = target_dir.parent / archive_name

        print_status(f"Streaming standalone POSIX core binary layout ({version})...")
        ctx = urllib.request.Request(url, headers={"User-Agent": "Scribe-Orchestrator"})
        
        target_dir.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(ctx, timeout=30) as response, open(archive_path, "wb") as out_file:
            while chunk := response.read(65536):
                out_file.write(chunk)

        with tarfile.open(archive_path, "r:gz") as tar_ref:
            try:
                tar_ref.extractall(target_dir.parent, filter='data')
            except TypeError:
                tar_ref.extractall(target_dir.parent)
        archive_path.unlink()
        
        source_extracted = target_dir.parent / "python"
        if source_extracted.exists() and source_extracted != target_dir:
            if target_dir.exists():
                target_dir.rmdir()
            source_extracted.rename(target_dir)

        executable = target_dir / "bin" / "python"

    pip_bootstrapper = target_dir / "get-pip.py"
    print_status("Bootstrapping localized package manager instance (pip)...")
    
    pip_url = "https://bootstrap.pypa.io/get-pip.py"
    pip_ctx = urllib.request.Request(pip_url, headers={"User-Agent": "Scribe-Orchestrator"})
    with urllib.request.urlopen(pip_ctx, timeout=30) as response, open(pip_bootstrapper, "wb") as out_file:
        while chunk := response.read(65536):
            out_file.write(chunk)
            
    subprocess.run([str(executable), str(pip_bootstrapper), "--no-warn-script-location"], check=True)
    pip_bootstrapper.unlink()
    
    return executable

def main():
    parser = argparse.ArgumentParser(description="Scribe-LLM Inherently Portable Provisioner")
    parser.add_argument("-p", "--python", choices=list(UPSTREAM_MATRIX.values()), help="Target isolated Python version override")
    parser.add_argument("-U", "--update", action="store_true", help="Force immediate extraction purge of cache libraries and assets")
    args = parser.parse_args()

    print_status("=" * 60)
    print_status("       SCRIBE-LLM CONTROL PLANE HYDRATION PROTOCOL      ", "SUCCESS")
    print_status("=" * 60)
    print_status("NOTE: This environment is structurally relocatable and portable by default.")
    print_status("-" * 60)

    project_root = Path(__file__).parent.resolve()
    venv_dir = project_root / ".venv"
    lock_file = venv_dir / "constraints.lock"
    
    if os.name == 'nt':
        venv_python = venv_dir / "python.exe"
    else:
        venv_python = venv_dir / "bin" / "python"

    if args.update:
        print_status("Executing structural purges for compilation layers...")
        purge_targets = [
            project_root / "lib", project_root / "mcpp", project_root / "font.css", project_root / "static" / "css" / "font.css"
        ]
        for target in purge_targets:
            if target.exists():
                resilient_purge(target)
                print_status(f"Purged target artifact boundary: {target.name}", "SUCCESS")

    selected_version = args.python
    if not selected_version and venv_python.exists() and not args.update:
        try:
            probe = subprocess.run([str(venv_python), "-c", "import sys; print(sys.version.split()[0])"], capture_output=True, text=True, check=True)
            selected_version = probe.stdout.strip()
            print_status(f"Active runtime core layer detected inside workspace: {selected_version}", "SUCCESS")
        except Exception:
            pass

    if not selected_version:
        for key, version in UPSTREAM_MATRIX.items():
            print(f"  [{key}] Python {version}")
        choice = input("\nEnter target core execution track [1-5]: ").strip()
        if choice in UPSTREAM_MATRIX:
            selected_version = UPSTREAM_MATRIX[choice]
        elif choice in UPSTREAM_MATRIX.values():
            selected_version = choice
        else:
            print_status("Invalid selection identifier string. Terminating.", "ERROR")
            sys.exit(1)

    skip_provisioning = False
    if venv_python.exists() and not args.update:
        try:
            probe = subprocess.run([str(venv_python), "-c", "import sys; print(sys.version.split()[0])"], capture_output=True, text=True, check=True)
            if probe.stdout.strip() == selected_version:
                print_status("Runtime core version constraint verified. Skipping provisioning phase.", "SUCCESS")
                skip_provisioning = True
        except Exception:
            print_status("Internal runtime validation fractured. Rebuilding target shell environment...", "WARN")

    if not skip_provisioning:
        try:
            venv_python = fetch_standalone_runtime(selected_version, venv_dir)
        except Exception as env_error:
            print_status(f"Environment core construction failure: {str(env_error)}", "ERROR")
            sys.exit(1)

    print_status(f"Environment runtime container anchored: {venv_python}", "SUCCESS")

    try:
        execution_sequence = resolve_topological_order(DEPENDENCY_GRAPH)
    except ValueError as cycle_error:
        print_status(str(cycle_error), "ERROR")
        sys.exit(1)

    sanitized_env = os.environ.copy()
    sanitized_env["VIRTUAL_ENV"] = str(venv_dir)
    sanitized_env["PATH"] = f"{str(venv_python.parent)}{os.pathsep}{sanitized_env.get('PATH', '')}"

    for script_node in execution_sequence:
        script_full_path = project_root / script_node
        if not script_full_path.exists():
            print_status(f"Skipping undefined setup node configuration: {script_node}", "WARN")
            continue

        print_status(f"Engaging script execution node: {script_node}...")
        process = subprocess.Popen(
            [str(venv_python), "-u", str(script_full_path)],
            cwd=str(project_root),
            env=sanitized_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding='utf-8',
            errors='replace'
        )

        try:
            if process.stdout:
                for line in process.stdout:
                    print(f"  │ {line.strip()}")
            process.wait()
        except KeyboardInterrupt:
            process.terminate()
            process.wait()
            raise

        if process.returncode != 0:
            print_status(f"Node execution failure ({script_node}) status: {process.returncode}", "ERROR")
            sys.exit(process.returncode)
        print_status(f"Sealed execution step: {script_node}", "SUCCESS")

    requirements_manifest = project_root / "requirements.txt"
    if requirements_manifest.exists():
        print_status("Injecting high-density third-party packages from manifest...")
        
        if lock_file.exists() and not args.update:
            pip_command = [str(venv_python), "-m", "pip", "install", "-r", str(requirements_manifest), "-c", str(lock_file)]
        else:
            pip_command = [str(venv_python), "-m", "pip", "install", "--pre", "-U", "-r", str(requirements_manifest)]
            
        process = subprocess.Popen(
            pip_command,
            cwd=str(project_root),
            env=sanitized_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding='utf-8',
            errors='replace'
        )
        
        try:
            if process.stdout:
                for line in process.stdout:
                    print(f"  │ {line.strip()}")
            process.wait()
        except KeyboardInterrupt:
            process.terminate()
            process.wait()
            raise

        if process.returncode != 0:
            print_status(f"Package orchestration boundary layer error: {process.returncode}", "ERROR")
            sys.exit(process.returncode)

        try:
            freeze = subprocess.run([str(venv_python), "-m", "pip", "freeze"], capture_output=True, text=True, check=True)
            lock_file.write_text(freeze.stdout, encoding="utf-8")
        except Exception:
            pass

    models_dir = project_root / "models"
    if not models_dir.exists():
        models_dir.mkdir(parents=True, exist_ok=True)
        print_status("Created workspace placeholder boundary: models/", "SUCCESS")

    if os.name == 'nt':
        (project_root / "start.bat").write_text(
            "@echo off\ntitle Scribe-LLM Local Core\ncolor 0b\n\".venv\\python.exe\" server.py\npause\n", encoding="utf-8"
        )
    else:
        start_sh = project_root / "start.sh"
        start_sh.write_text("#!/usr/bin/env bash\n./.venv/bin/python server.py\n", encoding="utf-8")
        start_sh.chmod(0o755)

    print_status("=" * 60)
    print_status(" SUCCESS: Scribe-LLM Portable Environment Ready [100/100] ", "SUCCESS")
    print_status("=" * 60)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n")
        print_status("Setup sequence terminated cleanly by user request.", "WARN")
        sys.exit(0)
