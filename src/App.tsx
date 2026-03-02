import React, { useState, useRef, useEffect } from 'react';
import { VideoClip, Voiceover, CaptionStyle } from './types';
import { FileUploader } from './components/FileUploader';
import { Timeline } from './components/Timeline';
import { ClipEditor } from './components/ClipEditor';
import { VoiceoverEditor } from './components/VoiceoverEditor';
import { PostProcessingPanel } from './components/PostProcessingPanel';
import { LogPanel } from './components/LogPanel';
import {
  analyzeVoiceover,
  analyzeVideo,
  suggestAlignment,
  estimateSegments,
  generateAudioFromScript,
  generateNarrationFromVideos,
  type AlignmentEntry,
} from './services/gemini';
import {
  Video,
  Music,
  Trash2,
  Sparkles,
  Layers,
  Play,
  Clock,
  FileText,
  Mic2,
  Loader2,
  Pencil,
  Upload,
  ArrowRight,
  CheckCircle2,
  Activity,
  Key,
} from 'lucide-react';
import { setApiKey, hasApiKey } from './services/apiKey';
import { motion, AnimatePresence } from 'motion/react';

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

function chainClips(clips: VideoClip[]): VideoClip[] {
  if (clips.length === 0) return [];
  let cursor = 0;
  return clips.map(clip => {
    const positioned = { ...clip, startTime: cursor };
    cursor += clip.trimmedDuration ?? clip.duration;
    return positioned;
  });
}

function CaptionOverlay({
  segments,
  currentTime,
  style,
}: {
  segments: Array<{ text: string; start: number; end: number }>;
  currentTime: number;
  style: CaptionStyle;
}) {
  const seg = segments.find(s => currentTime >= s.start && currentTime <= s.end);
  if (!seg) return null;
  const baseContainer = cn(
    'absolute left-0 right-0 px-6 pointer-events-none z-10 flex justify-center',
    style.position === 'bottom' ? 'bottom-6' : 'top-6'
  );
  if (style.mode === 'word-highlight') {
    const words = seg.text.split(' ');
    const wordDur = (seg.end - seg.start) / Math.max(words.length, 1);
    const wordIdx = Math.floor((currentTime - seg.start) / wordDur);
    return (
      <div className={baseContainer}>
        <div className="px-4 py-2 rounded-xl flex flex-wrap gap-x-1.5 gap-y-1 justify-center max-w-2xl"
          style={{ backgroundColor: style.bgColor, fontSize: `${style.fontSize}px` }}>
          {words.map((w, i) => (
            <span key={i} style={{ color: i === wordIdx ? '#7c3aed' : style.color, fontWeight: i === wordIdx ? 700 : 500, transition: 'color 0.1s' }}>{w}</span>
          ))}
        </div>
      </div>
    );
  }
  if (style.mode === 'speaker-labeled') {
    return (
      <div className={baseContainer}>
        <div className="px-4 py-2 rounded-xl max-w-2xl" style={{ backgroundColor: style.bgColor, fontSize: `${style.fontSize}px` }}>
          <span style={{ color: '#7c3aed', fontWeight: 700, marginRight: '8px' }}>Speaker:</span>
          <span style={{ color: style.color }}>{seg.text}</span>
        </div>
      </div>
    );
  }
  return (
    <div className={baseContainer}>
      <div className="px-5 py-2.5 rounded-xl max-w-2xl text-center"
        style={{ backgroundColor: style.bgColor, color: style.color, fontSize: `${style.fontSize}px`, fontWeight: 600 }}>
        {seg.text}
      </div>
    </div>
  );
}

type VoiceoverMethod = 'upload' | 'script' | 'auto';

function OnboardingModal({
  step, onStepComplete, onVideoUpload, videoClips, onVoiceoverUpload,
  onGenerateFromScript, onGenerateNarration, isGenerating,
}: {
  step: 1 | 2;
  onStepComplete: () => void;
  onVideoUpload: (files: File[]) => Promise<void>;
  videoClips: VideoClip[];
  onVoiceoverUpload: (files: File[]) => Promise<void>;
  onGenerateFromScript: (script: string, voice: string) => Promise<void>;
  onGenerateNarration: (voice: string) => Promise<void>;
  isGenerating: boolean;
}) {
  const [voiceoverMethod, setVoiceoverMethod] = useState<VoiceoverMethod | null>(null);
  const [script, setScript] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('Aoede');
  const VOICES = ['Aoede', 'Charon', 'Fenrir', 'Kore', 'Puck'];

  const handleVoiceoverAction = async () => {
    if (voiceoverMethod === 'script') { await onGenerateFromScript(script, selectedVoice); onStepComplete(); }
    else if (voiceoverMethod === 'auto') { await onGenerateNarration(selectedVoice); onStepComplete(); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ type: 'spring', damping: 28, stiffness: 380 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden"
      >
        <div className="px-8 pt-8 pb-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {[1, 2].map((s) => (
              <React.Fragment key={s}>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                    s < step ? 'bg-violet-600 text-white' :
                    s === step ? 'bg-violet-600 text-white ring-4 ring-violet-100' :
                    'bg-gray-100 text-gray-400'
                  )}>
                    {s < step ? <CheckCircle2 className="w-4 h-4" /> : s}
                  </div>
                  <span className={cn('text-sm font-medium', s === step ? 'text-gray-900' : 'text-gray-400')}>
                    {s === 1 ? 'Upload Videos' : 'Add Voiceover'}
                  </span>
                </div>
                {s < 2 && <div className="flex-1 h-px bg-gray-200" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="p-8">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Upload your videos</h2>
                  <p className="text-sm text-gray-500 mt-1">Add all the video clips you want to sync with a voiceover.</p>
                </div>
                <FileUploader label="Add Videos" accept={{ 'video/*': ['.mp4', '.mov', '.webm'] }} onFilesAdded={onVideoUpload} icon={<Upload className="w-6 h-6" />} />
                {videoClips.length > 0 && (
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {videoClips.map(clip => (
                      <div key={clip.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="w-10 h-10 bg-gray-200 rounded-lg overflow-hidden shrink-0">
                          <video src={clip.url} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{clip.name}</p>
                          <p className="text-xs text-gray-400">{clip.duration.toFixed(1)}s</p>
                        </div>
                        <CheckCircle2 className="w-4 h-4 text-violet-500 shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={onStepComplete} disabled={videoClips.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-all shadow-lg shadow-violet-200">
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}
            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Add a voiceover</h2>
                  <p className="text-sm text-gray-500 mt-1">Choose how you want to add audio to your video.</p>
                </div>
                <div className="space-y-3">
                  {[
                    { key: 'upload' as VoiceoverMethod, icon: <Music className="w-4 h-4" />, title: 'Upload audio', desc: 'Use an existing MP3, WAV, or M4A file.' },
                    { key: 'script' as VoiceoverMethod, icon: <FileText className="w-4 h-4" />, title: 'Write a script', desc: 'Type or paste your narration — AI converts it to speech.' },
                    { key: 'auto' as VoiceoverMethod, icon: <Sparkles className="w-4 h-4" />, title: 'Auto-generate', desc: 'AI watches your clips, writes a narration, and voices it.' },
                  ].map(opt => (
                    <button key={opt.key} onClick={() => setVoiceoverMethod(opt.key)}
                      className={cn('w-full flex items-start gap-4 p-4 rounded-2xl border-2 text-left transition-all',
                        voiceoverMethod === opt.key ? 'border-violet-500 bg-violet-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-gray-100')}>
                      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                        voiceoverMethod === opt.key ? 'bg-violet-600 text-white' : 'bg-white text-gray-500 border border-gray-200')}>
                        {opt.icon}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{opt.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <AnimatePresence>
                  {voiceoverMethod === 'upload' && (
                    <motion.div key="upload-in" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <FileUploader label="Upload Voiceover" accept={{ 'audio/*': ['.mp3', '.wav', '.m4a'] }}
                        onFilesAdded={async (files) => { await onVoiceoverUpload(files); onStepComplete(); }}
                        multiple={false} icon={<Music className="w-5 h-5" />} />
                    </motion.div>
                  )}
                  {voiceoverMethod === 'script' && (
                    <motion.div key="script-in" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden space-y-3">
                      <textarea value={script} onChange={e => setScript(e.target.value)}
                        placeholder="Type your narration script here..."
                        className="w-full h-28 text-sm p-3 rounded-xl border border-gray-200 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 text-gray-700 placeholder:text-gray-400" />
                      <div className="flex gap-2">
                        <select value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)}
                          className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-300">
                          {VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                        <button onClick={handleVoiceoverAction} disabled={!script.trim() || isGenerating}
                          className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all">
                          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic2 className="w-4 h-4" />}
                          Generate
                        </button>
                      </div>
                    </motion.div>
                  )}
                  {voiceoverMethod === 'auto' && (
                    <motion.div key="auto-in" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="flex gap-2">
                        <select value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)}
                          className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-300">
                          {VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                        <button onClick={handleVoiceoverAction} disabled={isGenerating}
                          className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all">
                          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          {isGenerating ? 'Generating...' : 'Generate'}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <button onClick={onStepComplete} className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors py-1">
                  Skip — I'll add audio later
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

export default function App() {
  const [videoClips, setVideoClips] = useState<VideoClip[]>([]);
  const [voiceover, setVoiceover] = useState<Voiceover | null>(null);
  const [isAligning, setIsAligning] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [showVoiceoverEditor, setShowVoiceoverEditor] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>({
    mode: 'lower-third', fontSize: 16, color: '#ffffff', bgColor: '#000000', position: 'bottom',
  });
  const [onboardingStep, setOnboardingStep] = useState<1 | 2 | null>(1);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(!hasApiKey());
  const [apiKeyInput, setApiKeyInput] = useState('');
  const videoRefs = useRef<Record<string, HTMLVideoElement>>({});
  const [previewHeight, setPreviewHeight] = useState(260);
  const isResizingPreview = useRef(false);
  const resizeStartY = useRef(0);
  const resizeStartH = useRef(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizingPreview.current) return;
      const delta = e.clientY - resizeStartY.current;
      setPreviewHeight(Math.max(140, Math.min(600, resizeStartH.current + delta)));
    };
    const onUp = () => { isResizingPreview.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  useEffect(() => {
    const sorted = [...videoClips].sort((a, b) => b.startTime - a.startTime);
    const activeClip = sorted.find((clip) => {
      const end = clip.startTime + (clip.trimmedDuration ?? clip.duration);
      return currentTime >= clip.startTime && currentTime < end;
    });
    if (activeClip) {
      setActiveVideoId(activeClip.id);
      const video = videoRefs.current[activeClip.id];
      if (video) {
        const relativeTime = (currentTime - activeClip.startTime) + (activeClip.trimStart ?? 0);
        if (Math.abs(video.currentTime - relativeTime) > 0.1) video.currentTime = relativeTime;
      }
      return;
    }
    const last = sorted[sorted.length - 1];
    if (!last) return;
    setActiveVideoId(last.id);
    const lastVideo = videoRefs.current[last.id];
    if (lastVideo) lastVideo.currentTime = last.duration;
  }, [currentTime, videoClips]);

  const getVideoDuration = (url: string): Promise<number> =>
    new Promise(resolve => { const v = document.createElement('video'); v.src = url; v.onloadedmetadata = () => resolve(v.duration); v.onerror = () => resolve(0); });

  const getAudioDuration = (url: string): Promise<number> =>
    new Promise(resolve => { const a = new Audio(url); a.onloadedmetadata = () => resolve(a.duration); a.onerror = () => resolve(0); });

  const handleVideoUpload = async (files: File[]) => {
    const newClips: VideoClip[] = await Promise.all(files.map(async (file) => {
      const url = URL.createObjectURL(file);
      const duration = await getVideoDuration(url);
      return { id: Math.random().toString(36).substr(2, 9), file, url, duration, startTime: 0, name: file.name };
    }));
    setVideoClips(prev => [...prev, ...newClips]);
  };

  const handleVoiceoverUpload = async (files: File[]) => {
    if (files.length === 0) return;
    const file = files[0];
    const url = URL.createObjectURL(file);
    const duration = await getAudioDuration(url);
    setVoiceover({ file, url, duration });
  };

  const handleGenerateFromScript = async (script: string, voice: string) => {
    setIsGeneratingAudio(true);
    try {
      const result = await generateAudioFromScript(script, voice);
      setVoiceover({ url: result.url, duration: result.duration, transcription: result.transcription });
    } catch (err) {
      console.error('TTS generation failed:', err);
      alert('Failed to generate audio. Please try again.');
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleGenerateNarration = async (voice: string) => {
    setIsGeneratingAudio(true);
    try {
      const updatedClips = await Promise.all(videoClips.map(async (clip) => {
        if (clip.analysis) return clip;
        const analysis = await analyzeVideo(clip.file);
        return { ...clip, analysis };
      }));
      setVideoClips(updatedClips);
      const result = await generateNarrationFromVideos(
        updatedClips.map(c => ({ name: c.name, analysis: c.analysis ?? '', duration: c.duration })), voice
      );
      setVoiceover({ url: result.url, duration: result.duration, transcription: result.transcription });
    } catch (err) {
      console.error('Narration generation failed:', err);
      alert('Failed to generate narration. Please try again.');
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleAutoAlign = async () => {
    if (!voiceover || videoClips.length === 0) return;
    setIsAligning(true);
    try {
      // Get transcription if we don't have one yet
      let transcription = voiceover.transcription ?? '';
      let segments = voiceover.segments ?? [];
      if (voiceover.file && !transcription) {
        const result = await analyzeVoiceover(voiceover.file);
        transcription = result.transcription;
        segments = result.segments;
      }
      // Always ensure segments exist (needed for PostProcessingPanel unlock)
      if (transcription && segments.length === 0) {
        segments = estimateSegments(transcription, voiceover.duration);
      }
      if (transcription) {
        setVoiceover(prev => prev ? { ...prev, transcription, segments } : null);
      }

      // Analyze any un-analyzed clips
      const updatedClips = await Promise.all(videoClips.map(async (clip): Promise<VideoClip> => {
        if (clip.analysis) return clip;
        const analysis = await analyzeVideo(clip.file);
        return { ...clip, analysis };
      }));
      setVideoClips(updatedClips);

      // Get the AI-suggested play order with per-position alternatives
      const entries: AlignmentEntry[] = await suggestAlignment(
        transcription,
        updatedClips.map(c => ({ id: c.id, name: c.name, analysis: c.analysis!, duration: c.trimmedDuration ?? c.duration }))
      );

      // Reorder clips according to AI suggestion, storing alternatives on each clip
      const clipMap = new Map(updatedClips.map(c => [c.id, c]));
      const orderedClips: VideoClip[] = entries
        .map((entry): VideoClip | null => {
          const clip = clipMap.get(entry.id) as VideoClip | undefined;
          if (!clip) return null;
          const v: VideoClip = clip;
          return { ...v, alternatives: entry.alternatives };
        })
        .filter((c): c is VideoClip => c !== null);
      // Append any clips the AI missed (safety net, clear their alternatives)
      const includedIds = new Set(entries.map(e => e.id));
      updatedClips.forEach(c => { if (!includedIds.has(c.id)) orderedClips.push({ ...c, alternatives: [] }); });

      setVideoClips(chainClips(orderedClips));
    } catch (error) {
      console.error('Alignment failed:', error);
      alert('Failed to align clips. Please try again.');
    } finally {
      setIsAligning(false);
    }
  };

  const removeVideo = (id: string) => {
    const clip = videoClips.find(c => c.id === id);
    if (clip) URL.revokeObjectURL(clip.url);
    setVideoClips(videoClips.filter(c => c.id !== id));
  };

  // Swap a clip with one of its alternatives on the timeline (preserves chainClips order)
  const handleSwapClip = (clipId: string, altId: string) => {
    setVideoClips(prev => {
      const sorted = [...prev].sort((a, b) => a.startTime - b.startTime);
      const idxA = sorted.findIndex(c => c.id === clipId);
      const idxB = sorted.findIndex(c => c.id === altId);
      if (idxA === -1 || idxB === -1) return prev;
      // Swap the two clips in the ordered array, keeping each clip's alternatives
      const tmp = sorted[idxA];
      sorted[idxA] = { ...sorted[idxB], alternatives: tmp.alternatives };
      sorted[idxB] = { ...tmp, alternatives: sorted[idxA].alternatives };
      return chainClips(sorted);
    });
  };

  const handleClipEdit = (updated: VideoClip) => setVideoClips(prev => prev.map(c => c.id === updated.id ? updated : c));
  const handleOnboardingNext = () => { if (onboardingStep === 1) setOnboardingStep(2); else setOnboardingStep(null); };
  const editingClip = videoClips.find(c => c.id === editingClipId) ?? null;

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-gray-900 font-sans">
      <AnimatePresence>
        {onboardingStep !== null && (
          <OnboardingModal
            step={onboardingStep}
            onStepComplete={handleOnboardingNext}
            onVideoUpload={handleVideoUpload}
            videoClips={videoClips}
            onVoiceoverUpload={handleVoiceoverUpload}
            onGenerateFromScript={handleGenerateFromScript}
            onGenerateNarration={handleGenerateNarration}
            isGenerating={isGeneratingAudio}
          />
        )}
      </AnimatePresence>

      <header className="h-14 bg-white/80 backdrop-blur-xl border-b border-gray-200/70 flex items-center justify-between px-8 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-violet-200">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-gray-900 leading-none">Syncro</h1>
            <p className="text-[9px] text-gray-400 uppercase tracking-widest font-semibold mt-0.5">Video Editing Copilot</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-gray-500">
            <Clock className="w-3 h-3" />
            {currentTime.toFixed(2)}s
          </div>
          <button
            onClick={() => setShowLogs(v => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              showLogs ? 'bg-violet-100 text-violet-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            )}
          >
            <Activity className="w-3 h-3" /> Logs
          </button>
          <button
            onClick={() => { setApiKeyInput(''); setShowApiKeyModal(true); }}
            title={hasApiKey() ? 'Change Gemini API key' : 'Set Gemini API key (required)'}
            className={cn(
              'p-2 rounded-full transition-colors',
              hasApiKey() ? 'text-gray-400 hover:text-violet-600 hover:bg-violet-50' : 'text-amber-500 hover:text-amber-600 bg-amber-50 animate-pulse'
            )}
          >
            <Key className="w-4 h-4" />
          </button>
          {onboardingStep === null && (
            <button onClick={() => setOnboardingStep(1)}
              className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold rounded-full transition-colors">
              + New Project
            </button>
          )}
          <button
            onClick={() => setShowExportModal(true)}
            className="px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-full transition-colors shadow shadow-violet-200 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </header>

      <main className="p-6 max-w-[1600px] mx-auto grid grid-cols-12 gap-6">
        <div className="col-span-3 space-y-5">
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <Music className="w-3.5 h-3.5" /> Voiceover
              </h2>
              {voiceover && (
                <button onClick={() => setVoiceover(null)} className="text-gray-300 hover:text-red-400 transition-colors p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="p-4">
              {!voiceover ? (
                <div onClick={() => setOnboardingStep(2)}
                  className="flex flex-col items-center gap-2 py-6 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-violet-300 hover:bg-violet-50/50 transition-all group">
                  <div className="w-9 h-9 bg-gray-100 group-hover:bg-violet-100 rounded-xl flex items-center justify-center transition-colors">
                    <Music className="w-4 h-4 text-gray-400 group-hover:text-violet-500" />
                  </div>
                  <p className="text-xs font-medium text-gray-400 group-hover:text-violet-500 transition-colors">Add voiceover</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-violet-100 text-violet-600 rounded-xl flex items-center justify-center shrink-0">
                      <Music className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{voiceover.file?.name ?? 'AI Generated'}</p>
                      <p className="text-xs text-gray-400">
                        {voiceover.trimStart !== undefined || voiceover.trimEnd !== undefined
                          ? `${((voiceover.trimEnd ?? voiceover.duration) - (voiceover.trimStart ?? 0)).toFixed(1)}s trimmed`
                          : `${voiceover.duration.toFixed(1)}s`}
                      </p>
                    </div>
                    <button onClick={() => setShowVoiceoverEditor(v => !v)} className="p-1.5 text-gray-300 hover:text-violet-500 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {voiceover.transcription && (
                    <div className="p-3 bg-gray-50 rounded-xl text-[11px] text-gray-500 leading-relaxed max-h-28 overflow-y-auto border border-gray-100">
                      <span className="font-bold text-gray-300 uppercase text-[9px] block mb-1">Transcript</span>
                      {voiceover.transcription}
                    </div>
                  )}
                  {showVoiceoverEditor && (
                    <VoiceoverEditor voiceover={voiceover} onSave={v => { setVoiceover(v); setShowVoiceoverEditor(false); }} onClose={() => setShowVoiceoverEditor(false)} />
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <Video className="w-3.5 h-3.5" /> Video Clips
              </h2>
              <span className="text-[10px] font-bold bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full">{videoClips.length}</span>
            </div>
            <div className="p-4 space-y-3">
              <FileUploader label="Add Videos" accept={{ 'video/*': ['.mp4', '.mov', '.webm'] }} onFilesAdded={handleVideoUpload} icon={<Video className="w-5 h-5" />} />
              <AnimatePresence mode="popLayout">
                {videoClips.map((clip) => (
                  <motion.div key={clip.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                    className={cn('border rounded-xl p-3 group transition-all',
                      activeVideoId === clip.id ? 'border-violet-300 bg-violet-50 ring-1 ring-violet-200' : 'border-gray-100 bg-gray-50 hover:border-gray-200')}>
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-gray-200 rounded-lg overflow-hidden relative shrink-0">
                        <video src={clip.url} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play className="w-3 h-3 text-white fill-white" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-700 truncate">{clip.name}</p>
                        <p className="text-[10px] text-gray-400">
                          {clip.trimStart !== undefined || clip.trimmedDuration !== undefined
                            ? `${(clip.trimmedDuration ?? (clip.duration - (clip.trimStart ?? 0))).toFixed(1)}s trimmed`
                            : `${clip.duration.toFixed(1)}s`}
                        </p>
                        {clip.analysis && (
                          <div className="flex items-center gap-1 mt-1">
                            <div className="w-3 h-3 rounded-full bg-emerald-500 flex items-center justify-center">
                              <svg className="w-2 h-2 text-white" viewBox="0 0 10 10" fill="none">
                                <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </div>
                            <span className="text-[10px] font-medium text-emerald-600">Analyzed</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditingClipId(clip.id)} className="p-1.5 text-gray-300 hover:text-violet-500 transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => removeVideo(clip.id)} className="p-1.5 text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>
        </div>

        <div className="col-span-9 space-y-5">
          <section className="bg-gray-900 rounded-2xl overflow-hidden relative shadow-xl border border-gray-200" style={{ height: previewHeight }}>
            <div className="absolute inset-0 flex items-center justify-center">
              {videoClips.length > 0 ? (() => {
                const sorted = [...videoClips].sort((a, b) => a.startTime - b.startTime);
                const TRANS_DUR = 0.5;
                return videoClips.map((clip) => {
                  const isActive = activeVideoId === clip.id;
                  const idx = sorted.findIndex(c => c.id === clip.id);
                  const next = sorted[idx + 1];
                  const transIn = clip.transitionIn ?? 'cut';
                  const nextTransIn = next?.transitionIn ?? 'cut';
                  const isWipe = transIn === 'wipe';

                  // choose transition duration based on which way this clip is moving
                  const movingDur = isActive
                    ? (transIn !== 'cut' ? `${TRANS_DUR * 1000}ms` : '0ms')
                    : (nextTransIn !== 'cut' ? `${TRANS_DUR * 1000}ms` : '0ms');

                  const style: React.CSSProperties = isWipe
                    ? {
                        opacity: 1,
                        clipPath: isActive ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)',
                        transition: `clip-path ${movingDur} ease`,
                        pointerEvents: isActive ? 'auto' : 'none',
                      }
                    : {
                        opacity: isActive ? 1 : 0,
                        transition: `opacity ${movingDur} ease`,
                        pointerEvents: isActive ? 'auto' : 'none',
                      };

                  return (
                    <video
                      key={clip.id}
                      ref={(el) => { if (el) videoRefs.current[clip.id] = el; }}
                      src={clip.url}
                      muted
                      playsInline
                      className="absolute inset-0 w-full h-full object-contain"
                      style={style}
                    />
                  );
                });
              })() : (
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center mx-auto">
                    <Video className="w-7 h-7 text-gray-600" />
                  </div>
                  <p className="text-gray-500 text-sm">Upload videos to get started</p>
                </div>
              )}
            </div>
            {activeVideoId && (() => {
              const activeClip = videoClips.find(c => c.id === activeVideoId);
              return activeClip?.textOverlay ? (
                <div className="absolute bottom-6 left-0 right-0 flex justify-center px-8 pointer-events-none">
                  <span className="bg-black/60 backdrop-blur-sm text-white text-sm font-semibold px-5 py-2 rounded-xl max-w-lg text-center">
                    {activeClip.textOverlay}
                  </span>
                </div>
              ) : null;
            })()}
            {captionsEnabled && voiceover?.segments && (
              <CaptionOverlay segments={voiceover.segments} currentTime={currentTime} style={captionStyle} />
            )}
            <div className="absolute top-4 left-4">
              <div className="px-3 py-1.5 bg-black/50 backdrop-blur-md rounded-full text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
                Live Preview
              </div>
            </div>
            {/* Resize handle */}
            <div
              className="absolute bottom-0 left-0 right-0 h-4 cursor-ns-resize flex items-end justify-center pb-1 z-20 group"
              onMouseDown={(e) => {
                isResizingPreview.current = true;
                resizeStartY.current = e.clientY;
                resizeStartH.current = previewHeight;
                e.preventDefault();
              }}
            >
              <div className="w-10 h-1 bg-white/20 group-hover:bg-white/60 rounded-full transition-colors" />
            </div>
          </section>

          <Timeline
            voiceover={voiceover}
            onVoiceoverChange={setVoiceover}
            videoClips={videoClips}
            onVideoClipChange={setVideoClips}
            onAutoAlign={handleAutoAlign}
            onSwapClip={handleSwapClip}
            onDeleteClip={removeVideo}
            isAligning={isAligning}
            currentTime={currentTime}
            onTimeUpdate={setCurrentTime}
          />
        </div>
      </main>

      {editingClipId && editingClip && (
        <ClipEditor clip={editingClip} onSave={handleClipEdit} onClose={() => setEditingClipId(null)} />
      )}

      {showLogs && <LogPanel onClose={() => setShowLogs(false)} />}

      {/* Export Modal */}
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-[100] flex items-end justify-end bg-black/30 backdrop-blur-sm" onClick={() => setShowExportModal(false)}>
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              className="relative h-full max-h-screen w-full max-w-xl bg-[#F5F5F7] border-l border-gray-200 shadow-2xl overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-xl border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-violet-600" />
                  <span className="text-sm font-bold text-gray-900">Export &amp; Post-Processing</span>
                </div>
                <button onClick={() => setShowExportModal(false)} className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors text-sm font-bold">
                  ✕
                </button>
              </div>
              <div className="p-5">
                <PostProcessingPanel
                  voiceover={voiceover}
                  videoClips={videoClips}
                  currentTime={currentTime}
                  captionStyle={captionStyle}
                  captionsEnabled={captionsEnabled}
                  onCaptionStyleChange={setCaptionStyle}
                  onCaptionsEnabledChange={setCaptionsEnabled}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* API Key Modal */}
      <AnimatePresence>
        {showApiKeyModal && (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 backdrop-blur-sm"
            onClick={() => { if (hasApiKey()) setShowApiKeyModal(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md mx-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-violet-100 rounded-2xl flex items-center justify-center">
                  <Key className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Gemini API Key</h2>
                  <p className="text-xs text-gray-400">Required for AI features</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Get your key from{' '}
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer"
                  className="text-violet-600 hover:underline font-medium">aistudio.google.com</a>.
                It's stored only in your browser.
              </p>
              <input
                type="password"
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && apiKeyInput.trim()) { setApiKey(apiKeyInput.trim()); setShowApiKeyModal(false); } }}
                placeholder="AIza…"
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent mb-4 font-mono"
              />
              <div className="flex gap-3">
                {hasApiKey() && (
                  <button
                    onClick={() => setShowApiKeyModal(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={() => { if (apiKeyInput.trim()) { setApiKey(apiKeyInput.trim()); setShowApiKeyModal(false); } }}
                  disabled={!apiKeyInput.trim()}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold transition-colors shadow shadow-violet-200"
                >
                  Save Key
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
