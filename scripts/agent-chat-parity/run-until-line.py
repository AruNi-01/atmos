#!/usr/bin/env python3
"""Run a command until it prints a line, then let it exit.

xcodebuild can print `Test Suite 'Selected tests' passed` and then keep the
simulator session open. A later SIGKILL lands on the next capture. This waits
for the line on a pty, gives the process a short grace period, and stops it.
"""

from __future__ import annotations

import os
import pty
import signal
import subprocess
import sys
import time


def _spawn(cmd: list[str]) -> tuple[subprocess.Popen[bytes], int]:
    master, slave = pty.openpty()
    proc = subprocess.Popen(
        cmd,
        stdin=slave,
        stdout=slave,
        stderr=slave,
        start_new_session=True,
    )
    os.close(slave)
    return proc, master


def _alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


def _signal_and_wait(pid: int, sig: int, seconds: float) -> bool:
    if not _alive(pid):
        return True
    try:
        os.killpg(pid, sig)
    except ProcessLookupError:
        return True
    except PermissionError:
        return False
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if not _alive(pid):
            return True
        time.sleep(0.1)
    return not _alive(pid)


def _stop(pid: int) -> None:
    # A parent that ignores SIGINT passes that disposition to the child.
    # SIGTERM still stops a sleeper; SIGINT is the polite signal for xcodebuild.
    if _signal_and_wait(pid, signal.SIGINT, 2):
        return
    if _signal_and_wait(pid, signal.SIGTERM, 2):
        return
    try:
        os.killpg(pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        return


def run_until_line(cmd: list[str], needle: str, seconds: float, grace: float) -> int:
    proc, master = _spawn(cmd)
    assert proc.pid is not None
    deadline = time.monotonic() + seconds
    pending = b""
    found = False
    try:
        while time.monotonic() < deadline:
            if proc.poll() is not None and not found:
                chunk = os.read(master, 65536) if _readable(master) else b""
                _emit(pending + chunk)
                return proc.returncode if proc.returncode is not None else 1
            if found:
                try:
                    return proc.wait(timeout=grace)
                except subprocess.TimeoutExpired:
                    print(
                        f"stopping after {needle!r}; process stayed open",
                        file=sys.stderr,
                    )
                    _stop(proc.pid)
                    proc.wait()
                    return 0
            chunk = _read_some(master, deadline)
            if chunk:
                pending += chunk
                while b"\n" in pending:
                    line, pending = pending.split(b"\n", 1)
                    text = line.decode("utf-8", errors="replace")
                    sys.stdout.write(text + "\n")
                    sys.stdout.flush()
                    if needle in text:
                        found = True
                        break
            elif proc.poll() is not None:
                if pending:
                    text = pending.decode("utf-8", errors="replace")
                    sys.stdout.write(text)
                    sys.stdout.flush()
                    if needle in text:
                        found = True
                        continue
                return proc.returncode if proc.returncode is not None else 1
    finally:
        os.close(master)
    print(f"timed out after {seconds}s: {' '.join(cmd)}", file=sys.stderr)
    _stop(proc.pid)
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass
    return 124


def _readable(fd: int) -> bool:
    import select

    ready, _, _ = select.select([fd], [], [], 0)
    return bool(ready)


def _read_some(fd: int, deadline: float) -> bytes:
    import select

    timeout = max(0, deadline - time.monotonic())
    ready, _, _ = select.select([fd], [], [], min(0.2, timeout))
    if not ready:
        return b""
    try:
        return os.read(fd, 65536)
    except OSError:
        return b""


def _emit(blob: bytes) -> None:
    if not blob:
        return
    sys.stdout.write(blob.decode("utf-8", errors="replace"))
    sys.stdout.flush()


def _self_test() -> int:
    needle = "Test Suite 'Selected tests' passed"
    started = time.monotonic()
    code = run_until_line(
        [
            sys.executable,
            "-c",
            "import time,sys; print(sys.argv[1]); time.sleep(30)",
            needle,
        ],
        needle,
        20,
        1,
    )
    elapsed = time.monotonic() - started
    if code != 0 or elapsed > 8:
        print(f"self-test hang failed code={code} elapsed={elapsed:.2f}", file=sys.stderr)
        return 1
    code = run_until_line([sys.executable, "-c", "import sys; sys.exit(3)"], needle, 10, 1)
    if code != 3:
        print(f"self-test exit failed code={code}", file=sys.stderr)
        return 1
    started = time.monotonic()
    code = run_until_line([sys.executable, "-c", "import time; time.sleep(30)"], needle, 1, 1)
    elapsed = time.monotonic() - started
    if code != 124 or elapsed > 8:
        print(f"self-test timeout failed code={code} elapsed={elapsed:.2f}", file=sys.stderr)
        return 1
    print("self-test ok")
    return 0


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        return _self_test()
    args = sys.argv[1:]
    if "--" not in args:
        print(
            "usage: run-until-line.py --seconds N --needle TEXT --grace N -- cmd...",
            file=sys.stderr,
        )
        return 2
    split = args.index("--")
    flags = args[:split]
    cmd = args[split + 1 :]
    seconds = 360.0
    grace = 20.0
    needle = ""
    index = 0
    while index < len(flags):
        flag = flags[index]
        if flag == "--seconds":
            seconds = float(flags[index + 1])
            index += 2
        elif flag == "--grace":
            grace = float(flags[index + 1])
            index += 2
        elif flag == "--needle":
            needle = flags[index + 1]
            index += 2
        else:
            print(f"unknown flag {flag}", file=sys.stderr)
            return 2
    if not needle or not cmd:
        print("needle and command are required", file=sys.stderr)
        return 2
    return run_until_line(cmd, needle, seconds, grace)


if __name__ == "__main__":
    raise SystemExit(main())
