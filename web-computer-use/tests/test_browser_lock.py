"""Run with: python3 -B -m unittest discover -s web-computer-use/tests -v"""

import importlib.util
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/browser_lock.py"
spec = importlib.util.spec_from_file_location("browser_lock", SCRIPT)
locks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(locks)


class BrowserLocksTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "locks"
        self.store = locks.LeaseStore(self.root)

    def acquire(self, owner="reader", browser="chrome", mode="plugin", **kwargs):
        candidates = locks.candidates_for(browser, mode, kwargs.pop("fallbacks", ()))
        return locks.reserve(self.store, owner, candidates=candidates,
                             wait=kwargs.pop("wait", 0), poll=0.005, **kwargs)

    def release(self, result):
        lease = result["lease"]
        return self.store.release(lease["token"], lease["owner"])

    def start_cli(self, *args):
        child = subprocess.Popen([sys.executable, "-B", str(SCRIPT), "--lock-dir", str(self.root), *args],
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        def cleanup():
            if child.poll() is None:
                child.kill()
            child.communicate()
        self.addCleanup(cleanup)
        return child

    def finish(self, child):
        stdout, stderr = child.communicate(timeout=5)
        return child.returncode, json.loads(stdout), stderr

    def wait_pending(self, count=1):
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            leases = self.store.status()["reservations"]
            if sum(lease["state"] == "pending" for lease in leases) >= count:
                return
            time.sleep(0.01)
        self.fail("Request did not enter the queue")

    def test_shared_chrome_readers_and_exclusive_conflict(self):
        first, second = self.acquire("a"), self.acquire("b")
        self.assertEqual(first["resources"], {"chrome": "shared"})
        self.assertEqual(second["status"], "acquired")
        blocked = self.acquire("writer", mode="computer-use")
        self.assertEqual(blocked["status"], "timeout")
        self.assertEqual(len(self.store.status()["reservations"]), 2)
        self.release(first)
        self.release(second)
        self.assertEqual(self.acquire("writer", mode="computer-use")["resources"],
                         {"chrome": "exclusive", "desktop": "exclusive"})

    def test_desktop_excludes_other_browsers_but_not_chrome_plugin(self):
        first = self.acquire("comet", "comet", "computer-use")
        self.assertEqual(self.acquire("reader")["status"], "acquired")
        for browser in ("chrome", "brave", "safari"):
            blocked = self.acquire(browser, browser, "computer-use")
            self.assertEqual(blocked["status"], "timeout")
            self.assertTrue(any("desktop" in blocker["resources"]
                                for item in blocked["blockers"] for blocker in item["blockers"]))
        self.release(first)
        self.assertEqual(self.acquire("safari", "safari", "computer-use")["status"], "acquired")

    def test_multiple_processes_share_chrome(self):
        children = [self.start_cli("acquire", "--browser", "chrome", "--mode", "plugin",
                                   "--owner", f"reader-{index}", "--wait", "3") for index in range(6)]
        for child in children:
            code, result, _ = self.finish(child)
            self.assertEqual(code, 0)
            self.assertEqual(result["status"], "acquired")
        self.assertEqual(len(self.store.status()["reservations"]), 6)

    def test_exclusive_race_has_exactly_one_winner(self):
        children = [self.start_cli("acquire", "--browser", browser, "--mode", "computer-use",
                                   "--owner", browser, "--wait", "0") for browser in locks.BROWSERS]
        results = [self.finish(child)[1] for child in children]
        self.assertEqual(sum(result["status"] == "acquired" for result in results), 1)
        self.assertEqual(len(self.store.status()["reservations"]), 1)

    def test_queued_writer_blocks_new_readers_then_acquires(self):
        first = self.acquire("reader")
        writer = self.start_cli("acquire", "--browser", "chrome", "--mode", "computer-use",
                                "--owner", "writer", "--wait", "4")
        self.wait_pending()
        self.assertEqual(self.acquire("new-reader")["status"], "timeout")
        self.assertEqual(self.acquire("brave", "brave", "computer-use")["status"], "acquired")
        # The waiting Chrome writer did not reserve the desktop or Brave.
        for lease in self.store.status()["reservations"]:
            if lease["owner"] == "brave":
                self.store.release(lease["token"], lease["owner"])
        self.release(first)
        code, result, stderr = self.finish(writer)
        self.assertEqual(code, 0)
        self.assertEqual(result["resources"], {"chrome": "exclusive", "desktop": "exclusive"})
        self.assertIn('"status": "waiting"', stderr)

    def test_simultaneous_upgrades_do_not_deadlock(self):
        readers = [self.acquire(owner) for owner in ("a", "b")]
        children = [self.start_cli("transition", "--token", reader["lease"]["token"],
                                   "--owner", reader["lease"]["owner"], "--mode", "computer-use",
                                   "--wait", "3") for reader in readers]
        results = [self.finish(child)[1] for child in children]
        self.assertEqual(sum(result["status"] == "acquired" for result in results), 1)
        self.assertEqual(sum(result["status"] == "timeout" for result in results), 1)
        leases = self.store.status()["reservations"]
        self.assertEqual(len(leases), 1)
        self.assertEqual(leases[0]["mode"], "computer-use")

    def test_failed_upgrade_relinquishes_reader(self):
        first = self.acquire("a")
        second = self.acquire("b")
        result = locks.reserve(self.store, "a", token=first["lease"]["token"], mode="computer-use", wait=0)
        self.assertEqual(result["status"], "timeout")
        self.assertEqual([item["token"] for item in self.store.status()["reservations"]], [second["lease"]["token"]])

    def test_downgrade_keeps_chrome_and_frees_desktop(self):
        first = self.acquire("a", mode="computer-use")
        result = locks.reserve(self.store, "a", token=first["lease"]["token"], mode="plugin", wait=0)
        self.assertEqual(result["lease"]["token"], first["lease"]["token"])
        self.assertEqual(result["resources"], {"chrome": "shared"})
        self.assertEqual(self.acquire("b")["status"], "acquired")
        self.assertEqual(self.acquire("c", "comet", "computer-use")["status"], "acquired")

    def test_fallback_immediately_skips_busy_chrome(self):
        self.acquire("reader")
        result = self.acquire("writer", mode="computer-use", fallbacks=("comet", "brave", "safari"), profile="Default")
        self.assertEqual(result["lease"]["browser"], "comet")
        self.assertIsNone(result["lease"]["profile"])
        self.assertTrue((self.root / f"comet.{result['lease']['token']}.json").is_file())

    def test_fallback_has_one_deadline(self):
        self.acquire("desktop", mode="computer-use")
        started = time.monotonic()
        result = self.acquire("blocked", fallbacks=("comet", "brave", "safari"), wait=0.12)
        elapsed = time.monotonic() - started
        self.assertEqual(result["status"], "timeout")
        self.assertGreaterEqual(elapsed, 0.1)
        self.assertLess(elapsed, 0.3)
        self.assertEqual(len(result["blockers"]), 4)
        self.assertEqual(len(self.store.status()["reservations"]), 1)

    def test_original_deadline_limits_later_wait(self):
        self.acquire("desktop", mode="computer-use")
        started = time.monotonic()
        result = self.acquire("blocked", wait=10, until=time.time() + 0.08)
        self.assertEqual(result["status"], "timeout")
        self.assertLess(time.monotonic() - started, 0.3)

    def test_full_ten_minute_budget_and_progress_without_real_wait(self):
        now = [1000.0]
        self.store.clock = lambda: now[0]
        holder = self.acquire("active", mode="computer-use")
        events = []
        def advance(seconds):
            now[0] += seconds
            # Simulate the other agent continuing to renew its active lease.
            self.store.renew(holder["lease"]["token"], "active")
        with patch.object(locks.time, "monotonic", side_effect=lambda: now[0]), \
             patch.object(locks.time, "sleep", side_effect=advance):
            result = locks.reserve(self.store, "waiting", wait=600, progress=events.append,
                                   candidates=locks.candidates_for("chrome", "plugin", ("comet", "brave", "safari")))
        self.assertEqual(result["status"], "timeout")
        self.assertEqual(result["waited_seconds"], 600)
        self.assertGreaterEqual(len(events), 20)
        remaining = [event["remaining_seconds"] for event in events]
        self.assertTrue(all(0 <= previous - following <= 30.01
                            for previous, following in zip(remaining, remaining[1:])))
        self.assertEqual(len(self.store.status()["reservations"]), 1)

    def test_elapsed_deadline_does_not_acquire_even_when_free(self):
        result = self.acquire(until=time.time() - 1)
        self.assertEqual(result["status"], "timeout")
        self.assertEqual(self.store.status()["reservations"], [])

    def test_elapsed_transition_deadline_does_not_claim_ownership(self):
        first = self.acquire("a")
        with self.assertRaises(locks.LockError) as raised:
            locks.reserve(self.store, "a", token=first["lease"]["token"],
                          mode="computer-use", until=time.time() - 1)
        self.assertEqual(raised.exception.code, "transition_not_started")
        self.assertEqual(self.store.status()["reservations"][0]["mode"], "plugin")

    def test_invalid_options_never_reserve(self):
        for args in [("chrome", "plugin", ["comet"], True, None),
                     ("chrome", "computer-use", ["brave"], True, "Work"),
                     ("brave", "plugin", [], False, None),
                     ("safari", "computer-use", [], False, "Default")]:
            with self.assertRaises(locks.LockError):
                locks.candidates_for(*args)
        for wait in (-1, 601, float("nan"), float("inf")):
            with self.assertRaises(locks.LockError):
                self.acquire(wait=wait)
        self.assertEqual(self.store.status()["reservations"], [])

    def test_expiry_renewal_and_stale_owner(self):
        now = [1000.0]
        self.store.clock = lambda: now[0]
        first = self.acquire("a")
        self.assertEqual(first["lease"]["expires_at"], 1300)
        now[0] = 1200
        self.assertEqual(self.store.renew(first["lease"]["token"], "a")["lease"]["expires_at"], 1500)
        now[0] = 1500
        with self.assertRaisesRegex(locks.LockError, "absent or expired"):
            self.store.renew(first["lease"]["token"], "a")
        replacement = self.acquire("a", mode="computer-use")
        self.assertNotEqual(first["lease"]["token"], replacement["lease"]["token"])
        self.assertEqual(self.release(first)["status"], "absent")
        self.assertEqual(len(self.store.status()["reservations"]), 1)

    def test_wrong_owner_cannot_mutate_reservation(self):
        first = self.acquire("a")
        for operation in (self.store.release, self.store.renew):
            with self.assertRaisesRegex(locks.LockError, "different owner"):
                operation(first["lease"]["token"], "b")
        with self.assertRaisesRegex(locks.LockError, "different owner"):
            locks.reserve(self.store, "b", token=first["lease"]["token"], mode="computer-use", wait=0)
        self.assertEqual(self.store.status()["reservations"][0]["owner"], "a")

    def test_pending_cannot_renew_or_claim_browser_access(self):
        self.acquire("reader")
        writer = self.start_cli("acquire", "--browser", "chrome", "--mode", "computer-use",
                                "--owner", "writer", "--wait", "4")
        self.wait_pending()
        pending = next(item for item in self.store.status()["reservations"] if item["state"] == "pending")
        self.assertEqual(pending["resources"], {})
        with self.assertRaisesRegex(locks.LockError, "pending reservation"):
            self.store.renew(pending["token"], "writer")
        writer.send_signal(signal.SIGTERM)
        code, result, _ = self.finish(writer)
        self.assertEqual(code, 130)
        self.assertEqual(result["status"], "cancelled")
        self.assertEqual(len(self.store.status()["reservations"]), 1)

    def test_timeout_removes_pending_ticket(self):
        self.acquire("reader")
        result = self.acquire("writer", mode="computer-use", wait=0.03)
        self.assertEqual(result["status"], "timeout")
        self.assertEqual(len(list(self.root.glob("*.json"))), 1)
        self.assertEqual(self.acquire("new-reader")["status"], "acquired")

    def test_deadline_crossed_during_load_returns_timeout_and_cleans_ticket(self):
        now = [1000.0]
        self.store.clock = lambda: now[0]
        self.acquire("reader")
        real_load = self.store.load
        reads = 0

        def slow_load(*args, **kwargs):
            nonlocal reads
            reads += 1
            if reads == 2:
                now[0] += 0.1
            return real_load(*args, **kwargs)

        def advance(seconds):
            now[0] += seconds

        with patch.object(self.store, "load", side_effect=slow_load), \
             patch.object(locks.time, "monotonic", side_effect=lambda: now[0]), \
             patch.object(locks.time, "sleep", side_effect=advance):
            result = self.acquire("writer", mode="computer-use", wait=0.05)
        self.assertEqual(result["status"], "timeout")
        self.assertFalse(result["reservation_held"])
        self.assertTrue(result["blockers"])
        self.assertEqual(len(list(self.root.glob("*.json"))), 1)

    def test_killed_waiter_eventually_expires(self):
        self.acquire("reader")
        writer = self.start_cli("acquire", "--browser", "chrome", "--mode", "computer-use",
                                "--owner", "writer", "--wait", "4")
        self.wait_pending()
        writer.kill()
        writer.communicate()
        pending = next(item for item in self.store.status()["reservations"] if item["state"] == "pending")
        self.store.clock = lambda: pending["expires_at"] + 0.01
        self.assertEqual(self.acquire("new-reader")["status"], "acquired")

    def test_interrupted_atomic_write_preserves_old_lease(self):
        first = self.acquire("a")
        path = self.root / f"chrome.{first['lease']['token']}.json"
        before = path.read_bytes()
        with patch.object(locks.os, "replace", side_effect=OSError("interrupted write")):
            with self.assertRaises(OSError):
                self.store.renew(first["lease"]["token"], "a")
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual(len(self.store.status()["reservations"]), 1)
        self.assertEqual(list(self.root.glob("*.tmp")), [])

    def test_fallback_rename_interruption_remains_authoritative(self):
        first = self.acquire("a")
        with self.store.guarded():
            path, lease = self.store.owned(self.store.load(), first["lease"]["token"], "a")
            lease.update(browser="comet", mode="computer-use")
            real_replace = locks.os.replace
            def interrupted(source, destination):
                if Path(source) == path:
                    raise OSError("interrupted rename")
                return real_replace(source, destination)
            with patch.object(locks.os, "replace", side_effect=interrupted):
                with self.assertRaises(OSError):
                    self.store.write(lease, path)
        self.assertEqual(len(list(self.root.glob("*.json"))), 1)
        self.assertEqual(self.acquire("b", "brave", "computer-use")["status"], "timeout")
        self.assertEqual(self.acquire("reader")["status"], "acquired")

    def test_corrupt_records_fail_closed_and_remain_on_disk(self):
        self.acquire("a")
        corrupt = self.root / "chrome.bad.json"
        corrupt.write_text("{broken")
        corrupt.chmod(0o600)
        with self.assertRaisesRegex(locks.LockError, "Invalid reservation file"):
            self.acquire("b")
        self.assertTrue(corrupt.exists())

    def test_private_permissions_and_symlink_rejection(self):
        self.acquire("a")
        self.assertEqual(stat.S_IMODE(self.root.stat().st_mode), 0o700)
        for path in self.root.iterdir():
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        link = self.root / "safari.bad.json"
        link.symlink_to(next(self.root.glob("*.json")))
        with self.assertRaisesRegex(locks.LockError, "Not an owned, regular file"):
            self.store.status()

    def test_guard_contention_obeys_wait_budget(self):
        with self.store.guarded():
            child = self.start_cli("acquire", "--browser", "chrome", "--mode", "plugin",
                                   "--owner", "blocked", "--wait", "0.05")
            code, result, _ = self.finish(child)
        self.assertEqual(code, 1)
        self.assertEqual(result["blockers"], [{"resources": ["metadata-guard"]}])
        self.assertLess(result["waited_seconds"], 0.25)

    def test_blocked_transition_reports_original_lease_unchanged(self):
        first = self.acquire("a")
        with self.store.guarded():
            child = self.start_cli("transition", "--token", first["lease"]["token"],
                                   "--owner", "a", "--mode", "computer-use", "--wait", "0")
            code, result, _ = self.finish(child)
        self.assertEqual(code, 2)
        self.assertEqual(result["code"], "transition_not_started")
        self.assertEqual(self.store.status()["reservations"][0]["mode"], "plugin")

    def test_cli_usage_errors_are_json(self):
        for args in [("acquire",), ("acquire", "--browser", "chrome", "--mode", "plugin",
                                   "--owner", "a", "--pinned", "--fallback", "comet")]:
            code, result, _ = self.finish(self.start_cli(*args))
            self.assertEqual(code, 2)
            self.assertEqual(result["code"], "invalid_request")

    def test_handoff_release_and_resume_requires_fresh_reservation(self):
        first = self.acquire("task", mode="computer-use")
        self.release(first)
        other = self.acquire("other", mode="computer-use")
        self.assertEqual(self.acquire("task", mode="computer-use")["status"], "timeout")
        self.release(other)
        resumed = self.acquire("task", mode="computer-use")
        self.assertNotEqual(resumed["lease"]["token"], first["lease"]["token"])


if __name__ == "__main__":
    unittest.main()
