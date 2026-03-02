import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { VideoClip, Voiceover, TransitionType } from '../types';
import { Play, Pause, Scissors, Wand2, Video, Plus, Zap, Layers, Star, Trash2 } from 'lucide-react';
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
  onSwapClip?: (clipId: string, altId: string) => void;
  onDeleteClip?: (id: string) => void;
  isAligning: boolean;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
}

interface ClipDragState {
  id: string;
  startMouseX: number;
  startClipTime: number;
  startTrack: number;
}

type TrimSide = 'left' | 'right';
interface TrimDragState {
  id: string;
  side: TrimSide;
  startMouseX: number;
  origTrimStart: number;
  origTrimmedDuration: number;
  origDuration: number;
  origStartTime: number;
}

const TRANSITION_OPTIONS: { value: TransitionType; label: string; icon: string }[] = [
  { value: 'cut',      label: 'Cut',      icon: '✂️' },
  { value: 'fade',     label: 'Fade',     icon: '🌅' },
  { value: 'dissolve', label: 'Dissolve', icon: '💧' },
  { value: 'wipe',     label: 'Wipe',     icon: '➡️' },
];

const TRACK_H = 64;
const TRACK_GAP = 16;
const TRACK_ROW_H = TRACK_H + TRACK_GAP;
const TRACK_LABEL_W = 36;

export const Timeline: React.FC<TimelineProps> = ({
  voiceover,
  videoClips,
  onVideoClipChange,
  onAutoAlign,
  onSwapClip,
  onDeleteClip,
  isAligning,
  currentTime,
  onTimeUpdate,
  onVoiceoverChange,
}) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const trackAreaRef = useRef<HTMLDivElement>(null);
  const videoTracksContainerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null);
  const [draggingTrimId, setDraggingTrimId] = useState<string | null>(null);
  const [isDraggingVoiceover, setIsDraggingVoiceover] = useState(false);
  const [extraTracks, setExtraTracks] = useState(0);
  const [transitionPopoverId, setTransitionPopoverId] = useState<string | null>(null);
  const [transitionPopoverPos, setTransitionPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const [altPopover, setAltPopover] = useState<{ clipId: string; x: number; y: number } | null>(null);

  const clipDragRef = useRef<ClipDragState | null>(null);
  const trimDragRef = useRef<TrimDragState | null>(null);
  const voiceoverDragRef = useRef<{ startMouseX: number; startClipTime: number } | null>(null);
  const videoClipsRef = useRef(videoClips);
  const voiceoverRef = useRef(voiceover);
  const currentTimeRef = useRef(currentTime);

  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { videoClipsRef.current = videoClips; }, [videoClips]);
  useEffect(() => { voiceoverRef.current = voiceover; }, [voiceover]);

  const pixelsPerSecond = 50;
  const TRACK_PADDING = TRACK_LABEL_W + 8; // label width + gap-2 (8px) = where lane content starts

  const voiceoverEffectiveDuration = voiceover
    ? (voiceover.trimEnd ?? voiceover.duration) - (voiceover.trimStart ?? 0)
    : 0;

  const totalDuration = Math.max(
    (voiceover?.startTime ?? 0) + voiceoverEffectiveDuration,
    ...videoClips.map((c) => c.startTime + (c.trimmedDuration ?? c.duration)),
    10
  );

  const usedTracks = videoClips.length > 0 ? Math.max(...videoClips.map(c => c.track ?? 0)) + 1 : 1;
  const numTracks = Math.max(2, usedTracks, extraTracks + 1);

  const seekToTime = useCallback((time: number) => {
    const clamped = Math.max(0, Math.min(time, totalDuration));
    onTimeUpdate(clamped);
    if (wavesurfer.current && voiceover) {
      const vStartTime = voiceover.startTime ?? 0;
      const vTrimStart = voiceover.trimStart ?? 0;
      const vDuration = voiceover.trimEnd ? voiceover.trimEnd - vTrimStart : voiceover.duration - vTrimStart;
      const relative = clamped - vStartTime;
      if (relative < 0) wavesurfer.current.seekTo(vTrimStart / voiceover.duration);
      else if (relative > vDuration) wavesurfer.current.seekTo((vTrimStart + vDuration) / voiceover.duration);
      else wavesurfer.current.seekTo((vTrimStart + relative) / voiceover.duration);
    }
  }, [onTimeUpdate, totalDuration, voiceover]);

  const getXFromMouseEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!trackAreaRef.current) return 0;
    const rect = trackAreaRef.current.getBoundingClientRect();
    return e.clientX - rect.left + trackAreaRef.current.scrollLeft - TRACK_PADDING;
  }, [TRACK_PADDING]);

  const getTimeFromX = useCallback((x: number) => x / pixelsPerSecond, []);

  useEffect(() => {
    if (waveformRef.current && voiceover) {
      wavesurfer.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#8b5cf6', progressColor: '#a78bfa', cursorColor: '#ffffff',
        barWidth: 2, barRadius: 3, height: 80, interact: false, url: voiceover.url,
      });
      wavesurfer.current.on('ready', () => {
        const trimStart = voiceover.trimStart ?? 0;
        if (trimStart > 0) wavesurfer.current?.seekTo(trimStart / voiceover.duration);
      });
      return () => { wavesurfer.current?.destroy(); wavesurfer.current = null; };
    }
  }, [voiceover]);

  useEffect(() => {
    if (!isPlaying) { if (wavesurfer.current?.isPlaying()) wavesurfer.current.pause(); return; }
    let frameId: number;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      const nextTime = currentTimeRef.current + delta;
      if (nextTime >= totalDuration) { setIsPlaying(false); onTimeUpdate(totalDuration); if (wavesurfer.current?.isPlaying()) wavesurfer.current.pause(); return; }
      onTimeUpdate(nextTime);
      if (wavesurfer.current && voiceover) {
        const vStartTime = voiceover.startTime ?? 0;
        const vTrimStart = voiceover.trimStart ?? 0;
        const vDuration = voiceover.trimEnd ? voiceover.trimEnd - vTrimStart : voiceover.duration - vTrimStart;
        const relative = nextTime - vStartTime;
        if (relative >= 0 && relative < vDuration) {
          if (!wavesurfer.current.isPlaying()) { wavesurfer.current.seekTo((vTrimStart + relative) / voiceover.duration); wavesurfer.current.play().catch(() => {}); }
        } else { if (wavesurfer.current.isPlaying()) wavesurfer.current.pause(); }
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, totalDuration, onTimeUpdate, voiceover]);

  useEffect(() => {
    if (!isDraggingPlayhead) return;
    const onMove = (e: MouseEvent) => seekToTime(getTimeFromX(getXFromMouseEvent(e)));
    const onUp = () => setIsDraggingPlayhead(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDraggingPlayhead, seekToTime, getXFromMouseEvent, getTimeFromX]);

  useEffect(() => {
    if (!isDraggingVoiceover) return;
    const onMove = (e: MouseEvent) => {
      const drag = voiceoverDragRef.current;
      const currentVo = voiceoverRef.current;
      if (!drag || !currentVo) return;
      const deltaTime = (e.clientX - drag.startMouseX) / pixelsPerSecond;
      if (onVoiceoverChange) onVoiceoverChange({ ...currentVo, startTime: Math.max(0, drag.startClipTime + deltaTime) });
    };
    const onUp = () => { voiceoverDragRef.current = null; setIsDraggingVoiceover(false); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDraggingVoiceover, onVoiceoverChange]);

  useEffect(() => {
    if (!draggingClipId) return;
    const onMove = (e: MouseEvent) => {
      const drag = clipDragRef.current;
      if (!drag) return;
      const newStart = Math.max(0, drag.startClipTime + (e.clientX - drag.startMouseX) / pixelsPerSecond);
      let targetTrack = drag.startTrack;
      if (videoTracksContainerRef.current) {
        const rect = videoTracksContainerRef.current.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        const currentMax = Math.max(1, ...videoClipsRef.current.map(c => c.track ?? 0));
        targetTrack = Math.max(0, Math.min(currentMax + 1, Math.floor(relY / TRACK_ROW_H)));
      }
      onVideoClipChange(videoClipsRef.current.map(c => c.id === drag.id ? { ...c, startTime: newStart, track: targetTrack } : c));
    };
    const onUp = () => { clipDragRef.current = null; setDraggingClipId(null); onVideoClipChange(resolveOverlaps(videoClipsRef.current)); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [draggingClipId]);

  const resolveOverlaps = (clips: VideoClip[]): VideoClip[] => {
    const byTrack: Record<number, VideoClip[]> = {};
    for (const c of clips) { const t = c.track ?? 0; if (!byTrack[t]) byTrack[t] = []; byTrack[t].push(c); }
    const result: VideoClip[] = [];
    for (const track of Object.values(byTrack)) {
      const sorted = [...track].sort((a, b) => a.startTime - b.startTime);
      result.push(...sorted.map((clip, i) => {
        const eff = clip.trimmedDuration ?? (clip.duration - (clip.trimStart ?? 0));
        const next = sorted[i + 1];
        if (next && clip.startTime + eff > next.startTime) return { ...clip, trimmedDuration: Math.max(0, next.startTime - clip.startTime) };
        return clip;
      }));
    }
    return result;
  };

  const handleTrimHandleMouseDown = (e: React.MouseEvent, clip: VideoClip, side: TrimSide) => {
    e.stopPropagation(); e.preventDefault();
    trimDragRef.current = {
      id: clip.id, side, startMouseX: e.clientX,
      origTrimStart: clip.trimStart ?? 0,
      origTrimmedDuration: clip.trimmedDuration ?? (clip.duration - (clip.trimStart ?? 0)),
      origDuration: clip.duration, origStartTime: clip.startTime,
    };
    setDraggingTrimId(clip.id);
  };

  useEffect(() => {
    if (!draggingTrimId) return;
    const onMove = (e: MouseEvent) => {
      const drag = trimDragRef.current;
      if (!drag) return;
      const deltaSec = (e.clientX - drag.startMouseX) / pixelsPerSecond;
      onVideoClipChange(videoClipsRef.current.map((c: VideoClip) => {
        if (c.id !== drag.id) return c;
        if (drag.side === 'right') {
          return { ...c, trimmedDuration: Math.max(0.5, Math.min(drag.origTrimmedDuration + deltaSec, drag.origDuration - drag.origTrimStart)) };
        } else {
          const clamped = Math.max(0, Math.min(deltaSec, drag.origTrimmedDuration - 0.5));
          return { ...c, trimStart: drag.origTrimStart + clamped > 0 ? drag.origTrimStart + clamped : undefined, startTime: Math.max(0, drag.origStartTime + clamped), trimmedDuration: drag.origTrimmedDuration - clamped };
        }
      }));
    };
    const onUp = () => { trimDragRef.current = null; setDraggingTrimId(null); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [draggingTrimId]);

  const togglePlay = () => setIsPlaying(p => !p);
  const handleTrackClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-clip]')) return;
    seekToTime(getTimeFromX(getXFromMouseEvent(e)));
  };
  const handleClipMouseDown = (e: React.MouseEvent, clip: VideoClip) => {
    e.stopPropagation(); e.preventDefault();
    clipDragRef.current = { id: clip.id, startMouseX: e.clientX, startClipTime: clip.startTime, startTrack: clip.track ?? 0 };
    setDraggingClipId(clip.id);
    setTransitionPopoverId(null);
  };
  const handleVoiceoverMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    if (!voiceover) return;
    voiceoverDragRef.current = { startMouseX: e.clientX, startClipTime: voiceover.startTime ?? 0 };
    setIsDraggingVoiceover(true);
  };
  const handleTransitionChange = (clipId: string, type: TransitionType) => {
    onVideoClipChange(videoClips.map(c => c.id === clipId ? { ...c, transitionIn: type } : c));
    setTransitionPopoverId(null);
  };

  const sortedClips = [...videoClips].sort((a, b) => a.startTime - b.startTime);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
        <div className="flex items-center gap-3">
          <button onClick={togglePlay} className="p-2 rounded-full bg-violet-600 text-white hover:bg-violet-500 transition-colors">
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <span className="text-xs font-mono text-gray-400">{currentTime.toFixed(2)}s / {totalDuration.toFixed(2)}s</span>
          <div className="w-px h-4 bg-gray-200" />
          <button
            onClick={() => setExtraTracks(t => t + 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 bg-white border border-gray-200 hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Add Track
          </button>
        </div>
        <button
          onClick={onAutoAlign}
          disabled={isAligning || !voiceover || videoClips.length === 0}
          className={cn('flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all bg-violet-500 text-white hover:bg-violet-400 disabled:opacity-50 disabled:cursor-not-allowed', isAligning && 'animate-pulse')}
        >
          <Wand2 className="w-4 h-4" />
          {isAligning ? 'Analyzing…' : 'Auto-Align with AI'}
        </button>
      </div>

      {/* Scrollable track area */}
      <div
        ref={trackAreaRef}
        className={cn('relative overflow-x-auto bg-gray-50', isDraggingPlayhead && 'cursor-ew-resize select-none')}
        style={{ minHeight: `${28 + 16 + 80 + 16 + numTracks * TRACK_ROW_H + 16}px` }}
        onClick={handleTrackClick}
      >
        <div style={{ width: `${TRACK_PADDING + (totalDuration + 5) * pixelsPerSecond}px`, minWidth: '100%', padding: '8px 32px 16px 0' }}>

          {/* Time Ruler */}
          <div style={{ marginLeft: TRACK_PADDING, height: 28, borderBottom: '1px solid #e5e7eb', position: 'relative' }} className="pointer-events-none">
            {Array.from({ length: Math.ceil(totalDuration) + 5 }).map((_, i) => (
              <div key={i} className="absolute bottom-0 flex flex-col items-start" style={{ left: `${i * pixelsPerSecond}px` }}>
                <span className="text-[10px] text-gray-400 font-mono" style={{ position: 'absolute', top: 2, left: 3 }}>{i}s</span>
                <div className="w-px bg-gray-300" style={{ height: 6 }} />
              </div>
            ))}
          </div>

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-px bg-violet-500 pointer-events-none"
            style={{ left: `${TRACK_PADDING + currentTime * pixelsPerSecond}px`, zIndex: 50 }}
          >
            <div
              className="absolute top-0 -left-1.5 w-3 h-3 bg-violet-500 rounded-full cursor-ew-resize pointer-events-auto"
              onMouseDown={(e) => { e.stopPropagation(); setIsDraggingPlayhead(true); }}
            />
          </div>

          {/* Rows */}
          <div className="mt-2 space-y-4">

            {/* Voiceover row */}
            <div className="flex items-stretch gap-2" style={{ marginLeft: 0 }}>
              <div className="flex items-center justify-center shrink-0" style={{ width: TRACK_LABEL_W }}>
                <span className="text-[9px] font-bold text-violet-400 uppercase tracking-wider">VO</span>
              </div>
              <div
                className={cn('relative h-20 bg-violet-50 rounded-xl border border-violet-200 overflow-hidden cursor-grab active:cursor-grabbing', isDraggingVoiceover && 'ring-2 ring-violet-500/30 shadow-lg opacity-90')}
                onMouseDown={handleVoiceoverMouseDown}
                style={{
                  width: voiceover ? `${voiceoverEffectiveDuration * pixelsPerSecond}px` : `${(totalDuration + 5) * pixelsPerSecond}px`,
                  marginLeft: voiceover ? `${(voiceover.startTime ?? 0) * pixelsPerSecond}px` : 0,
                  flexShrink: 0,
                }}
              >
                <div
                  ref={waveformRef}
                  className="absolute top-0 bottom-0 opacity-50"
                  style={{
                    width: voiceover ? `${voiceover.duration * pixelsPerSecond}px` : '100%',
                    left: voiceover ? `-${(voiceover.trimStart ?? 0) * pixelsPerSecond}px` : 0,
                  }}
                />
                <div className="absolute top-2 left-3 text-[10px] uppercase tracking-wider font-bold text-violet-500 pointer-events-none z-10">Voiceover</div>
              </div>
            </div>

            {/* Video track rows */}
            <div ref={videoTracksContainerRef} className="space-y-4">
              {Array.from({ length: numTracks }).map((_, trackIdx) => {
                const trackClips = sortedClips.filter(c => (c.track ?? 0) === trackIdx);
                return (
                  <div key={trackIdx} className="flex items-center gap-2">
                    {/* Track label */}
                    <div className="flex items-center justify-center shrink-0 rounded-lg border border-gray-200 bg-white" style={{ width: TRACK_LABEL_W, height: TRACK_H }}>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">V{trackIdx + 1}</span>
                    </div>

                    {/* Lane */}
                    <div className="relative" style={{ height: TRACK_H, width: `${(totalDuration + 5) * pixelsPerSecond}px`, flexShrink: 0 }}>
                      <div className="absolute inset-0 rounded-xl border border-dashed border-gray-200 bg-white/50" />

                      {trackClips.map((clip) => {
                        const effectiveDuration = clip.trimmedDuration ?? clip.duration;
                        const isActive = currentTime >= clip.startTime && currentTime < clip.startTime + effectiveDuration;
                        const isDragging = draggingClipId === clip.id;
                        const isTrimDragging = draggingTrimId === clip.id;

                        return (
                          <React.Fragment key={clip.id}>
                            <div
                              data-clip="true"
                              onMouseDown={(e) => handleClipMouseDown(e, clip)}
                              className={cn(
                                'absolute h-full rounded-xl border flex flex-col justify-center px-3 select-none group/clip cursor-grab active:cursor-grabbing',
                                isActive ? 'bg-violet-600 border-violet-700 ring-2 ring-violet-300/50 shadow-md' : 'bg-violet-100 border-violet-300 shadow-sm hover:shadow-md hover:border-violet-400',
                                (isDragging || isTrimDragging) && 'shadow-xl ring-2 ring-violet-400/40 opacity-90'
                              )}
                              style={{ left: `${clip.startTime * pixelsPerSecond}px`, width: `${effectiveDuration * pixelsPerSecond}px`, zIndex: isDragging ? 100 : 2 }}
                            >
                              {/* Left trim */}
                              <div
                                data-trim-handle="left"
                                onMouseDown={(e) => handleTrimHandleMouseDown(e, clip, 'left')}
                                className="absolute left-0 top-0 bottom-0 w-2.5 flex items-center justify-center cursor-col-resize rounded-l-xl z-10 opacity-0 group-hover/clip:opacity-100 transition-opacity bg-violet-500/80 hover:bg-violet-500"
                              >
                                <div className="w-0.5 h-4 bg-white/70 rounded-full" />
                              </div>

                              <div className="flex items-center gap-2 overflow-hidden">
                                <Video className="w-3.5 h-3.5 shrink-0" style={{ color: isActive ? 'white' : '#7c3aed' }} />
                                <span className="text-xs font-medium truncate" style={{ color: isActive ? 'white' : '#5b21b6' }}>{clip.name}</span>
                              </div>
                              {(clip.trimmedDuration !== undefined || clip.trimStart !== undefined) && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <Scissors className="w-3 h-3 text-orange-400 shrink-0" />
                                  <span className="text-[10px] text-orange-400 font-medium">{effectiveDuration.toFixed(1)}s</span>
                                </div>
                              )}
                              {clip.analysis && clip.trimmedDuration === undefined && clip.trimStart === undefined && (
                                <div className="text-[10px] truncate mt-0.5 italic" style={{ color: isActive ? 'rgba(255,255,255,0.7)' : '#8b5cf6' }}>{clip.analysis}</div>
                              )}

                              {/* Right trim */}
                              <div
                                data-trim-handle="right"
                                onMouseDown={(e) => handleTrimHandleMouseDown(e, clip, 'right')}
                                className="absolute right-0 top-0 bottom-0 w-2.5 flex items-center justify-center cursor-col-resize rounded-r-xl z-10 opacity-0 group-hover/clip:opacity-100 transition-opacity bg-orange-400/80 hover:bg-orange-400"
                              >
                                <div className="w-0.5 h-4 bg-white/70 rounded-full" />
                              </div>

                              {/* Delete button */}
                              {onDeleteClip && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onDeleteClip(clip.id); }}
                                  title="Remove clip"
                                  className="absolute bottom-1.5 right-8 w-4 h-4 rounded-full flex items-center justify-center z-10 opacity-0 group-hover/clip:opacity-100 transition-all bg-red-400/80 hover:bg-red-500"
                                >
                                  <Trash2 className="w-2.5 h-2.5 text-white" />
                                </button>
                              )}

                              {/* Alternatives button (Star) — shown when AI gave suggestions */}
                              {clip.alternatives && clip.alternatives.length > 0 && onSwapClip && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (altPopover?.clipId === clip.id) {
                                      setAltPopover(null);
                                    } else {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setAltPopover({ clipId: clip.id, x: rect.left, y: rect.bottom + 6 });
                                      setTransitionPopoverId(null);
                                    }
                                  }}
                                  title="Alternative clip suggestions"
                                  className={cn(
                                    'absolute top-1.5 right-8 w-4 h-4 rounded-full flex items-center justify-center z-10 transition-all opacity-0 group-hover/clip:opacity-100',
                                    altPopover?.clipId === clip.id ? 'opacity-100 bg-amber-400' : 'bg-amber-300 hover:bg-amber-400'
                                  )}
                                >
                                  <Star className="w-2.5 h-2.5 text-white fill-white" />
                                </button>
                              )}
                            </div>

                            {/* Transition badge between adjacent clips */}
                            {(() => {
                              const nextOnTrack = trackClips.find(c2 => c2.id !== clip.id && Math.abs(c2.startTime - (clip.startTime + effectiveDuration)) < 0.5);
                              if (!nextOnTrack) return null;
                              const transitionType = nextOnTrack.transitionIn ?? 'cut';
                              const x = (clip.startTime + effectiveDuration) * pixelsPerSecond;
                              return (
                                <div key={`tr-${clip.id}`} className="absolute z-20 flex flex-col items-center justify-center" style={{ left: x - 14, top: 0, height: TRACK_H, width: 28 }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (transitionPopoverId === nextOnTrack.id) {
                                        setTransitionPopoverId(null);
                                        setTransitionPopoverPos(null);
                                      } else {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setTransitionPopoverId(nextOnTrack.id);
                                        setTransitionPopoverPos({ x: rect.left - 40, y: rect.bottom + 6 });
                                      }
                                      setAltPopover(null);
                                    }}
                                    title={`Transition: ${transitionType}`}
                                    className={cn(
                                      'w-7 h-7 rounded-full border-2 flex items-center justify-center shadow-sm transition-all',
                                      transitionType === 'cut' ? 'bg-white border-gray-300 hover:border-violet-400 text-gray-500' : 'bg-violet-600 border-violet-700 text-white hover:bg-violet-500'
                                    )}
                                  >
                                    {transitionType === 'cut' ? <Zap className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
                                  </button>
                                </div>
                              );
                            })()}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {(transitionPopoverId || altPopover) && (
        <div className="fixed inset-0 z-40" onClick={() => { setTransitionPopoverId(null); setTransitionPopoverPos(null); setAltPopover(null); }} />
      )}

      {/* Transition type picker — fixed position so it escapes the scroll container */}
      {transitionPopoverId && transitionPopoverPos && (() => {
        const targetClip = videoClips.find(c => c.id === transitionPopoverId);
        if (!targetClip) return null;
        return (
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-1.5 w-36"
            style={{ left: transitionPopoverPos.x, top: transitionPopoverPos.y }}
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider px-2 pb-1">Transition</p>
            {TRANSITION_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { handleTransitionChange(transitionPopoverId, opt.value); setTransitionPopoverPos(null); }}
                className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors', (targetClip.transitionIn ?? 'cut') === opt.value ? 'bg-violet-50 text-violet-700' : 'text-gray-600 hover:bg-gray-50')}
              >
                <span>{opt.icon}</span>
                {opt.label}
                {(targetClip.transitionIn ?? 'cut') === opt.value && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-500" />}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Alternative clip suggestions — fixed position popover */}
      {altPopover && onSwapClip && (() => {
        const clip = videoClips.find(c => c.id === altPopover.clipId);
        if (!clip?.alternatives || clip.alternatives.length === 0) return null;
        return (
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-2 w-56"
            style={{ left: altPopover.x, top: altPopover.y, maxWidth: 'calc(100vw - 16px)' }}
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider px-1 pb-1.5">Alternative suggestions</p>
            {clip.alternatives.map(alt => {
              const altClip = videoClips.find(c => c.id === alt.id);
              if (!altClip) return null;
              return (
                <button
                  key={alt.id}
                  onClick={() => { onSwapClip(clip.id, alt.id); setAltPopover(null); }}
                  className="w-full text-left px-2 py-2 rounded-lg hover:bg-violet-50 transition-colors group/alt"
                >
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-xs font-semibold text-gray-700 truncate group-hover/alt:text-violet-700">{altClip.name}</span>
                    <span className="text-[10px] font-bold text-violet-500 shrink-0">{Math.round(alt.confidence * 100)}%</span>
                  </div>
                  {/* Confidence bar */}
                  <div className="h-1 rounded-full bg-gray-100 mb-1">
                    <div className="h-full rounded-full bg-violet-400" style={{ width: `${alt.confidence * 100}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-400 leading-tight">{alt.reason}</p>
                </button>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
};
