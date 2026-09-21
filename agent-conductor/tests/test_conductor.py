import contextlib
import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "conductor.py"
SPEC = importlib.util.spec_from_file_location("conductor", SCRIPT_PATH)
assert SPEC and SPEC.loader
conductor = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(conductor)


class ConductorTestCase(unittest.TestCase):
    """Base case: isolated AGENT_CONDUCTOR_HOME and a throwaway project dir."""

    def setUp(self) -> None:
        self.home = Path(tempfile.mkdtemp(prefix="conductor-home-")).resolve()
        self.project = Path(tempfile.mkdtemp(prefix="conductor-proj-")).resolve()
        self.addCleanup(shutil.rmtree, self.home, True)
        self.addCleanup(shutil.rmtree, self.project, True)
        patcher = mock.patch.dict(
            os.environ,
            {"AGENT_CONDUCTOR_HOME": str(self.home), "AGENT_CONDUCTOR_ACTOR": "tester"},
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def cli(self, *argv: str) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = conductor.main(list(argv))
        return code, out.getvalue(), err.getvalue()

    def init_run(self, goal: str = "Ship the thing", **extra: str) -> str:
        argv = ["init", "--cwd", str(self.project), "--goal", goal, "--json"]
        for key, value in extra.items():
            argv += [f"--{key.replace('_', '-')}", str(value)]
        code, out, _err = self.cli(*argv)
        self.assertEqual(code, 0, out)
        return json.loads(out)["run_id"]

    def run_dir(self, run_id: str) -> Path:
        return self.home / "runs" / run_id

    def registry(self, run_id: str) -> list[dict]:
        return json.loads((self.run_dir(run_id) / "tasks.json").read_text())["tasks"]

    def task(self, run_id: str, task_id: str) -> dict:
        return next(t for t in self.registry(run_id) if t["id"] == task_id)


class InitAndLatestTests(ConductorTestCase):
    def test_init_creates_run_scaffolding(self) -> None:
        code, out, _err = self.cli(
            "init",
            "--cwd",
            str(self.project),
            "--goal",
            "Ship the thing",
            "--harness",
            "codex",
            "--max-workers",
            "5",
            "--json",
        )
        self.assertEqual(code, 0)
        payload = json.loads(out)
        directory = Path(payload["run_dir"])

        self.assertTrue(payload["run_id"].endswith(payload["run_id"][-15:]))
        self.assertTrue(directory.is_dir())
        for name in ("run.json", "plan.md", "tasks.json", "events.jsonl", "events.log"):
            self.assertTrue((directory / name).exists(), f"missing {name}")
        self.assertTrue((directory / "tasks").is_dir())
        self.assertEqual(payload["script"], str(SCRIPT_PATH.resolve()))

        run = json.loads((directory / "run.json").read_text())
        self.assertEqual(run["harness"], "codex")
        self.assertEqual(run["max_workers"], 5)
        self.assertEqual(run["status"], "planning")
        self.assertEqual(run["cwd"], str(self.project))
        self.assertIsNone(run["finished"])
        self.assertIsNone(run["summary"])

        plan = (directory / "plan.md").read_text()
        for heading in (
            "# Plan: Ship the thing",
            "## Goal",
            "## Definition of done",
            "## Constraints",
            "## Approach",
            "## Tasks",
            "## Decisions log",
        ):
            self.assertIn(heading, plan)
        self.assertIn("tasks.json", plan)

        events = [json.loads(line) for line in (directory / "events.jsonl").read_text().splitlines()]
        self.assertEqual(events[0]["kind"], "created")
        self.assertEqual(events[0]["by"], "tester")
        self.assertIn("[run] CREATED:", (directory / "events.log").read_text())

    def test_run_id_uses_repo_slug_and_timestamp(self) -> None:
        run_id = self.init_run()
        slug = conductor.slugify(self.project.name)
        self.assertTrue(run_id.startswith(slug + "-"), run_id)
        self.assertRegex(run_id, r"-\d{8}-\d{6}(-\d+)?$")

    def test_latest_returns_most_recent_run_for_cwd(self) -> None:
        first = self.init_run("first")
        second = self.init_run("second")
        self.assertNotEqual(first, second)

        code, out, _err = self.cli("latest", "--cwd", str(self.project))
        self.assertEqual(code, 0)
        self.assertEqual(out.strip(), second)

    def test_latest_errors_when_no_run_exists(self) -> None:
        other = Path(tempfile.mkdtemp(prefix="conductor-other-"))
        self.addCleanup(shutil.rmtree, other, True)
        code, _out, err = self.cli("latest", "--cwd", str(other))
        self.assertEqual(code, 1)
        self.assertIn("no conductor run found", err)

    def test_commands_fall_back_to_latest_run_and_report_on_stderr(self) -> None:
        run_id = self.init_run()
        code, out, err = self.cli("status", "--cwd", str(self.project))
        self.assertEqual(code, 0)
        self.assertIn(f"conductor: using run {run_id}", err)
        self.assertIn(run_id, out)

    def test_unknown_run_is_a_clean_error(self) -> None:
        code, _out, err = self.cli("status", "--run", "nope-20200101-000000")
        self.assertEqual(code, 1)
        self.assertIn("unknown run", err)


class TaskAddTests(ConductorTestCase):
    def test_packet_contains_every_heading_and_the_script_path(self) -> None:
        run_id = self.init_run()
        code, out, _err = self.cli(
            "task",
            "add",
            "--run",
            run_id,
            "--title",
            "Implement the Widget API!",
            "--role",
            "implement",
            "--files",
            "src/widget.py, tests/test_widget.py",
            "--acceptance",
            "unit tests cover the happy path",
            "--acceptance",
            "no new lint warnings",
            "--verify",
            "python3 -m pytest -q",
            "--objective",
            "Add a widget endpoint",
            "--commit-policy",
            "commit",
            "--json",
        )
        self.assertEqual(code, 0)
        payload = json.loads(out)
        task = payload["task"]
        self.assertEqual(task["id"], "01")
        self.assertEqual(task["slug"], "implement-the-widget-api")
        self.assertEqual(task["status"], "pending")
        self.assertEqual(task["attempts"], 0)
        self.assertEqual(task["commit_policy"], "commit")

        packet = Path(task["packet"])
        self.assertTrue(packet.is_file())
        self.assertFalse(Path(task["report"]).exists(), "task add must not create the report")

        body = packet.read_text()
        for heading in (
            "# Task 01: Implement the Widget API!",
            "## Objective",
            "## Scope",
            "## Acceptance criteria",
            "## Constraints",
            "## Verification",
            "## Protocol",
            "## Report",
            "## Summary",
            "## Files changed",
            "## Commands run and results",
            "## Deviations from the packet",
            "## Open questions and follow-ups",
        ):
            self.assertIn(heading, body, f"missing heading {heading}")

        self.assertIn(str(SCRIPT_PATH.resolve()), body)
        self.assertIn(f"Run id: {run_id}", body)
        self.assertIn("Depends on: none", body)
        self.assertIn("Commit policy: commit ", body)
        self.assertIn(str(self.run_dir(run_id) / "plan.md"), body)
        self.assertIn("Working directory: " + str(self.project), body)
        self.assertIn("- [ ] unit tests cover the happy path", body)
        self.assertIn("- [ ] no new lint warnings", body)
        self.assertIn("- python3 -m pytest -q", body)
        self.assertIn("Files or areas you own: src/widget.py, tests/test_widget.py", body)
        self.assertIn("Add a widget endpoint", body)
        self.assertIn("--kind started", body)
        self.assertIn(str(Path(task["report"])), body)

    def test_placeholders_when_optional_fields_are_missing(self) -> None:
        run_id = self.init_run()
        code, out, _err = self.cli(
            "task", "add", "--run", run_id, "--title", "Explore", "--role", "explore", "--json"
        )
        self.assertEqual(code, 0)
        body = Path(json.loads(out)["task"]["packet"]).read_text()
        self.assertIn("- [ ] (master: fill in)", body)
        self.assertIn("Files or areas you own: (master: fill in)", body)
        self.assertIn("- (master: fill in the project's lint/test/build commands)", body)

    def test_ids_increment_and_depends_on_is_validated(self) -> None:
        run_id = self.init_run()
        self.cli("task", "add", "--run", run_id, "--title", "One", "--role", "implement")
        self.cli(
            "task", "add", "--run", run_id, "--title", "Two", "--role", "review", "--depends-on", "01"
        )
        ids = [t["id"] for t in self.registry(run_id)]
        self.assertEqual(ids, ["01", "02"])
        self.assertEqual(self.task(run_id, "02")["depends_on"], ["01"])

        code, _out, err = self.cli(
            "task", "add", "--run", run_id, "--title", "Three", "--role", "review", "--depends-on", "09"
        )
        self.assertEqual(code, 1)
        self.assertIn("unknown task '09'", err)

    def test_objective_file_is_read(self) -> None:
        run_id = self.init_run()
        objective = self.project / "objective.txt"
        objective.write_text("Objective loaded from a file\n")
        code, out, _err = self.cli(
            "task",
            "add",
            "--run",
            run_id,
            "--title",
            "From file",
            "--role",
            "implement",
            "--objective-file",
            str(objective),
            "--json",
        )
        self.assertEqual(code, 0)
        self.assertIn("Objective loaded from a file", Path(json.loads(out)["task"]["packet"]).read_text())

    def test_task_set_updates_fields_and_logs_changes(self) -> None:
        run_id = self.init_run()
        self.cli("task", "add", "--run", run_id, "--title", "One", "--role", "implement")
        code, _out, _err = self.cli(
            "task", "set", "--run", run_id, "--task", "01", "--status", "assigned", "--agent", "worker-a"
        )
        self.assertEqual(code, 0)
        task = self.task(run_id, "01")
        self.assertEqual(task["status"], "assigned")
        self.assertEqual(task["agent"], "worker-a")
        log = (self.run_dir(run_id) / "events.log").read_text()
        self.assertIn("TASK_UPDATED: status pending -> assigned; agent none -> worker-a", log)

        code, _out, err = self.cli(
            "task", "set", "--run", run_id, "--task", "01", "--status", "bogus"
        )
        self.assertEqual(code, 1)
        self.assertIn("invalid status", err)

    def test_task_show_prints_packet(self) -> None:
        run_id = self.init_run()
        self.cli("task", "add", "--run", run_id, "--title", "One", "--role", "implement")
        code, out, _err = self.cli("task", "show", "--run", run_id, "--task", "01")
        self.assertEqual(code, 0)
        self.assertIn("packet: ", out)
        self.assertIn("report: ", out)
        self.assertIn("# Task 01: One", out)


class EventTests(ConductorTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.run_id = self.init_run()
        self.cli("task", "add", "--run", self.run_id, "--title", "Build it", "--role", "implement")

    def test_started_sets_running_and_increments_attempts(self) -> None:
        code, _out, _err = self.cli(
            "event", "--run", self.run_id, "--task", "01", "--kind", "started", "--message", "kick off"
        )
        self.assertEqual(code, 0)
        task = self.task(self.run_id, "01")
        self.assertEqual(task["status"], "running")
        self.assertEqual(task["attempts"], 1)
        self.assertIsNotNone(task["started"])
        self.assertEqual(task["last_event"], "started: kick off")

    def test_progress_note_and_heartbeat_do_not_change_status(self) -> None:
        self.cli("event", "--run", self.run_id, "--task", "01", "--kind", "started", "--message", "go")
        for kind in ("progress", "note", "heartbeat"):
            self.cli(
                "event", "--run", self.run_id, "--task", "01", "--kind", kind, "--message", f"{kind} ping"
            )
            task = self.task(self.run_id, "01")
            self.assertEqual(task["status"], "running")
            self.assertEqual(task["attempts"], 1)
            self.assertEqual(task["last_event"], f"{kind}: {kind} ping")

    def test_terminal_kinds_set_status_and_finished(self) -> None:
        self.cli("event", "--run", self.run_id, "--task", "01", "--kind", "started", "--message", "go")
        self.cli("event", "--run", self.run_id, "--task", "01", "--kind", "done", "--message", "shipped")
        task = self.task(self.run_id, "01")
        self.assertEqual(task["status"], "done")
        self.assertIsNotNone(task["finished"])

        self.cli(
            "event", "--run", self.run_id, "--task", "01", "--kind", "rejected", "--message", "redo it"
        )
        self.assertEqual(self.task(self.run_id, "01")["status"], "rejected")

        self.cli("event", "--run", self.run_id, "--task", "01", "--kind", "started", "--message", "retry")
        task = self.task(self.run_id, "01")
        self.assertEqual(task["status"], "running")
        self.assertEqual(task["attempts"], 2, "retry after rejection must increment attempts")

        self.cli("event", "--run", self.run_id, "--task", "01", "--kind", "failed", "--message", "gave up")
        task = self.task(self.run_id, "01")
        self.assertEqual(task["status"], "failed")
        self.assertIsNotNone(task["finished"])

        self.cli("event", "--run", self.run_id, "--task", "01", "--kind", "blocked", "--message", "need x")
        self.assertEqual(self.task(self.run_id, "01")["status"], "blocked")

        self.cli("event", "--run", self.run_id, "--task", "01", "--kind", "accepted", "--message", "ok")
        self.assertEqual(self.task(self.run_id, "01")["status"], "accepted")

    def test_run_level_event_and_log_mirror(self) -> None:
        code, _out, _err = self.cli(
            "event", "--run", self.run_id, "--kind", "note", "--message", "master\nnote with newline"
        )
        self.assertEqual(code, 0)
        log_lines = (self.run_dir(self.run_id) / "events.log").read_text().splitlines()
        self.assertTrue(log_lines[-1].endswith("[run] NOTE: master note with newline"), log_lines[-1])
        events = [json.loads(line) for line in (self.run_dir(self.run_id) / "events.jsonl").read_text().splitlines()]
        self.assertIsNone(events[-1]["task"])
        self.assertEqual(events[-1]["kind"], "note")
        self.assertEqual(events[-1]["by"], "tester")

    def test_by_defaults_to_unknown_without_env(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("AGENT_CONDUCTOR_ACTOR")
            self.cli("event", "--run", self.run_id, "--kind", "note", "--message", "anon")
        events = [json.loads(line) for line in (self.run_dir(self.run_id) / "events.jsonl").read_text().splitlines()]
        self.assertEqual(events[-1]["by"], "unknown")

    def test_unknown_task_is_a_clean_error(self) -> None:
        code, _out, err = self.cli(
            "event", "--run", self.run_id, "--task", "99", "--kind", "note", "--message", "x"
        )
        self.assertEqual(code, 1)
        self.assertIn("unknown task '99'", err)


class StatusTests(ConductorTestCase):
    def test_ready_to_dispatch_respects_depends_on(self) -> None:
        run_id = self.init_run()
        self.cli("task", "add", "--run", run_id, "--title", "Base", "--role", "implement")
        self.cli(
            "task", "add", "--run", run_id, "--title", "Follow up", "--role", "review", "--depends-on", "01"
        )

        code, out, _err = self.cli("status", "--run", run_id)
        self.assertEqual(code, 0)
        self.assertIn("Ready to dispatch: 01", out)
        self.assertIn("Running: 0/2", out)

        self.cli("event", "--run", run_id, "--task", "01", "--kind", "started", "--message", "go")
        code, out, _err = self.cli("status", "--run", run_id)
        self.assertIn("Ready to dispatch: none", out)
        self.assertIn("Running: 1/2", out)

        self.cli("event", "--run", run_id, "--task", "01", "--kind", "done", "--message", "done here")
        code, out, _err = self.cli("status", "--run", run_id)
        self.assertIn("Ready to dispatch: 02", out)
        self.assertIn("Awaiting review: 01", out)

        self.cli("event", "--run", run_id, "--task", "02", "--kind", "blocked", "--message", "need a decision")
        code, out, _err = self.cli("status", "--run", run_id)
        self.assertIn("Open blockers:", out)
        self.assertIn("02: blocked: need a decision", out)

    def test_status_is_compact(self) -> None:
        run_id = self.init_run("A goal that is quite long " * 10)
        for index in range(4):
            self.cli("task", "add", "--run", run_id, "--title", f"Task {index}", "--role", "implement")
        _code, out, _err = self.cli("status", "--run", run_id)
        self.assertLess(len(out.splitlines()), 40)
        goal_line = next(line for line in out.splitlines() if line.startswith("goal: "))
        self.assertLessEqual(len(goal_line), len("goal: ") + 100)

    def test_status_json_has_structured_data(self) -> None:
        run_id = self.init_run()
        self.cli("task", "add", "--run", run_id, "--title", "Base", "--role", "implement")
        _code, out, _err = self.cli("status", "--run", run_id, "--json")
        data = json.loads(out)
        self.assertEqual(data["run"]["id"], run_id)
        self.assertEqual(data["ready_to_dispatch"], ["01"])
        self.assertEqual(data["counts"], {"pending": 1})
        self.assertEqual(data["max_workers"], 2)


class WatchTests(ConductorTestCase):
    def watch(self, *argv: str, timeout: int = 30) -> subprocess.CompletedProcess:
        env = dict(os.environ, AGENT_CONDUCTOR_HOME=str(self.home))
        return subprocess.run(
            [sys.executable, str(SCRIPT_PATH), "watch", *argv],
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
        )

    def test_from_start_replays_and_until_idle_exits(self) -> None:
        run_id = self.init_run()
        self.cli("task", "add", "--run", run_id, "--title", "Build", "--role", "implement")
        self.cli("task", "add", "--run", run_id, "--title", "Docs", "--role", "implement")
        self.cli("event", "--run", run_id, "--task", "01", "--kind", "started", "--message", "starting")
        self.cli("event", "--run", run_id, "--task", "01", "--kind", "done", "--message", "all green")
        self.cli("event", "--run", run_id, "--task", "01", "--kind", "accepted", "--message", "verified")
        self.cli("event", "--run", run_id, "--task", "02", "--kind", "started", "--message", "starting")
        self.cli("event", "--run", run_id, "--task", "02", "--kind", "failed", "--message", "no access")

        result = self.watch("--run", run_id, "--from-start", "--poll-seconds", "0.1", "--until", "idle")
        self.assertEqual(result.returncode, 0, result.stderr)
        lines = [line for line in result.stdout.splitlines() if line.strip()]
        self.assertEqual(len(lines), 2, result.stdout)
        self.assertIn("[02 implement] FAILED: no access", lines[0])
        self.assertTrue(lines[1].startswith("IDLE:"), lines[1])
        for hidden in ("STARTED", "TASK_ADDED", "DONE", "ACCEPTED"):
            self.assertNotIn(hidden, result.stdout)

    def test_idle_counts_review_and_correction_as_in_flight(self) -> None:
        for status in ("assigned", "running", "done", "rejected"):
            self.assertFalse(conductor.tasks_idle([{"status": status}]), status)
        for status in ("pending", "blocked", "failed", "accepted"):
            self.assertTrue(conductor.tasks_idle([{"status": status}]), status)

    def test_all_replays_every_kind_and_reports_finished_run(self) -> None:
        run_id = self.init_run()
        self.cli("task", "add", "--run", run_id, "--title", "Build", "--role", "implement")
        self.cli("finish", "--run", run_id, "--status", "done", "--summary", "wrapped up")

        result = self.watch(
            "--run", run_id, "--from-start", "--all", "--poll-seconds", "0.1", "--until", "never"
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("CREATED:", result.stdout)
        self.assertIn("TASK_ADDED:", result.stdout)
        self.assertEqual(result.stdout.strip().splitlines()[-1], "RUN done")

    def test_diagnostics_go_to_stderr_only(self) -> None:
        run_id = self.init_run()
        self.cli("finish", "--run", run_id, "--status", "aborted")
        result = self.watch("--poll-seconds", "0.1", "--cwd", str(self.project))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("conductor: using run", result.stderr)
        self.assertIn("watching", result.stderr)
        self.assertEqual(result.stdout.strip(), "RUN aborted")


REPORT_TEMPLATE = """## Summary
{summary}

## Files changed
- src/widget.py

## Commands run and results
- pytest -q: pass

## Acceptance criteria
- [{tick}] unit tests cover the happy path

## Deviations from the packet
None.

## Open questions and follow-ups
None.
"""


class CheckTests(ConductorTestCase):
    def prepare(self, *, tick: bool = True, accept: bool = True) -> str:
        run_id = self.init_run()
        self.cli(
            "task",
            "add",
            "--run",
            run_id,
            "--title",
            "Build",
            "--role",
            "implement",
            "--acceptance",
            "unit tests cover the happy path",
        )
        self.cli("event", "--run", run_id, "--task", "01", "--kind", "started", "--message", "go")
        report = Path(self.task(run_id, "01")["report"])
        report.write_text(REPORT_TEMPLATE.format(summary="Did it", tick="x" if tick else " "))
        self.cli("event", "--run", run_id, "--task", "01", "--kind", "done", "--message", "done")
        if accept:
            self.cli("event", "--run", run_id, "--task", "01", "--kind", "accepted", "--message", "lgtm")
        return run_id

    def test_check_passes_for_accepted_task_with_ticked_report(self) -> None:
        run_id = self.prepare()
        code, out, _err = self.cli("check", "--run", run_id)
        self.assertEqual(code, 0, out)
        self.assertEqual(out.strip().splitlines()[-1], "CHECK PASS")
        self.assertNotIn("FAIL", out)

    def test_check_fails_on_unticked_acceptance_criteria(self) -> None:
        run_id = self.prepare(tick=False)
        code, out, _err = self.cli("check", "--run", run_id)
        self.assertEqual(code, 1)
        self.assertIn("unticked acceptance criteria", out)
        self.assertIn("unit tests cover the happy path", out)
        self.assertEqual(out.strip().splitlines()[-1], "CHECK FAIL")

    def test_check_fails_on_missing_report(self) -> None:
        run_id = self.prepare()
        Path(self.task(run_id, "01")["report"]).unlink()
        code, out, _err = self.cli("check", "--run", run_id)
        self.assertEqual(code, 1)
        self.assertIn("report is missing", out)

    def test_check_fails_when_report_lacks_acceptance_section(self) -> None:
        run_id = self.prepare()
        Path(self.task(run_id, "01")["report"]).write_text("## Summary\nDid it\n")
        code, out, _err = self.cli("check", "--run", run_id)
        self.assertEqual(code, 1)
        self.assertIn("no '## Acceptance criteria' section", out)

    def test_check_fails_on_unfinished_and_blocked_tasks(self) -> None:
        run_id = self.prepare()
        self.cli("task", "add", "--run", run_id, "--title", "Pending", "--role", "review")
        self.cli("task", "add", "--run", run_id, "--title", "Stuck", "--role", "implement")
        self.cli("event", "--run", run_id, "--task", "03", "--kind", "blocked", "--message", "need input")
        code, out, _err = self.cli("check", "--run", run_id)
        self.assertEqual(code, 1)
        self.assertIn("task 02 is pending (not finished)", out)
        self.assertIn("task 03 is blocked", out)

    def test_check_warns_about_leftover_worktrees(self) -> None:
        run_id = self.prepare()
        leftover = self.project / "leftover-worktree"
        leftover.mkdir()
        self.cli("task", "set", "--run", run_id, "--task", "01", "--worktree", str(leftover))
        code, out, _err = self.cli("check", "--run", run_id)
        self.assertEqual(code, 0, out)
        self.assertIn("WARN task 01 worktree not cleaned up", out)
        self.assertEqual(out.strip().splitlines()[-1], "CHECK PASS")

    def test_check_json_mode(self) -> None:
        run_id = self.prepare(tick=False)
        code, out, _err = self.cli("check", "--run", run_id, "--json")
        self.assertEqual(code, 1)
        payload = json.loads(out)
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["result"], "CHECK FAIL")
        self.assertTrue(payload["failures"])


class FinishTests(ConductorTestCase):
    def test_finish_sets_status_summary_and_event(self) -> None:
        run_id = self.init_run()
        code, out, _err = self.cli(
            "finish", "--run", run_id, "--status", "done", "--summary", "All tasks accepted"
        )
        self.assertEqual(code, 0, out)
        run = json.loads((self.run_dir(run_id) / "run.json").read_text())
        self.assertEqual(run["status"], "done")
        self.assertEqual(run["summary"], "All tasks accepted")
        self.assertIsNotNone(run["finished"])
        self.assertIn("FINISHED: run done: All tasks accepted", (self.run_dir(run_id) / "events.log").read_text())

    def test_finish_aborted_without_summary(self) -> None:
        run_id = self.init_run()
        self.assertEqual(self.cli("finish", "--run", run_id, "--status", "aborted")[0], 0)
        run = json.loads((self.run_dir(run_id) / "run.json").read_text())
        self.assertEqual(run["status"], "aborted")
        self.assertIsNone(run["summary"])


@unittest.skipUnless(shutil.which("git"), "git is not available")
class WorktreeTests(ConductorTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.repo = Path(tempfile.mkdtemp(prefix="conductor-repo-")).resolve()
        self.addCleanup(shutil.rmtree, self.repo, True)
        self.git("init")
        self.git("config", "user.email", "test@example.com")
        self.git("config", "user.name", "Conductor Test")
        (self.repo / "README.md").write_text("hello\n")
        self.git("add", "README.md")
        self.git("commit", "-m", "initial")

    def git(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["git", *args], cwd=str(self.repo), capture_output=True, text=True, check=True
        )

    def test_worktree_add_list_and_remove(self) -> None:
        code, out, _err = self.cli(
            "init", "--cwd", str(self.repo), "--goal", "Worktree run", "--json"
        )
        self.assertEqual(code, 0)
        run_id = json.loads(out)["run_id"]
        self.cli("task", "add", "--run", run_id, "--title", "Build it", "--role", "implement")

        code, out, _err = self.cli("worktree", "add", "--run", run_id, "--task", "01", "--json")
        self.assertEqual(code, 0, out)
        payload = json.loads(out)
        path = Path(payload["worktree"])
        branch = payload["branch"]
        self.assertEqual(branch, f"agent-conductor/{run_id}/01-build-it")
        self.assertEqual(path, self.home / "worktrees" / run_id / "01-build-it")
        self.assertTrue((path / "README.md").is_file())
        self.assertEqual(self.task(run_id, "01")["worktree"], str(path))

        _code, out, _err = self.cli("worktree", "list", "--run", run_id, "--json")
        entries = json.loads(out)["worktrees"]
        self.assertEqual(entries, [{"task": "01", "worktree": str(path), "exists": True}])

        branches = self.git("branch", "--list", branch).stdout
        self.assertIn(branch, branches)

        code, out, _err = self.cli(
            "worktree", "remove", "--run", run_id, "--task", "01", "--delete-branch"
        )
        self.assertEqual(code, 0, out)
        self.assertFalse(path.exists())
        self.assertIsNone(self.task(run_id, "01")["worktree"])
        self.assertEqual(self.git("branch", "--list", branch).stdout.strip(), "")
        self.assertIn("WORKTREE_REMOVED", (self.run_dir(run_id) / "events.log").read_text())

    def test_worktree_remove_without_worktree_errors(self) -> None:
        code, out, _err = self.cli("init", "--cwd", str(self.repo), "--goal", "g", "--json")
        run_id = json.loads(out)["run_id"]
        self.cli("task", "add", "--run", run_id, "--title", "No tree", "--role", "implement")
        code, _out, err = self.cli("worktree", "remove", "--run", run_id, "--task", "01")
        self.assertEqual(code, 1)
        self.assertIn("no recorded worktree", err)

    def test_worktree_add_surfaces_git_errors(self) -> None:
        code, out, _err = self.cli("init", "--cwd", str(self.repo), "--goal", "g", "--json")
        run_id = json.loads(out)["run_id"]
        self.cli("task", "add", "--run", run_id, "--title", "Bad base", "--role", "implement")
        code, _out, err = self.cli(
            "worktree", "add", "--run", run_id, "--task", "01", "--base", "no-such-ref"
        )
        self.assertEqual(code, 1)
        self.assertIn("git command failed", err)


class HelperTests(unittest.TestCase):
    def test_slugify_limits_length_and_charset(self) -> None:
        self.assertEqual(conductor.slugify("Implement the Widget API!"), "implement-the-widget-api")
        self.assertEqual(conductor.slugify(""), "task")
        self.assertLessEqual(len(conductor.slugify("x" * 80)), 40)
        self.assertFalse(conductor.slugify("Hello -- World").endswith("-"))

    def test_collapse_removes_newlines(self) -> None:
        self.assertEqual(conductor.collapse("a\nb\n  c"), "a b c")



class PacketHeaderSyncTests(WorktreeTests):
    def test_worktree_add_and_remove_rewrite_packet_working_directory(self) -> None:
        code, out, _err = self.cli(
            "init", "--cwd", str(self.repo), "--goal", "Sync run", "--json"
        )
        self.assertEqual(code, 0)
        run_id = json.loads(out)["run_id"]
        self.cli("task", "add", "--run", run_id, "--title", "Build it", "--role", "implement")
        packet = Path(self.task(run_id, "01")["packet"])
        self.assertIn(f"Working directory: {self.repo}", packet.read_text())

        code, out, _err = self.cli("worktree", "add", "--run", run_id, "--task", "01", "--json")
        self.assertEqual(code, 0, out)
        worktree = json.loads(out)["worktree"]
        self.assertIn(f"Working directory: {worktree}", packet.read_text())
        self.assertNotIn(f"Working directory: {self.repo}\n", packet.read_text())

        code, _out, _err = self.cli(
            "worktree", "remove", "--run", run_id, "--task", "01", "--delete-branch"
        )
        self.assertEqual(code, 0)
        self.assertIn(f"Working directory: {self.repo}", packet.read_text())

    def test_task_set_commit_policy_rewrites_packet(self) -> None:
        code, out, _err = self.cli(
            "init", "--cwd", str(self.repo), "--goal", "Policy run", "--json"
        )
        self.assertEqual(code, 0)
        run_id = json.loads(out)["run_id"]
        self.cli("task", "add", "--run", run_id, "--title", "Build it", "--role", "implement")
        packet = Path(self.task(run_id, "01")["packet"])
        code, _out, _err = self.cli(
            "task", "set", "--run", run_id, "--task", "01", "--commit-policy", "commit"
        )
        self.assertEqual(code, 0)
        text = packet.read_text()
        self.assertIn("Commit policy: commit (none = do not commit", text)
        self.assertNotIn("Commit policy: none", text)


class RunStatusTests(ConductorTestCase):
    def test_first_started_event_moves_run_to_running(self) -> None:
        run_id = self.init_run()
        self.cli("task", "add", "--run", run_id, "--title", "Build it", "--role", "implement")
        run_json = self.run_dir(run_id) / "run.json"
        self.assertEqual(json.loads(run_json.read_text())["status"], "planning")
        code, _out, _err = self.cli(
            "event", "--run", run_id, "--task", "01", "--kind", "started", "--message", "go"
        )
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(run_json.read_text())["status"], "running")
        self.cli("event", "--run", run_id, "--task", "01", "--kind", "done", "--message", "ok")
        self.cli("finish", "--run", run_id, "--status", "done")
        self.cli("event", "--run", run_id, "--task", "01", "--kind", "started", "--message", "again")
        self.assertEqual(json.loads(run_json.read_text())["status"], "done")


class AmendmentAndPlanLogTests(ConductorTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.run_id = self.init_run()
        self.cli("task", "add", "--run", self.run_id, "--title", "One", "--role", "implement",
                 "--acceptance", "first criterion")
        self.cli("task", "add", "--run", self.run_id, "--title", "Two", "--role", "implement")

    def test_task_set_depends_on_and_reviewer(self) -> None:
        code, _out, err = self.cli(
            "task", "set", "--run", self.run_id, "--task", "02", "--depends-on", "01",
            "--reviewer", "rev-1",
        )
        self.assertEqual(code, 0, err)
        task = self.task(self.run_id, "02")
        self.assertEqual(task["depends_on"], ["01"])
        self.assertEqual(task["reviewer"], "rev-1")
        self.assertIn("Depends on: 01", Path(task["packet"]).read_text())

        code, _out, _err = self.cli("task", "set", "--run", self.run_id, "--task", "02", "--depends-on", "none")
        self.assertEqual(code, 0)
        self.assertEqual(self.task(self.run_id, "02")["depends_on"], [])
        self.assertIn("Depends on: none", Path(self.task(self.run_id, "02")["packet"]).read_text())

        code, _out, err = self.cli("task", "set", "--run", self.run_id, "--task", "02", "--depends-on", "02")
        self.assertEqual(code, 1)
        self.assertIn("cannot depend on itself", err)
        code, _out, err = self.cli("task", "set", "--run", self.run_id, "--task", "02", "--depends-on", "07")
        self.assertEqual(code, 1)
        self.assertIn("unknown task '07'", err)

    def test_reviewer_does_not_overwrite_agent_and_shows_in_status(self) -> None:
        self.cli("task", "set", "--run", self.run_id, "--task", "01", "--agent", "impl-1")
        self.cli("task", "set", "--run", self.run_id, "--task", "01", "--reviewer", "rev-1")
        task = self.task(self.run_id, "01")
        self.assertEqual((task["agent"], task["reviewer"]), ("impl-1", "rev-1"))
        _code, out, _err = self.cli("status", "--run", self.run_id)
        self.assertIn("REVIEWER", out)
        self.assertIn("rev-1", out)

    def test_task_amend_adds_binding_section_and_criteria(self) -> None:
        code, _out, err = self.cli(
            "task", "amend", "--run", self.run_id, "--task", "01",
            "--text", "Also remove the settings toggle.", "--acceptance", "toggle is gone",
        )
        self.assertEqual(code, 0, err)
        body = Path(self.task(self.run_id, "01")["packet"]).read_text()
        self.assertIn("## Master amendment (", body)
        self.assertIn("Also remove the settings toggle.", body)
        self.assertLess(body.index("## Master amendment"), body.index("## Verification"))
        criteria = body[body.index("## Acceptance criteria"):body.index("## Constraints")]
        self.assertIn("- [ ] first criterion", criteria)
        self.assertIn("- [ ] toggle is gone (added ", criteria)
        self.assertIn("AMENDED:", (self.run_dir(self.run_id) / "events.log").read_text())

        code, _out, err = self.cli("task", "amend", "--run", self.run_id, "--task", "01")
        self.assertEqual(code, 1)
        self.assertIn("nothing to amend", err)

    def test_plan_log_appends_to_decisions_log(self) -> None:
        code, _out, err = self.cli("plan", "log", "--run", self.run_id, "--message", "Serialize 01 and 02")
        self.assertEqual(code, 0, err)
        plan = (self.run_dir(self.run_id) / "plan.md").read_text()
        section = plan[plan.index("## Decisions log"):]
        self.assertIn("run created", section)
        self.assertIn("Serialize 01 and 02", section)
        self.assertLess(section.index("run created"), section.index("Serialize 01 and 02"))
        self.assertIn("DECISION: Serialize 01 and 02", (self.run_dir(self.run_id) / "events.log").read_text())


class AutonomyTests(ConductorTestCase):
    def test_plan_defaults_to_high_autonomy_and_packet_points_at_it(self) -> None:
        run_id = self.init_run()
        plan = (self.run_dir(run_id) / "plan.md").read_text()
        self.assertIn("## Autonomy", plan)
        self.assertIn("High (default)", plan)
        _code, out, _err = self.cli(
            "task", "add", "--run", run_id, "--title", "One", "--role", "implement", "--json"
        )
        body = Path(json.loads(out)["task"]["packet"]).read_text()
        self.assertIn("Constraints, and Autonomy first", body)
        self.assertIn("Follow the plan's Autonomy section", body)

    def test_autonomy_can_be_set_at_init(self) -> None:
        run_id = self.init_run(autonomy="Ask before any external write.")
        plan = (self.run_dir(run_id) / "plan.md").read_text()
        self.assertIn("Ask before any external write.", plan)
        self.assertNotIn("High (default)", plan)


class CheckinTests(ConductorTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.run_id = self.init_run()
        self.cli("task", "add", "--run", self.run_id, "--title", "One", "--role", "implement")

    def checkin(self, *extra: str) -> dict:
        code, out, err = self.cli("checkin", "--run", self.run_id, "--json", *extra)
        self.assertEqual(code, 0, err)
        return json.loads(out)

    def test_act_when_work_is_ready_then_ok_while_progressing(self) -> None:
        data = self.checkin()
        self.assertEqual(data["verdict"], "ACT")
        self.assertIn("ready to dispatch: 01", data["reason"])
        self.assertTrue(data["next_cron"])

        self.cli("task", "set", "--run", self.run_id, "--task", "01", "--status", "assigned", "--agent", "w")
        self.cli("event", "--run", self.run_id, "--task", "01", "--kind", "started", "--message", "go")
        data = self.checkin()
        self.assertEqual(data["verdict"], "OK")
        self.assertEqual(data["quiet_checkins"], 0)

    def test_done_task_asks_for_review(self) -> None:
        self.cli("event", "--run", self.run_id, "--task", "01", "--kind", "started", "--message", "go")
        self.cli("event", "--run", self.run_id, "--task", "01", "--kind", "done", "--message", "ok")
        data = self.checkin()
        self.assertEqual(data["verdict"], "ACT")
        self.assertIn("awaiting review", data["reason"])

    def test_stops_after_consecutive_quiet_checkins(self) -> None:
        self.cli("event", "--run", self.run_id, "--task", "01", "--kind", "started", "--message", "go")
        # The first check-in sees the started event; the next three see nothing new.
        verdicts = [self.checkin()["verdict"] for _ in range(4)]
        self.assertEqual(verdicts, ["OK", "OK", "OK", "STOP"])
        final = self.checkin()
        self.assertEqual(final["verdict"], "STOP")
        self.assertIsNone(final["next_cron"])

        self.cli("event", "--run", self.run_id, "--task", "01", "--kind", "progress", "--message", "moving")
        self.assertEqual(self.checkin()["verdict"], "OK")

    def test_stop_when_run_is_finished(self) -> None:
        self.cli("finish", "--run", self.run_id, "--status", "done")
        data = self.checkin()
        self.assertEqual(data["verdict"], "STOP")
        self.assertIsNone(data["next_cron"])
        _code, out, _err = self.cli("checkin", "--run", self.run_id)
        self.assertTrue(out.startswith("STOP:"))
        self.assertNotIn("NEXT:", out)

    def test_next_cron_is_one_shot_and_avoids_round_minutes(self) -> None:
        from datetime import datetime, timezone
        base = datetime(2026, 9, 21, 13, 35, tzinfo=timezone.utc)
        self.assertEqual(conductor.next_checkin_cron(25, base), "1 14 21 9 *")
        self.assertEqual(conductor.next_checkin_cron(20, base), "55 13 21 9 *")


class ElapsedTests(ConductorTestCase):
    def test_elapsed_stops_at_finish(self) -> None:
        run_id = self.init_run()
        run_path = self.run_dir(run_id) / "run.json"
        run = json.loads(run_path.read_text())
        run["created"] = "2026-09-21T10:00:00+00:00"
        run["finished"] = "2026-09-21T11:05:00+00:00"
        run["status"] = "done"
        run_path.write_text(json.dumps(run))
        data = conductor.build_status(self.run_dir(run_id), run)
        self.assertEqual(data["elapsed"], "1h05m")


class ReviewLevelTests(ConductorTestCase):
    def add(self, run_id: str, title: str, role: str, *extra: str) -> dict:
        code, out, err = self.cli(
            "task", "add", "--run", run_id, "--title", title, "--role", role, "--json", *extra
        )
        self.assertEqual(code, 0, err)
        return json.loads(out)["task"]

    def test_defaults_by_role_and_packet_header(self) -> None:
        run_id = self.init_run()
        expected = {"explore": "none", "implement": "light", "integrate": "full", "computer-use": "light"}
        for role, level in expected.items():
            task = self.add(run_id, role, role)
            self.assertEqual(task["review"], level, role)
            body = Path(task["packet"]).read_text()
            self.assertIn(f"Review: {level} (", body)
        body = Path(self.task(run_id, "02")["packet"]).read_text()
        self.assertIn("## Self-check before reporting done", body)
        self.assertIn("No stale references remain", body)
        self.assertIn("exit status, and the last lines of its output", body)

    def test_explicit_review_and_task_set_rewrites_header(self) -> None:
        run_id = self.init_run()
        task = self.add(run_id, "Risky", "implement", "--review", "full")
        self.assertEqual(task["review"], "full")
        code, _out, err = self.cli("task", "set", "--run", run_id, "--task", "01", "--review", "none")
        self.assertEqual(code, 0, err)
        self.assertIn("Review: none (", Path(task["packet"]).read_text())
        code, _out, err = self.cli("task", "set", "--run", run_id, "--task", "01", "--review", "bogus")
        self.assertEqual(code, 1)
        self.assertIn("invalid review level", err)

    def test_review_none_is_accepted_on_done(self) -> None:
        run_id = self.init_run()
        self.add(run_id, "Map it", "explore")
        self.add(run_id, "Build it", "implement", "--depends-on", "01")
        self.cli("event", "--run", run_id, "--task", "01", "--kind", "started", "--message", "go")
        self.cli("event", "--run", run_id, "--task", "01", "--kind", "done", "--message", "brief written")
        self.assertEqual(self.task(run_id, "01")["status"], "accepted")
        log = (self.run_dir(run_id) / "events.log").read_text()
        self.assertIn("ACCEPTED: auto-accepted: review none", log)
        _code, out, _err = self.cli("status", "--run", run_id, "--json")
        data = json.loads(out)
        self.assertEqual(data["ready_to_dispatch"], ["02"])
        self.assertEqual(data["awaiting_review"], [])

    def test_light_review_still_waits_for_a_reviewer(self) -> None:
        run_id = self.init_run()
        self.add(run_id, "Build it", "implement")
        self.cli("event", "--run", run_id, "--task", "01", "--kind", "started", "--message", "go")
        self.cli("event", "--run", run_id, "--task", "01", "--kind", "done", "--message", "ok")
        self.assertEqual(self.task(run_id, "01")["status"], "done")

    def test_max_workers_default_depends_on_harness(self) -> None:
        claude = self.init_run()
        self.assertEqual(json.loads((self.run_dir(claude) / "run.json").read_text())["max_workers"], 2)
        codex = self.init_run(harness="codex")
        self.assertEqual(json.loads((self.run_dir(codex) / "run.json").read_text())["max_workers"], 3)
        explicit = self.init_run(harness="claude", max_workers=4)
        self.assertEqual(json.loads((self.run_dir(explicit) / "run.json").read_text())["max_workers"], 4)


if __name__ == "__main__":
    unittest.main()
