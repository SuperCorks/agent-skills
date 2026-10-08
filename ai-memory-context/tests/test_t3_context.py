"""Profile preservation, auxiliary exclusion, and explicit coverage regression tests."""
import contextlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from test_host_setup import module
from agent_memory import capture, retrieval, telemetry
from agent_memory.config import Config
import context_hook
import native_hooks


class ProfileTests(unittest.TestCase):
    def test_actual_shadow_homes_are_configured_without_sharing_credentials(self):
        installer = module("install_t3_context", "install-t3-context.py")
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory).resolve()
            common, shadow = home / ".claude_t3", home / ".claude_account"
            common.mkdir(); shadow.mkdir()
            (common / "projects").mkdir()
            (shadow / "projects").symlink_to(common / "projects")
            (shadow / ".claude.json").write_text(json.dumps({"account": "keep", "mcpServers": {"unrelated": {"command": "keep"}}}))
            (shadow / "settings.json").write_text(json.dumps({"theme": "dark", "hooks": {"Stop": [{"hooks": [
                {"command": "ai-memory hook --agent claude-code --event stop --auth-token old-secret"},
                {"command": "notify-owner"}]}]}}))
            skills = home / ".agents/skills"
            for name in ("ai-memory-context", "serena-context", "graphify-context"):
                (skills / name).mkdir(parents=True)
            runtime = {"server_url": "https://memory.invalid", "host_id": "test", "allowed_scopes": [{"workspace": "w", "project": "p"}]}
            settings = {"providerInstances": {"claude": {"driver": "claudeAgent", "config": {
                "homePath": "~/.claude_t3", "shadowHomePath": "~/.claude_account"}},
                "codex": {"driver": "codex", "config": {"homePath": "~/.codex", "shadowHomePath": "~/.codex_account"}}}}
            writes, links, profiles = installer.plan(home, settings, runtime, skills, "/python", "/serena", "new-secret")
            account = writes[shadow / ".claude.json"]
            self.assertEqual(account["account"], "keep")
            self.assertEqual(account["mcpServers"]["unrelated"], {"command": "keep"})
            self.assertIn("--context=claude-code", account["mcpServers"]["serena"]["args"])
            self.assertEqual(writes[shadow / "settings.json"]["theme"], "dark")
            commands = [entry["command"] for groups in writes[shadow / "settings.json"]["hooks"].values() for group in groups for entry in group["hooks"]]
            self.assertIn("notify-owner", commands)
            self.assertFalse(any("old-secret" in command or "ai-memory hook" in command for command in commands))
            config = writes[home / ".config/agent-memory/config.json"]
            self.assertIn(str(common / "projects"), config["transcript_roots"])
            self.assertIn(str(home / ".codex_account/sessions"), config["transcript_roots"])
            self.assertEqual(links[shadow / "skills/serena-context"], skills / "serena-context")
            self.assertNotIn(shadow / ".credentials.json", writes)
            self.assertEqual(len(profiles), 2)

    def test_auxiliary_hook_cannot_load_config_consume_handoff_or_enroll(self):
        with patch.dict(os.environ, {"T3_REQUEST_KIND": "metadata"}), \
                patch("agent_memory.config.Config.load") as load, \
                patch.object(context_hook, "native_hook") as native, \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(context_hook.main(), 0)
            load.assert_not_called(); native.assert_not_called()
            self.assertEqual(output.getvalue().strip(), "{}")
            self.assertFalse(capture.hook(None, "SessionStart", {})["queued"])
            self.assertIsNone(native_hooks.enqueue(None, "SessionStart", {}))

    def test_claude_tools_are_classified_without_payload_storage(self):
        for name, args, expected in (
            ("Skill", {"skill": "serena-context"}, ("serena", "skill")),
            ("Read", {"file_path": "/private"}, ("literal", "read")),
            ("Grep", {"pattern": "private"}, ("literal", "search")),
            ("mcp__ai-memory__memory_query", {}, ("ai-memory", "query")),
        ):
            self.assertEqual(telemetry.classify(name, args), expected)


class CoverageTests(unittest.TestCase):
    def test_older_stream_is_reachable_by_continuation_and_session_filter(self):
        scope = {"workspace": "w", "project": "p"}
        config = Config({"server_url": "https://memory.invalid", "host_id": "test", "allowed_scopes": [scope]})
        descriptors = [{"workstream_id": f"stream-{i:03}", "native_session_id": f"session-{i}", "host_id": "host", "updated_at": f"{i:03}"} for i in range(120)]
        class Client:
            def __init__(self, config): pass
            def request(self, method, path, *args, **kwargs):
                return {"events": [{"native_session_id": "session-0", "event_id": "old", "content": "answer"}]} if path == "/workstream/stream-000/events" else {}
        with patch.object(retrieval, "Client", Client), patch.object(retrieval, "list_ledgers", return_value=descriptors):
            first = retrieval.search(config, "answer", scope)
            self.assertEqual(first["status"], "incomplete")
            self.assertEqual(first["ledger_coverage"]["next_offset"], 100)
            self.assertEqual(first["ledger_events"], [])
            older = retrieval.search(config, "answer", scope, ledger_offset=100)
            self.assertEqual(older["ledger_events"][0]["content"], "answer")
            targeted = retrieval.search(config, "answer", scope, session="session-0")
            self.assertEqual(targeted["status"], "complete")
            self.assertEqual(targeted["ledger_coverage"]["searched"], 1)
            foreign = retrieval.search(config, "answer", scope, host="foreign")
            self.assertEqual(foreign["ledger_events"], [])
