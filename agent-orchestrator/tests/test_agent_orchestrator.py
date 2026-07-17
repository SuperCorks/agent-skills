import importlib.util
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "agent_orchestrator.py"
SPEC = importlib.util.spec_from_file_location("agent_orchestrator", SCRIPT_PATH)
assert SPEC and SPEC.loader
agent_orchestrator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(agent_orchestrator)


class RuntimeDefaultsTests(unittest.TestCase):
    def parse_run_args(self, *extra_args: str):
        parser = agent_orchestrator.build_parser()
        return parser.parse_args(
            [
                "run",
                "--engine",
                "opencode",
                "--prompt",
                "Test prompt",
                *extra_args,
            ]
        )

    def test_run_timeout_defaults_to_45_minutes(self) -> None:
        self.assertEqual(agent_orchestrator.BUILTIN_RUN_TIMEOUT_SECONDS, 2700)
        with mock.patch.object(
            agent_orchestrator,
            "DEFAULT_RUN_TIMEOUT",
            agent_orchestrator.BUILTIN_RUN_TIMEOUT_SECONDS,
        ):
            args = self.parse_run_args()

        self.assertEqual(args.timeout, 2700)

    def test_explicit_run_timeout_overrides_default(self) -> None:
        args = self.parse_run_args("--timeout", "60")

        self.assertEqual(args.timeout, 60)


class OpenCodeModelReasoningTests(unittest.TestCase):
    def build_opencode_command(self, *extra_args: str) -> list[str]:
        parser = agent_orchestrator.build_parser()
        args = parser.parse_args(
            [
                "run",
                "--engine",
                "opencode",
                "--prompt",
                "Test prompt",
                *extra_args,
            ]
        )
        with mock.patch.object(agent_orchestrator, "opencode_auto_supported", return_value=True):
            return agent_orchestrator.build_command(
                args,
                Path("/tmp/project"),
                "Test prompt",
                None,
            )

    def test_kimi_k3_defaults_to_max_reasoning(self) -> None:
        with mock.patch.object(agent_orchestrator, "DEFAULT_KIMI_K3_REASONING", "max"):
            command = self.build_opencode_command(
                "--model",
                "openrouter/moonshotai/kimi-k3",
            )

        self.assertIn("--auto", command)
        self.assertEqual(
            command[command.index("--model") + 1],
            "openrouter/moonshotai/kimi-k3",
        )
        self.assertEqual(command[command.index("--variant") + 1], "max")

    def test_kimi_k3_matching_is_case_insensitive(self) -> None:
        with mock.patch.object(agent_orchestrator, "DEFAULT_KIMI_K3_REASONING", "max"):
            self.assertEqual(
                agent_orchestrator.default_reasoning(
                    "opencode",
                    "OPENROUTER/MOONSHOTAI/KIMI-K3",
                ),
                "max",
            )

    def test_existing_grok_default_remains_high(self) -> None:
        with mock.patch.object(agent_orchestrator, "DEFAULT_OPENCODE_REASONING", "high"):
            command = self.build_opencode_command(
                "--model",
                "openrouter/x-ai/grok-4.5",
            )

        self.assertEqual(command[command.index("--variant") + 1], "high")

    def test_generic_opencode_reasoning_does_not_override_kimi(self) -> None:
        with (
            mock.patch.object(agent_orchestrator, "DEFAULT_OPENCODE_REASONING", "low"),
            mock.patch.object(agent_orchestrator, "DEFAULT_KIMI_K3_REASONING", "max"),
        ):
            self.assertEqual(
                agent_orchestrator.default_reasoning(
                    "opencode",
                    "openrouter/moonshotai/kimi-k3",
                ),
                "max",
            )

    def test_explicit_reasoning_overrides_model_default(self) -> None:
        command = self.build_opencode_command(
            "--model",
            "openrouter/x-ai/grok-4.5",
            "--reasoning",
            "low",
        )

        self.assertEqual(command[command.index("--variant") + 1], "low")


if __name__ == "__main__":
    unittest.main()
