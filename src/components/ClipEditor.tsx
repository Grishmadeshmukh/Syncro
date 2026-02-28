import React, { useState, useEffect, useRef } from 'react';
import { VideoClip } from '../types';
import { X, Scissors, Type, RotateCcw } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ClipEditorProps {
    clip: VideoClip;
    onSave: (updated: VideoClip) => void;
    onClose: () => void;
}

export const ClipEditor: React.FC<ClipEditorProps> = ({ clip, onSave, onClose }) => {
    const effectiveDuration = clip.trimmedDuration ?? clip.duration;

    const [trimStart, setTrimStart] = useState(clip.trimStart ?? 0);
    const [trimEnd, setTrimEnd] = useState(
        clip.trimStart !== undefined || clip.trimmedDuration !== undefined
            ? (clip.trimStart ?? 0) + effectiveDuration
            : clip.duration
    );
    const [textOverlay, setTextOverlay] = useState(clip.textOverlay ?? '');

    const videoRef = useRef<HTMLVideoElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);

    // Clamp helpers
    const clampTrimStart = (v: number) => Math.max(0, Math.min(v, trimEnd - 0.5));
    const clampTrimEnd = (v: number) => Math.max(trimStart + 0.5, Math.min(v, clip.duration));

    // Keep video preview in sync with trimStart
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.currentTime = trimStart;
        }
    }, [trimStart]);

    // Close on Escape key
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const handleSave = () => {
        const newEffectiveDuration = trimEnd - trimStart;
        // Only set trimmedDuration if it's different from the full duration
        const hasRightTrim = trimEnd < clip.duration || trimStart > 0;
        onSave({
            ...clip,
            trimStart: trimStart > 0 ? trimStart : undefined,
            trimmedDuration: hasRightTrim ? newEffectiveDuration : undefined,
            textOverlay: textOverlay.trim() || undefined,
        });
        onClose();
    };

    const handleReset = () => {
        setTrimStart(0);
        setTrimEnd(clip.duration);
        setTextOverlay('');
    };

    const formatTime = (s: number) => `${s.toFixed(2)}s`;

    return (
        // Backdrop
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-zinc-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b bg-zinc-50/60">
                    <div>
                        <h2 className="text-sm font-bold text-zinc-800">Edit Clip</h2>
                        <p className="text-[11px] text-zinc-400 truncate max-w-[260px]">{clip.name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-500 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Mini preview */}
                    <div className="relative aspect-video bg-zinc-900 rounded-xl overflow-hidden">
                        <video
                            ref={videoRef}
                            src={clip.url}
                            className="w-full h-full object-contain"
                            muted
                            playsInline
                        />
                        {textOverlay && (
                            <div
                                ref={overlayRef}
                                className="absolute bottom-4 left-0 right-0 flex justify-center px-4 pointer-events-none"
                            >
                                <span className="bg-black/60 text-white text-sm font-semibold px-4 py-1.5 rounded-lg backdrop-blur-sm max-w-full text-center">
                                    {textOverlay}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Trim section */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                            <Scissors className="w-3.5 h-3.5" />
                            Trim Clip
                        </div>

                        {/* Visual trim bar */}
                        <div className="relative h-10 bg-zinc-100 rounded-lg overflow-hidden">
                            {/* Active region */}
                            <div
                                className="absolute top-0 bottom-0 bg-emerald-200 border-x-2 border-emerald-500"
                                style={{
                                    left: `${(trimStart / clip.duration) * 100}%`,
                                    width: `${((trimEnd - trimStart) / clip.duration) * 100}%`,
                                }}
                            />
                            {/* Trim start handle (visual only; controlled by the number inputs below) */}
                            <div
                                className="absolute top-0 bottom-0 w-1 bg-emerald-500 cursor-col-resize"
                                style={{ left: `${(trimStart / clip.duration) * 100}%` }}
                            />
                            {/* Trim end handle (visual only) */}
                            <div
                                className="absolute top-0 bottom-0 w-1 bg-orange-500 cursor-col-resize"
                                style={{ left: `${(trimEnd / clip.duration) * 100}%` }}
                            />
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-500 font-mono pointer-events-none">
                                {formatTime(trimEnd - trimStart)} of {formatTime(clip.duration)}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <label className="space-y-1">
                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Start</span>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="range"
                                        min={0}
                                        max={clip.duration}
                                        step={0.1}
                                        value={trimStart}
                                        onChange={e => setTrimStart(clampTrimStart(Number(e.target.value)))}
                                        className="flex-1 accent-emerald-500"
                                    />
                                    <span className="text-[11px] font-mono text-zinc-600 w-12 text-right">{formatTime(trimStart)}</span>
                                </div>
                            </label>
                            <label className="space-y-1">
                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">End</span>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="range"
                                        min={0}
                                        max={clip.duration}
                                        step={0.1}
                                        value={trimEnd}
                                        onChange={e => setTrimEnd(clampTrimEnd(Number(e.target.value)))}
                                        className="flex-1 accent-orange-500"
                                    />
                                    <span className="text-[11px] font-mono text-zinc-600 w-12 text-right">{formatTime(trimEnd)}</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Text overlay section */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                            <Type className="w-3.5 h-3.5" />
                            Caption / Text Overlay
                        </div>
                        <input
                            type="text"
                            value={textOverlay}
                            onChange={e => setTextOverlay(e.target.value)}
                            placeholder="Optional caption shown while clip plays…"
                            maxLength={120}
                            className={cn(
                                "w-full text-sm px-3 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50",
                                "focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400",
                                "placeholder:text-zinc-400 text-zinc-700"
                            )}
                        />
                        {textOverlay && (
                            <p className="text-[10px] text-zinc-400">Preview shown in the mini player above.</p>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t bg-zinc-50/60">
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 transition-colors font-medium"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors shadow shadow-emerald-200"
                        >
                            Apply
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
