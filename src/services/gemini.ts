import { GoogleGenAI, Type } from "@google/genai";

function getAI() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
}

/** Convert raw PCM base64 (24kHz 16-bit mono) to a playable WAV blob URL */
function pcmBase64ToWavUrl(pcmBase64: string, sampleRate = 24000): string {
  const pcm = Uint8Array.from(atob(pcmBase64), (c) => c.charCodeAt(0));
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const enc = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  enc(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); enc(8, 'WAVE');
  enc(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, numChannels, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, byteRate, true); v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitsPerSample, true);
  enc(36, 'data'); v.setUint32(40, dataSize, true);
  new Uint8Array(buf, 44).set(pcm);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function getAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio(url);
    a.onloadedmetadata = () => resolve(a.duration);
    a.onerror = () => resolve(0);
  });
}

/**
 * Mode 2: Generate spoken audio from a script using Gemini TTS.
 * Returns a Voiceover object ready to be used in the timeline.
 */
export async function generateAudioFromScript(
  script: string,
  voiceName = 'Aoede'
): Promise<{ url: string; duration: number; transcription: string }> {
  const response = await getAI().models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ parts: [{ text: script }] }],
    config: {
      responseModalities: ['AUDIO'] as any,
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
      } as any,
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.[0] as any;
  if (!part?.inlineData?.data) throw new Error('No audio returned from TTS');

  const url = pcmBase64ToWavUrl(part.inlineData.data);
  const duration = await getAudioDuration(url);
  return { url, duration, transcription: script };
}

/**
 * Mode 3: Given analyzed video clips, generate a narration script using Gemini,
 * then synthesize it with TTS and return a complete Voiceover.
 */
export async function generateNarrationFromVideos(
  videoClips: Array<{ name: string; analysis: string; duration: number }>,
  voiceName = 'Aoede'
): Promise<{ url: string; duration: number; transcription: string }> {
  const totalDuration = videoClips.reduce((s, c) => s + c.duration, 0);

  const scriptResponse = await getAI().models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `You are a documentary narrator. Based on these video clips, write a natural, engaging narration script.
The total video duration is ${totalDuration.toFixed(1)} seconds — keep your script roughly the same length when spoken at a natural pace.
Do NOT include stage directions, timestamps, or labels. Output only the words to be spoken.

Video clips:
${videoClips.map((c, i) => `Clip ${i + 1} (${c.duration.toFixed(1)}s) — "${c.name}": ${c.analysis}`).join('\n')}`,
  });

  const script = scriptResponse.text?.trim() || 'No narration could be generated.';
  return generateAudioFromScript(script, voiceName);
}

export async function analyzeVoiceover(audioFile: File): Promise<{ transcription: string; segments: Array<{ text: string; start: number; end: number }> }> {
  const base64Audio = await fileToBase64(audioFile);

  // First, get the actual duration so we can validate/clamp timestamps
  const audioBlobUrl = URL.createObjectURL(audioFile);
  const totalDuration = await getAudioDuration(audioBlobUrl);
  URL.revokeObjectURL(audioBlobUrl);

  const response = await getAI().models.generateContent({
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
          text: `You are a precise audio transcription tool. Listen to this audio file carefully.

The audio is exactly ${totalDuration.toFixed(2)} seconds long.

Transcribe every spoken word and split the transcript into natural sentence or phrase segments.
For each segment provide the EXACT start and end time in seconds (use decimals, e.g. 3.45).
- The first segment must start at or very close to 0.00
- The last segment must end at or very close to ${totalDuration.toFixed(2)}
- Segments must NOT overlap and must be in chronological order
- Times must be realistic — do not guess; listen carefully to when speech starts and stops

Return a JSON array of segments. Each segment has:
- "text": the spoken words in that segment
- "start": start time in seconds (number)
- "end": end time in seconds (number)`,
        },
      ],
    },
    config: {
      temperature: 0,
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

  let segments: Array<{ text: string; start: number; end: number }> = JSON.parse(response.text || "[]");

  // Clamp and sort just in case
  segments = segments
    .sort((a, b) => a.start - b.start)
    .map(s => ({
      ...s,
      start: Math.max(0, Math.min(s.start, totalDuration)),
      end: Math.max(0, Math.min(s.end, totalDuration)),
    }));

  const transcription = segments.map(s => s.text).join(" ");
  return { transcription, segments };
}

export async function analyzeVideo(videoFile: File): Promise<string> {
  const base64Video = await fileToBase64(videoFile);
  
  const response = await getAI().models.generateContent({
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
  videoClips: Array<{ id: string; name: string; analysis: string; duration?: number }>
): Promise<Array<{ videoId: string; startTime: number; reason: string }>> {
  const totalVoiceDuration = voiceoverSegments.length > 0
    ? voiceoverSegments[voiceoverSegments.length - 1].end
    : 0;

  const prompt = `You are a video editor. You must place each video clip on a timeline that has a voiceover.

VOICEOVER SEGMENTS (text with exact start/end times in seconds):
${voiceoverSegments.map(s => `  [${s.start.toFixed(2)}s – ${s.end.toFixed(2)}s] "${s.text}"`).join('\n')}

Total voiceover duration: ${totalVoiceDuration.toFixed(2)} seconds

VIDEO CLIPS (each must be placed exactly once):
${videoClips.map(c => `  id=${c.id} | name="${c.name}" | duration=${(c.duration ?? 0).toFixed(2)}s | content: ${c.analysis}`).join('\n')}

RULES:
1. For each clip, pick the startTime (in seconds) that best matches the voiceover content at that moment.
2. The startTime must be >= 0 and the clip must finish before or at ${totalVoiceDuration.toFixed(2)}s (i.e. startTime <= ${totalVoiceDuration.toFixed(2)} - clip.duration).
3. Clips MUST NOT overlap in time. Check: if clip A starts at T_a with duration D_a, and clip B starts at T_b, then T_b >= T_a + D_a (or T_a >= T_b + D_b).
4. Place clips in ascending order of startTime; earlier content in the voiceover = earlier clip.
5. Use the voiceover segment timestamps as anchor points — a clip about topic X should start near when the voiceover first mentions X.

Return a JSON array with one object per clip containing "videoId", "startTime" (seconds, number), and "reason" (brief explanation).`;

  const response = await getAI().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      temperature: 0,
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

  const results: Array<{ videoId: string; startTime: number; reason: string }> = JSON.parse(response.text || "[]");

  // Clamp start times to valid range
  return results.map(r => {
    const clip = videoClips.find(c => c.id === r.videoId);
    const maxStart = Math.max(0, totalVoiceDuration - (clip?.duration ?? 0));
    return { ...r, startTime: Math.max(0, Math.min(r.startTime, maxStart)) };
  });
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
