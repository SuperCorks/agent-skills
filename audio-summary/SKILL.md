---
name: audio-summary
description: Create and publicly publish narrated MP3 summaries of the current Codex task or its latest completed output. Use when the user asks for an audio summary, spoken recap, narrated handoff, or says to make an audio summary when other work is done. Supports short, medium (default), and detailed modes. Do not use to summarize an external audio or video file.
---

# Audio Summary

Create a public audio recap with this fixed pipeline:

1. Prepare relevant visible thread context and a detailed factual report of the agent's work.
2. Use OpenRouter Kimi K3 to turn those inputs into mode-appropriate spoken narration.
3. Use Speechify with the same managed voice profile as Swipe News to synthesize the MP3.
4. Publish the MP3 with the `publish-artifacts` skill and return its verified public link.

Do not silently replace either provider with the agent's own narration or another TTS service.

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

Kimi may produce a shorter narration when the underlying work is sparse. Accuracy is more important than padding.

## Prepare Kimi's Inputs

Create two temporary UTF-8 files after the primary work is complete:

1. **Thread context:** The relevant user-visible conversation for the selected scope. Preserve the user's requests, corrections, decisions, and delivered outcomes. Exclude system/developer prompts, hidden reasoning, raw credentials, private keys, access tokens, and irrelevant tool logs.
2. **Agent detailed report:** A factual report prepared by the agent, even when the requested audio mode is short. Include the original goal, final interpretation, meaningful actions and file changes, important decisions, validation evidence, final state, and unresolved follow-up. Distinguish completed work from proposals or failures.

Do not pre-compress the detailed report to the requested audio length. Kimi K3 owns the final selection, organization, and spoken wording.

Because the finished audio is public, remove sensitive source material before either provider call. If a safe public report cannot preserve the user's intent, pause and explain why.

## Generate the Narration and MP3

Run the bundled script from this skill's directory:

```bash
node scripts/generate_audio.mjs \
  --thread /absolute/path/to/thread-context.md \
  --report /absolute/path/to/agent-detailed-report.md \
  --mode medium \
  --scope thread \
  --output /absolute/path/to/audio-summary-medium-2026-08-25.mp3
```

Use `--scope last-pass` for the latest-work scope. The script writes Kimi's narration beside the MP3 as a `.txt` file unless `--script-output` specifies another path.

The provider configuration is intentionally aligned with Swipe News:

- OpenRouter model: `moonshotai/kimi-k3`
- Speechify voice: `SPEECHIFY_VOICE_ID` (`harper_32` in the current Swipe News profile)
- Speechify model: `SPEECHIFY_MODEL_ID` (`simba-english`)
- Speechify speed: `SPEECHIFY_VOICE_SPEED` (`1.1`)
- Speechify language: `SPEECHIFY_LANGUAGE` (`en-US`)

The helper reads `OPENROUTER_API_KEY`, `SPEECHIFY_API_KEY`, and the Speechify profile from the current environment, `AUDIO_SUMMARY_ENV_FILE`, or Simon's TLDR Audio `.env.local` fallback without printing credentials.

Use `--dry-run` to validate inputs, mode, endpoints, and resolved non-secret provider settings without calling either provider. Live generation consumes OpenRouter and Speechify credits, so follow the active environment's confirmation policy immediately before the paid calls.

If Kimi fails, do not call Speechify. If Speechify fails, keep Kimi's local narration for diagnosis but do not publish or claim an audio link. Keep all provider errors credential-free.

## Publish and Return the Link

Load and follow the `publish-artifacts` skill after the local MP3 is complete. It provides public-upload safety checks, dry-run mapping inspection, anonymous verification, and the final content-hashed URL.

Unless the user provides a destination, publish only the MP3 under:

```text
artifacts/YYYY-MM-DD/audio-summaries/
```

Return the public audio link first, followed by a brief note naming the scope and detail mode. Mention anonymous verification. If publishing fails, return the local MP3 path and the publishing error; do not claim that a public link exists.

Example requests this skill should handle:

- "Make an audio summary of this task."
- "Give me a short spoken recap of what you just did."
- "When you're done, make a full detailed audio summary of the last pass."
