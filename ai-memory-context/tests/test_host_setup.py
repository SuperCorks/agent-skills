"""Behavior tests for the host installation and narrowly scoped hook guard."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
import sys
import io

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


class ScopeGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.guard = module("context_hook", "context_hook.py")

    def payload(self, arguments, tool="mcp__ai_memory__memory_query"):
        return {"tool_name": tool, "tool_input": arguments}

    def test_missing_or_partial_scope_is_denied(self):
        for arguments in ({"query": "planner"}, {"workspace": "kernel"}, {"scopes": []}):
            result = self.guard.scope_guard("PreToolUse", self.payload(arguments))
            self.assertEqual(result["hookSpecificOutput"]["permissionDecision"], "deny")
            self.assertIn("explicit", result["hookSpecificOutput"]["permissionDecisionReason"])

    def test_explicit_scope_and_intentional_global_are_allowed(self):
        for arguments in (
            {"workspace": "supercorks/kernel", "project": "nextjs"},
            {"scopes": [{"workspace": "supercorks/kernel", "project": "nextjs"}]},
            {"global": True},
        ):
            self.assertIsNone(self.guard.scope_guard("PreToolUse", self.payload(arguments)))

    def test_conflicting_or_malformed_scopes_are_denied(self):
        for arguments in (
            {"scopes": [{"workspace": "kernel"}]},
            {"workspace": " ", "project": "app"},
            {"global": True, "project": "app"},
            {"scopes": [{"workspace": "w", "project": "p"}], "project": "p"},
        ):
            self.assertIsNotNone(self.guard.scope_guard("PreToolUse", self.payload(arguments)))

    def test_unrelated_reads_and_global_status_are_not_blocked(self):
        self.assertIsNone(self.guard.scope_guard("PreToolUse", self.payload({}, "Bash")))
        self.assertIsNone(self.guard.scope_guard("PreToolUse", self.payload({}, "mcp__serena__search_for_pattern")))
        self.assertIsNone(self.guard.scope_guard("PreToolUse", self.payload({}, "mcp__ai_memory__memory_status")))
        self.assertIsNone(self.guard.scope_guard("PostToolUse", self.payload({})))

    def test_global_write_uses_its_actual_scope_argument(self):
        self.assertIsNone(self.guard.scope_guard("PreToolUse", self.payload(
            {"scope": "global", "path": "preference.md", "body": "fixture"}, "mcp__ai_memory__memory_write_page")))
        self.assertIsNotNone(self.guard.scope_guard("PreToolUse", self.payload(
            {"scope": "global", "workspace": "w", "project": "p"}, "mcp__ai_memory__memory_write_page")))
        self.assertIsNotNone(self.guard.scope_guard("PreToolUse", self.payload(
            {"scopes": [{"workspace": "w", "project": "p"}]}, "mcp__ai_memory__memory_write_page")))

    def test_schema_specific_scopes_and_maintenance(self):
        self.assertIsNone(self.guard.scope_guard("PreToolUse", self.payload(
            {"workspace": "w", "project": "p", "scopes": []})))
        for tool in ("memory_handoff_begin", "memory_feedback", "memory_lint", "memory_forget_sweep"):
            self.assertIsNotNone(self.guard.scope_guard("PreToolUse", self.payload({}, "mcp__ai_memory__" + tool)))
            self.assertIsNone(self.guard.scope_guard("PreToolUse", self.payload(
                {"workspace": "w", "project": "p"}, "mcp__ai_memory__" + tool)))
        self.assertIsNotNone(self.guard.scope_guard("PreToolUse", self.payload(
            {"global": True}, "mcp__ai_memory__memory_delete_page")))


class InstallationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.setup = module("install_context", "install-context.py")

    def test_reconcile_preserves_unrelated_hooks_and_is_idempotent(self):
        original = {"description": "Personal hooks", "hooks": {
            "Stop": [{"hooks": [
                {"type": "command", "command": "my-notifier --done"},
                {"type": "command", "command": "ai-memory hook --agent codex --event stop"},
                {"type": "command", "command": "'/private/releases/ai-memory' --data-dir '/private/Application Support/ai-memory' hook --event stop --agent codex --auth-token fixture-only"},
            ]}],
            "PermissionRequest": [{"hooks": [{"type": "command", "command": "custom-policy"}]}],
        }}
        result = self.setup.reconcile_hooks(original, "/skills/ai-memory-context/scripts/context_hook.py", "/usr/bin/python3")
        commands = [h["command"] for groups in result["hooks"].values() for group in groups for h in group["hooks"]]
        self.assertIn("my-notifier --done", commands)
        self.assertIn("custom-policy", commands)
        self.assertFalse(any(command.startswith("ai-memory hook") for command in commands))
        self.assertFalse(any("fixture-only" in command for command in commands))
        self.assertIn("SessionEnd", result["hooks"])
        self.assertEqual(result, self.setup.reconcile_hooks(result, "/skills/ai-memory-context/scripts/context_hook.py", "/usr/bin/python3"))

    def test_serena_registration_is_unbound_and_does_not_modify_trust(self):
        import tomllib
        original = 'model = "example"\n[hooks.state."old-hook"]\ntrusted_hash = "unchanged"\n[mcp_servers.other]\nurl = "https://example.invalid/mcp"\n[mcp_servers.serena]\ncommand = "old"\nargs = ["--project-from-cwd"]\n[mcp_servers.graphify]\ncommand = "graphify-mcp"\n'
        changed = self.setup.reconcile_codex(original)
        parsed = tomllib.loads(changed)
        self.assertEqual(parsed["model"], "example")
        self.assertEqual(parsed["hooks"]["state"]["old-hook"]["trusted_hash"], "unchanged")
        self.assertEqual(parsed["mcp_servers"]["other"]["url"], "https://example.invalid/mcp")
        self.assertEqual(parsed["mcp_servers"]["serena"]["command"], "serena")
        self.assertNotIn("--project-from-cwd", parsed["mcp_servers"]["serena"]["args"])
        self.assertNotIn("graphify", parsed["mcp_servers"])
        self.assertEqual(changed, self.setup.reconcile_codex(changed))

    def test_atomic_install_preserves_old_file_and_private_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            target = base / "config.json"
            target.write_text("old", encoding="utf-8")
            backup = base / "backup"
            self.setup.write_private(target, "new", backup)
            self.assertEqual(target.read_text(), "new")
            self.assertEqual((backup / "config.json").read_text(), "old")
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_installer_refuses_to_overwrite_a_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            source = base / "source"
            source.write_text("untouched")
            target = base / "config"
            target.symlink_to(source)
            with self.assertRaises(ValueError):
                self.setup.write_private(target, "new", base / "backup")
            self.assertEqual(source.read_text(), "untouched")


class HookRouterTests(unittest.TestCase):
    def test_unrelated_project_is_quietly_skipped_in_actual_router(self):
        from agent_memory.config import Config, MemoryError
        router = module("context_hook_router", "context_hook.py")
        config = Mock()
        config.resolve_scope.side_effect = MemoryError("outside allowlist")
        with patch.object(Config, "load", return_value=config), patch.object(router, "native_hook", return_value={}), \
                patch.object(sys, "argv", ["context_hook.py", "Stop"]), \
                patch.object(sys, "stdin", io.StringIO('{"cwd":"/outside","session_id":"s"}')), \
                patch.object(sys, "stdout", io.StringIO()) as output:
            self.assertEqual(router.main(), 0)
        self.assertEqual(json.loads(output.getvalue()), {})


class NativeForwardingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.native = module("native_hooks", "native_hooks.py")

    def test_body_is_bounded_and_raw_assistant_is_not_duplicated(self):
        body = self.native.bounded_body({"session_id": "s", "prompt": "x" * 20000,
            "tool_input": {"command": "x" * 5000}, "last_assistant_message": "private-copy",
            "arbitrary_field": "omit"})
        self.assertLessEqual(len(body["prompt"].encode()), 16384)
        self.assertLessEqual(len(json.dumps(body["tool_input"]).encode()), 2048)
        self.assertNotIn("last_assistant_message", body)
        self.assertNotIn("arbitrary_field", body)

    def test_native_scope_uses_top_level_cwd_and_child_marker(self):
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory)
            child = parent / "child"
            child.mkdir()
            (parent / ".ai-memory.toml").write_text('workspace="w"\nproject="meta"\n')
            (child / ".ai-memory.toml").write_text('workspace="w"\nproject="child"\n')
            self.assertEqual(self.native.marker_context(str(parent))["project"], "meta")
            self.assertEqual(self.native.marker_context(str(child))["project"], "child")

    def test_native_unallowlisted_scope_cannot_enqueue(self):
        from agent_memory.config import Config, MemoryError
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            (base / ".ai-memory.toml").write_text('workspace="outside"\nproject="unknown"\n')
            config = Config({"server_url": "https://example.invalid", "host_id": "test",
                             "state_dir": str(base / "state"),
                             "allowed_scopes": [{"workspace": "w", "project": "p"}]})
            self.assertIsNone(self.native.enqueue(config, "Stop", {"session_id": "s", "cwd": str(base)}, spawn=False))
            self.assertFalse((base / "state" / "native-hooks").exists())

    def test_explicit_native_legacy_scope_does_not_expand_fuller_scope(self):
        from agent_memory.config import Config, MemoryError
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            (base / ".ai-memory.toml").write_text('workspace="legacy"\nproject="app"\n')
            config = Config({"server_url": "https://example.invalid", "host_id": "test",
                             "state_dir": str(base / "state"),
                             "allowed_scopes": [{"workspace": "w", "project": "p"}],
                             "native_allowed_scopes": [{"workspace": "legacy", "project": "app"}]})
            self.native.enqueue(config, "Stop", {"session_id": "s", "cwd": str(base)}, spawn=False)
            self.assertEqual(len(list((base / "state" / "native-hooks").glob("*.json"))), 1)
            with self.assertRaises(MemoryError):
                config.resolve_scope(base)

    def test_policy_uses_no_token_and_metadata_only_omits_content(self):
        completed = Mock(returncode=0, stdout=json.dumps({"disposition": "metadata-only", "policy_state": "active"}))
        with patch.object(self.native.subprocess, "run", return_value=completed) as run:
            result = self.native.capture_body(Mock(server_url="https://example.invalid"), "PostToolUse",
                                             {"cwd": "/tmp", "session_id": "s", "tool_response": "hidden-by-policy"})
        self.assertNotIn("--auth-token", run.call_args.args[0])
        self.assertNotIn("tool_response", result)

    def test_batch_ack_removes_only_confirmed_entries(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Mock(state_dir=Path(directory), server_url="https://example.invalid", timeout=1)
            queue = config.state_dir / "native-hooks"
            queue.mkdir()
            for index in range(3):
                (queue / f"{index}.json").write_text(json.dumps({"url": "https://example.invalid/hook?ingest_key=" + str(index), "body": {}}))
            client = Mock()
            client.request.return_value = {"accepted": 1, "accepted_indices": [0, 2]}
            self.native.drain(config, client=client)
            self.assertFalse((queue / "0.json").exists())
            self.assertTrue((queue / "1.json").exists())
            self.assertFalse((queue / "2.json").exists())

    def test_network_failure_retains_queue(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Mock(state_dir=Path(directory), server_url="https://example.invalid", timeout=1)
            queue = config.state_dir / "native-hooks"
            queue.mkdir()
            entry = queue / "0.json"
            entry.write_text(json.dumps({"url": "https://example.invalid/hook?ingest_key=0", "body": {}}))
            client = Mock()
            client.request.side_effect = OSError("connection failed")
            with self.assertRaises(OSError):
                self.native.drain(config, client=client)
            self.assertTrue(entry.exists())


if __name__ == "__main__":
    unittest.main()
