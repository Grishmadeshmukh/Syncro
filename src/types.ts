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

export interface Chapter {
  time: number;
  label: string;
}

export interface VideoDescription {
  summary: string;
  chapters: Chapter[];
  hashtags: string[];
}

export type CaptionMode = 'lower-third' | 'word-highlight' | 'speaker-labeled';

export interface CaptionStyle {
  mode: CaptionMode;
  fontSize: number;
  color: string;
  bgColor: string;
  position: 'bottom' | 'top';
}

export interface ThumbnailCandidate {
  id: string;
  timestamp: number;
  quote: string;
  reason: string;
  imageDataUrl: string;
}
