"""Identify the macOS browser launching our native host, without profile access."""

import ctypes
import os
from pathlib import PurePosixPath
import sys


BROWSER_APPS = {"Google Chrome.app": "chrome", "Comet.app": "comet", "Brave Browser.app": "brave"}


def app_name(part):
    """Normalize a real app bundle or macOS code-sign clone bundle name."""
    if part.endswith(".app.bundle"):
        return part.removesuffix(".bundle")
    return part if part.endswith(".app") else None


def browser_from_executable(executable):
    """Match the enclosing app bundle, not a Chrome-looking user-agent string."""
    parts = PurePosixPath(executable).parts
    for index, part in enumerate(parts):
        bundle = app_name(part)
        if bundle is not None:
            return BROWSER_APPS.get(bundle) if parts[index + 1:index + 2] == ("Contents",) else None
    return None


def parent_executable():
    if sys.platform != "darwin":
        return ""
    try:
        libproc = ctypes.CDLL("/usr/lib/libproc.dylib")
        libproc.proc_pidpath.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_uint32]
        libproc.proc_pidpath.restype = ctypes.c_int
        buffer = ctypes.create_string_buffer(4096)
        if libproc.proc_pidpath(os.getppid(), buffer, len(buffer)) > 0:
            return os.fsdecode(buffer.value)
    except (OSError, AttributeError):
        pass
    return ""


def detect_browser():
    # One parent lookup at startup. Unknown/renamed apps require a manual choice.
    # This is display metadata, never an authorization or profile identity check.
    return browser_from_executable(parent_executable())
