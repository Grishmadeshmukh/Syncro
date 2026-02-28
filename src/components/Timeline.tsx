import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { VideoClip, Voiceover } from '../types';
import { Play, Pause, Scissors, Wand2, Video } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface TimelineProps {
  voiceover: Voiceover | null;
  videoClips: VideoClip[];
  onVideoClipChange: (clips: VideoClip[]) => void;
  onAutoAlign: () => void;
  isAligning: boolean;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
}

// Shared drag state kept in a ref to avoid re-render overhead
interface ClipDragState {
  id: string;
  startMouseX: number;
  startClipTime: number;
}

export const Timeline: React.FC<TimelineProps> = ({
  voiceover,
  videoClips,
  onVideoClipChange,
  onAutoAlign,
  isAligning,
  currentTime,
  onTimeUpdate,
}) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const trackAreaRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null);
  const clipDragRef = useRef<ClipDragState | null>(null);
  const videoClipsRef = useRef(videoClips);
  // Suppress WaveSurfer timeupdate while user is actively scrubbing
  const isScrubbing = useRef(false);

  const pixelsPerSecond = 50;
  const TRACK_PADDING = 32; // px (p-8 = 2rem = 32px)

  // Keep ref in sync so drag handlers always see fresh clips without stale closure
  useEffect(() => {
    videoClipsRef.current = videoClips;
  }, [videoClips]);

  const totalDuration = Math.max(
    voiceover?.duration || 0,
    ...videoClips.map((c) => c.startTime + (c.trimmedDuration ?? c.duration)),
    10
  );

  const seekToTime = useCallback((time: number) => {
    const clamped = Math.max(0, Math.min(time, totalDuration));
    isScrubbing.current = true;
    onTimeUpdate(clamped);
    if (wavesurfer.current && voiceover) {
      wavesurfer.current.seekTo(clamped / voiceover.duration);
    }
    // Allow timeupdate to resume after the seek settles
    setTimeout(() => { isScrubbing.current = false; }, 50);
  }, [onTimeUpdate, totalDuration, voiceover]);

  const getXFromMouseEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!trackAreaRef.current) return 0;
    const rect = trackAreaRef.current.getBoundingClientRect();
    return e.clientX - rect.left + trackAreaRef.current.scrollLeft - TRACK_PADDING;
  }, []);

  const getTimeFromX = useCallback((x: number) => x / pixelsPerSecond, []);

  // ── WaveSurfer setup ─────────────────────────────────────────────────────
  useEffect(() => {
    if (waveformRef.current && voiceover) {
      wavesurfer.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#10b981',
        progressColor: '#059669',
        cursorColor: 'transparent',
        barWidth: 2,
        barRadius: 3,
        height: 80,
        interact: false,
        url: voiceover.url,
      });

      wavesurfer.current.on('timeupdate', (time) => {
        if (!isScrubbing.current) onTimeUpdate(time);
      });
      wavesurfer.current.on('play', () => setIsPlaying(true));
      wavesurfer.current.on('pause', () => setIsPlaying(false));

      return () => {
        wavesurfer.current?.destroy();
        wavesurfer.current = null;
      };
    }
  }, [voiceover]);

  // ── Playhead drag ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDraggingPlayhead) return;
    const onMove = (e: MouseEvent) => seekToTime(getTimeFromX(getXFromMouseEvent(e)));
    const onUp = () => setIsDraggingPlayhead(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDraggingPlayhead, seekToTime, getXFromMouseEvent, getTimeFromX]);

  // ── Clip drag ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!draggingClipId) return;

    const onMove = (e: MouseEvent) => {
      const drag = clipDragRef.current;
      if (!drag) return;
      const deltaX = e.clientX - drag.startMouseX;
      const deltaTime = deltaX / pixelsPerSecond;
      const newStart = Math.max(0, drag.startClipTime + deltaTime);
      const updated = videoClipsRef.current.map((c) =>
        c.id === drag.id ? { ...c, startTime: newStart } : c
      );
      onVideoClipChange(updated);
    };

    const onUp = () => {
      clipDragRef.current = null;
      setDraggingClipId(null);
      // Resolve overlaps on release
      onVideoClipChange(resolveOverlaps(videoClipsRef.current));
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingClipId]);

  const resolveOverlaps = (clips: VideoClip[]): VideoClip[] => {
    const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
    return sorted.map((clip, i) => {
      const next = sorted[i + 1];
      if (next && clip.startTime + clip.duration > next.startTime) {
        const trimmed = Math.max(0, next.startTime - clip.startTime);
        return { ...clip, trimmedDuration: trimmed };
      }
      return { ...clip, trimmedDuration: undefined };
    });
  };

  const togglePlay = () => wavesurfer.current?.playPause();

  const handleTrackClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-clip]')) return;
    seekToTime(getTimeFromX(getXFromMouseEvent(e)));
  };

  const handleClipMouseDown = (e: React.MouseEvent, clip: VideoClip) => {
    e.stopPropagation();
    e.preventDefault();
    clipDragRef.current = {
      id: clip.id,
      startMouseX: e.clientX,
      startClipTime: clip.startTime,
    };
    setDraggingClipId(clip.id);
  };

  const sortedClips = [...videoClips].sort((a, b) => a.startTime - b.startTime);

  return (
    <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
      <div className="p-4 border-b flex items-center justify-between bg-zinc-50/50">
        <div className="flex items-center gap-4">
          <button
            onClick={togglePlay}
            className="p-2 rounded-full bg-zinc-900 text-white hover:bg-zinc-800 transition-colors"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <div className="text-sm font-mono text-zinc-500">
            {currentTime.toFixed(2)}s / {totalDuration.toFixed(2)}s
          </div>
        </div>
        <button
          onClick={onAutoAlign}
          disabled={isAligning || !voiceover || videoClips.length === 0}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all",
            "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed",
            isAligning && "animate-pulse"
          )}
        >
          <Wand2 className="w-4 h-4" />
          {isAligning ? "Analyzing..." : "Auto-Align with AI"}
        </button>
      </div>

      <div
        ref={trackAreaRef}
        className="relative overflow-x-auto p-8 bg-zinc-50/30 cursor-crosshair"
        style={{ minHeight: 300 }}
        onClick={handleTrackClick}
      >
        {/* Time Markers */}
        <div className="absolute top-0 left-8 right-8 h-6 border-b flex items-end pointer-events-none">
          {Array.from({ length: Math.ceil(totalDuration) + 5 }).map((_, i) => (
            <div
              key={i}
              className="absolute border-l border-zinc-200 h-2"
              style={{ left: `${i * pixelsPerSecond}px` }}
            >
              <span className="absolute -top-5 left-1 text-[10px] text-zinc-400 font-mono">
                {i}s
              </span>
            </div>
          ))}
        </div>

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none"
          style={{ left: `${TRACK_PADDING + currentTime * pixelsPerSecond}px`, zIndex: 50 }}
        >
          <div
            className="absolute top-0 -left-2 w-4 h-4 bg-red-500 rounded-full cursor-grab active:cursor-grabbing pointer-events-auto"
            onMouseDown={(e) => { e.stopPropagation(); setIsDraggingPlayhead(true); }}
          />
        </div>

        <div
          className="relative mt-8 space-y-4"
          style={{ width: `${(totalDuration + 5) * pixelsPerSecond}px` }}
        >
          {/* Voiceover waveform track */}
          <div className="relative h-20 bg-emerald-50/50 rounded-xl border border-emerald-100 overflow-hidden">
            <div className="absolute inset-0 opacity-50" ref={waveformRef} />
            <div className="absolute top-2 left-2 text-[10px] uppercase tracking-wider font-bold text-emerald-600 pointer-events-none">
              Voiceover Track
            </div>
          </div>

          {/* Video track — single lane */}
          <div className="relative h-16">
            {sortedClips.map((clip, sortIndex) => {
              const effectiveDuration = clip.trimmedDuration ?? clip.duration;
              const isActive =
                currentTime >= clip.startTime &&
                currentTime < clip.startTime + effectiveDuration;
              const isDragging = draggingClipId === clip.id;
              const zIndex = isDragging ? 100 : sortIndex + 1;

              return (
                <div
                  key={clip.id}
                  data-clip="true"
                  onMouseDown={(e) => handleClipMouseDown(e, clip)}
                  className={cn(
                    "absolute h-full rounded-xl border flex flex-col justify-center px-3 select-none",
                    "cursor-grab active:cursor-grabbing",
                    isActive
                      ? "bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 shadow-md"
                      : "bg-white border-zinc-200 shadow-sm hover:shadow-md hover:border-zinc-400",
                    isDragging && "shadow-xl ring-2 ring-blue-400/40 opacity-90"
                  )}
                  style={{
                    left: `${clip.startTime * pixelsPerSecond}px`,
                    width: `${effectiveDuration * pixelsPerSecond}px`,
                    zIndex,
                  }}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Video className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="text-xs font-medium text-zinc-700 truncate">{clip.name}</span>
                  </div>
                  {clip.trimmedDuration !== undefined && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Scissors className="w-3 h-3 text-orange-400 shrink-0" />
                      <span className="text-[10px] text-orange-400 font-medium">
                        {clip.trimmedDuration.toFixed(1)}s / {clip.duration.toFixed(1)}s
                      </span>
                    </div>
                  )}
                  {clip.analysis && clip.trimmedDuration === undefined && (
                    <div className="text-[10px] text-zinc-400 truncate mt-0.5 italic">{clip.analysis}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
