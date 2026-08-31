"""Real HTTP/fixture acceptance tests; never connects to live memory."""
import json
import os
import sys
import tempfile
import threading
import time
import unittest
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, unquote, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from agent_memory import capture, cli, retrieval, telemetry
from agent_memory.api import Client
from agent_memory.api import REGISTRY_PREFIX, REGISTRY_TITLE
from agent_memory.config import Config, MemoryError
from agent_memory.storage import read_json
from agent_memory.transcript import scan, snapshot


class FakeMemory:
    def __init__(self):
        self.requests, self.streams, self.runs, self.pages = [], {}, {}, {}
        self.outage = False
        self.fail_finish_after_commit = False
        self.finish_entered = None
        self.finish_release = None
        self.unavailable_streams = set()
        self.observations = []
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                self.dispatch()

            def do_POST(self):
                self.dispatch()

            def dispatch(self):
                path = urlsplit(self.path)
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"null")
                owner.requests.append((self.command, path.path, body))
                if self.headers.get("Authorization") != "Bearer offline-test-token":
                    return self.reply(401, {})
                if owner.outage:
                    return self.reply(503, {})
                if path.path == "/workstream/runs":
                    key = (body["workspace"], body["project"], body["repo_fingerprint"],
                           body["worktree_fingerprint"], body.get("workstream", body.get("new_workstream")))
                    if key not in owner.streams:
                        if "workstream" in body:
                            return self.reply(404, {})
                        owner.streams[key] = {"id": "stream-" + str(len(owner.streams)), "events": {}}
                    elif "new_workstream" in body:
                        return self.reply(409, {})
                    stream = owner.streams[key]
                    run_id = "run-" + str(len(owner.runs))
                    owner.runs[run_id] = {"stream": stream, "finished": False}
                    return self.reply(200, {"workstream_id": stream["id"], "run_id": run_id})
                if path.path.endswith("/finish"):
                    if owner.finish_entered:
                        owner.finish_entered.set()
                        owner.finish_release.wait(5)
                    run = owner.runs[path.path.split("/")[-2]]
                    imported = 0
                    if not run["finished"]:
                        for event in body["events"]:
                            if event["event_id"] not in run["stream"]["events"]:
                                run["stream"]["events"][event["event_id"]] = event
                                imported += 1
                        run["finished"] = body["complete"]
                    if owner.fail_finish_after_commit:
                        owner.fail_finish_after_commit = False
                        return self.reply(503, {})
                    return self.reply(200, {"imported_events": imported, "latest_sequence": len(run["stream"]["events"])})
                if path.path == "/admin/write-page":
                    owner.pages[(body["workspace"], body["project"], body["path"])] = body
                    return self.reply(200, {"page_id": "page-1", "path": body["path"]})
                if path.path == "/api/v1/search":
                    scopes = {(scope["workspace"], scope["project"]) for scope in body["scopes"]}
                    return self.reply(200, [{"workspace": ws, "project": proj, "path": name, "snippet": page["body"]}
                                            for (ws, proj, name), page in owner.pages.items()
                                            if (ws, proj) in scopes and body["q"] in page["body"]])
                if path.path.endswith("/events"):
                    stream_id = path.path.split("/")[-2]
                    stream = next((stream for stream in owner.streams.values() if stream["id"] == stream_id), None)
                    if stream is None or stream_id in owner.unavailable_streams:
                        return self.reply(404, {})
                    query = parse_qs(path.query).get("q", [""])[0]
                    limit = int(parse_qs(path.query).get("limit", [100])[0])
                    return self.reply(200, [event for event in stream["events"].values() if query in event["content"]][-limit:])
                if "/pages" in path.path:
                    parts = path.path.split("/")
                    ws, project = unquote(parts[4]), unquote(parts[6])
                    if path.path.endswith("/pages"):
                        return self.reply(200, [{"path": name, "title": page.get("title")} for (w, p, name), page in owner.pages.items() if (w, p) == (ws, project)])
                    name = unquote("/".join(parts[8:]))
                    page = owner.pages.get((ws, project, name))
                    return self.reply(200, {"body_markdown": page["body"]}) if page else self.reply(404, {})
                if path.path.endswith("/observations"):
                    return self.reply(200, owner.observations) if owner.observations else self.reply(404, {})
                if path.path == "/api/v1/projects":
                    return self.reply(200, {"projects": [{"project_name": "app"}]})
                return self.reply(404, {})

            def reply(self, status, body):
                raw = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = "http://127.0.0.1:" + str(self.server.server_address[1])

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()


SESSION = "019fa83b-b2fe-7773-a68f-2d7f53b65211"
FORK = "019fa83b-b2fe-7773-a68f-2d7f53b65212"


def message(text, stamp="2026-09-01T00:00:01Z", role="assistant"):
    return {"type": "response_item", "timestamp": stamp, "payload": {
        "type": "message", "role": role, "content": [{"type": "output_text", "text": text}]}}


class CaptureIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        (self.repo / ".ai-memory.toml").write_text('workspace="work/team"\nproject="app"\n')
        self.native = self.root / "sessions"
        self.archive = self.root / "archive"
        self.native.mkdir()
        self.archive.mkdir()
        self.server = FakeMemory()
        self.registry_key = self.root / "registry-key"
        self.registry_key.write_text("12" * 32)
        self.config = Config({"server_url": self.server.url, "host_id": "test-host",
                              "state_dir": str(self.root / "state"),
                              "allowed_scopes": [{"workspace": "work/team", "project": "app"}],
                              "registry_key_file": str(self.registry_key),
                              "transcript_roots": [str(self.native), str(self.archive)]})
        self.env = patch.dict(os.environ, {"AI_MEMORY_AUTH_TOKEN": "offline-test-token"})
        self.env.start()
        self.path = self.new_file(SESSION)

    def tearDown(self):
        self.env.stop()
        self.server.close()
        self.temp.cleanup()

    def new_file(self, session, suffix="", fork=None):
        path = self.native / ("rollout-" + session + suffix + ".jsonl")
        payload = {"id": session, "cwd": str(self.repo), "timestamp": datetime.now(timezone.utc).isoformat()}
        if fork:
            payload["forked_from_id"] = fork
        self.append({"type": "session_meta", "payload": payload}, path)
        return path

    def append(self, value, path=None):
        with (path or self.path).open("a") as handle:
            handle.write(json.dumps(value) + "\n")

    def hook(self, event="Stop", path=None, session=SESSION):
        return capture.hook(self.config, event, {"session_id": session, "cwd": str(self.repo),
                             "transcript_path": str(path or self.path), "source": "startup"}, spawn=False)

    def events(self):
        return [event for stream in self.server.streams.values() for event in stream["events"].values()]

    def test_future_only_capture_search_and_idempotent_repeated_drain(self):
        self.append(message("old material must not import"))
        first = capture.initialize(self.config)
        self.append(message("future assistant decision", "2026-09-01T00:00:02Z"))
        self.hook()
        result = capture.drain(self.config)
        self.assertEqual(result["status"], "ok")
        self.assertEqual([event["content"] for event in self.events()], ["future assistant decision"])
        self.assertEqual(capture.initialize(self.config)["activated_at"], first["activated_at"])
        self.hook()
        capture.drain(self.config)
        self.assertEqual(len(self.events()), 1)
        found = retrieval.search(self.config, "assistant decision", {"workspace": "work/team", "project": "app"})
        self.assertEqual(found["ledger_events"][0]["content"], "future assistant decision")
        self.assertTrue(all("scopes" in body for method, path, body in self.server.requests if path == "/api/v1/search"))

    def test_fork_start_excludes_copied_history_but_records_new_turn(self):
        self.append(message("parent old history"))
        capture.initialize(self.config)
        fork = self.new_file(FORK, fork=SESSION)
        self.append(message("parent old history"), fork)
        self.hook("SessionStart", fork, FORK)
        self.append(message("fork new work"), fork)
        self.hook("Stop", fork, FORK)
        capture.drain(self.config)
        self.assertEqual([event["content"] for event in self.events()], ["fork new work"])
        self.assertIn("unproven_start_prefix_excluded", read_json(capture.state_path(self.config, FORK))["losses"])

    def test_fresh_start_keeps_user_message_persisted_before_start_hook(self):
        capture.initialize(self.config)
        fresh = self.new_file(FORK)
        self.append(message("first actual user prompt", role="user"), fresh)
        self.hook("SessionStart", fresh, FORK)
        self.append(message("assistant response"), fresh)
        self.hook("Stop", fresh, FORK)
        capture.drain(self.config)
        self.assertEqual([event["content"] for event in self.events()], ["first actual user prompt", "assistant response"])

    def test_forged_registry_scope_is_rejected_before_foreign_ledger_request(self):
        capture.initialize(self.config)
        self.append(message("legitimate work"))
        self.hook()
        capture.drain(self.config)
        key, page = next(iter(self.server.pages.items()))
        forged = json.loads(page["title"][len(REGISTRY_TITLE):])
        forged["workstream_id"] = "foreign-stream"
        self.server.pages[key] = {**page, "title": REGISTRY_TITLE + json.dumps(forged)}
        result = retrieval.search(self.config, "work", {"workspace": "work/team", "project": "app"})
        self.assertEqual(result["ledger_events"], [])
        self.assertTrue(result["partial_errors"])
        self.assertFalse(any("foreign-stream" in path for _, path, _ in self.server.requests))

    def test_unsigned_array_and_unknown_key_descriptors_fail_closed(self):
        for index, value in enumerate([None, [], {"version": 1}, {
                "version": 1, "workspace": "work/team", "project": "app", "registry_key_id": "unknown"}]):
            name = REGISTRY_PREFIX + str(index) + ".md"
            self.server.pages[("work/team", "app", name)] = {"body": "```json\n" + json.dumps(value) + "\n```"}
        result = retrieval.search(self.config, "anything", {"workspace": "work/team", "project": "app"})
        self.assertEqual(result["ledger_events"], [])
        self.assertEqual(len(result["partial_errors"]), 4)
        self.assertFalse(any(path.endswith("/events") for _, path, _ in self.server.requests))

    def test_missing_ledger_still_returns_bounded_hook_observations(self):
        capture.initialize(self.config)
        self.append(message("visible ledger content"))
        self.hook()
        capture.drain(self.config)
        self.server.unavailable_streams = {stream["id"] for stream in self.server.streams.values()}
        self.server.observations = [{"kind": "user_prompt", "content": "bounded original prompt"}]
        result = retrieval.read_session(self.config, SESSION, {"workspace": "work/team", "project": "app"})
        self.assertEqual(result["ledger_events"], [])
        self.assertEqual(result["hook_observations"][0]["content"], "bounded original prompt")
        self.assertEqual(result["partial_errors"][0]["status"], 404)

    def test_doctor_reports_registry_key_health_without_key_content(self):
        capture.initialize(self.config)
        result = cli.doctor(self.config)
        self.assertTrue(result["registry_receipt_key_ready"])
        self.assertEqual(result["status"], "ready")
        self.registry_key.write_text("INVALID_SECRET_MUST_NOT_APPEAR")
        result = cli.doctor(self.config)
        self.assertFalse(result["registry_receipt_key_ready"])
        self.assertEqual(result["status"], "degraded")
        self.assertNotIn("INVALID_SECRET_MUST_NOT_APPEAR", json.dumps(result))

    def test_multiple_rollouts_archive_move_and_resume_deduplicate(self):
        second = self.new_file(SESSION, "_resume")
        capture.initialize(self.config)
        record = {"type": "response_item", "timestamp": "2026-09-01T00:00:01Z", "payload": {
            "type": "function_call_output", "call_id": "call-1", "output": {"status": "done"}}}
        self.append(record)
        self.append(record, second)
        self.hook()
        capture.drain(self.config)
        self.assertEqual(len(self.events()), 1)
        archived = self.archive / self.path.name
        self.path.rename(archived)
        self.path = archived
        self.append(message("resumed work"))
        self.hook("SessionStart")
        self.hook()
        capture.drain(self.config)
        self.assertIn("resumed work", [event["content"] for event in self.events()])
        self.assertEqual(len(self.events()), 2)

    def test_partial_tail_is_retried_not_acknowledged(self):
        capture.initialize(self.config)
        self.hook("SessionStart")
        raw = json.dumps(message("completed tail"))
        with self.path.open("a") as handle:
            handle.write(raw[:20])
        self.hook()
        capture.drain(self.config)
        self.assertTrue(capture.job_path(self.config, SESSION).exists())
        with self.path.open("a") as handle:
            handle.write(raw[20:] + "\n")
        capture.drain(self.config)
        self.assertEqual([event["content"] for event in self.events()], ["completed tail"])
        self.assertFalse(capture.job_path(self.config, SESSION).exists())

    def test_record_started_before_activation_is_never_backfilled(self):
        raw = json.dumps(message("pre-activation partial must stay excluded"))
        with self.path.open("a") as handle:
            handle.write(raw[:30])
        capture.initialize(self.config)
        with self.path.open("a") as handle:
            handle.write(raw[30:] + "\n")
        self.append(message("new after activation"))
        self.hook()
        capture.drain(self.config)
        self.assertEqual([event["content"] for event in self.events()], ["new after activation"])

    def test_offline_queue_and_uncertain_finish_retry_are_lossless(self):
        capture.initialize(self.config)
        self.append(message("retry safely"))
        self.hook()
        self.server.outage = True
        self.assertEqual(capture.drain(self.config)["status"], "pending")
        self.server.outage = False
        self.server.fail_finish_after_commit = True
        self.assertEqual(capture.drain(self.config)["status"], "pending")
        self.assertEqual(len(self.events()), 1)
        self.assertEqual(capture.drain(self.config)["status"], "ok")
        self.assertEqual(len(self.events()), 1)
        self.assertFalse(capture.job_path(self.config, SESSION).exists())

    def test_activation_prefix_rewrite_fails_closed(self):
        self.append(message("old"))
        capture.initialize(self.config)
        self.hook("SessionStart")
        self.path.write_text(self.path.read_text().replace('"old"', '"bad"'))
        self.append(message("new"))
        self.hook()
        result = capture.drain(self.config)
        self.assertEqual(result["status"], "pending")
        self.assertEqual(self.events(), [])

    def test_header_mismatch_and_unknown_scope_cannot_enqueue(self):
        capture.initialize(self.config)
        with self.assertRaises(MemoryError):
            self.hook(session=FORK)
        (self.repo / ".ai-memory.toml").write_text('workspace="another"\nproject="app"\n')
        with self.assertRaises(MemoryError):
            self.hook()
        self.assertEqual(list((self.config.state_dir / "queue").glob("*.json")), [])

    def test_telemetry_has_metadata_not_argument_or_result_content(self):
        scope = {"workspace": "work/team", "project": "app"}
        payload = {"session_id": SESSION, "tool_name": "mcp__serena__find_symbol", "tool_use_id": "one",
                   "tool_input": {"query": "PRIVATE_QUERY"}, "tool_response": {"text": "PRIVATE_RESULT"}}
        telemetry.record(self.config, "PreToolUse", payload, scope)
        telemetry.record(self.config, "PostToolUse", payload, scope)
        records = "".join(path.read_text() for path in (self.config.state_dir / "telemetry").glob("*.jsonl"))
        self.assertNotIn("PRIVATE_QUERY", records)
        self.assertNotIn("PRIVATE_RESULT", records)
        self.assertEqual(telemetry.report(self.config, scope)["layers"]["serena"]["calls"], 1)

    def test_hook_enqueue_does_not_wait_on_remote_drain_and_new_tail_survives(self):
        capture.initialize(self.config)
        self.append(message("first batch"))
        self.hook()
        self.server.finish_entered = threading.Event()
        self.server.finish_release = threading.Event()
        worker = threading.Thread(target=capture.drain, args=(self.config,))
        worker.start()
        self.assertTrue(self.server.finish_entered.wait(2))
        try:
            self.append(message("new tail during upload", "2026-09-01T00:00:02Z"))
            start = time.monotonic()
            self.hook()
            self.assertLess(time.monotonic() - start, 0.5)
        finally:
            self.server.finish_release.set()
            worker.join(5)
        capture.drain(self.config)
        self.assertEqual([event["content"] for event in self.events()], ["first batch", "new tail during upload"])

    def test_multi_batch_import_checkpoints_only_on_final_batch(self):
        capture.initialize(self.config)
        for index in range(520):
            self.append(message("event-" + str(index)))
        self.hook()
        self.assertEqual(capture.drain(self.config)["status"], "ok")
        finishes = [body for method, path, body in self.server.requests if path.endswith("/finish")]
        self.assertEqual([body["complete"] for body in finishes], [False, True])
        self.assertNotIn("source_cursor", finishes[0])
        self.assertIn("source_cursor", finishes[1])
        self.assertEqual(len(self.events()), 520)

    def test_explicit_parent_search_discovers_both_host_registries(self):
        capture.initialize(self.config)
        self.append(message("cross-host project context"))
        self.hook()
        capture.drain(self.config)
        # A second client has no local capture state but discovers the first
        # host's ledger from centrally stored, explicitly scoped descriptors.
        other = Config({**self.config.data, "host_id": "second-host", "state_dir": str(self.root / "other-state")})
        result = retrieval.search(other, "cross-host", {"workspace": "work/team", "project": "app"})
        self.assertEqual(result["ledger_events"][0]["host_id"], "test-host")
        other.scopes.append({"workspace": "work/team", "project": "workspace"})
        other.scopes[0]["parent"] = {"workspace": "work/team", "project": "workspace"}
        self.server.pages[("work/team", "workspace", "decisions/meta.md")] = {"body": "cross-host parent context"}
        result = retrieval.search(other, "cross-host", {"workspace": "work/team", "project": "app"}, include_parent=True)
        self.assertEqual(len(result["scopes"]), 2)
        self.assertEqual(result["pages"][0]["project"], "workspace")

    def test_session_scope_does_not_follow_nested_shell_workdir(self):
        capture.initialize(self.config)
        other = self.root / "other-repo"
        other.mkdir()
        (other / ".ai-memory.toml").write_text('workspace="other"\nproject="other"\n')
        self.append(message("anchored"))
        capture.hook(self.config, "Stop", {"session_id": SESSION, "cwd": str(self.repo),
                     "transcript_path": str(self.path), "tool_input": {"workdir": str(other)}}, spawn=False)
        capture.drain(self.config)
        prepares = [body for method, path, body in self.server.requests if path == "/workstream/runs"]
        self.assertTrue(all(body["workspace"] == "work/team" and body["project"] == "app" for body in prepares))


if __name__ == "__main__":
    unittest.main()
