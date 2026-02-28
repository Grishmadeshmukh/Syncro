export interface VideoClip {
  id: string;
  file: File;
  url: string;
  duration: number;
  startTime: number; // Start time in the overall timeline
  name: string;
  analysis?: string;
}

export interface Voiceover {
  file: File;
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
