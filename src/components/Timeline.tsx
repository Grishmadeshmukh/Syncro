import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { VideoClip, Voiceover } from '../types';
import { motion } from 'motion/react';
import { Play, Pause, Scissors, Trash2, Wand2, Video } from 'lucide-react';
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
  const [isPlaying, setIsPlaying] = useState(false);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingPlayheadRef = useRef(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  // Keep latest values accessible inside stable event listeners
  const totalDurationRef = useRef(0);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;

  useEffect(() => {
    if (waveformRef.current && voiceover) {
      wavesurfer.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#8b5cf6',
        progressColor: '#a78bfa',
        cursorColor: '#ffffff',
        barWidth: 2,
        barRadius: 3,
        height: 80,
        url: voiceover.url,
      });

      wavesurfer.current.on('timeupdate', (time) => {
        onTimeUpdate(time);
      });

      wavesurfer.current.on('play', () => setIsPlaying(true));
      wavesurfer.current.on('pause', () => setIsPlaying(false));

      return () => {
        wavesurfer.current?.destroy();
      };
    }
  }, [voiceover]);

  const togglePlay = () => {
    wavesurfer.current?.playPause();
  };

  const handleClipDrag = (id: string, newStartTime: number) => {
    const updatedClips = videoClips.map((clip) =>
      clip.id === id ? { ...clip, startTime: Math.max(0, newStartTime) } : clip
    );
    onVideoClipChange(updatedClips);
  };

  const totalDuration = Math.max(
    voiceover?.duration || 0,
    ...videoClips.map((c: VideoClip) => c.startTime + c.duration)
  );
  totalDurationRef.current = totalDuration;

  const pixelsPerSecond = 50;
  // Offset in px from the container's left edge where time=0 starts (matches playhead formula)
  const timelineOffset = 8;

  const getTimeFromMouseX = (clientX: number): number => {
    const container = timelineContainerRef.current;
    if (!container) return 0;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left + container.scrollLeft - timelineOffset;
    return Math.max(0, Math.min(x / pixelsPerSecond, totalDurationRef.current));
  };

  const seekToTime = (time: number) => {
    onTimeUpdateRef.current(time);
    if (wavesurfer.current) {
      const dur = wavesurfer.current.getDuration();
      if (dur > 0) wavesurfer.current.seekTo(time / dur);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingPlayheadRef.current) return;
      seekToTime(getTimeFromMouseX(e.clientX));
    };
    const handleMouseUp = () => {
      if (isDraggingPlayheadRef.current) {
        isDraggingPlayheadRef.current = false;
        setIsDraggingPlayhead(false);
      }
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handlePlayheadMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingPlayheadRef.current = true;
    setIsDraggingPlayhead(true);
  };

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Don't interfere if a clip drag is in progress
    seekToTime(getTimeFromMouseX(e.clientX));
  };

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

      <div
        ref={timelineContainerRef}
        className={cn(
          "relative overflow-x-auto p-8 min-h-[300px] bg-black/70",
          isDraggingPlayhead && "cursor-ew-resize select-none"
        )}
      >
        {/* Time Markers — click to seek */}
        <div
          className="absolute top-0 left-8 right-8 h-6 border-b border-violet-700/50 flex items-end cursor-pointer"
          onClick={handleRulerClick}
        >
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
          className="absolute top-0 bottom-0 w-px bg-violet-400 z-50"
          style={{ left: `${8 + currentTime * pixelsPerSecond}px` }}
        >
          <div
            className="absolute top-0 -left-1.5 w-3 h-3 bg-violet-400 rounded-full cursor-ew-resize"
            onMouseDown={handlePlayheadMouseDown}
          />
        </div>

        <div className="relative mt-8 space-y-4" style={{ width: `${(totalDuration + 5) * pixelsPerSecond}px` }}>
          {/* Audio Track */}
          <div className="relative h-20 bg-black/50 rounded-xl border border-violet-700/40 overflow-hidden">
            <div className="absolute inset-0 opacity-50" ref={waveformRef} />
            <div className="absolute top-2 left-2 text-[10px] uppercase tracking-wider font-bold text-violet-400">
              Voiceover Track
            </div>
          </div>

          {/* Video Tracks */}
          <div className="space-y-2">
            {videoClips.map((clip, index) => (
              <div key={clip.id} className="relative h-16 group">
                <motion.div
                  drag="x"
                  dragMomentum={false}
                  onDrag={(_, info) => {
                    const newTime = clip.startTime + info.delta.x / pixelsPerSecond;
                    handleClipDrag(clip.id, newTime);
                  }}
                  className={cn(
                    "absolute h-full rounded-xl border flex flex-col justify-center px-4 cursor-grab active:cursor-grabbing transition-shadow",
                    "bg-violet-800/50 border-violet-600/50 shadow-sm hover:shadow-md",
                    currentTime >= clip.startTime && currentTime <= clip.startTime + clip.duration
                      ? "border-violet-400 ring-2 ring-violet-400/30"
                      : "border-violet-600/50"
                  )}
                  style={{
                    left: `${clip.startTime * pixelsPerSecond}px`,
                    width: `${clip.duration * pixelsPerSecond}px`,
                  }}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Video className="w-4 h-4 text-violet-400 flex-shrink-0" />
                    <span className="text-xs font-medium text-violet-200 truncate">
                      {clip.name}
                    </span>
                  </div>
                  {clip.analysis && (
                    <div className="text-[10px] text-violet-500 truncate mt-1 italic">
                      {clip.analysis}
                    </div>
                  )}
                </motion.div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
