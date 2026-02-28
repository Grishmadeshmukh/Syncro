import React, { useState, useRef } from 'react';
import { Voiceover } from '../types';
import { Scissors, Play, Pause, RotateCcw } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface VoiceoverEditorProps {
    voiceover: Voiceover;
    onSave: (updated: Voiceover) => void;
    onClose: () => void;
}

export const VoiceoverEditor: React.FC<VoiceoverEditorProps> = ({ voiceover, onSave, onClose }) => {
    const [trimStart, setTrimStart] = useState(voiceover.trimStart ?? 0);
    const [trimEnd, setTrimEnd] = useState(voiceover.trimEnd ?? voiceover.duration);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const effectiveDuration = voiceover.duration;
    const clampStart = (v: number) => Math.max(0, Math.min(v, trimEnd - 0.5));
    const clampEnd = (v: number) => Math.max(trimStart + 0.5, Math.min(v, effectiveDuration));

    const handlePreview = () => {
        if (!audioRef.current) {
            audioRef.current = new Audio(voiceover.url);
            audioRef.current.addEventListener('ended', () => setIsPlaying(false));
            audioRef.current.addEventListener('pause', () => setIsPlaying(false));
        }
        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            audioRef.current.currentTime = trimStart;
            const handleTimeUpdate = () => {
                if (audioRef.current && audioRef.current.currentTime >= trimEnd) {
                    audioRef.current.pause();
                    audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
                }
            };
            audioRef.current.addEventListener('timeupdate', handleTimeUpdate);
            audioRef.current.play();
            setIsPlaying(true);
        }
    };

    const handleReset = () => {
        setTrimStart(0);
        setTrimEnd(effectiveDuration);
    };

    const handleSave = () => {
        const hasEdits = trimStart > 0 || trimEnd < effectiveDuration;
        onSave({
            ...voiceover,
            trimStart: trimStart > 0 ? trimStart : undefined,
            trimEnd: trimEnd < effectiveDuration ? trimEnd : undefined,
        });
        onClose();
    };

    const fmt = (s: number) => `${s.toFixed(1)}s`;

    return (
        <div className="mt-3 border border-zinc-200 rounded-2xl overflow-hidden shadow-sm bg-white">
            <div className="px-4 py-3 border-b bg-zinc-50/60 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    <Scissors className="w-3.5 h-3.5" />
                    Trim Voiceover
                </div>
                <button
                    onClick={handleReset}
                    className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors font-medium"
                >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                </button>
            </div>

            <div className="p-4 space-y-4">
                {/* Visual trim bar */}
                <div className="relative h-8 bg-zinc-100 rounded-lg overflow-hidden">
                    <div
                        className="absolute top-0 bottom-0 bg-emerald-200 border-x-2 border-emerald-500"
                        style={{
                            left: `${(trimStart / effectiveDuration) * 100}%`,
                            width: `${((trimEnd - trimStart) / effectiveDuration) * 100}%`,
                        }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-500 font-mono pointer-events-none">
                        {fmt(trimEnd - trimStart)} of {fmt(effectiveDuration)}
                    </span>
                </div>

                {/* Sliders */}
                <div className="space-y-2">
                    <label className="flex items-center gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 w-10 shrink-0">Start</span>
                        <input
                            type="range"
                            min={0}
                            max={effectiveDuration}
                            step={0.1}
                            value={trimStart}
                            onChange={e => setTrimStart(clampStart(Number(e.target.value)))}
                            className="flex-1 accent-emerald-500"
                        />
                        <span className="text-[11px] font-mono text-zinc-600 w-10 text-right shrink-0">{fmt(trimStart)}</span>
                    </label>
                    <label className="flex items-center gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 w-10 shrink-0">End</span>
                        <input
                            type="range"
                            min={0}
                            max={effectiveDuration}
                            step={0.1}
                            value={trimEnd}
                            onChange={e => setTrimEnd(clampEnd(Number(e.target.value)))}
                            className="flex-1 accent-orange-500"
                        />
                        <span className="text-[11px] font-mono text-zinc-600 w-10 text-right shrink-0">{fmt(trimEnd)}</span>
                    </label>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-1">
                    <button
                        onClick={handlePreview}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                            isPlaying
                                ? "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
                                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                        )}
                    >
                        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        {isPlaying ? 'Stop' : 'Preview'}
                    </button>
                    <div className="flex-1" />
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-500 hover:bg-zinc-100 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow shadow-emerald-200"
                    >
                        Apply
                    </button>
                </div>
            </div>
        </div>
    );
};
