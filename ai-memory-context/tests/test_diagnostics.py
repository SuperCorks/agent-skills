"""Fault log: diagnosable without ever holding payload text."""
import ast
import io
import json
import os
import sys
import tempfile
import time
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import context_hook
from agent_memory import cli, diagnostics
from agent_memory.api import ApiError
from agent_memory.config import CaptureSkip, Config, MemoryError

SAFE_ERRORS = {"MemoryError", "CaptureSkip"}


class DiagnosticsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        (self.repo / ".ai-memory.toml").write_text('workspace="work/team"\nproject="app"\n')
        key = self.root / "registry-key"
        key.write_text("12" * 32)
        self.config = Config({"server_url": "http://127.0.0.1:9", "host_id": "test-host",
                              "state_dir": str(self.root / "state"), "registry_key_file": str(key),
                              "allowed_scopes": [{"workspace": "work/team", "project": "app"}],
                              "transcript_roots": [str(self.root / "sessions")]})

    def tearDown(self):
        self.temp.cleanup()

    def raised(self, error):
        try:
            raise error
        except Exception as caught:  # noqa: BLE001 - gives the error a traceback
            return caught

    def records(self, name=diagnostics.ERRORS):
        return diagnostics.load(self.config, name)

    def test_every_memory_error_message_is_a_static_source_literal(self):
        """The log records these messages verbatim, so none may carry runtime data."""
        offenders = []
        for path in SCRIPTS.rglob("*.py"):
            for node in ast.walk(ast.parse(path.read_text())):
                if not isinstance(node, ast.Raise) or not isinstance(node.exc, ast.Call):
                    continue
                name = getattr(node.exc.func, "id", getattr(node.exc.func, "attr", None))
                if name not in SAFE_ERRORS:
                    continue
                literal = (len(node.exc.args) == 1 and isinstance(node.exc.args[0], ast.Constant)
                           and isinstance(node.exc.args[0].value, str) and not node.exc.keywords)
                if not literal:
                    offenders.append(path.name + ":" + str(node.lineno))
        self.assertEqual(offenders, [])

    def test_memory_error_keeps_its_message_and_context_but_other_errors_keep_no_text(self):
        scope = {"workspace": "work/team", "project": "app"}
        payload = {"session_id": "s-1", "prompt": "the user's secret prompt", "tool_input": {"token": "hunter2"}}
        diagnostics.note(self.config, "capture", self.raised(MemoryError("Native hook session_id does not match the transcript header")),
                         event="PreToolUse", payload=payload, scope=scope, agent="claude-code")
        diagnostics.note(self.config, "capture", self.raised(OSError(13, "/Users/someone/private/path hunter2")),
                         event="Stop", payload=payload, scope=scope, agent="codex")
        diagnostics.note(self.config, "native-drain", self.raised(ApiError(503)), agent="codex")
        known, unknown, api = self.records()
        self.assertEqual(known["message"], "Native hook session_id does not match the transcript header")
        self.assertEqual((known["event"], known["agent"], known["session_id"], known["scope"]),
                         ("PreToolUse", "claude-code", "s-1", scope))
        self.assertNotIn("where", known)  # raised here, outside the companion: no site to name
        self.assertNotIn("message", unknown)
        self.assertEqual((unknown["error_type"], unknown["errno"]), ("PermissionError", 13))
        self.assertEqual(api["status"], 503)
        written = (self.config.state_dir / diagnostics.ERRORS).read_text()
        for secret in ("hunter2", "secret prompt", "/Users/someone"):
            self.assertNotIn(secret, written)

    def test_raise_site_names_the_companion_line_that_refused(self):
        from agent_memory import transcript
        try:
            transcript.allowed_path(self.config, self.root / "outside-every-root.jsonl")
        except MemoryError as refused:
            diagnostics.note(self.config, "capture", refused)
        record, = self.records()
        self.assertRegex(record["where"], r"^transcript\.py:\d+$")

    def test_expected_skips_are_counted_apart_from_faults(self):
        diagnostics.note(self.config, "capture", self.raised(CaptureSkip("Session has no persisted transcript; nothing to capture")))
        self.assertEqual(self.records(), [])
        self.assertEqual([item["message"] for item in self.records(diagnostics.SKIPS)],
                         ["Session has no persisted transcript; nothing to capture"])
        summary = diagnostics.summary(self.config)
        self.assertEqual((summary["errors"], summary["expected_skips"]), (0, 1))

    def test_summary_groups_by_cause_and_separates_the_last_day(self):
        target = self.config.state_dir / diagnostics.ERRORS
        self.config.state_dir.mkdir(parents=True)
        now = time.time()
        rows = ([{"time": now - 3 * 86400, "component": "capture", "error_type": "MemoryError", "message": "old cause",
                  "session_id": "a", "agent": "codex"}] * 3
                + [{"time": now - 60, "component": "drain", "error_type": "MemoryError", "message": "new cause",
                    "session_id": "b", "agent": "claude-code", "where": "capture.py:1"}]
                + [{"time": now - 30 * 86400, "component": "capture", "error_type": "MemoryError"}])  # outside window, legacy shape
        target.write_text("".join(json.dumps(row) + "\n" for row in rows))
        summary = diagnostics.summary(self.config, days=7)
        self.assertEqual((summary["errors"], summary["errors_last_24h"]), (4, 1))
        self.assertEqual([(group["error"], group["count"]) for group in summary["error_groups"]], [("old cause", 3), ("new cause", 1)])
        self.assertEqual(summary["error_groups_last_24h"][0]["agents"], ["claude-code"])
        self.assertEqual(summary["noisiest_sessions"][0], {"session_id": "a", "errors": 3})

    def test_log_rotates_instead_of_growing_without_bound(self):
        target = self.config.state_dir / diagnostics.ERRORS
        self.config.state_dir.mkdir(parents=True)
        target.write_text(json.dumps({"time": time.time(), "component": "capture", "error_type": "MemoryError"}) + "\n")
        with patch.object(diagnostics, "ROTATE_BYTES", 10):
            diagnostics.note(self.config, "capture", self.raised(MemoryError("fresh")))
        self.assertTrue(target.with_name(target.name + ".1").exists())
        self.assertEqual(len(target.read_text().splitlines()), 1)
        self.assertEqual(len(self.records()), 2)  # load spans the rotated file

    def test_doctor_attention_reflects_recent_faults_not_history(self):
        self.config.state_dir.mkdir(parents=True)
        (self.config.state_dir / "activation.json").write_text(json.dumps({"activated_at": "2026-01-01T00:00:00Z", "files": {}}))
        target = self.config.state_dir / diagnostics.ERRORS
        target.write_text(json.dumps({"time": time.time() - 5 * 86400, "component": "capture", "error_type": "MemoryError"}) + "\n")
        with patch.object(cli, "Client") as client:
            client.return_value.request.return_value = {"projects": []}
            quiet = cli.doctor(self.config)
            diagnostics.note(self.config, "capture", self.raised(MemoryError("Native hook session_id does not match the transcript header")))
            noisy = cli.doctor(self.config)
        self.assertEqual((quiet["status"], quiet["attention_reasons"], quiet["hook_error_count"]), ("ready", [], 1))
        self.assertEqual((noisy["status"], noisy["attention_reasons"]), ("attention", ["hook_or_drain_errors_last_24h"]))
        self.assertEqual(noisy["diagnostics"]["error_groups_last_24h"][0]["error"],
                         "Native hook session_id does not match the transcript header")

    def test_claude_mode_runs_fuller_capture_only_and_logs_skips_with_context(self):
        payload = {"session_id": "claude-1", "cwd": str(self.repo), "transcript_path": None, "hook_event_name": "SessionStart"}
        (self.config.state_dir).mkdir(parents=True)
        (self.config.state_dir / "activation.json").write_text(json.dumps({"activated_at": "2026-01-01T00:00:00Z", "files": {}}))
        output = io.StringIO()
        with patch.object(sys, "argv", ["context_hook.py", "SessionStart", "--agent", "claude-code"]), \
                patch.object(sys, "stdin", io.StringIO(json.dumps(payload))), \
                patch("agent_memory.config.Config.load", return_value=self.config), \
                patch.object(context_hook, "native_hook") as lifecycle, redirect_stdout(output):
            self.assertEqual(context_hook.main(), 0)
        lifecycle.assert_not_called()  # ai-memory's own Claude hook owns lifecycle observations
        self.assertEqual(output.getvalue().strip(), "{}")
        skip, = self.records(diagnostics.SKIPS)
        self.assertEqual((skip["agent"], skip["event"], skip["session_id"]), ("claude-code", "SessionStart", "claude-1"))
        self.assertEqual(self.records(), [])

    def test_agent_argument_defaults_to_codex_and_rejects_unknown_values(self):
        self.assertEqual(context_hook.arguments(["x", "Stop"]), ("Stop", "codex"))
        self.assertEqual(context_hook.arguments(["x", "Stop", "--agent", "claude-code"]), ("Stop", "claude-code"))
        self.assertEqual(context_hook.arguments(["x", "Stop", "--agent", "something-else"]), ("Stop", "codex"))


if __name__ == "__main__":
    unittest.main()
