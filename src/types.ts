export type WorkflowMode = 'upload-both' | 'script-video' | 'video-only';

export interface VideoClip {
  id: string;
  file: File;
  url: string;
  duration: number;         // original file duration (never mutated)
  trimmedDuration?: number; // effective display/playback duration after cuts
  startTime: number;        // start time in the overall timeline
  name: string;
  analysis?: string;
}

export interface Voiceover {
  file?: File;              // undefined for AI-generated audio
  url: string;
  duration: number;
  transcription?: string;
  segments?: Array<{
    text: string;
    start: number;
    end: number;
  }>;
}

export interface AlignmentResult {
  videoId: string;
  startTime: number;
  reason: string;
}
