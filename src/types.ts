export type WorkflowMode = 'upload-both' | 'script-video' | 'video-only';

export interface VideoClip {
  id: string;
  file: File;
  url: string;
  duration: number;         // original file duration (never mutated)
  trimmedDuration?: number; // effective display/playback duration after right-trim
  trimStart?: number;       // seconds into the original file to start playback (default 0)
  startTime: number;        // start time in the overall timeline
  name: string;
  analysis?: string;
  textOverlay?: string;     // optional caption shown in preview while clip is active
}

export interface Voiceover {
  file?: File;              // undefined for AI-generated audio
  url: string;
  duration: number;         // full original duration
  trimStart?: number;       // seconds into the audio to begin playback (default 0)
  trimEnd?: number;         // seconds into the audio to stop playback (default = duration)
  transcription?: string;
  segments?: Array<{
    text: string;
    start: number;
    end: number;
  }>;
  startTime?: number;
}

export interface AlignmentResult {
  videoId: string;
  startTime: number;
  reason: string;
}
