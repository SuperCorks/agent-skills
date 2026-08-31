"""Offline acceptance tests for the forward-only Desktop memory companion."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from agent_memory.config import Config, MemoryError
from agent_memory.transcript import normalize_record


class ScopeTests(unittest.TestCase):
    def test_unknown_marker_never_falls_back(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / ".ai-memory.toml").write_text('workspace="other"\nproject="other"\n')
            config = Config({"server_url": "http://127.0.0.1:1", "host_id": "test",
                             "allowed_scopes": [{"workspace": "work", "project": "app"}],
                             "state_dir": str(root / "state")})
            with self.assertRaises(MemoryError):
                config.resolve_scope(root)

    def test_child_marker_and_worktree_keep_explicit_identity(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / ".ai-memory.toml").write_text('workspace="work"\nproject="app"\n')
            (root / "src").mkdir()
            config = Config({"server_url": "http://127.0.0.1:1", "host_id": "test",
                             "allowed_scopes": [{"workspace": "work", "project": "app"}],
                             "state_dir": str(root / "state")})
            self.assertEqual(config.resolve_scope(root / "src"), {"workspace": "work", "project": "app"})


class TranscriptTests(unittest.TestCase):
    def test_visible_messages_and_structured_outputs(self):
        records = [
            {"type": "response_item", "timestamp": "2026-09-01T00:00:00Z", "payload": {
                "type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "visible"}]}},
            {"type": "response_item", "payload": {"type": "function_call_output", "call_id": "one",
                "output": [{"type": "text", "text": "done"}]}}
        ]
        events = [event for record in records for event in normalize_record(record, "session", "source")[0]]
        self.assertEqual([event["content"] for event in events], ["visible", "done"])
        self.assertEqual(events[0]["occurred_at"], "2026-09-01T00:00:00Z")

    def test_reasoning_and_injected_instructions_are_not_imported(self):
        for payload in [
            {"type": "reasoning", "summary": [{"text": "private"}]},
            {"type": "message", "role": "assistant", "channel": "analysis", "content": "private"},
            {"type": "message", "role": "developer", "content": "private"},
            {"type": "message", "role": "user", "content": "# AGENTS.md instructions for /repo"},
        ]:
            self.assertEqual(normalize_record({"type": "response_item", "payload": payload}, "s", "r")[0], [])

    def test_large_visible_output_is_chunked_not_silently_truncated(self):
        body = "é" * 70000
        events, losses = normalize_record({"type": "response_item", "payload": {
            "type": "function_call_output", "call_id": "large", "output": body}}, "s", "r")
        self.assertEqual("".join(event["content"] for event in events), body)
        self.assertTrue(all(len(event["content"].encode()) <= 60000 for event in events))
        self.assertEqual(losses, [])

    def test_structured_nested_private_payloads_are_excluded(self):
        events, _ = normalize_record({"type": "response_item", "payload": {
            "type": "function_call_output", "output": {"result": {"content": [
                {"type": "text", "text": "visible"}, {"type": "image", "data": "PRIVATE_IMAGE"},
                {"type": "reasoning", "text": "PRIVATE_REASONING"}]}}}}, "s", "r")
        self.assertNotIn("PRIVATE_", events[0]["content"])
        self.assertIn("visible", events[0]["content"])

    def test_ordinary_structured_data_field_is_preserved(self):
        events, losses = normalize_record({"type": "response_item", "payload": {
            "type": "function_call_output", "output": {"data": {"answer": "visible API result"}, "count": 1}}}, "s", "r")
        self.assertIn('"data": {"answer": "visible API result"}', events[0]["content"])
        self.assertEqual(losses, [])


if __name__ == "__main__":
    unittest.main()
