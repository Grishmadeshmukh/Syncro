import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function analyzeVoiceover(audioFile: File): Promise<{ transcription: string; segments: Array<{ text: string; start: number; end: number }> }> {
  const base64Audio = await fileToBase64(audioFile);
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: audioFile.type,
            data: base64Audio,
          },
        },
        {
          text: `Transcribe this voiceover and provide a list of segments with their start and end times. 
          The output MUST be a JSON array of objects with 'text', 'start', and 'end' properties.
          Example: [{"text": "Hello world", "start": 0, "end": 2}]`,
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            start: { type: Type.NUMBER },
            end: { type: Type.NUMBER },
          },
          required: ["text", "start", "end"],
        },
      },
    },
  });

  const segments = JSON.parse(response.text || "[]");
  const transcription = segments.map((s: any) => s.text).join(" ");
  
  return { transcription, segments };
}

export async function analyzeVideo(videoFile: File): Promise<string> {
  const base64Video = await fileToBase64(videoFile);
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: videoFile.type,
            data: base64Video,
          },
        },
        {
          text: "Describe the content of this video clip in detail. What is happening? What are the key visual elements?",
        },
      ],
    },
  });

  return response.text || "No analysis available.";
}

export async function suggestAlignment(
  voiceoverSegments: Array<{ text: string; start: number; end: number }>,
  videoClips: Array<{ id: string; name: string; analysis: string }>
): Promise<Array<{ videoId: string; startTime: number; reason: string }>> {
  const prompt = `
    I have a voiceover with the following segments:
    ${JSON.stringify(voiceoverSegments)}

    And I have the following video clips with their descriptions:
    ${JSON.stringify(videoClips)}

    Match each video clip to the most appropriate time in the voiceover based on the content.
    Return a JSON array of objects with 'videoId', 'startTime', and 'reason'.
    The 'startTime' should be the time in seconds when the video should start playing.
  `;

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
            videoId: { type: Type.STRING },
            startTime: { type: Type.NUMBER },
            reason: { type: Type.STRING },
          },
          required: ["videoId", "startTime", "reason"],
        },
      },
    },
  });

  return JSON.parse(response.text || "[]");
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}
