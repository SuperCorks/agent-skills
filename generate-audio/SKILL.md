---
name: generate-audio
description: Turn text into a spoken MP3 or WAV file. Uses the local Voxtral TTS model by default (free and private, on Apple Silicon) and falls back to Speechify when Voxtral cannot run. Use when the user asks to generate audio, narrate or speak text, or make a voiceover, or when another skill needs text-to-speech. Covers one-time installation of the shared Voxtral runtime. Not for transcribing audio, voice cloning, or summarizing a task (use audio-summary).
---

# Generate Audio

Synthesize speech from text with one command. Two providers are supported:

| Provider | Runs | Cost | Used when |
| --- | --- | --- | --- |
| `voxtral` | Locally, Voxtral 4B TTS (bf16) on MLX | Free | Default, on Apple Silicon with the shared runtime installed |
| `speechify` | Speechify API, managed Swipe News voice profile | Paid credits | Voxtral cannot run or fails, or when requested explicitly |

## Generate Audio

Run the bundled script from this skill's directory:

```bash
node scripts/generate_audio.mjs \
  --text-file /absolute/path/to/narration.txt \
  --output /absolute/path/to/narration.mp3
```

Pass `--text "..."` instead of `--text-file` for a short inline string. The output extension selects the format: `.mp3` (44.1 kHz mono, 96 kbps) or `.wav` (24 kHz mono).

Options:

- `--provider auto|voxtral|speechify`: `auto` is the default. `voxtral` never falls back and never spends credits. `speechify` skips Voxtral.
- `--voice <name>`: Voxtral voice preset, default `casual_male` (or `GENERATE_AUDIO_VOICE`). English: `casual_female`, `casual_male`, `cheerful_female`, `neutral_female`, `neutral_male`. Also `fr_`, `de_`, `es_`, `it_`, `pt_`, `nl_` with `female`/`male`, plus `ar_male`, `hi_female`, `hi_male`. Speechify ignores this and uses its managed voice profile.
- `--speed <0.5-2>`: Playback speed. Without it Voxtral speaks at `1` and Speechify uses the managed profile speed (`1.1`).
- `--overwrite`: Replace an existing output file.
- `--dry-run`: Report the plan without generating audio or calling any provider.

The script prints one JSON line:

```json
{"outputPath":"/abs/narration.mp3","bytes":444231,"requestedProvider":"auto","provider":"voxtral","fallbackReason":null,"voice":"casual_male","speed":1,"words":100,"chunks":1,"audioSeconds":37,"elapsedSeconds":66.6}
```

Always tell the user which `provider` ran. When `fallbackReason` is set, say so: it means paid Speechify credits were used instead of the local model.

## Provider Selection and Paid Calls

With `--provider auto`, Speechify is used when:

| `fallbackReason` | Meaning |
| --- | --- |
| `unsupported-platform` | Not macOS on Apple Silicon (for example a Linux remote host) |
| `voxtral-not-installed` | The shared runtime is missing; see Installation |
| `voxtral-failed: ...` | Voxtral was started but errored, timed out, or the lock stayed busy |

If Speechify also fails, the script exits non-zero and names both causes. No output file is left behind on failure.

Speechify consumes paid credits. Run `--dry-run` first: when it reports `"paidCall": true`, follow the active environment's confirmation policy before the real run. When it reports `"paidCall": false` the run is free, although a mid-run Voxtral failure can still fall back. Use `--provider voxtral` when spending credits is never acceptable.

## Timing

Voxtral generates at roughly 0.55x real time on an M3 Max, so audio takes about 1.8 times its own length to produce. `--dry-run` returns an `estimate` with `audioSeconds` and `generationSeconds`. As a guide: 100 words is about 35 seconds of audio and one minute of work; 900 words is about six minutes of audio and ten minutes of work.

Run anything longer than about two minutes of audio in the background and keep working. Progress lines (`voxtral_worker: chunk 2/4`) arrive on stderr. Voxtral jobs are serialized through a lock in the shared runtime because each one peaks near 9 GB of memory; a second job waits for the first.

## Known Limits

- **Openings are sometimes dropped or garbled.** Voxtral can fumble the first word or two of whatever it is given, then speak the rest accurately (98 to 99 percent of words in testing). It is worst on very short inputs: a 10-word sentence came out wrong in 3 of 8 takes ("spin leaves in..." instead of "The morning train to Lisbon leaves in..."), at every model precision. Longer inputs are affected too: across two multi-chunk narrations, 3 of 9 chunk openings lost their first word ("The" twice, "Follow-up:" once). Long text is split into chunks of 25 to 120 words, which avoids the severe short-input failures and limits how many openings there are, but it does not remove the problem. There is no automatic self-check. For audio that matters, ask the user to listen, regenerate with `--overwrite` if an opening is wrong, and prefer text whose sentences do not open with a label such as "Follow-up:".
- **No voice cloning.** The open weights ship without the reference-audio encoder, so only the 20 preset voices work.
- **License.** The Voxtral weights are CC BY-NC 4.0: non-commercial use only. Whoever installs the runtime is responsible for that fit. Use `--provider speechify` where the terms do not fit.
- **Languages.** English, French, German, Spanish, Italian, Portuguese, Dutch, Arabic, and Hindi. Pick the voice that matches the language of the text.

## Installation

Voxtral needs a one-time install of a shared runtime. It lives outside the skill so that every copy of this skill (for example under `~/.claude/skills` and `~/.codex/skills`) uses the same environment and the same model files.

Requirements: macOS on Apple Silicon, about 9 GB of free memory, 9 GB of disk, [`uv`](https://docs.astral.sh/uv/), and `ffmpeg` (`brew install uv ffmpeg`). On any other platform skip installation; the skill uses Speechify.

The install downloads about 8 GB of model weights. Confirm with the user before running it.

```bash
node scripts/install_voxtral.mjs
```

It is safe to re-run: a runtime that already passes its check is left untouched. It installs:

| What | Where |
| --- | --- |
| Python 3.12 environment with pinned `mlx-audio` and `mistral-common` | `~/.local/share/generate-audio/voxtral/venv` |
| Install manifest (versions, pinned model revision, smoke-test result) | `~/.local/share/generate-audio/install.json` |
| Model `mlx-community/Voxtral-4B-TTS-2603-mlx-bf16`, pinned revision | The standard Hugging Face cache (`~/.cache/huggingface/hub`) |

Set `GENERATE_AUDIO_HOME` to relocate the first two. The install ends with a smoke test that speaks a sentence, and writes the manifest only if that succeeds, so a failed install is never mistaken for a working one. Generation itself runs offline.

Check an installation at any time, without changing it:

```bash
node scripts/install_voxtral.mjs --check
```

It prints a JSON report and exits non-zero with a `problems` list when something is wrong. Use `--force` to rebuild the environment. To uninstall, delete `~/.local/share/generate-audio` and remove the model with `hf cache rm model/mlx-community/Voxtral-4B-TTS-2603-mlx-bf16`.

## Speechify Configuration

The Speechify path uses the same managed voice profile as Swipe News:

- Voice: `SPEECHIFY_VOICE_ID` (`harper_32`)
- Model: `SPEECHIFY_MODEL_ID` (`simba-english`)
- Speed: `SPEECHIFY_VOICE_SPEED` (`1.1`), overridden by `--speed`
- Language: `SPEECHIFY_LANGUAGE` (`en-US`)

`SPEECHIFY_API_KEY` belongs to the Speechify account `simoncorcos.ing@gmail.com`. The script reads it and the profile from the current environment, `--env-file`, `GENERATE_AUDIO_ENV_FILE`, `AUDIO_SUMMARY_ENV_FILE`, or Simon's TLDR Audio `.env.local` fallback, without printing credentials. Speechify accepts at most 20,000 characters per request.

Example requests this skill should handle:

- "Read this paragraph out loud into an MP3."
- "Generate audio for this script with the male voice."
- "Install Voxtral so audio generation runs locally."
