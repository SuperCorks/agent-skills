"""Checks for t3_attention.py against a small synthetic environment database."""

from contextlib import closing
from datetime import datetime
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from zoneinfo import ZoneInfo


SCRIPT_DIR = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("t3_attention", SCRIPT_DIR / "t3_attention.py")
t3 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(t3)

ZONE = ZoneInfo("America/Toronto")
WINDOW = (datetime.fromisoformat("2026-11-05T00:00:00-05:00"),
          datetime.fromisoformat("2026-11-06T00:00:00-05:00"))


def make_db(path, with_log=True):
    with closing(sqlite3.connect(path)) as db:
        db.executescript("""
            CREATE TABLE projection_projects (project_id TEXT, title TEXT);
            CREATE TABLE orchestration_v2_projection_threads (thread_id TEXT, project_id TEXT, title TEXT);
            CREATE TABLE orchestration_v2_projection_messages (
              thread_id TEXT, role TEXT, streaming INTEGER, created_at TEXT, payload_json TEXT);
            CREATE TABLE orchestration_v2_projection_plans (thread_id TEXT, kind TEXT, payload_json TEXT);
            CREATE TABLE orchestration_command_receipts (
              aggregate_kind TEXT, aggregate_id TEXT, command_type TEXT, accepted_at TEXT);
        """)
        db.execute("INSERT INTO projection_projects VALUES ('p', 'Client site')")
        db.executemany("INSERT INTO orchestration_v2_projection_threads VALUES (?, 'p', ?)",
                       [("a", "Fix booking"), ("b", "QA portal")])
        user = json.dumps({"createdBy": "user", "text": "go"})
        agent_sent = json.dumps({"createdBy": "agent", "text": "status"})
        db.executemany("INSERT INTO orchestration_v2_projection_messages VALUES (?, 'user', 0, ?, ?)", [
            ("a", "2026-11-05T14:01:00.000Z", user),
            ("a", "2026-11-05T14:02:00.000Z", agent_sent),
        ])
        db.executemany("INSERT INTO orchestration_command_receipts VALUES ('thread', ?, ?, ?)", [
            ("a", "runtime-request.respond", "2026-11-05T14:03:00.000Z"),
            ("a", "thread.visit", "2026-11-05T13:00:00.000Z"),
            ("b", "thread.visit", "2026-11-05T13:10:00.000Z"),
            ("b", "thread.visit", "2026-11-05T13:10:10.000Z"),
            ("a", "thread.visit", "2026-11-05T13:20:00.000Z"),
        ])
        if with_log:
            db.execute("""CREATE TABLE attention_log (entry_id TEXT, revision INTEGER, kind TEXT,
                thread_id TEXT, item_id TEXT, surface TEXT, started_at TEXT, ended_at TEXT,
                details_json TEXT)""")
            listen = lambda by: json.dumps({"itemKind": "message", "fromSeconds": 0, "toSeconds": 60,
                                            "recordingSeconds": 90, "rate": 1, "startedBy": by,
                                            "finished": False})
            db.executemany("INSERT INTO attention_log VALUES (?, 1, ?, ?, NULL, 'desktop', ?, ?, ?)", [
                ("v1", "thread-view", "a", "2026-11-05T13:30:00.000Z", "2026-11-05T14:00:00.000Z",
                 json.dumps({"endedBy": "left"})),
                # Overlaps the view: counted once.
                ("l1", "read-aloud-listen", "a", "2026-11-05T13:50:00.000Z",
                 "2026-11-05T14:10:00.000Z", listen("user")),
                # Autoplay near the user's message counts; one far from any sign of them does not.
                ("l2", "read-aloud-listen", "b", "2026-11-05T14:05:00.000Z",
                 "2026-11-05T14:06:00.000Z", listen("autoplay")),
                ("l3", "read-aloud-listen", "b", "2026-11-05T20:00:00.000Z",
                 "2026-11-05T20:05:00.000Z", listen("autoplay")),
                # A thread with nothing but uncounted autoplay is still listed.
                ("l4", "read-aloud-listen", "c", "2026-11-05T22:00:00.000Z",
                 "2026-11-05T22:05:00.000Z", listen("autoplay")),
            ])
        db.commit()


class T3AttentionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "statev2.sqlite"

    def collect(self):
        with closing(t3.connect(self.path)) as db:
            return t3.collect(db, WINDOW, ZONE)

    def test_attention_log_merges_views_and_counted_listens(self):
        make_db(self.path)
        result = self.collect()
        threads = {t["threadId"]: t for t in result["threads"]}
        a, b = threads["a"], threads["b"]
        self.assertEqual(a["title"], "Fix booking")
        self.assertEqual(a["project"], "Client site")
        self.assertEqual(a["attended"], [["2026-11-05T08:30:00-05:00", "2026-11-05T09:10:00-05:00"]])
        self.assertEqual(a["attendedMinutes"], 40)
        self.assertEqual(a["userMessages"], ["2026-11-05T09:01:00-05:00"])
        self.assertEqual(a["touches"], [{"at": "2026-11-05T09:03:00-05:00", "kind": "approval"}])
        self.assertEqual([l["counted"] for l in b["listens"]], [True, False])
        self.assertEqual(b["attendedMinutes"], 1)
        self.assertEqual(threads["c"]["attendedMinutes"], 0)
        # Thread switches stand in only before the log began.
        self.assertEqual(result["fallbackUntil"], "2026-11-05T08:30:00-05:00")
        self.assertEqual(b["switches"], ["2026-11-05T08:10:00-05:00"])
        self.assertEqual(a["switches"], ["2026-11-05T08:20:00-05:00"])

    def test_without_a_log_only_fallback_evidence_is_reported(self):
        make_db(self.path, with_log=False)
        result = self.collect()
        self.assertIsNone(result["attentionLogBegan"])
        self.assertEqual(result["fallbackUntil"], "2026-11-06T00:00:00-05:00")
        self.assertEqual({t["threadId"]: t["attendedMinutes"] for t in result["threads"]},
                         {"a": 0, "b": 0})


if __name__ == "__main__":
    unittest.main()
