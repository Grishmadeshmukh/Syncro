import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function generateDescription(
  transcription: string,
  segments: Array<{ text: string; start: number; end: number }>,
  videoAnalyses: string[]
): Promise<{ summary: string; chapters: Array<{ time: number; label: string }>; hashtags: string[] }> {
  const prompt = `You are generating a YouTube-style video description.

Voiceover transcription:
"${transcription}"

Timed transcript segments: ${JSON.stringify(segments)}

Video content descriptions: ${videoAnalyses.join(' | ')}

Generate:
1. A compelling 2-3 sentence summary of the video content
2. Chapter timestamps (3-8 chapters) derived from topic shifts in the transcript. Each chapter needs a timestamp (in seconds from the start) and a short descriptive label (2-5 words)
3. 8-12 relevant hashtags for YouTube/social media (without the # symbol)`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          chapters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                time: { type: Type.NUMBER },
                label: { type: Type.STRING },
              },
              required: ["time", "label"],
            },
          },
          hashtags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["summary", "chapters", "hashtags"],
      },
    },
  });

  try {
    return JSON.parse(response.text || '{"summary":"","chapters":[],"hashtags":[]}');
  } catch {
    return { summary: '', chapters: [], hashtags: [] };
  }
}

export async function identifyKeyMoments(
  transcription: string,
  segments: Array<{ text: string; start: number; end: number }>,
  videoAnalyses: string[]
): Promise<Array<{ timestamp: number; quote: string; reason: string }>> {
  const prompt = `Analyze this video and identify the 4-5 most emotionally charged, surprising, or compelling moments that would make great video thumbnails for click-through on YouTube or social media.

Full transcription: "${transcription}"

Timed segments: ${JSON.stringify(segments)}

Video content: ${videoAnalyses.join(' | ')}

For each moment provide:
- The exact timestamp in seconds (must be within the segment times above)
- A short punchy quote or label (max 7 words) suitable as thumbnail text
- Why this moment is visually and emotionally compelling for a thumbnail`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            timestamp: { type: Type.NUMBER },
            quote: { type: Type.STRING },
            reason: { type: Type.STRING },
          },
          required: ["timestamp", "quote", "reason"],
        },
      },
    },
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch {
    return [];
  }
}
