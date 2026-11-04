"""Run tstack's pr-wait on Windows.

pr-wait imports fcntl for one thing: a non-blocking exclusive lock that keeps two
watchers off the same PR. Windows has no fcntl, so this wrapper installs a small
stand-in built on msvcrt.locking, then runs pr-wait unchanged. Arguments pass
through as given:

    python pr-wait-win.py <pr> [--repo owner/name] [--until ready|green|any-change]

Written for the jeff-mods tstack plugin on 2026-11-03. Not part of upstream tstack.
"""

import os
import runpy
import sys
import types

LOCK_SH, LOCK_EX, LOCK_NB, LOCK_UN = 1, 2, 4, 8


# Lock one byte far past the pid that pr-wait writes at the start of the file.
# Windows locks are mandatory, so locking byte 0 would stop a second watcher from
# reading the first watcher's pid. Every process locks this same offset.
LOCK_OFFSET = 1 << 20


def _flock(handle, operation):
    import msvcrt

    fd = handle if isinstance(handle, int) else handle.fileno()
    if hasattr(handle, "flush"):
        handle.flush()
    os.lseek(fd, LOCK_OFFSET, os.SEEK_SET)
    try:
        if operation & LOCK_UN:
            msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
            return
        mode = msvcrt.LK_NBLCK if operation & LOCK_NB else msvcrt.LK_LOCK
        try:
            msvcrt.locking(fd, mode, 1)
        except OSError as error:
            raise BlockingIOError(*error.args) from error
    finally:
        # pr-wait seeks the file object itself before every read or write, so
        # resetting the descriptor here keeps the two in step.
        os.lseek(fd, 0, os.SEEK_SET)


if os.name == "nt" and "fcntl" not in sys.modules:
    shim = types.ModuleType("fcntl")
    shim.LOCK_SH, shim.LOCK_EX, shim.LOCK_NB, shim.LOCK_UN = LOCK_SH, LOCK_EX, LOCK_NB, LOCK_UN
    shim.flock = _flock
    sys.modules["fcntl"] = shim

script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pr-wait")
sys.argv[0] = script
runpy.run_path(script, run_name="__main__")
