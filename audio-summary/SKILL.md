---
name: audio-summary
description: Create and publicly publish narrated MP3 summaries of the current Codex task or its latest completed output. Use when the user asks for an audio summary, spoken recap, narrated handoff, or says to make an audio summary when other work is done. Supports short, medium (default), and detailed modes. Do not use to summarize an external audio or video file.
---

# Audio Summary

Create a public audio recap with this fixed pipeline:

1. Prepare relevant visible thread context and a detailed factual report of the agent's work.
2. Have a narrator turn those inputs into mode-appropriate spoken narration: a sub-agent of the harness you are running in, or OpenRouter Kimi K2.5 when that is not possible.
3. Synthesize the MP3 with the `generate-audio` skill, which uses the local Voxtral model and falls back to Speechify.
4. Publish the MP3 with the `publish-artifacts` skill and return its verified public link.

Do not write the narration yourself in the main thread, and do not synthesize with any tool other than `generate-audio`.

## Interpret the Request

Choose the scope from the user's wording:

- **Current task/thread:** Cover the goal, important decisions, work performed, outcome, verification, and remaining follow-up. Use this scope when the user does not specify one.
- **Last output/pass:** Cover only the most recent meaningful work cycle and its result. Do not pull older work into the narration merely for context.
- **Deferred:** When the user says "when you're done," finish and verify the primary work first. Generate the audio summary as the final task action so it includes the completed result.

Choose one detail mode:

| Mode | Target narration | Use when |
| --- | --- | --- |
| `short` | 90-160 words, about 1 minute | The user asks for short, quick, brief, or TLDR audio |
| `medium` | 250-400 words, about 2-3 minutes | Default when no detail level is given |
| `detailed` | 600-900 words, about 4-7 minutes | The user asks for detailed, full, complete, in-depth, or "full detailed" audio |

The narrator may produce a shorter narration when the underlying work is sparse. Accuracy is more important than padding.

## Prepare the Narrator's Inputs

Create two temporary UTF-8 files after the primary work is complete:

1. **Thread context:** The relevant user-visible conversation for the selected scope. Preserve the user's requests, corrections, decisions, and delivered outcomes. Exclude system/developer prompts, hidden reasoning, raw credentials, private keys, access tokens, and irrelevant tool logs.
2. **Agent detailed report:** A factual report prepared by the agent, even when the requested audio mode is short. Include the original goal, final interpretation, meaningful actions and file changes, important decisions, validation evidence, final state, and unresolved follow-up. Distinguish completed work from proposals or failures.

Do not pre-compress the detailed report to the requested audio length. The narrator owns the final selection, organization, and spoken wording.

Because the finished audio is public, remove sensitive source material before handing it to any narrator. If a safe public report cannot preserve the user's intent, pause and explain why.

## Generate the Narration

Pick the narrator from the harness you are running in. OpenRouter is only the fallback.

| Running in | Narrator |
| --- | --- |
| Claude Code | A sub-agent on Claude Sonnet (`sonnet`) at `xhigh` effort |
| Codex | A sub-agent on GPT-5.6 Luna (`gpt-5.6-luna`) at extra-high (`xhigh`) reasoning |
| Any other harness, or the sub-agent cannot be used | OpenRouter Kimi K2.5, through the bundled script |

### With a sub-agent

1. Write the narration brief. This calls no provider and needs no credentials:

   ```bash
   node scripts/generate_narration.mjs \
     --thread /absolute/path/to/thread-context.md \
     --report /absolute/path/to/agent-detailed-report.md \
     --mode medium \
     --scope thread \
     --output /absolute/path/to/audio-summary-medium-2026-08-25.txt \
     --brief-output /absolute/path/to/audio-summary-medium-2026-08-25-brief.md
   ```

   Use `--scope last-pass` for the latest-work scope. The brief holds the narration instructions, the word target, both sources, and the `--output` path the narration must be written to. It is the same brief OpenRouter receives, so every narrator follows identical instructions.

2. Launch the sub-agent with your harness's own sub-agent mechanism, on the model and effort from the table. Do not shell out to the `claude` or `codex` CLI and do not use `agent-orchestrator`. Where the harness sets effort per agent definition or inherits it from the session rather than per launch, select the model and use the closest effort it allows. Prompt it with only: "Read the brief at `<brief path>` and follow it exactly."

3. Check the narration file before synthesizing. It must exist and be plain spoken prose: no Markdown, headings, bullets, or preamble such as "Here is the narration". It must end with a complete sentence, stay within the mode's word range unless the work is sparse, and state nothing the detailed report does not support. If it fails the check, launch the sub-agent once more; if it fails again, use the fallback.

### Fallback: OpenRouter

Use this when the harness is neither Claude Code nor Codex, when it cannot launch a sub-agent on the required model, or when the sub-agent failed twice. Run the same command without `--brief-output`, adding `--overwrite` if a rejected narration file is in the way. The script writes Kimi's narration to the `.txt` output and reports `narrator`, word count, and token use.

The model is `moonshotai/kimi-k2.5`, chosen for cost: about a fifth of a cent per medium narration, roughly a tenth of Kimi K3. Its reasoning effort is set to `low` because reasoning tokens share the token limit with the narration and can otherwise cut it off. `OPENROUTER_API_KEY` belongs to the OpenRouter account `admin@hoptech.ca`. The helper reads it from the current environment, `AUDIO_SUMMARY_ENV_FILE`, or Simon's TLDR Audio `.env.local` fallback without printing credentials.

Use `--dry-run` to validate inputs and see which narrator a command would use: it reports `"paidCall": true` only for OpenRouter. That call consumes OpenRouter credits, so follow the active environment's confirmation policy immediately before it. The sub-agent path spends no OpenRouter credits.

If the fallback fails too, stop: do not synthesize audio from anything else. That includes the error saying the narration stopped at the token limit: the text is incomplete, so nothing is written. Retry once, and if it repeats, report it.

## Synthesize the MP3

Load and follow the `generate-audio` skill, passing the narration file and an `.mp3` output beside it. Pass `--speed 1.1` so the recap keeps the same pace whichever provider runs:

```bash
node /path/to/generate-audio/scripts/generate_audio.mjs \
  --text-file /absolute/path/to/audio-summary-medium-2026-08-25.txt \
  --output /absolute/path/to/audio-summary-medium-2026-08-25.mp3 \
  --speed 1.1
```

That skill owns provider selection, installation, and the paid-call policy. In short: run its `--dry-run` first, and only a plan reporting `"paidCall": true` (Speechify) needs confirmation. The local model is free but slow, taking roughly 1 to 2 minutes for `short`, 3 to 4 for `medium`, and 6 to 10 for `detailed`, so run `medium` and `detailed` synthesis in the background.

If synthesis fails, keep the narration for diagnosis but do not publish or claim an audio link. Keep all provider errors credential-free.

## Publish and Return the Link

Load and follow the `publish-artifacts` skill after the local MP3 is complete. It provides public-upload safety checks, dry-run mapping inspection, anonymous verification, and the final content-hashed URL.

Unless the user provides a destination, publish only the MP3 under:

```text
artifacts/YYYY-MM-DD/audio-summaries/
```

Return the public audio link first, followed by a brief note naming the scope, the detail mode, the narrator that wrote it, and the synthesis provider that ran. If `generate-audio` reported a `fallbackReason`, include it. Mention anonymous verification. If publishing fails, return the local MP3 path and the publishing error; do not claim that a public link exists.

Example requests this skill should handle:

- "Make an audio summary of this task."
- "Give me a short spoken recap of what you just did."
- "When you're done, make a full detailed audio summary of the last pass."
