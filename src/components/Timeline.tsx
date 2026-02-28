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
  onVoiceoverChange?: (voiceover: Voiceover) => void;
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

type TrimSide = 'left' | 'right';
interface TrimDragState {
  id: string;
  side: TrimSide;
  startMouseX: number;
  // snapshot values at drag start
  origTrimStart: number;
  origTrimmedDuration: number;
  origDuration: number;
  origStartTime: number;
}

export const Timeline: React.FC<TimelineProps> = ({
  voiceover,
  videoClips,
  onVideoClipChange,
  onAutoAlign,
  isAligning,
  currentTime,
  onTimeUpdate,
  onVoiceoverChange,
}) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const trackAreaRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  // Incoming: full drag state management
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null);
  const [draggingTrimId, setDraggingTrimId] = useState<string | null>(null);
  const clipDragRef = useRef<ClipDragState | null>(null);
  const trimDragRef = useRef<TrimDragState | null>(null);
  const voiceoverDragRef = useRef<{ startMouseX: number; startClipTime: number } | null>(null);
  const videoClipsRef = useRef(videoClips);
  const voiceoverRef = useRef(voiceover);
  const [isDraggingVoiceover, setIsDraggingVoiceover] = useState(false);
  const currentTimeRef = useRef(currentTime);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const pixelsPerSecond = 50;
  const TRACK_PADDING = 32; // px (p-8 = 2rem = 32px)

  // Keep ref in sync so drag handlers always see fresh clips without stale closure
  useEffect(() => {
    videoClipsRef.current = videoClips;
  }, [videoClips]);

  useEffect(() => {
    voiceoverRef.current = voiceover;
  }, [voiceover]);

  // Effective voiceover duration respects trimStart/trimEnd
  const voiceoverEffectiveDuration = voiceover
    ? (voiceover.trimEnd ?? voiceover.duration) - (voiceover.trimStart ?? 0)
    : 0;

  const totalDuration = Math.max(
    (voiceover?.startTime ?? 0) + voiceoverEffectiveDuration,
    ...videoClips.map((c) => c.startTime + (c.trimmedDuration ?? c.duration)),
    10
  );

  const seekToTime = useCallback((time: number) => {
    const clamped = Math.max(0, Math.min(time, totalDuration));
    onTimeUpdate(clamped);
    if (wavesurfer.current && voiceover) {
      const vStartTime = voiceover.startTime ?? 0;
      const vTrimStart = voiceover.trimStart ?? 0;
      const vDuration = voiceover.trimEnd ? voiceover.trimEnd - vTrimStart : voiceover.duration - vTrimStart;
      const relative = clamped - vStartTime;

      if (relative < 0) {
        wavesurfer.current.seekTo(vTrimStart / voiceover.duration);
      } else if (relative > vDuration) {
        wavesurfer.current.seekTo((vTrimStart + vDuration) / voiceover.duration);
      } else {
        wavesurfer.current.seekTo((vTrimStart + relative) / voiceover.duration);
      }
    }
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
        // Original: violet colors to match app theme
        waveColor: '#8b5cf6',
        progressColor: '#a78bfa',
        cursorColor: '#ffffff',
        barWidth: 2,
        barRadius: 3,
        height: 80,
        interact: false,
        url: voiceover.url,
      });

      // Once audio is decoded, seek to trimStart so playback and progress
      // both start at the correct offset within the original audio file
      wavesurfer.current.on('ready', () => {
        const trimStart = voiceover.trimStart ?? 0;
        if (trimStart > 0) {
          wavesurfer.current?.seekTo(trimStart / voiceover.duration);
        }
      });

      return () => {
        wavesurfer.current?.destroy();
        wavesurfer.current = null;
      };
    }
  }, [voiceover]);

  // ── Universal Clock ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) {
      if (wavesurfer.current?.isPlaying()) {
        wavesurfer.current.pause();
      }
      return;
    }

    let frameId: number;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      const nextTime = currentTimeRef.current + delta;

      if (nextTime >= totalDuration) {
        setIsPlaying(false);
        onTimeUpdate(totalDuration);
        if (wavesurfer.current?.isPlaying()) wavesurfer.current.pause();
        return;
      }

      onTimeUpdate(nextTime);

      if (wavesurfer.current && voiceover) {
        const vStartTime = voiceover.startTime ?? 0;
        const vTrimStart = voiceover.trimStart ?? 0;
        const vDuration = voiceover.trimEnd ? voiceover.trimEnd - vTrimStart : voiceover.duration - vTrimStart;

        const relative = nextTime - vStartTime;
        if (relative >= 0 && relative < vDuration) {
          if (!wavesurfer.current.isPlaying()) {
            const pos = (vTrimStart + relative) / voiceover.duration;
            wavesurfer.current.seekTo(pos);
            wavesurfer.current.play().catch(() => { });
          }
        } else {
          if (wavesurfer.current.isPlaying()) {
            wavesurfer.current.pause();
          }
        }
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, totalDuration, onTimeUpdate, voiceover]);

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

  // ── Voiceover drag ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDraggingVoiceover) return;

    const onMove = (e: MouseEvent) => {
      const drag = voiceoverDragRef.current;
      const currentVo = voiceoverRef.current;
      if (!drag || !currentVo) return;

      const deltaX = e.clientX - drag.startMouseX;
      const deltaTime = deltaX / pixelsPerSecond;
      const newStart = Math.max(0, drag.startClipTime + deltaTime);

      if (onVoiceoverChange) {
        onVoiceoverChange({ ...currentVo, startTime: newStart });
      }
    };

    const onUp = () => {
      voiceoverDragRef.current = null;
      setIsDraggingVoiceover(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDraggingVoiceover, onVoiceoverChange]);

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
      const clipEffective = clip.trimmedDuration ?? (clip.duration - (clip.trimStart ?? 0));
      const next = sorted[i + 1];
      if (next && clip.startTime + clipEffective > next.startTime) {
        const trimmed = Math.max(0, next.startTime - clip.startTime);
        return { ...clip, trimmedDuration: trimmed };
      }
      // Don't clear trimmedDuration if it was set by the user via the trim handles
      return clip;
    });
  };

  // ── Trim handle drag ─────────────────────────────────────────────────────
  const handleTrimHandleMouseDown = (e: React.MouseEvent, clip: VideoClip, side: TrimSide) => {
    e.stopPropagation();
    e.preventDefault();
    trimDragRef.current = {
      id: clip.id,
      side,
      startMouseX: e.clientX,
      origTrimStart: clip.trimStart ?? 0,
      origTrimmedDuration: clip.trimmedDuration ?? (clip.duration - (clip.trimStart ?? 0)),
      origDuration: clip.duration,
      origStartTime: clip.startTime,
    };
    setDraggingTrimId(clip.id);
  };

  const togglePlay = () => setIsPlaying((p: boolean) => !p);

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

  const handleVoiceoverMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!voiceover) return;
    voiceoverDragRef.current = {
      startMouseX: e.clientX,
      startClipTime: voiceover.startTime ?? 0,
    };
    setIsDraggingVoiceover(true);
  };

  // ── Trim drag effect ────────────────────────────────────────────────────
  useEffect(() => {
    if (!draggingTrimId) return;

    const onMove = (e: MouseEvent) => {
      const drag = trimDragRef.current;
      if (!drag) return;
      const deltaX = e.clientX - drag.startMouseX;
      const deltaSec = deltaX / pixelsPerSecond;

      const clips = videoClipsRef.current;
      const updated = clips.map((c: VideoClip) => {
        if (c.id !== drag.id) return c;
        if (drag.side === 'right') {
          // Right handle: shrink/grow trimmedDuration
          const newDuration = Math.max(0.5, Math.min(
            drag.origTrimmedDuration + deltaSec,
            drag.origDuration - drag.origTrimStart
          ));
          return { ...c, trimmedDuration: newDuration };
        } else {
          // Left handle: push trimStart forward (clip gets shorter from the left)
          const maxShift = drag.origTrimmedDuration - 0.5;
          const clamped = Math.max(0, Math.min(deltaSec, maxShift));
          const newTrimStart = drag.origTrimStart + clamped;
          const newStartTime = Math.max(0, drag.origStartTime + clamped);
          const newTrimmedDuration = drag.origTrimmedDuration - clamped;
          return {
            ...c,
            trimStart: newTrimStart > 0 ? newTrimStart : undefined,
            startTime: newStartTime,
            trimmedDuration: newTrimmedDuration,
          };
        }
      });
      onVideoClipChange(updated);
    };

    const onUp = () => {
      trimDragRef.current = null;
      setDraggingTrimId(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingTrimId]);

  const sortedClips = [...videoClips].sort((a, b) => a.startTime - b.startTime);

  return (
    <div className="bg-black/90 border border-violet-800/40 rounded-2xl overflow-hidden shadow-sm">
      <div className="p-4 border-b border-violet-800/40 flex items-center justify-between bg-black/80">
        <div className="flex items-center gap-4">
          <button
            onClick={togglePlay}
            className="p-2 rounded-full bg-violet-600 text-white hover:bg-violet-500 transition-colors"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <div className="text-sm font-mono text-violet-400">
            {currentTime.toFixed(2)}s / {totalDuration.toFixed(2)}s
          </div>
        </div>
        <button
          onClick={onAutoAlign}
          disabled={isAligning || !voiceover || videoClips.length === 0}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all",
            "bg-violet-500 text-white hover:bg-violet-400 disabled:opacity-50 disabled:cursor-not-allowed",
            isAligning && "animate-pulse"
          )}
        >
          <Wand2 className="w-4 h-4" />
          {isAligning ? "Analyzing..." : "Auto-Align with AI"}
        </button>
      </div>

      {/* Main scrollable timeline area */}
      <div
        ref={trackAreaRef}
        className={cn(
          "relative overflow-x-auto p-8 min-h-[300px] bg-black/70",
          isDraggingPlayhead && "cursor-ew-resize select-none"
        )}
        onClick={handleTrackClick}
      >
        {/* Time Markers — click on track area to seek */}
        <div className="absolute top-0 left-8 right-8 h-6 border-b border-violet-700/50 flex items-end pointer-events-none">
          {Array.from({ length: Math.ceil(totalDuration) + 5 }).map((_, i) => (
            <div
              key={i}
              className="absolute border-l border-violet-700/50 h-2"
              style={{ left: `${i * pixelsPerSecond}px` }}
            >
              <span className="absolute -top-5 left-1 text-[10px] text-violet-500 font-mono">
                {i}s
              </span>
            </div>
          ))}
        </div>

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-px bg-violet-400 pointer-events-none"
          style={{ left: `${TRACK_PADDING + currentTime * pixelsPerSecond}px`, zIndex: 50 }}
        >
          <div
            className="absolute top-0 -left-1.5 w-3 h-3 bg-violet-400 rounded-full cursor-ew-resize pointer-events-auto"
            onMouseDown={(e) => { e.stopPropagation(); setIsDraggingPlayhead(true); }}
          />
        </div>

        {/* Stacked timeline rows */}
        <div
          className="relative mt-8 space-y-4"
          style={{ width: `${(totalDuration + 5) * pixelsPerSecond}px` }}
        >
          {/* Row 1: Voiceover waveform track — draggable, width = effective (trimmed) duration */}
          <div
            className={cn(
              "relative h-20 bg-black/50 rounded-xl border border-violet-700/40 overflow-hidden",
              "cursor-grab active:cursor-grabbing",
              isDraggingVoiceover && "ring-2 ring-violet-500/30 shadow-lg opacity-90"
            )}
            onMouseDown={handleVoiceoverMouseDown}
            style={{
              width: voiceover
                ? `${voiceoverEffectiveDuration * pixelsPerSecond}px`
                : '100%',
              left: voiceover ? `${(voiceover.startTime ?? 0) * pixelsPerSecond}px` : 0,
            }}
          >
            {/*
              Inner WaveSurfer container: full audio width, shifted left by trimStart
              so only the trimmed window is visible through overflow-hidden.
              WaveSurfer measures this div's clientWidth to size its canvas,
              giving us exactly 1 pixel per (1/pps) second — matching the ruler.
            */}
            <div
              ref={waveformRef}
              className="absolute top-0 bottom-0 opacity-50"
              style={{
                width: voiceover ? `${voiceover.duration * pixelsPerSecond}px` : '100%',
                left: voiceover ? `-${(voiceover.trimStart ?? 0) * pixelsPerSecond}px` : 0,
              }}
            />
            <div className="absolute top-2 left-2 text-[10px] uppercase tracking-wider font-bold text-violet-400 pointer-events-none z-10">
              Voiceover Track
            </div>
          </div>

          {/* Row 2: Video clips track — single lane */}
          <div className="relative h-16">
            {sortedClips.map((clip, sortIndex) => {
              const effectiveDuration = clip.trimmedDuration ?? clip.duration;
              const isActive =
                currentTime >= clip.startTime &&
                currentTime < clip.startTime + effectiveDuration;
              const isDragging = draggingClipId === clip.id;
              const zIndex = isDragging ? 100 : sortIndex + 1;

              const isTrimDragging = draggingTrimId === clip.id;

              return (
                <div
                  key={clip.id}
                  data-clip="true"
                  onMouseDown={(e) => handleClipMouseDown(e, clip)}
                  className={cn(
                    "absolute h-full rounded-xl border flex flex-col justify-center px-3 select-none group/clip",
                    "cursor-grab active:cursor-grabbing",
                    isActive
                      ? "bg-violet-800/70 border-violet-400 ring-2 ring-violet-400/30 shadow-md"
                      : "bg-violet-800/50 border-violet-600/50 shadow-sm hover:shadow-md hover:border-violet-500",
                    (isDragging || isTrimDragging) && "shadow-xl ring-2 ring-violet-400/40 opacity-90"
                  )}
                  style={{
                    left: `${clip.startTime * pixelsPerSecond}px`,
                    width: `${effectiveDuration * pixelsPerSecond}px`,
                    zIndex,
                  }}
                >
                  {/* Left trim handle */}
                  <div
                    data-trim-handle="left"
                    onMouseDown={(e) => handleTrimHandleMouseDown(e, clip, 'left')}
                    className={cn(
                      "absolute left-0 top-0 bottom-0 w-2.5 flex items-center justify-center",
                      "cursor-col-resize rounded-l-xl z-10",
                      "opacity-0 group-hover/clip:opacity-100 transition-opacity",
                      "bg-violet-500/80 hover:bg-violet-500"
                    )}
                  >
                    <div className="w-0.5 h-4 bg-white/70 rounded-full" />
                  </div>

                  <div className="flex items-center gap-2 overflow-hidden">
                    <Video className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    <span className="text-xs font-medium text-violet-200 truncate">{clip.name}</span>
                  </div>
                  {(clip.trimmedDuration !== undefined || clip.trimStart !== undefined) && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Scissors className="w-3 h-3 text-orange-400 shrink-0" />
                      <span className="text-[10px] text-orange-400 font-medium">
                        {effectiveDuration.toFixed(1)}s / {clip.duration.toFixed(1)}s
                      </span>
                    </div>
                  )}
                  {clip.analysis && clip.trimmedDuration === undefined && clip.trimStart === undefined && (
                    <div className="text-[10px] text-violet-500 truncate mt-0.5 italic">{clip.analysis}</div>
                  )}

                  {/* Right trim handle */}
                  <div
                    data-trim-handle="right"
                    onMouseDown={(e) => handleTrimHandleMouseDown(e, clip, 'right')}
                    className={cn(
                      "absolute right-0 top-0 bottom-0 w-2.5 flex items-center justify-center",
                      "cursor-col-resize rounded-r-xl z-10",
                      "opacity-0 group-hover/clip:opacity-100 transition-opacity",
                      "bg-orange-400/80 hover:bg-orange-400"
                    )}
                  >
                    <div className="w-0.5 h-4 bg-white/70 rounded-full" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
