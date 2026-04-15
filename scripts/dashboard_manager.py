#!/usr/bin/env python3
"""LECG BIM Dashboard Manager — development control panel."""

import queue
import socket
import subprocess
import sys
import threading
import tkinter as tk
import tkinter.font as tkf
import webbrowser
from datetime import datetime
from pathlib import Path
from tkinter import scrolledtext

# ── Paths & config ─────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent   # C:\LECG\Dashboard
KILL_PORTS = [3000, 4444, 5173, 8080]

# Read NEXTAUTH_URL from .env so the URL stays in sync automatically
def _read_tunnel_url() -> str:
    env = BASE_DIR / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.startswith("NEXTAUTH_URL="):
                return line.split("=", 1)[1].strip()
    return "https://divertible-dudishly-kina.ngrok-free.dev"

TUNNEL_URL = _read_tunnel_url()
LOCAL_URL  = "http://localhost:3000"

# ── Colour palette ──────────────────────────────────────────────────────────
C = {
    "bg":      "#0d0d14",
    "panel":   "#13131e",
    "border":  "#1e1e2e",
    "btn":     "#1c1c2e",
    "accent":  "#7c6af7",
    "green":   "#4ade80",
    "yellow":  "#fbbf24",
    "red":     "#f87171",
    "text":    "#e2e8f0",
    "muted":   "#6b7280",
    "log_bg":  "#09090f",
    "log_fg":  "#94a3b8",
}


class DashboardManager(tk.Tk):

    def __init__(self):
        super().__init__()
        self._stack_proc:  subprocess.Popen | None = None
        self._tunnel_proc: subprocess.Popen | None = None
        self._log_q: queue.Queue = queue.Queue()

        self._configure_window()
        self._build_ui()
        self._poll_status()
        self._drain_log()
        self._ensure_desktop_shortcut()

    # ── Window setup ───────────────────────────────────────────────────────

    def _configure_window(self):
        self.title("LECG Dashboard Manager")
        self.configure(bg=C["bg"])
        self.minsize(640, 500)
        self.geometry("700x560")
        self.update_idletasks()
        sw, sh = self.winfo_screenwidth(), self.winfo_screenheight()
        self.geometry(f"700x560+{(sw-700)//2}+{(sh-560)//2}")
        self.protocol("WM_DELETE_WINDOW", self.destroy)

    # ── UI construction ────────────────────────────────────────────────────

    def _build_ui(self):
        # Header
        hdr = tk.Frame(self, bg=C["panel"], pady=10, padx=18)
        hdr.pack(fill="x")
        tk.Label(hdr, text="LECG BIM Dashboard",
                 font=("Segoe UI", 13, "bold"), bg=C["panel"], fg=C["text"]).pack(side="left")
        tk.Label(hdr, text="dev manager",
                 font=("Segoe UI", 9), bg=C["panel"], fg=C["muted"]).pack(side="left", padx=(8,0), pady=(4,0))

        # Separator
        tk.Frame(self, bg=C["border"], height=1).pack(fill="x")

        # Status row
        sf = tk.Frame(self, bg=C["panel"], padx=18, pady=7)
        sf.pack(fill="x")
        self._s_dots: dict[str, tk.Label] = {}
        self._s_lbls: dict[str, tk.Label] = {}

        for name, port in [("Next.js", 3000), ("Yjs WS", 4444)]:
            dot = tk.Label(sf, text="●", font=("Segoe UI", 11), bg=C["panel"], fg=C["muted"])
            dot.pack(side="left")
            lbl = tk.Label(sf, text=f"{name} :{port}", font=("Segoe UI", 9), bg=C["panel"], fg=C["muted"])
            lbl.pack(side="left", padx=(2, 16))
            self._s_dots[name] = dot
            self._s_lbls[name] = lbl

        self._tunnel_dot = tk.Label(sf, text="●", font=("Segoe UI", 11), bg=C["panel"], fg=C["muted"])
        self._tunnel_dot.pack(side="left")
        self._tunnel_lbl = tk.Label(sf, text="Tunnel", font=("Segoe UI", 9), bg=C["panel"], fg=C["muted"])
        self._tunnel_lbl.pack(side="left", padx=(2, 0))

        # Separator
        tk.Frame(self, bg=C["border"], height=1).pack(fill="x")

        # Buttons
        bf = tk.Frame(self, bg=C["bg"], padx=14, pady=10)
        bf.pack(fill="x")

        self._mk_btn(bf, "▶  Start Stack",  self._start_stack,  bg=C["accent"], fg="#fff")
        self._mk_btn(bf, "⊕  Start Tunnel", self._start_tunnel, bg="#1d4ed8",   fg="#fff")
        self._mk_btn(bf, "⊗  Stop All",     self._stop_all,     bg="#7f1d1d",   fg="#fca5a5")
        self._mk_btn(bf, "↗  Open Local",   self._open_local,   bg=C["btn"],    fg=C["text"])
        self._mk_btn(bf, "⬡  Open Tunnel",  self._open_tunnel,  bg=C["btn"],    fg=C["text"])

        # Log area header
        lh = tk.Frame(self, bg=C["bg"], padx=14, pady=2)
        lh.pack(fill="x")
        tk.Label(lh, text="Output", font=("Segoe UI", 8, "bold"),
                 bg=C["bg"], fg=C["muted"]).pack(side="left")
        tk.Button(lh, text="Clear", command=self._clear_log,
                  bg=C["btn"], fg=C["muted"], relief="flat", padx=8, pady=1,
                  font=("Segoe UI", 8), cursor="hand2", bd=0).pack(side="right")

        # Log widget
        log_wrap = tk.Frame(self, bg=C["log_bg"], padx=1, pady=1)
        log_wrap.pack(fill="both", expand=True, padx=14, pady=(0, 14))

        mono = "Cascadia Code" if "Cascadia Code" in tkf.families() else "Consolas"
        self._log = scrolledtext.ScrolledText(
            log_wrap, bg=C["log_bg"], fg=C["log_fg"],
            font=(mono, 9), relief="flat", wrap="word",
            insertbackground=C["text"], selectbackground=C["accent"],
        )
        self._log.pack(fill="both", expand=True)
        self._log.config(state="disabled")

        self._log.tag_config("info",    foreground=C["log_fg"])
        self._log.tag_config("ok",      foreground=C["green"])
        self._log.tag_config("warn",    foreground=C["yellow"])
        self._log.tag_config("err",     foreground=C["red"])
        self._log.tag_config("dim",     foreground=C["muted"])
        self._log.tag_config("hi",      foreground=C["accent"])

    def _mk_btn(self, parent, text, cmd, bg, fg):
        b = tk.Button(
            parent, text=text, command=cmd,
            bg=bg, fg=fg, activebackground="#2a2a42", activeforeground=fg,
            relief="flat", padx=12, pady=6,
            font=("Segoe UI", 9, "bold"), cursor="hand2", bd=0,
        )
        b.pack(side="left", padx=(0, 8))
        return b

    # ── Log helpers ────────────────────────────────────────────────────────

    def _log_line(self, msg: str, tag: str = "info"):
        ts = datetime.now().strftime("%H:%M:%S")
        self._log_q.put((f"[{ts}] {msg}\n", tag))

    def _drain_log(self):
        try:
            while True:
                text, tag = self._log_q.get_nowait()
                self._log.config(state="normal")
                self._log.insert("end", text, tag)
                self._log.see("end")
                self._log.config(state="disabled")
        except queue.Empty:
            pass
        self.after(80, self._drain_log)

    def _clear_log(self):
        self._log.config(state="normal")
        self._log.delete("1.0", "end")
        self._log.config(state="disabled")

    # ── Status polling ─────────────────────────────────────────────────────

    def _port_open(self, port: int) -> bool:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.4):
                return True
        except OSError:
            return False

    def _poll_status(self):
        for name, port in [("Next.js", 3000), ("Yjs WS", 4444)]:
            up    = self._port_open(port)
            color = C["green"] if up else C["muted"]
            self._s_dots[name].config(fg=color)
            self._s_lbls[name].config(fg=color)

        tunnel_alive = self._tunnel_proc is not None and self._tunnel_proc.poll() is None
        tc = C["green"] if tunnel_alive else C["muted"]
        self._tunnel_dot.config(fg=tc)
        self._tunnel_lbl.config(fg=tc)

        self.after(2000, self._poll_status)

    # ── Actions ────────────────────────────────────────────────────────────

    def _stream_proc(self, proc: subprocess.Popen, label: str):
        """Read proc stdout in a thread and forward to log."""
        for line in proc.stdout:
            line = line.rstrip()
            if not line:
                continue
            lo = line.lower()
            if any(k in lo for k in ("ready", "started", "✓", " ok", "success", "compiled")):
                tag = "ok"
            elif any(k in lo for k in ("error", "fail", "exception", "unhandled")):
                tag = "err"
            elif "warn" in lo:
                tag = "warn"
            else:
                tag = "info"
            self._log_line(line, tag)
        self._log_line(f"{label} process ended.", "dim")

    def _start_stack(self):
        if self._stack_proc and self._stack_proc.poll() is None:
            self._log_line("Stack is already running. Stop it first.", "warn")
            return
        self._log_line("Starting dev stack…", "hi")

        def run():
            try:
                proc = subprocess.Popen(
                    [sys.executable, str(BASE_DIR / "scripts" / "run_dev_stack.py"), "--no-clean"],
                    cwd=str(BASE_DIR),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True, bufsize=1,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
                self._stack_proc = proc
                self._stream_proc(proc, "Dev stack")
            except Exception as exc:
                self._log_line(f"Could not start stack: {exc}", "err")

        threading.Thread(target=run, daemon=True).start()

    def _start_tunnel(self):
        if self._tunnel_proc and self._tunnel_proc.poll() is None:
            self._log_line("Tunnel is already running.", "warn")
            return
        self._log_line("Starting tunnel…", "hi")

        def run():
            try:
                proc = subprocess.Popen(
                    ["node", str(BASE_DIR / "scripts" / "run-tunnel.js")],
                    cwd=str(BASE_DIR),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True, bufsize=1,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
                self._tunnel_proc = proc
                self._stream_proc(proc, "Tunnel")
            except Exception as exc:
                self._log_line(f"Could not start tunnel: {exc}", "err")

        threading.Thread(target=run, daemon=True).start()

    def _stop_all(self):
        self._log_line("Stopping all services…", "warn")

        def stop():
            for proc in (self._stack_proc, self._tunnel_proc):
                if proc and proc.poll() is None:
                    try:
                        proc.terminate()
                    except Exception:
                        pass
            self._stack_proc = None
            self._tunnel_proc = None

            for port in KILL_PORTS:
                try:
                    subprocess.run(
                        ["powershell", "-NoProfile", "-Command",
                         f"Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue "
                         f"| ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force "
                         f"-ErrorAction SilentlyContinue }}"],
                        capture_output=True, timeout=10,
                        creationflags=subprocess.CREATE_NO_WINDOW,
                    )
                except Exception:
                    pass

            self._log_line("Done — all services stopped.", "ok")

        threading.Thread(target=stop, daemon=True).start()

    def _open_local(self):
        webbrowser.open(LOCAL_URL)
        self._log_line(f"Opened {LOCAL_URL}", "dim")

    def _open_tunnel(self):
        webbrowser.open(TUNNEL_URL)
        self._log_line(f"Opened {TUNNEL_URL}", "dim")

    # ── Desktop shortcut (created once) ────────────────────────────────────

    def _ensure_desktop_shortcut(self):
        flag = BASE_DIR / ".shortcut_created"
        if flag.exists():
            return
        try:
            desktop = Path.home() / "Desktop"
            if not desktop.exists():
                return

            pythonw = Path(sys.executable).with_name("pythonw.exe")
            if not pythonw.exists():
                pythonw = Path(sys.executable)

            script = BASE_DIR / "scripts" / "dashboard_manager.py"
            bat    = desktop / "LECG Dashboard Manager.bat"
            bat.write_text(
                f'@echo off\ncd /d "{BASE_DIR}"\nstart "" "{pythonw}" "{script}"\n',
                encoding="utf-8",
            )
            flag.touch()
            self._log_line(f'Desktop shortcut created: "{bat.name}"', "ok")
        except Exception as exc:
            self._log_line(f"Could not create desktop shortcut: {exc}", "warn")


if __name__ == "__main__":
    app = DashboardManager()
    app.mainloop()
