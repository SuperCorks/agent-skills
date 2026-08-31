"""Metadata-only CLI classification and safe API acknowledgement regressions."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from agent_memory import capture, telemetry
from agent_memory.config import Config, MemoryError


class TelemetryTests(unittest.TestCase):
    def test_direct_commands_are_classified_by_executable_and_operation(self):
        cases = {
            'graphify query "PRIVATE_QUERY"': ("graphify", "query"),
            '/opt/bin/graphify explain node': ("graphify", "explain"),
            'scripts/agent-context graph query "question"': ("graphify", "query"),
            './scripts/agent-context graph check': ("graphify", "check"),
            '/repo/scripts/agent-context graph refresh': ("graphify", "refresh"),
            'agent-memory search "PRIVATE_QUERY" --repo /repo': ("ai-memory", "search"),
            '/bin/agent-memory read --session ID --repo /repo': ("ai-memory", "read"),
            'agent-memory report --repo /repo': ("ai-memory", "report"),
            'rg "graphify query" /repo': ("literal", "search"),
        }
        for command, expected in cases.items():
            with self.subTest(command=command):
                self.assertEqual(telemetry.classify("exec_command", {"cmd": command}), expected)
                self.assertEqual(telemetry.classify("Bash", {"command": command}), expected)

    def test_quoted_mentions_and_compound_commands_are_not_inferred(self):
        for command in [
            'printf "graphify query secret"',
            'cat /repo/graphify/query.txt',
            'echo "agent-memory search"',
            'sh -c "graphify query question"',
            'graphify query question;echo next',
            'graphify query question&&echo next',
            'graphify query question | cat',
            'graphify query question > output.txt',
            'graphify query "$(echo question)"',
            'graphify query question\necho next',
            'cd /repo && graphify query question',
        ]:
            with self.subTest(command=command):
                self.assertEqual(telemetry.classify("exec_command", {"cmd": command}), ("other", "unclassified"))

    def test_report_separates_graph_checks_refreshes_and_queries_without_raw_commands(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Config({"server_url": "https://memory.example.invalid", "host_id": "offline",
                "state_dir": directory, "allowed_scopes": [{"workspace": "test", "project": "app"}]})
            for index, operation in enumerate(("check", "refresh", "query")):
                payload = {"session_id": "session", "tool_use_id": str(index), "tool_name": "exec_command",
                    "tool_input": {"cmd": "scripts/agent-context graph " + operation + " PRIVATE_QUERY_SENTINEL"},
                    "tool_response": {"output": "PRIVATE_RESULT_SENTINEL", "exit_code": 0}}
                telemetry.record(config, "PreToolUse", payload)
                telemetry.record(config, "PostToolUse", payload)
            report = telemetry.report(config)
            self.assertEqual(report["layers"]["graphify"]["calls"], 3)
            self.assertEqual(report["layers"]["graphify"]["retrieval_calls"], 1)
            self.assertEqual(report["layers"]["graphify"]["operations"], {"check": 1, "refresh": 1, "query": 1})
            stored = "".join(path.read_text() for path in Path(directory).rglob("*.json*"))
            for prohibited in ("PRIVATE_QUERY_SENTINEL", "PRIVATE_RESULT_SENTINEL", "scripts/agent-context", "tool_input", "tool_response"):
                self.assertNotIn(prohibited, stored)

    def test_malformed_prepare_ack_is_safe_and_does_not_assign_a_ledger(self):
        class FakeClient:
            def __init__(self, response):
                self.response = response

            def request(self, *args, **kwargs):
                return self.response

        for response in (None, [], {}, {"run_id": "run"}, {"run_id": "run", "workstream_id": 4}):
            state = {"scope": {"workspace": "test", "project": "app"}, "host_id": "host",
                     "session_id": "session", "anchor_cwd": "/repo"}
            with self.subTest(response=response), self.assertRaises(MemoryError):
                capture.prepare(FakeClient(response), state)
            self.assertNotIn("workstream_id", state)


if __name__ == "__main__":
    unittest.main()
