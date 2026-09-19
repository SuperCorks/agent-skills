#!/usr/bin/env python3
"""Render text chunks to WAV files with Voxtral TTS on MLX.

Runs inside the shared generate-audio virtual environment. The model loads once
per invocation and every chunk in the job is rendered with it.

Usage: voxtral_worker.py <job.json>

Job file:
    {
      "model": {"repo": "...", "revision": "..."},
      "voice": "neutral_female",
      "maxFrames": 1500,
      "chunks": [{"text": "...", "output": "/abs/path/chunk_000.wav"}]
    }

Prints one JSON line on stdout. Progress and errors go to stderr.
"""

import json
import os
import sys
import time

# The installer downloads the complete pinned snapshot, so generation never
# needs the network. Set before huggingface_hub is imported.
os.environ.setdefault("HF_HUB_OFFLINE", "1")

FRAME_SECONDS = 0.08
MIN_CHUNK_SECONDS = 0.3


def fail(message):
    sys.stderr.write(f"voxtral_worker: {message}\n")
    sys.exit(1)


def main():
    if len(sys.argv) != 2:
        fail("expected exactly one argument: the job file path")

    with open(sys.argv[1], encoding="utf-8") as handle:
        job = json.load(handle)

    chunks = job.get("chunks") or []
    if not chunks:
        fail("the job contains no chunks")
    max_frames = int(job.get("maxFrames", 1500))

    # mlx-audio prints status lines to stdout. Stdout is reserved for this
    # script's single JSON result, so library output is diverted to stderr.
    result_stream = sys.stdout
    sys.stdout = sys.stderr

    import numpy as np
    import soundfile as sf
    from huggingface_hub import snapshot_download
    from mlx_audio.tts.utils import load

    started = time.time()
    model_path = snapshot_download(
        job["model"]["repo"],
        revision=job["model"]["revision"],
        local_files_only=True,
    )
    model = load(model_path)
    sample_rate = int(getattr(model, "sample_rate", 24000))
    load_seconds = time.time() - started

    rendered = []
    generate_started = time.time()
    for index, chunk in enumerate(chunks):
        sys.stderr.write(f"voxtral_worker: chunk {index + 1}/{len(chunks)}\n")
        sys.stderr.flush()
        results = model.generate(text=chunk["text"], voice=job["voice"], max_tokens=max_frames)
        audio = np.concatenate([np.array(result.audio) for result in results])
        seconds = len(audio) / sample_rate

        if seconds < MIN_CHUNK_SECONDS:
            fail(f"chunk {index + 1} produced only {seconds:.2f}s of audio")
        # Reaching the frame cap means the model never emitted its end-of-audio
        # token: a runaway generation, not a finished one.
        if seconds >= (max_frames - 1) * FRAME_SECONDS:
            fail(f"chunk {index + 1} hit the {max_frames}-frame cap without finishing")

        sf.write(chunk["output"], audio, sample_rate)
        rendered.append({"output": chunk["output"], "audioSeconds": round(seconds, 2)})

    result_stream.write(
        json.dumps(
            {
                "chunks": rendered,
                "sampleRate": sample_rate,
                "loadSeconds": round(load_seconds, 2),
                "generateSeconds": round(time.time() - generate_started, 2),
            }
        )
        + "\n"
    )


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as error:  # noqa: BLE001 - reported to the caller, which may fall back
        fail(f"{type(error).__name__}: {error}")
