import { GoogleGenAI } from '@google/genai';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const DEFAULT_PROMPT =
  'Describe this image in 10-20 words. Focus on the main subject and key features. Be concise.';

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.heic':
      return 'image/heic';
    case '.heif':
      return 'image/heif';
    default:
      return 'image/jpeg';
  }
}

function printUsage() {
  console.log(`Usage:
  node .github/skills/describe-image/index.js [options] <image_path>

Options:
  --google                 Use Google Gemini (requires GOOGLE_AI_API_KEY)
  --llava                  Use local Ollama LLaVA model
  --prompt "..."           Custom prompt
  --model <name>           Model name (default: gemini-3-flash-preview for Google, llava for Ollama)
  -h, --help               Show this help

Examples:
  node .github/skills/describe-image/index.js ./image.png
  node .github/skills/describe-image/index.js --llava ./image.png
  node .github/skills/describe-image/index.js --google --prompt "List visible buttons" ./image.png
`);
}

function printOllamaInstallInstructions() {
  console.error('\nOllama is not installed or not available in PATH.');
  console.error('Install instructions (macOS):');
  console.error('  brew install ollama');
  console.error('  ollama --version');
  console.error('  ollama pull llava');
  console.error('\nDocs: https://ollama.com/download');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let provider = 'google';
  let prompt = DEFAULT_PROMPT;
  let model;
  let imagePath;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const nextArg = args[index + 1];

    if (arg === '-h' || arg === '--help') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--google') {
      if (provider === 'llava') {
        console.error('Error: --google and --llava are mutually exclusive');
        process.exit(1);
      }
      provider = 'google';
      continue;
    }

    if (arg === '--llava') {
      if (provider === 'google' && args.includes('--google')) {
        console.error('Error: --google and --llava are mutually exclusive');
        process.exit(1);
      }
      provider = 'llava';
      continue;
    }

    if (arg === '--prompt') {
      if (!nextArg) {
        console.error('Error: --prompt requires a value');
        process.exit(1);
      }
      prompt = nextArg;
      index += 1;
      continue;
    }

    if (arg.startsWith('--prompt=')) {
      prompt = arg.slice('--prompt='.length);
      continue;
    }

    if (arg === '--model') {
      if (!nextArg) {
        console.error('Error: --model requires a value');
        process.exit(1);
      }
      model = nextArg;
      index += 1;
      continue;
    }

    if (arg.startsWith('--model=')) {
      model = arg.slice('--model='.length);
      continue;
    }

    if (arg.startsWith('--')) {
      console.error(`Error: Unknown option ${arg}`);
      printUsage();
      process.exit(1);
    }

    if (!imagePath) {
      imagePath = arg;
      continue;
    }

    console.error(`Error: Unexpected argument ${arg}`);
    printUsage();
    process.exit(1);
  }

  if (!imagePath) {
    console.error('Error: image_path is required');
    printUsage();
    process.exit(1);
  }

  return {
    provider,
    prompt,
    model,
    imagePath,
  };
}

function assertImageExists(imagePath) {
  if (!fs.existsSync(imagePath)) {
    console.error(`Error: File not found at ${imagePath}`);
    process.exit(1);
  }
}

async function describeWithGoogle(imagePath, prompt, model = 'gemini-3-flash-preview') {
  const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
  if (!GOOGLE_AI_API_KEY) {
    console.error('Error: GOOGLE_AI_API_KEY environment variable is required for --google');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey: GOOGLE_AI_API_KEY });
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = getMimeType(imagePath);

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64Image } },
            { text: prompt },
          ],
        },
      ],
    });

    return response.text?.trim() || 'Unable to describe image';
  } catch (error) {
    console.error(`Error describing ${imagePath}:`, error);
    return 'Error describing image';
  }
}

function describeWithLlava(imagePath, prompt, model = 'llava') {
  const versionResult = spawnSync('ollama', ['--version'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (versionResult.error || versionResult.status !== 0) {
    printOllamaInstallInstructions();
    process.exit(1);
  }

  const modelCheck = spawnSync('ollama', ['show', model], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (modelCheck.status !== 0) {
    console.error(`Error: Ollama model "${model}" is not available locally.`);
    console.error(`Install it with: ollama pull ${model}`);
    process.exit(1);
  }

  const ollamaPrompt = `${prompt}\n\nImage: ${imagePath}`;
  const result = spawnSync('ollama', ['run', model, ollamaPrompt], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    console.error('Error running Ollama:', result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(result.stderr?.trim() || `Ollama command failed with exit code ${result.status}`);
    process.exit(1);
  }

  const output = (result.stdout || '')
    .split('\n')
    .filter((line) => !line.startsWith('Added image '))
    .join('\n')
    .trim();

  return output || 'Unable to describe image';
}

async function main() {
  const { provider, prompt, model, imagePath } = parseArgs(process.argv);
  assertImageExists(imagePath);

  const description =
    provider === 'llava'
      ? describeWithLlava(imagePath, prompt, model)
      : await describeWithGoogle(imagePath, prompt, model);

  console.log(description);
}

main().catch(console.error);
