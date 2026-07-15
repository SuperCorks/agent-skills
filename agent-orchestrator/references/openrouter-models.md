# OpenRouter Model Profiles

This is a dated integration snapshot, not a promise that OpenRouter will keep a model, alias, price, provider, or reasoning level unchanged. Verify the live catalog before a long-running or cost-sensitive run:

```bash
curl -fsSL https://openrouter.ai/api/v1/model/x-ai/grok-4.5 | jq '.data | {id, canonical_slug, context_length, pricing, supported_parameters, reasoning}'
```

Snapshot verified 2026-07-15 against the OpenRouter Models API. OpenCode uses the `openrouter/<model-id>` form; the Models API uses the provider/model ID without the `openrouter/` prefix.

| Model | OpenCode model | Context | Current reasoning metadata | Input / output price per million tokens |
| --- | --- | ---: | --- | ---: |
| xAI Grok 4.5 | `openrouter/x-ai/grok-4.5` | 500K | Mandatory; `high`, `medium`, `low`; default `high` | $2 / $6 |
| OpenAI GPT-5.6 Sol | `openrouter/openai/gpt-5.6-sol` | 1.05M | `max`, `xhigh`, `high`, `medium`, `low`, `none`; default `medium` | $5 / $30 |
| OpenAI GPT-5.6 Terra | `openrouter/openai/gpt-5.6-terra` | 1.05M | `max`, `xhigh`, `high`, `medium`, `low`, `none`; default `medium` | $2.50 / $15 |
| Anthropic Claude Opus 4.8 | `openrouter/anthropic/claude-opus-4.8` | 1M | `max`, `xhigh`, `high`, `medium`, `low`; default `medium` | $5 / $25 |
| xAI Grok Build 0.1 | `openrouter/x-ai/grok-build-0.1` | 256K | Reasoning mandatory; effort list not exposed in the current record | $1 / $2 |

## Grok 4.5

Use this profile for coding, agentic tasks, and knowledge work when a third model family is useful:

```bash
python3 agent-orchestrator/scripts/agent_orchestrator.py run \
  --engine opencode \
  --model openrouter/x-ai/grok-4.5 \
  --reasoning high \
  --timeout 1800 \
  --prompt "Review the current implementation for correctness risks and return a handoff packet."
```

The current catalog record reports text, image, and file input with text output; tool use, structured outputs, and reasoning are supported. The route is available through OpenRouter, but availability and provider uptime can change independently of the model's launch status.

Do not assume that the skill's default `high` setting applies to every OpenRouter model. OpenRouter documents `reasoning.effort` as a normalized parameter, but individual model records still define supported efforts. Use the live record and choose the highest effort that the selected model advertises.
