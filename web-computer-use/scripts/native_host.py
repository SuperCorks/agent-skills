#!/usr/bin/env python3
"""Read-only Chrome Native Messaging host; stdin/stdout, no network listener."""

import json
import select
import struct
import sys
import time

sys.dont_write_bytecode = True
from browser_lock import LeaseStore, LockError  # noqa: E402
from host_config import allowed_origin  # noqa: E402
from browser_identity import detect_browser  # noqa: E402

HEADER = struct.Struct("=I")
MAX_REQUEST_BYTES = 16 * 1024
MAX_RESPONSE_BYTES = 1024 * 1024


def read_exact(stream, length):
    chunks = bytearray()
    while len(chunks) < length:
        data = stream.read(length - len(chunks))
        if not data:
            if not chunks:
                return None
            raise ValueError("Incomplete native message")
        chunks.extend(data)
    return bytes(chunks)


def read_message(stream):
    header = read_exact(stream, HEADER.size)
    if header is None:
        return None
    size = HEADER.unpack(header)[0]
    if not 0 < size <= MAX_REQUEST_BYTES:
        raise ValueError("Native request is too large or empty")
    payload = read_exact(stream, size)
    if payload is None:
        raise ValueError("Missing native message body")
    return json.loads(payload.decode("utf-8"))


def write_message(stream, value):
    data = json.dumps(value, separators=(",", ":"), allow_nan=False).encode("utf-8")
    if len(data) > MAX_RESPONSE_BYTES:
        data = b'{"status":"error","code":"response_too_large"}'
    stream.write(HEADER.pack(len(data)) + data)
    stream.flush()


def snapshot(store, host_browser=None):
    try:
        result = store.snapshot()
    except LockError as exc:
        result = {"status": "error", "code": exc.code, "sampled_at": time.time()}
    except OSError:
        result = {"status": "error", "code": "io_error", "sampled_at": time.time()}
    return {**result, "host_browser": host_browser}


def handle_request(request, store, host_browser=None):
    if not isinstance(request, dict) or set(request) != {"type"} or request["type"] not in ("getStatus", "subscribe"):
        return {"status": "error", "code": "unsupported_operation"}
    return snapshot(store, host_browser)


def serve(input_stream, output_stream, store, host_browser=None):
    subscribed = False
    while True:
        ready, _, _ = select.select([input_stream], [], [], 1 if subscribed else None)
        if not ready:
            write_message(output_stream, snapshot(store, host_browser))
            continue
        request = read_message(input_stream)
        if request is None:
            return
        response = handle_request(request, store, host_browser)
        write_message(output_stream, response)
        if isinstance(request, dict) and request == {"type": "subscribe"}:
            subscribed = True


def main():
    # Chrome also enforces this origin in its host manifest. Do not accept
    # arbitrary paths, shell commands, lock operations, or origins over IPC.
    if len(sys.argv) != 2 or sys.argv[1] != allowed_origin():
        print("Native host refused an unrecognized extension origin.", file=sys.stderr)
        return 2
    try:
        # Use unbuffered input: select() must see every queued frame, including
        # frames that arrive together. BufferedReader can hide already-read bytes.
        with open(sys.stdin.fileno(), "rb", buffering=0, closefd=False) as incoming:
            serve(incoming, sys.stdout.buffer, LeaseStore(), detect_browser())
        return 0
    except (ValueError, UnicodeError, struct.error):
        write_message(sys.stdout.buffer, {"status": "error", "code": "invalid_message"})
        return 2
    except (BrokenPipeError, KeyboardInterrupt):
        return 0


if __name__ == "__main__":
    sys.exit(main())
