"""Isolated regression checks for deep-link resolution and transcript reading."""

import importlib.util
from contextlib import closing
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest


SCRIPT_DIR = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("t3_threads", SCRIPT_DIR / "t3-threads.py")
t3 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(t3)


class T3ThreadsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name).resolve()
        self.env = dict(os.environ, HOME=str(self.home))
        self.env.pop("T3CODE_HOME", None)
        self.link = "t3cork://app/environment-a/thread-a"
        self.db = self.make_store(self.home / ".t3-fork/userdata")

    def make_store(self, state, environment="environment-a", native_provider="claudeAgent"):
        state.mkdir(parents=True)
        (state / "environment-id").write_text(environment)
        path = state / "state.sqlite"
        db = sqlite3.connect(path)
        db.executescript("""
            CREATE TABLE projection_threads (thread_id TEXT, project_id TEXT, title TEXT, created_at TEXT, updated_at TEXT, archived_at TEXT, deleted_at TEXT);
            CREATE TABLE projection_projects (project_id TEXT, title TEXT, workspace_root TEXT);
            CREATE TABLE projection_thread_messages (message_id TEXT, thread_id TEXT, role TEXT, text TEXT, created_at TEXT, attachments_json TEXT);
            CREATE TABLE projection_thread_sessions (thread_id TEXT, provider_name TEXT, provider_instance_id TEXT, provider_thread_id TEXT, provider_session_id TEXT);
            CREATE TABLE provider_session_runtime (thread_id TEXT, provider_name TEXT, provider_instance_id TEXT, resume_cursor_json TEXT);
            INSERT INTO projection_projects VALUES ('project-a', 'Example', '/workspace/example');
            INSERT INTO projection_threads VALUES ('thread-a', 'project-a', 'Find the missing event', '2026-10-01', '2026-10-03', '2026-10-03', NULL);
            INSERT INTO projection_thread_messages VALUES ('3', 'thread-a', 'assistant', 'Found the mapping.', '2026-10-03', '[]');
            INSERT INTO projection_thread_messages VALUES ('1', 'thread-a', 'user', 'Find the event.', '2026-10-01', '[{"id":"image-a"}]');
            INSERT INTO projection_thread_messages VALUES ('2', 'thread-a', 'reasoning', 'Separate reasoning.', '2026-10-02', '[]');
        """)
        cursor = {"threadId": "thread-a", "resume": "native-claude-a"} if native_provider == "claudeAgent" else {"threadId": "native-codex-a"}
        db.execute("INSERT INTO projection_thread_sessions VALUES (?, ?, ?, NULL, NULL)", ("thread-a", native_provider, "account-a"))
        db.execute("INSERT INTO provider_session_runtime VALUES (?, ?, ?, ?)", ("thread-a", native_provider, "account-a", json.dumps(cursor)))
        db.commit()
        db.close()
        return path

    def run_reader(self, *args, ok=True, shell=True):
        command = ["bash", str(SCRIPT_DIR / "agent-threads.sh")] if shell else ["python3", str(SCRIPT_DIR / "t3-threads.py")]
        result = subprocess.run([*command, *args], env=self.env, cwd=self.home, capture_output=True, text=True)
        if ok:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return result

    def test_link_resolves_claude_session_in_archived_thread(self):
        record = json.loads(self.run_reader("resolve", "--link", self.link).stdout)
        self.assertEqual(record["db"], str(self.db))
        self.assertEqual(record["title"], "Find the missing event")
        self.assertEqual(record["native_session_id"], "native-claude-a")
        self.assertEqual(record["message_counts_by_role"], {"assistant": 1, "reasoning": 1, "user": 1})
        self.assertEqual(record["provider_instance_id"], "account-a")

    def test_visible_messages_are_ordered_and_reasoning_is_optional(self):
        output = self.run_reader("show", "--link", self.link).stdout
        self.assertLess(output.index("user: Find"), output.index("assistant: Found"))
        self.assertNotIn("Separate reasoning", output)
        self.assertIn("[attachments;", output)
        expanded = self.run_reader("show", "--link", self.link, "--include-reasoning").stdout
        self.assertIn("reasoning: Separate reasoning", expanded)
        latest = self.run_reader("show", "--link", self.link, "--limit", "1").stdout
        self.assertIn("assistant: Found", latest)
        self.assertNotIn("user: Find", latest)

    def test_wrong_environment_never_reads_matching_thread_id(self):
        result = self.run_reader("show", "--link", "t3cork://app/wrong-environment/thread-a", "--db", str(self.db), ok=False)
        self.assertIn("not found in environment wrong-environment", result.stderr)
        self.assertNotIn("Find the event", result.stdout)

    def test_custom_dev_store_and_codex_native_session(self):
        path = self.make_store(self.home / "custom/dev", "environment-b", "codex")
        self.env["T3CODE_HOME"] = str(self.home / "custom")
        link = "t3cork-dev://app/environment-b/thread-a"
        record = json.loads(self.run_reader("resolve", "--link", link).stdout)
        self.assertEqual(record["db"], str(path))
        self.assertEqual(record["native_session_id"], "native-codex-a")

    def test_custom_home_and_explicit_thread_without_environment_file(self):
        record = json.loads(self.run_reader("resolve", "--link", self.link, "--t3-home", str(self.home / ".t3-fork")).stdout)
        self.assertEqual(record["thread_id"], "thread-a")
        self.db.with_name("environment-id").unlink()
        self.run_reader("resolve", "--link", self.link, "--db", str(self.db), ok=False)
        record = json.loads(self.run_reader("resolve", "--thread", "thread-a", "--db", str(self.db)).stdout)
        self.assertIsNone(record["environment_id"])
        self.assertIn("assistant: Found", self.run_reader("show", "--thread", "thread-a", "--db", str(self.db)).stdout)

    def test_duplicate_stores_require_selection(self):
        self.make_store(self.home / ".t3/userdata")
        result = self.run_reader("resolve", "--link", self.link, ok=False)
        self.assertIn("multiple databases", result.stderr)
        self.run_reader("resolve", "--link", self.link, "--db", str(self.db))

    def test_inventory_and_source_filtered_subjects(self):
        rows = [json.loads(line) for line in self.run_reader("inventory").stdout.splitlines()]
        self.assertEqual(rows[0]["source"], "t3-code")
        self.assertEqual(rows[0]["deep_link"], self.link)
        subjects = self.run_reader("subjects", "--source", "t3-code", "--limit", "1").stdout
        self.assertIn("Find the missing event", subjects)
        self.assertIn(self.link, subjects)
        self.assertIn("## T3 Code", self.run_reader("subjects", "--limit", "1").stdout)

    def test_missing_and_invalid_links_fail_without_creating_stores(self):
        for link in ("t3cork://app/new?projectId=p", "t3cork://app/environment-a/thread%2Fbad", "https://app/environment-a/thread-a", "t3cork://app/environment-a/x%27%20OR%201=1", "t3cork://app/environment-a/missing"):
            with self.subTest(link=link):
                self.run_reader("resolve", "--link", link, ok=False)
        missing = self.home / "missing.sqlite"
        self.run_reader("resolve", "--link", self.link, "--db", str(missing), ok=False)
        self.assertFalse(missing.exists())
        self.run_reader("show", "--link", self.link, "--limit", "0", ok=False)

    def test_reads_live_wal_and_database_connection_rejects_writes(self):
        writer = sqlite3.connect(self.db)
        self.addCleanup(writer.close)
        writer.execute("PRAGMA journal_mode=WAL")
        writer.execute("INSERT INTO projection_thread_messages VALUES ('4', 'thread-a', 'user', 'Latest WAL message.', '2026-10-04', '[]')")
        writer.commit()
        self.assertTrue(self.db.with_name("state.sqlite-wal").is_file())
        output = self.run_reader("show", "--link", self.link, "--limit", "1").stdout
        self.assertIn("Latest WAL message", output)
        before = self.db.read_bytes()
        reader = t3.open_database(self.db)
        try:
            with self.assertRaises(sqlite3.OperationalError):
                reader.execute("DELETE FROM projection_threads")
        finally:
            reader.close()
        self.assertEqual(self.db.read_bytes(), before)

    def test_existing_jsonl_and_vscode_commands_still_work(self):
        transcript = self.home / "session.jsonl"
        transcript.write_text(json.dumps({"type": "response_item", "payload": {"role": "user", "content": [{"text": "Existing Codex message"}]}}) + "\n")
        self.assertIn("user: Existing Codex message", self.run_reader("show", "--path", str(transcript)).stdout)
        vscode = self.home / "state.vscdb"
        with closing(sqlite3.connect(vscode)) as db:
            db.execute("CREATE TABLE ItemTable (key TEXT, value TEXT)")
            db.execute("INSERT INTO ItemTable VALUES (?, ?)", ("memento/interactive-session", json.dumps({"history": {"copilot": [{"text": "Existing Copilot message"}]}})))
            db.commit()
        self.assertIn("copilot: Existing Copilot message", self.run_reader("show", "--db", str(vscode)).stdout)


if __name__ == "__main__":
    unittest.main()
