#!/usr/bin/env python3
"""Run the Dashboard + LOD Checker dev stack with clean port handling.

Launches both services in one terminal with prefixed output:
  [dashboard]    — Next.js full-stack app (port 3000)
  [lod-checker]  — Flask + Vite app (ports 8080, 5173)
"""

from __future__ import annotations

import argparse
import os
import socket
import signal
import subprocess
import sys
import threading
import shutil
import time
from pathlib import Path

LOD_CHECKER_DIR = Path(r"C:\LECG\LOD Checker")
LOD_QUERY_ENCODER_SCRIPT = Path(__file__).resolve().parent.parent / "services" / "lod-query-encoder" / "server.py"

# Track child processes for cleanup
_children: list[subprocess.Popen] = []
_lock = threading.Lock()


def is_windows() -> bool:
    return os.name == "nt"


def get_pids_listening_on_port(port: int) -> list[int]:
    if is_windows():
        cmd = [
            "powershell",
            "-NoProfile",
            "-Command",
            (
                f"Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction SilentlyContinue "
                "| Select-Object -ExpandProperty OwningProcess -Unique"
            ),
        ]
    else:
        cmd = ["sh", "-lc", f"lsof -ti tcp:{port} -sTCP:LISTEN || true"]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode not in (0, 1):
        return []

    pids: list[int] = []
    for raw in result.stdout.splitlines():
        value = raw.strip()
        if not value:
            continue
        if value.isdigit():
            pids.append(int(value))
    return sorted(set(pids))


def kill_pid(pid: int) -> None:
    if is_windows():
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], check=False)
    else:
        os.kill(pid, signal.SIGTERM)


def free_port(port: int) -> None:
    pids = get_pids_listening_on_port(port)
    if not pids:
        print(f"[runner] Port {port} is free")
        return

    print(f"[runner] Port {port} in use by PID(s): {', '.join(str(pid) for pid in pids)}")
    for pid in pids:
        print(f"[runner] Stopping PID {pid}")
        kill_pid(pid)


def stream_output(proc: subprocess.Popen[str], prefix: str) -> None:
    assert proc.stdout is not None
    for line in iter(proc.stdout.readline, ""):
        if not line:
            break
        print(f"[{prefix}] {line.rstrip()}")


def kill_children() -> None:
    with _lock:
        for proc in _children:
            if proc.poll() is None:
                if is_windows():
                    subprocess.run(
                        ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                        check=False,
                        capture_output=True,
                    )
                else:
                    proc.terminate()


def get_lod_checker_service(project_root: Path) -> ManagedService:`n    return ManagedService("lod-checker", ["npx", "serve", "-s", "services/lod-engine/dist", "-l", "5173"], project_root, port=5173)


def get_lod_query_encoder_service(project_root: Path) -> ManagedService:`n    script = project_root / "services" / "lod-engine" / "lod_query_encoder.py"`n    return ManagedService("lod-encoder", [sys.executable, str(script)], project_root, port=8091)


def get_yjs_service(project_root: Path) -> ManagedService:`n    script = project_root / "scripts" / "yjs-server.mjs"`n    return ManagedService("yjs", ["node", str(script)], project_root, port=4444)


def resolve_next_command(project_root: Path, *args: str) -> list[str]:
    next_bin = project_root / "node_modules" / "next" / "dist" / "bin" / "next"
    if next_bin.exists():
        return ["node", str(next_bin), *args]
    if is_windows():
        return ["npx.cmd", "next", *args]
    return ["npx", "next", *args]


def run_next_build(project_root: Path) -> int:
    cmd = resolve_next_command(project_root, "build", "--webpack")
    print(f"[runner] Building Next.js app: {' '.join(cmd)}")

    proc = subprocess.Popen(
        cmd,
        cwd=str(project_root),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    with _lock:
        _children.append(proc)

    try:
        stream_output(proc, "dashboard-build")
        return proc.wait()
    except KeyboardInterrupt:
        return 0


def run_next_dev(project_root: Path, port: int) -> int:
    env = os.environ.copy()
    env["PORT"] = str(port)

    cmd = resolve_next_command(project_root, "dev", "--webpack", "-H", "0.0.0.0", "--port", str(port))
    print(f"[runner] Starting Next.js dev server: {' '.join(cmd)}")
    print(f"[runner] Dashboard: http://localhost:{port}")

    proc = subprocess.Popen(
        cmd,
        cwd=str(project_root),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    with _lock:
        _children.append(proc)

    thread = threading.Thread(target=stream_output, args=(proc, "dashboard"), daemon=True)
    thread.start()

    try:
        return proc.wait()
    except KeyboardInterrupt:
        return 0


def run_next_start(project_root: Path, port: int) -> int:
    env = os.environ.copy()
    env["PORT"] = str(port)

    cmd = resolve_next_command(project_root, "start", "-H", "0.0.0.0", "--port", str(port))
    print(f"[runner] Starting Next.js preview server: {' '.join(cmd)}")
    print(f"[runner] Dashboard preview: http://localhost:{port}")
    print("[runner] Preview mode disables HMR to keep the public tunnel stable")

    proc = subprocess.Popen(
        cmd,
        cwd=str(project_root),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    with _lock:
        _children.append(proc)

    thread = threading.Thread(target=stream_output, args=(proc, "dashboard"), daemon=True)
    thread.start()

    try:
        return proc.wait()
    except KeyboardInterrupt:
        return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Dashboard + LOD Checker dev stack")
    parser.add_argument(
        "--mode",
        choices=("dev", "public"),
        default="dev",
        help="Run Next.js in development mode or build/start preview mode",
    )
    parser.add_argument("--port", type=int, default=3000, help="Port for Next.js (default: 3000)")
    parser.add_argument(
        "--no-kill",
        action="store_true",
        help="Do not auto-kill processes already listening on ports",
    )
    parser.add_argument(
        "--no-lod",
        action="store_true",
        help="Skip launching the LOD Checker",
    )
    parser.add_argument(
        "--no-lod-encoder",
        action="store_true",
        help="Skip launching the LOD query encoder",
    )
    parser.add_argument(
        "--no-yjs",
        action="store_true",
        help="Skip launching the Yjs WebSocket server",
    )
    parser.add_argument(
        "--no-clean",
        action="store_true",
        help="Do not clear the .next cache before starting Next.js",
    )
    return parser.parse_args()


def clean_next_cache(project_root: Path) -> None:
    next_dir = project_root / ".next"
    if not next_dir.exists():
        print("[runner] .next cache not found (nothing to clean)")
        return

    print(f"[runner] Clearing Next.js cache: {next_dir}")
    for attempt in range(1, 6):
        try:
            shutil.rmtree(next_dir, ignore_errors=False)
            return
        except Exception as err:
            if attempt >= 5:
                print(f"[runner] Warning: failed to clear .next cache: {err}")
                return
            time.sleep(0.3 * attempt)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)

    args = parse_args()
    project_root = Path(__file__).resolve().parent.parent

    # Patch environment
    print("[runner] Patching environment...")
    try:
        subprocess.run(["node", "scripts/patch-env.js"], cwd=str(project_root), check=True)
    except subprocess.CalledProcessError as err:
        print(f"[runner] Failed to patch environment: exit code {err.returncode}")
        return err.returncode

    # Ensure PostgreSQL
    subprocess.run(["node", "scripts/postgres-local.js", "start"], cwd=str(project_root), capture_output=True)

    # Free ports
    if not args.no_kill:
        for p in [args.port, 4444, 8091, 5173, 8080]:
            free_port(p)

    if not args.no_clean:
        clean_next_cache(project_root)

    managed_services: list[ManagedService] = []

    if not args.no_yjs:
        managed_services.append(get_yjs_service(project_root))
    if not args.no_lod_encoder:
        managed_services.append(get_lod_query_encoder_service(project_root))
    if not args.no_lod:
        managed_services.append(get_lod_checker_service(project_root))

    for svc in managed_services:
        svc.start()

    try:
        if args.mode == "public":
            run_next_build(project_root)
            # For public mode, we just run start and don't monitor as much, but we could
            return run_next_start(project_root, args.port)

        # Dev mode monitoring loop
        dashboard_cmd = resolve_next_command(project_root, "dev", "--webpack", "-H", "0.0.0.0", "--port", str(args.port))
        dashboard = ManagedService("dashboard", dashboard_cmd, project_root, port=args.port)
        dashboard.start()

        print("[runner] Stack is running. Monitoring background services...")
        while dashboard.is_alive():
            time.sleep(5)
            for svc in managed_services:
                if not svc.check_health():
                    print(f"[runner] Service {svc.name} is unhealthy or dead!")
                    svc.restart()
        
        return dashboard.proc.wait() if dashboard.proc else 0
    except KeyboardInterrupt:
        return 0
    finally:
        print("\n[runner] Shutting down all processes...")
        for svc in managed_services:
            svc.stop()
        kill_children()


if __name__ == "__main__":
    sys.exit(main())


