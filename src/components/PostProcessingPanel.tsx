import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  FileText,
  MessageSquare,
  Image,
  Download,
  Wand2,
  Copy,
  Check,
  Loader2,
  Lock,
  Music,
  Video,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Hash,
  Film,
} from 'lucide-react';
import { VideoClip, Voiceover, CaptionStyle, CaptionMode, VideoDescription, ThumbnailCandidate } from '../types';
import { generateDescription, identifyKeyMoments } from '../services/postProcessing';
import { generateSRT, generateVTT, downloadTextFile, downloadBlob } from '../utils/captionUtils';
import { captureVideoFrame, addQuoteOverlay, downloadDataUrl, downloadFile, getClipAtTime } from '../utils/exportUtils';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function formatTimestamp(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ── Tab button ──────────────────────────────────────────────────────────────
function TabButton({
  active,
  locked,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  locked: boolean;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={locked ? undefined : onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap',
        active
          ? 'border-emerald-500 text-emerald-600'
          : locked
          ? 'border-transparent text-zinc-300 cursor-not-allowed'
          : 'border-transparent text-zinc-500 hover:text-zinc-800 hover:border-zinc-300'
      )}
    >
      {locked ? <Lock className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}

// ── Locked placeholder ───────────────────────────────────────────────────────
function LockedState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
      <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center">
        <Lock className="w-5 h-5 text-zinc-400" />
      </div>
      <p className="text-sm text-zinc-400 max-w-xs">{message}</p>
    </div>
  );
}

// ── Copy button ──────────────────────────────────────────────────────────────
function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      setFailed(true);
      setTimeout(() => setFailed(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all',
        copied
          ? 'bg-emerald-100 text-emerald-600'
          : failed
          ? 'bg-red-100 text-red-600'
          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
        className
      )}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : failed ? 'Failed' : 'Copy'}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 1 — Description & Chapters
// ═══════════════════════════════════════════════════════════════════════════
function DescriptionTab({ voiceover, videoClips }: { voiceover: Voiceover; videoClips: VideoClip[] }) {
  const [description, setDescription] = useState<VideoDescription | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [showHashtags, setShowHashtags] = useState(false);

  const canGenerate = !!voiceover.transcription && !!voiceover.segments?.length;

  const handleGenerate = async () => {
    if (!voiceover.transcription || !voiceover.segments) return;
    setIsGenerating(true);
    setError('');
    try {
      const result = await generateDescription(
        voiceover.transcription,
        voiceover.segments,
        videoClips.map(c => c.analysis || '').filter(Boolean)
      );
      setDescription(result);
    } catch (e) {
      setError('Failed to generate description. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const fullDescriptionText = description
    ? [
        description.summary,
        '',
        '━━━━━━━━━━━━━━━━━━━━',
        'CHAPTERS',
        '━━━━━━━━━━━━━━━━━━━━',
        ...description.chapters.map(c => `${formatTimestamp(c.time)} ${c.label}`),
        '',
        description.hashtags.map(h => `#${h}`).join(' '),
      ].join('\n')
    : '';

  if (!canGenerate) {
    return (
      <LockedState message="Run AI Auto-Align first so the voiceover is transcribed and segmented." />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-800">YouTube-Style Description</p>
          <p className="text-xs text-zinc-400 mt-0.5">Auto-generated summary + chapter timestamps</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className={cn(
            'flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all',
            isGenerating
              ? 'bg-zinc-100 text-zinc-400 cursor-wait'
              : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-200'
          )}
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : description ? (
            <RefreshCw className="w-4 h-4" />
          ) : (
            <Wand2 className="w-4 h-4" />
          )}
          {isGenerating ? 'Generating…' : description ? 'Regenerate' : 'Generate'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      <AnimatePresence>
        {description && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Summary */}
            <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Summary</span>
                <CopyButton text={description.summary} />
              </div>
              <p className="text-sm text-zinc-700 leading-relaxed">{description.summary}</p>
            </div>

            {/* Chapters */}
            <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  Chapters ({description.chapters.length})
                </span>
                <CopyButton
                  text={description.chapters
                    .map(c => `${formatTimestamp(c.time)} ${c.label}`)
                    .join('\n')}
                />
              </div>
              <div className="space-y-1 mt-1">
                {description.chapters.map((ch, i) => (
                  <div key={i} className="flex items-center gap-3 py-1">
                    <span className="font-mono text-xs font-bold text-emerald-600 w-10 flex-shrink-0">
                      {formatTimestamp(ch.time)}
                    </span>
                    <span className="text-sm text-zinc-700">{ch.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Hashtags */}
            <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowHashtags(v => !v)}
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  <Hash className="w-3 h-3" />
                  Hashtags ({description.hashtags.length})
                  {showHashtags ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                <CopyButton text={description.hashtags.map(h => `#${h}`).join(' ')} />
              </div>
              <AnimatePresence>
                {showHashtags && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-wrap gap-2 pt-2">
                      {description.hashtags.map((tag, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-lg border border-emerald-100"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Full copy */}
            <div className="flex justify-end">
              <CopyButton text={fullDescriptionText} className="text-sm px-4 py-2" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 2 — Captions
// ═══════════════════════════════════════════════════════════════════════════
function CaptionsTab({
  voiceover,
  captionStyle,
  captionsEnabled,
  onStyleChange,
  onEnabledChange,
}: {
  voiceover: Voiceover | null;
  captionStyle: CaptionStyle;
  captionsEnabled: boolean;
  onStyleChange: (s: CaptionStyle) => void;
  onEnabledChange: (v: boolean) => void;
}) {
  const hasSegments = !!voiceover?.segments?.length;

  const handleMode = (mode: CaptionMode) => onStyleChange({ ...captionStyle, mode });
  const handlePosition = (position: 'bottom' | 'top') => onStyleChange({ ...captionStyle, position });

  const modeOptions: { value: CaptionMode; label: string; desc: string }[] = [
    { value: 'lower-third', label: 'Lower Third', desc: 'Classic bar at bottom' },
    { value: 'word-highlight', label: 'Word Highlight', desc: 'Highlights current word' },
    { value: 'speaker-labeled', label: 'Speaker Label', desc: 'Prefixes with "Speaker:"' },
  ];

  const handleDownloadSRT = () => {
    if (!voiceover?.segments) return;
    downloadTextFile(generateSRT(voiceover.segments), 'captions.srt', 'text/plain');
  };

  const handleDownloadVTT = () => {
    if (!voiceover?.segments) return;
    downloadTextFile(generateVTT(voiceover.segments), 'captions.vtt', 'text/vtt');
  };

  if (!hasSegments) {
    return (
      <LockedState message="Run AI Auto-Align first to generate the transcript segments needed for captions." />
    );
  }

  return (
    <div className="space-y-6">
      {/* Live preview toggle */}
      <div className="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-100 rounded-2xl">
        <div>
          <p className="text-sm font-semibold text-zinc-800">Live Caption Preview</p>
          <p className="text-xs text-zinc-400 mt-0.5">Show captions on the video preview above</p>
        </div>
        <button
          onClick={() => onEnabledChange(!captionsEnabled)}
          className={cn(
            'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
            captionsEnabled ? 'bg-emerald-500' : 'bg-zinc-200'
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
              captionsEnabled ? 'translate-x-5' : 'translate-x-0'
            )}
          />
        </button>
      </div>

      {/* Caption style */}
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Style</p>
        <div className="grid grid-cols-3 gap-3">
          {modeOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleMode(opt.value)}
              className={cn(
                'p-3 rounded-xl border text-left transition-all',
                captionStyle.mode === opt.value
                  ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500/20'
                  : 'border-zinc-200 hover:border-zinc-300 bg-white'
              )}
            >
              <p className="text-xs font-semibold text-zinc-800">{opt.label}</p>
              <p className="text-[10px] text-zinc-400 mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Font size */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Font Size</p>
          <span className="text-xs font-mono font-semibold text-zinc-600">{captionStyle.fontSize}px</span>
        </div>
        <input
          type="range"
          min={12}
          max={36}
          value={captionStyle.fontSize}
          onChange={e => onStyleChange({ ...captionStyle, fontSize: Number(e.target.value) })}
          className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer accent-emerald-500"
        />
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Text Color</p>
          <div className="flex items-center gap-3 p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl">
            <input
              type="color"
              value={captionStyle.color}
              onChange={e => onStyleChange({ ...captionStyle, color: e.target.value })}
              className="w-8 h-8 rounded-lg border-0 cursor-pointer bg-transparent"
            />
            <span className="text-xs font-mono text-zinc-500">{captionStyle.color}</span>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Background</p>
          <div className="flex items-center gap-3 p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl">
            <input
              type="color"
              value={captionStyle.bgColor}
              onChange={e => onStyleChange({ ...captionStyle, bgColor: e.target.value })}
              className="w-8 h-8 rounded-lg border-0 cursor-pointer bg-transparent"
            />
            <span className="text-xs font-mono text-zinc-500">{captionStyle.bgColor}</span>
          </div>
        </div>
      </div>

      {/* Position */}
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Position</p>
        <div className="flex gap-3">
          {(['bottom', 'top'] as const).map(pos => (
            <button
              key={pos}
              onClick={() => handlePosition(pos)}
              className={cn(
                'flex-1 py-2 text-xs font-semibold rounded-xl border capitalize transition-all',
                captionStyle.position === pos
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                  : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300'
              )}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {/* Download */}
      <div className="pt-2 border-t border-zinc-100">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-3">Export Caption File</p>
        <div className="flex gap-3">
          <button
            onClick={handleDownloadSRT}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-white border border-zinc-200 text-zinc-700 rounded-xl hover:border-zinc-400 hover:bg-zinc-50 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Download SRT
          </button>
          <button
            onClick={handleDownloadVTT}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-white border border-zinc-200 text-zinc-700 rounded-xl hover:border-zinc-400 hover:bg-zinc-50 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Download VTT
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 3 — Thumbnails
// ═══════════════════════════════════════════════════════════════════════════
function ThumbnailsTab({ voiceover, videoClips }: { voiceover: Voiceover; videoClips: VideoClip[] }) {
  const [thumbnails, setThumbnails] = useState<ThumbnailCandidate[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const canGenerate =
    !!voiceover.transcription && !!voiceover.segments?.length && videoClips.length > 0;

  const handleGenerate = async () => {
    if (!voiceover.transcription || !voiceover.segments) return;
    setIsGenerating(true);
    setError('');
    setProgress('Asking AI to identify key moments…');
    setThumbnails([]);
    try {
      const moments = await identifyKeyMoments(
        voiceover.transcription,
        voiceover.segments,
        videoClips.map(c => c.analysis || '').filter(Boolean)
      );

      const results: ThumbnailCandidate[] = [];
      for (let i = 0; i < moments.length; i++) {
        const m = moments[i];
        setProgress(`Capturing frame ${i + 1} of ${moments.length}…`);
        const hit = getClipAtTime(videoClips, m.timestamp);
        if (!hit) continue;
        try {
          const raw = await captureVideoFrame(hit.clip, hit.localTime);
          const withText = await addQuoteOverlay(raw, m.quote);
          results.push({
            id: `thumb-${i}`,
            timestamp: m.timestamp,
            quote: m.quote,
            reason: m.reason,
            imageDataUrl: withText,
          });
          setThumbnails([...results]);
        } catch {
          // skip this frame
        }
      }

      if (results.length === 0) setError('Could not capture any frames. Try aligning clips first.');
    } catch (e) {
      setError('Failed to identify key moments. Please try again.');
    } finally {
      setIsGenerating(false);
      setProgress('');
    }
  };

  if (!canGenerate) {
    return (
      <LockedState message="Upload videos and run AI Auto-Align first to enable thumbnail generation." />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-800">Thumbnail Candidates</p>
          <p className="text-xs text-zinc-400 mt-0.5">
            AI finds the most compelling moments and overlays a key quote
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className={cn(
            'flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all',
            isGenerating
              ? 'bg-zinc-100 text-zinc-400 cursor-wait'
              : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-200'
          )}
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : thumbnails.length > 0 ? (
            <RefreshCw className="w-4 h-4" />
          ) : (
            <Wand2 className="w-4 h-4" />
          )}
          {isGenerating ? 'Generating…' : thumbnails.length > 0 ? 'Regenerate' : 'Generate'}
        </button>
      </div>

      {isGenerating && progress && (
        <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700">
          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
          {progress}
        </div>
      )}

      {error && (
        <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      <AnimatePresence>
        {thumbnails.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-2 gap-4"
          >
            {thumbnails.map((thumb, i) => (
              <motion.div
                key={thumb.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className="group rounded-2xl border border-zinc-200 overflow-hidden bg-white hover:border-emerald-300 hover:shadow-md transition-all"
              >
                <div className="relative aspect-video bg-zinc-100">
                  <img
                    src={thumb.imageDataUrl}
                    alt={thumb.quote}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2">
                    <span className="px-2 py-0.5 bg-black/60 text-white text-[10px] font-mono rounded-md">
                      {formatTimestamp(thumb.timestamp)}
                    </span>
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  <p className="text-xs font-semibold text-zinc-800 line-clamp-1">"{thumb.quote}"</p>
                  <p className="text-[10px] text-zinc-400 line-clamp-2">{thumb.reason}</p>
                  <button
                    onClick={() =>
                      downloadDataUrl(thumb.imageDataUrl, `thumbnail-${i + 1}-${thumb.timestamp}s.jpg`)
                    }
                    className="flex items-center gap-1.5 w-full justify-center py-1.5 text-xs font-semibold bg-zinc-50 border border-zinc-200 text-zinc-600 rounded-lg hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download PNG
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 4 — Export
// ═══════════════════════════════════════════════════════════════════════════
function ExportTab({
  voiceover,
  videoClips,
  captionStyle,
  captionsEnabled,
}: {
  voiceover: Voiceover | null;
  videoClips: VideoClip[];
  captionStyle: CaptionStyle;
  captionsEnabled: boolean;
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);

  const handleDownloadAsset = (url: string, name: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
  };

  const handleDownloadSRT = () => {
    if (!voiceover?.segments) return;
    downloadTextFile(generateSRT(voiceover.segments), 'captions.srt', 'text/plain');
  };

  const handleDownloadVTT = () => {
    if (!voiceover?.segments) return;
    downloadTextFile(generateVTT(voiceover.segments), 'captions.vtt', 'text/vtt');
  };

  const handleExportVideo = async () => {
    if (!voiceover || videoClips.length === 0) return;
    setIsExporting(true);
    setExportProgress(0);

    try {
      const W = 1280;
      const H = 720;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      // Pre-load render video elements — only store ones that loaded successfully
      const renderVids: Record<string, HTMLVideoElement> = {};
      await Promise.all(videoClips.map(clip =>
        new Promise<void>(res => {
          const v = document.createElement('video');
          v.src = clip.url;
          v.muted = true;
          v.preload = 'auto';
          v.addEventListener('loadeddata', () => { renderVids[clip.id] = v; res(); }, { once: true });
          v.addEventListener('error', () => res(), { once: true }); // skip broken clips, don't store
          v.load();
        })
      ));

      // Audio setup — preload fully before recording starts
      const audioCtx = new AudioContext();
      const audioEl = new Audio(voiceover.url);
      audioEl.preload = 'auto';
      await new Promise<void>((res, rej) => {
        audioEl.addEventListener('canplaythrough', () => res(), { once: true });
        audioEl.addEventListener('error', () => rej(new Error('Audio load failed')), { once: true });
        audioEl.load();
      });
      const src = audioCtx.createMediaElementSource(audioEl);
      const dest = audioCtx.createMediaStreamDestination();
      src.connect(dest);
      src.connect(audioCtx.destination);

      // Build combined stream
      const canvasStream = canvas.captureStream(30);
      const combined = new MediaStream([
        ...canvasStream.getTracks(),
        ...dest.stream.getTracks(),
      ]);

      const { mimeType, ext, label } = pickMimeType();
      const recorder = new MediaRecorder(combined, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        downloadFile(blob, `syncvoice-export.${ext}`);
        // suppress unused warning
        void label;
        setIsExporting(false);
        setExportProgress(0);
        Object.values(renderVids).forEach(v => v.remove());
      };

      const duration = voiceover.duration;
      const startWall = performance.now();
      const sorted = [...videoClips].sort((a, b) => a.startTime - b.startTime);
      const totalClipDur = sorted.reduce((s, c) => s + c.duration, 0);

      let rafId: number;
      const draw = () => {
        const elapsed = (performance.now() - startWall) / 1000;
        setExportProgress(Math.min(elapsed / duration, 1));

        if (elapsed >= duration) {
          recorder.stop();
          audioEl.pause();
          cancelAnimationFrame(rafId);
          return;
        }

        // Find active clip
        const hit = getClipAtTime(videoClips, elapsed);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        if (hit) {
          const v = renderVids[hit.clip.id];
          if (v && Math.abs(v.currentTime - hit.localTime) > 0.15) v.currentTime = hit.localTime;
          try { drawContained(ctx, v, W, H); } catch { /* skip */ }
        }

        // Draw captions
        if (captionsEnabled && voiceover.segments) {
          const seg = voiceover.segments.find(s => elapsed >= s.start && elapsed <= s.end);
          if (seg) drawCaptionOnCanvas(ctx, W, H, seg.text, captionStyle);
        }

        rafId = requestAnimationFrame(draw);
      };

      stopRef.current = () => {
        recorder.stop();
        audioEl.pause();
        cancelAnimationFrame(rafId);
        Object.values(renderVids).forEach(v => v.remove());
        setIsExporting(false);
        setExportProgress(0);
      };

      recorder.start(100);
      audioEl.play();
      rafId = requestAnimationFrame(draw);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      void totalClipDur;
    } catch (e) {
      console.error('Export failed:', e);
      setIsExporting(false);
    }
  };

  const hasContent = videoClips.length > 0 || !!voiceover;

  if (!hasContent) {
    return <LockedState message="Upload assets and run AI Auto-Align before exporting." />;
  }

  return (
    <div className="space-y-6">
      {/* Asset Downloads */}
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Download Assets</p>
        <div className="space-y-2">
          {voiceover && (
            <div className="flex items-center justify-between p-3 bg-white border border-zinc-200 rounded-xl hover:border-zinc-300 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Music className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-800 truncate max-w-[200px]">
                    {voiceover.file.name}
                  </p>
                  <p className="text-[10px] text-zinc-400">{voiceover.duration.toFixed(1)}s · Audio</p>
                </div>
              </div>
              <button
                onClick={() => handleDownloadAsset(voiceover.url, voiceover.file.name)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-zinc-100 text-zinc-600 rounded-lg hover:bg-zinc-200 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
            </div>
          )}

          {videoClips.map(clip => (
            <div
              key={clip.id}
              className="flex items-center justify-between p-3 bg-white border border-zinc-200 rounded-xl hover:border-zinc-300 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-zinc-100 rounded-lg overflow-hidden flex-shrink-0">
                  <video src={clip.url} className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-800 truncate max-w-[200px]">
                    {clip.name}
                  </p>
                  <p className="text-[10px] text-zinc-400">{clip.duration.toFixed(1)}s · Video</p>
                </div>
              </div>
              <button
                onClick={() => handleDownloadAsset(clip.url, clip.name)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-zinc-100 text-zinc-600 rounded-lg hover:bg-zinc-200 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Caption Downloads */}
      {voiceover?.segments && voiceover.segments.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Caption Files</p>
          <div className="flex gap-3">
            <button
              onClick={handleDownloadSRT}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-white border border-zinc-200 text-zinc-700 rounded-xl hover:border-zinc-400 hover:bg-zinc-50 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              SRT Captions
            </button>
            <button
              onClick={handleDownloadVTT}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-white border border-zinc-200 text-zinc-700 rounded-xl hover:border-zinc-400 hover:bg-zinc-50 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              VTT Captions
            </button>
          </div>
        </div>
      )}

      {/* Combined Video Export */}
      {voiceover && videoClips.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">
            Combined Export
          </p>
          <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-zinc-800 text-white rounded-xl flex items-center justify-center flex-shrink-0">
                <Film className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-800">Export Combined Video</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Records the aligned sequence with audio
                  {captionsEnabled ? ' and burned-in captions' : ''}.
                  Saves as MP4 (H.264) when supported by your browser, otherwise WebM.
                </p>
              </div>
            </div>

            {isExporting && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium text-zinc-600">
                  <span>Recording…</span>
                  <span>{Math.round(exportProgress * 100)}%</span>
                </div>
                <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${exportProgress * 100}%` }}
                    transition={{ duration: 0.1 }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3">
              {!isExporting ? (
                <button
                  onClick={handleExportVideo}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-zinc-900 text-white rounded-xl hover:bg-zinc-700 transition-all"
                >
                  <Film className="w-4 h-4" />
                  Start Export
                </button>
              ) : (
                <button
                  onClick={() => stopRef.current?.()}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-red-100 text-red-600 rounded-xl hover:bg-red-200 transition-all"
                >
                  Cancel
                </button>
              )}
              <span className="flex items-center text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                MP4 / WebM
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pick the best available recording format ─────────────────────────────────
function pickMimeType(): { mimeType: string; ext: string; label: string } {
  const candidates = [
    { mimeType: 'video/mp4;codecs=avc1', ext: 'mp4', label: 'MP4 · H.264' },
    { mimeType: 'video/mp4;codecs=h264', ext: 'mp4', label: 'MP4 · H.264' },
    { mimeType: 'video/mp4', ext: 'mp4', label: 'MP4' },
    { mimeType: 'video/webm;codecs=vp9', ext: 'webm', label: 'WebM · VP9' },
    { mimeType: 'video/webm', ext: 'webm', label: 'WebM' },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return { mimeType: 'video/webm', ext: 'webm', label: 'WebM' };
}

// ── Draw video frame onto canvas preserving aspect ratio (letterbox) ─────────
function drawContained(
  ctx: CanvasRenderingContext2D,
  v: HTMLVideoElement,
  W: number,
  H: number
) {
  const vW = v.videoWidth;
  const vH = v.videoHeight;
  if (!vW || !vH) { ctx.drawImage(v, 0, 0, W, H); return; }
  const scale = Math.min(W / vW, H / vH);
  const dW = vW * scale;
  const dH = vH * scale;
  ctx.drawImage(v, (W - dW) / 2, (H - dH) / 2, dW, dH);
}

// ── Canvas caption renderer (used during video export recording) ────────────
function drawCaptionOnCanvas(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  text: string,
  style: CaptionStyle
) {
  const fontSize = Math.max(16, Math.round(W * 0.032));
  ctx.font = `bold ${fontSize}px Inter, Arial, sans-serif`;
  ctx.textAlign = 'center';

  const maxW = W * 0.8;
  const words = text.split(' ').filter(Boolean);
  if (words.length === 0) return;
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  if (lines.length === 0) return;

  const lh = fontSize * 1.35;
  const padX = 20;
  const padY = 10;
  const boxH = lines.length * lh + padY * 2;
  const maxLineWidth = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
  const boxW = Math.min(maxLineWidth + padX * 2, W - 40);
  const boxX = (W - boxW) / 2;
  const boxY = style.position === 'bottom' ? H - boxH - 32 : 32;

  ctx.fillStyle = style.bgColor;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(boxX, boxY, boxW, boxH, 6);
  else ctx.rect(boxX, boxY, boxW, boxH);
  ctx.fill();

  ctx.fillStyle = style.color;
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, boxY + padY + (i + 0.82) * lh, maxW);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PANEL
// ═══════════════════════════════════════════════════════════════════════════
type Tab = 'description' | 'captions' | 'thumbnails' | 'export';

interface PostProcessingPanelProps {
  voiceover: Voiceover | null;
  videoClips: VideoClip[];
  currentTime: number;
  captionStyle: CaptionStyle;
  captionsEnabled: boolean;
  onCaptionStyleChange: (s: CaptionStyle) => void;
  onCaptionsEnabledChange: (v: boolean) => void;
}

export function PostProcessingPanel({
  voiceover,
  videoClips,
  captionStyle,
  captionsEnabled,
  onCaptionStyleChange,
  onCaptionsEnabledChange,
}: PostProcessingPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('description');

  const hasTranscription = !!voiceover?.transcription && !!voiceover?.segments?.length;
  const hasClips = videoClips.length > 0;

  const tabs: {
    id: Tab;
    label: string;
    icon: React.ElementType;
    locked: boolean;
  }[] = [
    { id: 'description', label: 'Description', icon: FileText, locked: !hasTranscription },
    { id: 'captions', label: 'Captions', icon: MessageSquare, locked: !hasTranscription },
    { id: 'thumbnails', label: 'Thumbnails', icon: Image, locked: !hasTranscription || !hasClips },
    { id: 'export', label: 'Export', icon: Download, locked: false },
  ];

  return (
    <div className="bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-6 pt-5 pb-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-zinc-900 rounded-xl flex items-center justify-center flex-shrink-0">
            <Film className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Post-Processing & Export</h2>
            <p className="text-[10px] text-zinc-400">
              {hasTranscription
                ? 'AI analysis complete — all features unlocked'
                : 'Run AI Auto-Align to unlock generation features'}
            </p>
          </div>
          {!hasTranscription && (
            <span className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-600 text-[10px] font-bold rounded-full uppercase tracking-wider">
              <Lock className="w-2.5 h-2.5" />
              Pending Analysis
            </span>
          )}
          {hasTranscription && (
            <span className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-600 text-[10px] font-bold rounded-full uppercase tracking-wider">
              <Check className="w-2.5 h-2.5" />
              Ready
            </span>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 border-b border-zinc-100 -mx-6 px-6">
          {tabs.map(tab => (
            <TabButton
              key={tab.id}
              active={activeTab === tab.id}
              locked={tab.locked}
              icon={tab.icon}
              label={tab.label}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="p-6"
        >
          {activeTab === 'description' && (
            voiceover
              ? <DescriptionTab voiceover={voiceover} videoClips={videoClips} />
              : <LockedState message="Upload a voiceover and run AI Auto-Align to generate descriptions." />
          )}
          {activeTab === 'captions' && (
            <CaptionsTab
              voiceover={voiceover}
              captionStyle={captionStyle}
              captionsEnabled={captionsEnabled}
              onStyleChange={onCaptionStyleChange}
              onEnabledChange={onCaptionsEnabledChange}
            />
          )}
          {activeTab === 'thumbnails' && (
            voiceover
              ? <ThumbnailsTab voiceover={voiceover} videoClips={videoClips} />
              : <LockedState message="Upload a voiceover and run AI Auto-Align to generate thumbnails." />
          )}
          {activeTab === 'export' && (
            <ExportTab
              voiceover={voiceover}
              videoClips={videoClips}
              captionStyle={captionStyle}
              captionsEnabled={captionsEnabled}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
