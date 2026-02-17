---
name: describe-image
description: Generates a short text description of an image file using AI.
---

# Describe Image

Use this skill when you need to understand the content of an image file in the project, or when you need to generate a description for an image (e.g. for alt text or filename generation).

**Script location:** `.github/skills/describe-image/`

## Prerequisites

- Node.js installed
- `@google/genai` and `dotenv` npm packages

For `--google`:

- `GOOGLE_AI_API_KEY` environment variable set
- If missing in current process env, the script attempts to read it from your zsh login/interactive environment (`zsh -ilc`)

For `--llava`:

- `ollama` installed and available in PATH
- Vision model pulled locally (default: `llava`)

## Supported Formats

- JPEG (`.jpg`, `.jpeg`)
- PNG (`.png`)
- WebP (`.webp`)
- HEIC/HEIF (`.heic`, `.heif`)

## Usage

To describe an image, run the following command:

```bash
node .github/skills/describe-image/index.js [options] <image_path>
```

### Options

- `--google` Use Google Gemini (default provider)
- `--llava` Use local Ollama model
- `--prompt "..."` Custom prompt text
- `--model <name>` Override model (`gemini-3-flash-preview` for Google, `llava` for Ollama)
- `-h`, `--help` Show usage

**Example:**

```bash
node .github/skills/describe-image/index.js ./public/properties/shared/image_01.jpg
node .github/skills/describe-image/index.js --llava ./public/properties/shared/image_01.jpg
node .github/skills/describe-image/index.js --google --prompt "List visible buttons" ./public/properties/shared/image_01.jpg
```

### Ollama install behavior

If `--llava` is used and `ollama` is not installed, the script prints installation steps (including Homebrew commands) and exits.

**Output:**

```
A modern living room with a white sectional sofa and large windows overlooking a city skyline.
```

The script outputs a concise 10-20 word description of the image content, focusing on the main subject and key features.
