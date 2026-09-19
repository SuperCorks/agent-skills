import importlib.util
import os
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "agent_orchestrator.py"
SPEC = importlib.util.spec_from_file_location("agent_orchestrator", SCRIPT_PATH)
assert SPEC and SPEC.loader
agent_orchestrator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(agent_orchestrator)


def load_module_with_env(**env: str):
    """Re-import the script with patched environment variables."""
    spec = importlib.util.spec_from_file_location("agent_orchestrator_env", SCRIPT_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    with mock.patch.dict(os.environ, env, clear=False):
        spec.loader.exec_module(module)
    return module


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


class ModelAliasTests(unittest.TestCase):
    def test_documented_aliases_resolve_to_exact_model_ids(self) -> None:
        cases = [
            ("codex", "sol", "gpt-5.6-sol"),
            ("codex", "terra", "gpt-5.6-terra"),
            ("codex", "astra", "gpt-6-astra"),
            ("claude", "opus", "claude-opus-5"),
            ("claude", "fable", "claude-fable-5"),
            ("opencode", "grok", "openrouter/x-ai/grok-4.5"),
            ("opencode", "kimi", "openrouter/moonshotai/kimi-k3"),
        ]

        for engine, alias, expected in cases:
            with self.subTest(engine=engine, alias=alias):
                self.assertEqual(
                    agent_orchestrator.resolve_model(engine, alias.upper()),
                    expected,
                )


class CodexAstraDefaultsTests(unittest.TestCase):
    def build_codex_command(self, *extra_args: str) -> list[str]:
        parser = agent_orchestrator.build_parser()
        args = parser.parse_args(
            [
                "run",
                "--engine",
                "codex",
                "--prompt",
                "Test prompt",
                *extra_args,
            ]
        )
        return agent_orchestrator.build_command(
            args,
            Path("/tmp/project"),
            "Test prompt",
            None,
        )

    def test_astra_alias_resolves_to_gpt_6_astra(self) -> None:
        self.assertEqual(agent_orchestrator.resolve_model("codex", "astra"), "gpt-6-astra")

    def test_astra_alias_is_case_insensitive(self) -> None:
        self.assertEqual(agent_orchestrator.resolve_model("codex", "AsTrA"), "gpt-6-astra")

    def test_astra_defaults_to_medium_reasoning(self) -> None:
        with mock.patch.object(agent_orchestrator, "DEFAULT_CODEX_ASTRA_REASONING", "medium"):
            command = self.build_codex_command("--model", "astra")

            self.assertEqual(
                agent_orchestrator.default_reasoning("codex", "gpt-6-astra"),
                "medium",
            )

        self.assertEqual(command[command.index("--model") + 1], "gpt-6-astra")
        self.assertEqual(
            command[command.index("-c") + 1],
            'model_reasoning_effort="medium"',
        )

    def test_astra_matching_is_case_insensitive_for_reasoning(self) -> None:
        with mock.patch.object(agent_orchestrator, "DEFAULT_CODEX_ASTRA_REASONING", "medium"):
            self.assertEqual(
                agent_orchestrator.default_reasoning("codex", "GPT-6-ASTRA"),
                "medium",
            )

    def test_builtin_astra_default_is_medium(self) -> None:
        if os.environ.get("AGENT_ORCHESTRATOR_CODEX_ASTRA_REASONING") or os.environ.get(
            "AGENT_ORCHESTRATOR_CODEX_REASONING"
        ):
            self.skipTest("local Codex reasoning environment override is set")
        module = load_module_with_env()

        self.assertEqual(module.DEFAULT_CODEX_ASTRA_REASONING, "medium")
        self.assertEqual(module.default_reasoning("codex", "astra"), "medium")

    def test_model_specific_env_overrides_astra_default(self) -> None:
        module = load_module_with_env(AGENT_ORCHESTRATOR_CODEX_ASTRA_REASONING="high")

        self.assertEqual(module.DEFAULT_CODEX_ASTRA_REASONING, "high")
        self.assertEqual(module.default_reasoning("codex", "astra"), "high")

    def test_model_specific_env_beats_global_codex_override(self) -> None:
        module = load_module_with_env(
            AGENT_ORCHESTRATOR_CODEX_REASONING="low",
            AGENT_ORCHESTRATOR_CODEX_ASTRA_REASONING="high",
        )

        self.assertEqual(module.default_reasoning("codex", "astra"), "high")

    def test_global_codex_env_override_applies_without_model_specific_value(self) -> None:
        module = load_module_with_env(AGENT_ORCHESTRATOR_CODEX_REASONING="max")

        self.assertEqual(module.default_reasoning("codex", "astra"), "max")

    def test_explicit_reasoning_overrides_astra_default(self) -> None:
        with mock.patch.object(agent_orchestrator, "DEFAULT_CODEX_ASTRA_REASONING", "medium"):
            command = self.build_codex_command("--model", "astra", "--reasoning", "xhigh")

        self.assertEqual(command[command.index("--model") + 1], "gpt-6-astra")
        self.assertEqual(
            command[command.index("-c") + 1],
            'model_reasoning_effort="xhigh"',
        )

    def test_astra_selection_does_not_change_sol_default(self) -> None:
        with (
            mock.patch.object(agent_orchestrator, "DEFAULT_CODEX_MODEL", "gpt-5.6-sol"),
            mock.patch.object(agent_orchestrator, "DEFAULT_CODEX_SOL_REASONING", "xhigh"),
            mock.patch.object(agent_orchestrator, "DEFAULT_CODEX_ASTRA_REASONING", "medium"),
        ):
            command = self.build_codex_command()

        self.assertEqual(command[command.index("--model") + 1], "gpt-5.6-sol")
        self.assertEqual(
            command[command.index("-c") + 1],
            'model_reasoning_effort="xhigh"',
        )


class ClaudeModelDefaultsTests(unittest.TestCase):
    def build_claude_command(self, *extra_args: str) -> list[str]:
        parser = agent_orchestrator.build_parser()
        args = parser.parse_args(
            [
                "run",
                "--engine",
                "claude",
                "--prompt",
                "Test prompt",
                *extra_args,
            ]
        )
        return agent_orchestrator.build_command(
            args,
            Path("/tmp/project"),
            "Test prompt",
            None,
        )

    def test_claude_defaults_to_opus_5_with_xhigh_effort(self) -> None:
        with (
            mock.patch.object(agent_orchestrator, "DEFAULT_CLAUDE_MODEL", "claude-opus-5"),
            mock.patch.object(agent_orchestrator, "DEFAULT_CLAUDE_REASONING", "xhigh"),
        ):
            command = self.build_claude_command()

        self.assertEqual(command[command.index("--model") + 1], "claude-opus-5")
        self.assertEqual(command[command.index("--effort") + 1], "xhigh")

    def test_opus_alias_uses_opus_5_effort_default(self) -> None:
        with mock.patch.object(agent_orchestrator, "DEFAULT_CLAUDE_REASONING", "xhigh"):
            command = self.build_claude_command("--model", "opus")

        self.assertEqual(command[command.index("--model") + 1], "claude-opus-5")
        self.assertEqual(command[command.index("--effort") + 1], "xhigh")

    def test_opus_alias_is_case_insensitive(self) -> None:
        self.assertEqual(
            agent_orchestrator.resolve_model("claude", "OPUS"),
            "claude-opus-5",
        )


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
