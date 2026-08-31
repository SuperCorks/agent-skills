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

    def test_native_agent_message_keeps_visible_text_and_source_routing_only(self):
        record = {"type": "response_item", "timestamp": "2026-09-01T00:00:00Z", "payload": {
            "type": "agent_message", "id": "native-message-1", "author": "/root/reviewer", "recipient": "/root",
            "content": [{"type": "input_text", "text": "Visible review result"},
                        {"type": "encrypted_content", "encrypted_content": "PRIVATE_CIPHERTEXT"}],
            "internal_chat_message_metadata_passthrough": {"create_time": 1788220800.25,
                "turn_id": "native-turn-1", "other": "PRIVATE_UNRELATED_METADATA"}}}
        events, losses = normalize_record(record, "s", "r")
        self.assertEqual(losses, [])
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["kind"], "message")
        self.assertEqual(events[0]["role"], "agent")
        expected_header = ('[agent-message {"native_turn_id":"native-turn-1","recipient":"/root",'
                           '"source_agent":"/root/reviewer","source_create_time":1788220800.25}]\n')
        self.assertEqual(events[0]["content"], expected_header + "Visible review result")
        self.assertEqual(events[0]["metadata"]["source_agent"], "/root/reviewer")
        self.assertEqual(events[0]["metadata"]["recipient"], "/root")
        self.assertEqual(events[0]["metadata"]["native_turn_id"], "native-turn-1")
        self.assertEqual(events[0]["metadata"]["source_create_time"], 1788220800.25)
        self.assertNotIn("PRIVATE_", json.dumps(events))

    def test_every_agent_message_chunk_has_bounded_provenance_without_private_fields(self):
        text = "é" * 70000
        record = {"type": "response_item", "timestamp": "2026-09-01T00:00:00Z", "payload": {
            "type": "agent_message", "id": "large-agent-message", "author": "\x01" * 512,
            "recipient": "\x02" * 512, "content": [{"type": "input_text", "text": text},
                {"type": "encrypted_content", "data": "PRIVATE_CIPHERTEXT"}],
            "internal_chat_message_metadata_passthrough": {"turn_id": "\x03" * 512,
                "create_time": 1788220800.25, "unrelated": "PRIVATE_UNRELATED_METADATA"}}}
        events, losses = normalize_record(record, "s", "byte:12")
        self.assertEqual(losses, [])
        self.assertEqual(len(events), 3)
        bodies = []
        for event in events:
            header, body = event["content"].split("\n", 1)
            self.assertTrue(header.startswith("[agent-message {") and header.endswith("}]"))
            provenance = json.loads(header[len("[agent-message "):-1])
            self.assertEqual(provenance["source_agent"], "\x01" * 256 + "…")
            self.assertEqual(provenance["recipient"], "\x02" * 256 + "…")
            self.assertEqual(provenance["native_turn_id"], "\x03" * 256 + "…")
            self.assertEqual(provenance["source_create_time"], 1788220800.25)
            self.assertLessEqual(len(event["content"].encode()), 65536)
            self.assertEqual(event["metadata"]["source_agent"], "\x01" * 512)
            self.assertNotIn("PRIVATE_", json.dumps(event))
            bodies.append(body)
        self.assertEqual("".join(bodies), text)
        self.assertEqual([len(body.encode()) for body in bodies], [60000, 60000, 20000])
        replay = normalize_record(record, "s", "byte:999")[0]
        self.assertEqual([event["event_id"] for event in events], [event["event_id"] for event in replay])

    def test_native_agent_messages_still_exclude_analysis_and_encrypted_only_records(self):
        for payload in (
            {"type": "agent_message", "channel": "analysis", "content": [{"type": "input_text", "text": "PRIVATE"}]},
            {"type": "agent_message", "content": [{"type": "encrypted_content", "encrypted_content": "PRIVATE"}]},
        ):
            self.assertEqual(normalize_record({"type": "response_item", "payload": payload}, "s", "r"),
                             ([], ["private_record_excluded"]))

    def test_recognized_private_only_content_is_intentionally_excluded_not_missing(self):
        for block in ({"type": "image", "data": "PRIVATE_IMAGE"},
                      {"type": "encrypted_content", "data": "PRIVATE_CIPHERTEXT"}):
            for kind, field in (("agent_message", "content"), ("function_call_output", "output")):
                with self.subTest(kind=kind, block_type=block["type"]):
                    record = {"type": "response_item", "payload": {"type": kind, field: [block]}}
                    self.assertEqual(normalize_record(record, "s", "r"), ([], ["private_record_excluded"]))
        missing = {"type": "response_item", "payload": {"type": "agent_message"}}
        self.assertEqual(normalize_record(missing, "s", "r"), ([], ["empty_or_unsupported_visible_content"]))

    def test_agent_message_dedup_is_stable_but_distinguishes_source_and_recipient(self):
        record = {"type": "response_item", "timestamp": "2026-09-01T00:00:00Z", "payload": {
            "type": "agent_message", "author": "/root/a", "recipient": "/root",
            "content": [{"type": "input_text", "text": "Same visible result"}]}}
        original = normalize_record(record, "s", "byte:12")[0][0]["event_id"]
        # Captured before provenance headers were introduced: presentation must
        # not turn an already-imported native record into a new event identity.
        self.assertEqual(original, "desktop:v1:cb3983a2f1d1a0484bc2d8d87755b7c857382ac7cfd5b04d5a473c00c97e80fc")
        self.assertEqual(normalize_record(record, "s", "byte:999")[0][0]["event_id"], original)
        for key, changed in (("author", "/root/b"), ("recipient", "/root/c")):
            distinct = {**record, "payload": {**record["payload"], key: changed}}
            self.assertNotEqual(normalize_record(distinct, "s", "byte:12")[0][0]["event_id"], original)

    def test_explicit_empty_tool_result_is_recorded_not_reported_as_capture_loss(self):
        for output in ("", []):
            record = {"type": "response_item", "payload": {
                "type": "function_call_output", "call_id": "empty-result", "output": output}}
            events, losses = normalize_record(record, "s", "r")
            self.assertEqual(losses, [])
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]["content"], "")
            self.assertEqual(events[0]["kind"], "tool_result")
            self.assertEqual(events[0]["role"], "tool")
            self.assertTrue(events[0]["metadata"]["empty_result"])
        missing = {"type": "response_item", "payload": {"type": "function_call_output", "call_id": "missing-result"}}
        self.assertEqual(normalize_record(missing, "s", "r"), ([], ["empty_or_unsupported_visible_content"]))

    def test_empty_compaction_is_not_a_gap_or_a_reason_to_replay_replacement_history(self):
        record = {"type": "compacted", "payload": {"message": "", "replacement_history": [
            {"type": "message", "role": "user", "content": "PRIVATE_OLD_HISTORY"}]}}
        self.assertEqual(normalize_record(record, "s", "r"), ([], []))


if __name__ == "__main__":
    unittest.main()
