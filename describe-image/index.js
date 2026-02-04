import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
if (!GOOGLE_AI_API_KEY) {
  console.error('Error: GOOGLE_AI_API_KEY environment variable is required');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GOOGLE_AI_API_KEY });

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

async function describeImage(imagePath) {
  if (!fs.existsSync(imagePath)) {
    console.error(`Error: File not found at ${imagePath}`);
    process.exit(1);
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = getMimeType(imagePath);

  const prompt = `Describe this image in 10-20 words. Focus on the main subject and key features. Be concise.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node .github/skills/describe-image <image_path>');
    process.exit(1);
  }

  const imagePath = args[0];
  const description = await describeImage(imagePath);
  console.log(description);
}

main().catch(console.error);
