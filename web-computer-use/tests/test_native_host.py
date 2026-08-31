import io
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from browser_lock import LeaseStore, LockError, candidates_for, reserve
import host_config
import native_host
import install_native_host

TASK_ID = "11111111-2222-4333-8444-555555555555"


class NativeHostTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "locks"
        self.store = LeaseStore(self.root)

    def acquire(self, mode="plugin", **kwargs):
        return reserve(self.store, "agent", candidates=candidates_for("chrome", mode), wait=0,
                       task_name="Build the status extension", thread_id=TASK_ID, **kwargs)["lease"]

    def test_empty_snapshot_creates_nothing(self):
        self.assertEqual(self.store.snapshot()["reservations"], [])
        self.assertFalse(self.root.exists())

    def test_dangling_symlink_is_unknown_not_idle(self):
        self.root.symlink_to(Path(self.temporary.name) / "missing")
        self.assertEqual(native_host.snapshot(self.store)["code"], "unsafe_store")

    def test_snapshot_excludes_secrets_and_does_not_prune_expired(self):
        lease = self.acquire()
        files = {path: path.read_bytes() for path in self.root.iterdir()}
        snapshot = self.store.snapshot()
        self.assertNotIn(lease["token"], json.dumps(snapshot))
        self.assertNotIn(str(self.root), json.dumps(snapshot))
        self.assertEqual(snapshot["reservations"][0]["task_name"], "Build the status extension")
        self.store.clock = lambda: lease["expires_at"] + 1
        self.assertEqual(self.store.snapshot()["reservations"], [])
        self.assertEqual({path: path.read_bytes() for path in self.root.iterdir()}, files)

    def test_timing_survives_renewals_and_changes_on_transition(self):
        now = [1000.0]
        self.store.clock = lambda: now[0]
        lease = self.acquire()
        now[0] = 1010
        renewed = self.store.renew(lease["token"], "agent")["lease"]
        self.assertEqual(renewed["acquired_at"], 1000)
        self.assertEqual(renewed["mode_since"], 1000)
        upgraded = reserve(self.store, "agent", token=lease["token"], mode="computer-use", wait=0)["lease"]
        self.assertEqual(upgraded["mode_since"], 1010)
        self.assertEqual(upgraded["acquired_at"], 1010)
        now[0] = 1020
        downgraded = reserve(self.store, "agent", token=lease["token"], mode="plugin", wait=0)["lease"]
        self.assertEqual(downgraded["acquired_at"], 1010)
        self.assertEqual(downgraded["mode_since"], 1020)
        self.assertEqual(downgraded["thread_id"], TASK_ID)
        self.assertEqual(downgraded["task_name"], "Build the status extension")

    def test_old_leases_do_not_invent_start_time(self):
        lease = self.acquire()
        with self.store.guarded():
            path, old = self.store.owned(self.store.load(), lease["token"], "agent")
            for field in ("acquired_at", "mode_since", "thread_id", "task_name"):
                old.pop(field)
            self.store.write(old, path)
        self.assertIsNone(self.store.snapshot()["reservations"][0]["mode_since"])

    def test_snapshot_cannot_acquire_guard_while_writer_holds_it(self):
        self.acquire()
        with self.store.guarded():
            response = native_host.snapshot(self.store)
        self.assertEqual(response["code"], "guard_busy")

    def test_read_only_protocol_rejects_mutations_and_paths(self):
        lease = self.acquire()
        for request in ({"type": "release", "token": lease["token"]}, {"type": "renew"},
                        {"type": "getStatus", "path": "/etc/passwd"},
                        {"type": "getStatus", "host_browser": "chrome"}, [], None):
            self.assertEqual(native_host.handle_request(request, self.store)["code"], "unsupported_operation")
        self.assertEqual(len(self.store.snapshot()["reservations"]), 1)

    def test_detected_host_browser_is_independent_of_reserved_browser(self):
        self.acquire()
        result = native_host.handle_request({"type": "getStatus"}, self.store, "comet")
        self.assertEqual(result["host_browser"], "comet")
        self.assertEqual(result["reservations"][0]["browser"], "chrome")
        self.assertNotIn("pid", result)
        self.assertNotIn("executable", result)

    def test_frame_round_trip_and_limits(self):
        output = io.BytesIO()
        native_host.write_message(output, {"type": "getStatus", "unicode": "🤖"})
        output.seek(0)
        self.assertEqual(native_host.read_message(output)["unicode"], "🤖")
        self.assertIsNone(native_host.read_message(output))
        for data in (b"\x01", struct.pack("=I", 20000), struct.pack("=I", 10) + b"short", struct.pack("=I", 0)):
            with self.assertRaises(ValueError):
                native_host.read_message(io.BytesIO(data))

    def test_real_host_frames_and_exits_on_eof(self):
        message = io.BytesIO()
        native_host.write_message(message, {"type": "getStatus"})
        native_host.write_message(message, {"type": "getStatus"})
        code = """import sys
from pathlib import Path
import native_host
from browser_lock import LeaseStore
from host_config import allowed_origin
root = Path(sys.argv[1])
native_host.LeaseStore = lambda: LeaseStore(root)
sys.argv = ['native_host.py', allowed_origin()]
raise SystemExit(native_host.main())
"""
        result = subprocess.run([sys.executable, "-B", "-c", code, str(self.root)],
                                cwd=Path(native_host.__file__).parent,
                                input=message.getvalue(), capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        output = io.BytesIO(result.stdout)
        self.assertEqual(native_host.read_message(output)["status"], "ok")
        self.assertEqual(native_host.read_message(output)["status"], "ok")
        self.assertIsNone(native_host.read_message(output))
        self.assertFalse(self.root.exists())

    def test_subscribe_emits_live_heartbeats_until_disconnect(self):
        code = """import sys
from pathlib import Path
from native_host import serve
from browser_lock import LeaseStore
with open(sys.stdin.fileno(), 'rb', buffering=0, closefd=False) as incoming:
    serve(incoming, sys.stdout.buffer, LeaseStore(Path(sys.argv[1])), 'comet')
"""
        child = subprocess.Popen([sys.executable, "-B", "-c", code, str(self.root)],
                                 cwd=Path(native_host.__file__).parent,
                                 stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            native_host.write_message(child.stdin, {"type": "subscribe"})
            import select
            self.assertTrue(select.select([child.stdout], [], [], 3)[0])
            first = native_host.read_message(child.stdout)
            self.acquire()
            self.assertTrue(select.select([child.stdout], [], [], 3)[0])
            second = native_host.read_message(child.stdout)
            self.assertGreater(second["sampled_at"], first["sampled_at"])
            self.assertEqual(first["host_browser"], "comet")
            self.assertEqual(second["host_browser"], "comet")
            self.assertEqual(first["reservations"], [])
            self.assertEqual(second["reservations"][0]["task_name"], "Build the status extension")
            self.assertNotIn("token", second["reservations"][0])
            child.stdin.close()
            child.wait(timeout=3)
            self.assertEqual(child.returncode, 0)
        finally:
            if child.poll() is None:
                child.kill()
            child.wait()
            child.stdout.close()
            child.stderr.close()

    def test_origin_rejected(self):
        result = subprocess.run([sys.executable, "-B", str(Path(native_host.__file__)), "chrome-extension://wrong/"],
                                input=b"", capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, b"")

    def test_setup_preview_then_registration_in_temp_directory(self):
        directory = Path(self.temporary.name) / "Native Messaging Hosts"
        preview = install_native_host.setup(directory, sys.executable)
        self.assertFalse(directory.exists())
        installed = install_native_host.setup(directory, sys.executable, install=True)
        manifest = json.loads(Path(installed["manifest_path"]).read_text())
        self.assertEqual(manifest["allowed_origins"], [host_config.allowed_origin()])
        self.assertEqual(len(installed["extension_id"]), 32)
        self.assertEqual(installed["extension_id"], preview["extension_id"])
        self.assertTrue(os.access(manifest["path"], os.X_OK))
        result = subprocess.run([manifest["path"], host_config.allowed_origin()], input=b"", capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_task_id_cannot_be_a_url(self):
        with self.assertRaises(LockError):
            reserve(self.store, "agent", candidates=candidates_for("chrome", "plugin"),
                    thread_id="javascript:alert(1)", wait=0)


if __name__ == "__main__":
    unittest.main()
