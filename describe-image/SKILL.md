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
- `GOOGLE_AI_API_KEY` environment variable set

## Supported Formats

- JPEG (`.jpg`, `.jpeg`)
- PNG (`.png`)
- WebP (`.webp`)
- HEIC/HEIF (`.heic`, `.heif`)

## Usage

To describe an image, run the following command:

```bash
node .github/skills/describe-image/index.js <image_path>
```

**Example:**

```bash
node .github/skills/describe-image/index.js ./public/properties/shared/image_01.jpg
```

**Output:**

```
A modern living room with a white sectional sofa and large windows overlooking a city skyline.
```

The script outputs a concise 10-20 word description of the image content, focusing on the main subject and key features.
