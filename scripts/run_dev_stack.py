#!/usr/bin/env python3
"""Run the Dashboard + LOD Checker dev stack with clean port handling.

Launches both services in one terminal with prefixed output:
  [dashboard]    — Next.js full-stack app (port 3000)
  [lod-checker]  — Flask + Vite app (ports 8080, 5173)
"""

from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import threading
import shutil
import time
import json
import urllib.error
import urllib.request
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


def run_lod_checker() -> None:
    """Spawn LOD Checker (Flask + Vite) as a background process."""
    if not LOD_CHECKER_DIR.exists():
        print("[runner] LOD Checker directory not found, skipping")
        return

    run_viz = LOD_CHECKER_DIR / "run_viz.py"
    if not run_viz.exists():
        print(f"[runner] {run_viz} not found, skipping LOD Checker")
        return

    print(f"[runner] Starting LOD Checker from {LOD_CHECKER_DIR}")
    print("[runner] LOD Checker backend: http://localhost:8080")
    print("[runner] LOD Checker frontend: http://localhost:5173")

    proc = subprocess.Popen(
        ["python", str(run_viz)],
        cwd=str(LOD_CHECKER_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    with _lock:
        _children.append(proc)

    stream_output(proc, "lod-checker")


def run_lod_query_encoder(project_root: Path) -> None:
    """Spawn the local LOD query encoder service."""
    if not LOD_QUERY_ENCODER_SCRIPT.exists():
        print("[runner] LOD query encoder script not found, skipping")
        return

    env = os.environ.copy()
    # Default to CPU in the shared dev runner unless the user has explicitly
    # chosen a device in their current shell environment.
    env.setdefault("LOD_QUERY_ENCODER_DEVICE", "cpu")

    print("[runner] Starting LOD query encoder on port 8091")
    proc = subprocess.Popen(
        ["python", str(LOD_QUERY_ENCODER_SCRIPT)],
        cwd=str(project_root),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    with _lock:
        _children.append(proc)

    stream_output(proc, "lod-encoder")


def run_yjs_server(project_root: Path) -> None:
    """Spawn Yjs WebSocket server as a background process."""
    script = project_root / "scripts" / "yjs-server.mjs"
    if not script.exists():
        print("[runner] yjs-server.mjs not found, skipping")
        return

    print("[runner] Starting Yjs WebSocket server on port 4444")
    proc = subprocess.Popen(
        ["node", str(script)],
        cwd=str(project_root),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    with _lock:
        _children.append(proc)

    stream_output(proc, "yjs")


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


def run_next_dev(project_root: Path, port: int, prewarm_acc: bool = False) -> int:
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
    if prewarm_acc:
        prewarm_thread = threading.Thread(target=prewarm_acc_when_ready, args=(port,), daemon=True)
        prewarm_thread.start()

    try:
        return proc.wait()
    except KeyboardInterrupt:
        return 0


def env_flag_enabled(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def prewarm_acc_when_ready(port: int, timeout_seconds: int = 180) -> None:
    url = f"http://localhost:{port}/api/dev/prewarm-acc"
    deadline = time.time() + timeout_seconds
    last_error: Exception | None = None

    print(f"[runner] ACC prewarm enabled; waiting for {url}")
    while time.time() < deadline:
        try:
            request = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(request, timeout=20) as response:
                raw = response.read().decode("utf-8")
            payload = json.loads(raw)
            print(
                f"[runner] ACC prewarm complete: ok={payload.get('ok')} "
                f"totalMs={payload.get('totalMs')} cache={payload.get('cache')}"
            )
            for task in payload.get("tasks", []):
                print(
                    f"[runner] ACC prewarm {task.get('name')}: "
                    f"ok={task.get('ok')} rows={task.get('rows')} ms={task.get('ms')}"
                )
            return
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as err:
            last_error = err
            time.sleep(2)

    print(f"[runner] Warning: ACC prewarm did not complete within {timeout_seconds}s: {last_error}")


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
    parser.add_argument(
        "--prewarm-acc",
        action="store_true",
        help="After Next.js is reachable, warm ACC snapshot caches in the dev server process",
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

    # Patch environment with current local IP before starting services
    print("[runner] Patching environment...")
    try:
        subprocess.run(["node", "scripts/patch-env.js"], cwd=str(project_root), check=True)
    except subprocess.CalledProcessError as err:
        print(f"[runner] Failed to patch environment: exit code {err.returncode}")
        return err.returncode

    # Ensure PostgreSQL is running before any service starts
    print("[runner] Ensuring PostgreSQL is running...")
    pg_result = subprocess.run(
        ["node", "scripts/postgres-local.js", "start"],
        cwd=str(project_root),
        capture_output=True,
        text=True,
    )
    for line in (pg_result.stdout or "").strip().splitlines():
        print(f"[postgres] {line}")
    if pg_result.returncode != 0:
        for line in (pg_result.stderr or "").strip().splitlines():
            print(f"[postgres] {line}")
        print("[runner] WARNING: PostgreSQL may not be running — auth will fail")

    # Free all ports
    if not args.no_kill:
        free_port(args.port)
        if not args.no_yjs:
            free_port(4444)
        if not args.no_lod_encoder:
            free_port(8091)
        if not args.no_lod:
            free_port(5173)
            free_port(8080)

    # Avoid stale _next/static references that can cause layout.css 404s in dev.
    if not args.no_clean:
        clean_next_cache(project_root)

    # Start Yjs WebSocket server in background thread
    if not args.no_yjs:
        yjs_thread = threading.Thread(target=run_yjs_server, args=(project_root,), daemon=True)
        yjs_thread.start()

    if not args.no_lod_encoder:
        encoder_thread = threading.Thread(
            target=run_lod_query_encoder,
            args=(project_root,),
            daemon=True,
        )
        encoder_thread.start()

    # Start LOD Checker in background thread
    if not args.no_lod:
        lod_thread = threading.Thread(target=run_lod_checker, daemon=True)
        lod_thread.start()

    try:
        if args.mode == "public":
            build_code = run_next_build(project_root)
            if build_code != 0:
                return build_code
            return run_next_start(project_root, args.port)

        return run_next_dev(project_root, args.port, prewarm_acc=args.prewarm_acc or env_flag_enabled("ACC_PREWARM"))
    finally:
        print("\n[runner] Shutting down all processes...")
        kill_children()


if __name__ == "__main__":
    sys.exit(main())
