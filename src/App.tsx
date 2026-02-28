import React, { useState, useRef, useEffect } from 'react';
import { VideoClip, Voiceover, WorkflowMode } from './types';
import { FileUploader } from './components/FileUploader';
import { Timeline } from './components/Timeline';
import { analyzeVoiceover, analyzeVideo, suggestAlignment, generateAudioFromScript, generateNarrationFromVideos } from './services/gemini';
import { 
  Video, 
  Music, 
  Trash2, 
  ChevronRight, 
  Sparkles, 
  Layers,
  Info,
  Play,
  Pause,
  Clock,
  FileText,
  Mic2,
  Wand2,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [videoClips, setVideoClips] = useState<VideoClip[]>([]);
  const [voiceover, setVoiceover] = useState<Voiceover | null>(null);
  const [isAligning, setIsAligning] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [mode, setMode] = useState<WorkflowMode>('upload-both');
  const [script, setScript] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('Aoede');
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const videoRefs = useRef<Record<string, HTMLVideoElement>>({});

  const VOICES = ['Aoede', 'Charon', 'Fenrir', 'Kore', 'Puck'];

  const handleModeChange = (newMode: WorkflowMode) => {
    setMode(newMode);
    setVoiceover(null);
    setScript('');
  };

  // Sync video playback with timeline time
  useEffect(() => {
    // Sort by startTime so later clips take priority over earlier ones when times overlap
    const sorted = [...videoClips].sort((a, b) => b.startTime - a.startTime);
    const activeClip = sorted.find((clip) => {
      const end = clip.startTime + (clip.trimmedDuration ?? clip.duration);
      return currentTime >= clip.startTime && currentTime < end;
    });

    if (activeClip) {
      setActiveVideoId(activeClip.id);
      const video = videoRefs.current[activeClip.id];
      if (video) {
        const relativeTime = currentTime - activeClip.startTime;
        if (Math.abs(video.currentTime - relativeTime) > 0.1) {
          video.currentTime = relativeTime;
        }
      }
    } else {
      setActiveVideoId(null);
    }
  }, [currentTime, videoClips]);

  const handleVideoUpload = async (files: File[]) => {
    const newClips: VideoClip[] = await Promise.all(
      files.map(async (file) => {
        const url = URL.createObjectURL(file);
        const duration = await getVideoDuration(url);
        return {
          id: Math.random().toString(36).substr(2, 9),
          file,
          url,
          duration,
          startTime: 0,
          name: file.name,
        };
      })
    );
    setVideoClips([...videoClips, ...newClips]);
  };

  const handleVoiceoverUpload = async (files: File[]) => {
    if (files.length === 0) return;
    const file = files[0];
    const url = URL.createObjectURL(file);
    const duration = await getAudioDuration(url);
    setVoiceover({ file, url, duration });
  };

  const getVideoDuration = (url: string): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = url;
      video.onloadedmetadata = () => resolve(video.duration);
    });
  };

  const getAudioDuration = (url: string): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio(url);
      audio.onloadedmetadata = () => resolve(audio.duration);
    });
  };

  const handleGenerateFromScript = async () => {
    if (!script.trim()) return;
    setIsGeneratingAudio(true);
    try {
      const result = await generateAudioFromScript(script, selectedVoice);
      setVoiceover({ url: result.url, duration: result.duration, transcription: result.transcription });
    } catch (err) {
      console.error('TTS generation failed:', err);
      alert('Failed to generate audio. Please try again.');
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleGenerateNarration = async () => {
    if (videoClips.length === 0) return;
    setIsGeneratingAudio(true);
    try {
      // Analyze any clips that haven't been analyzed yet
      const updatedClips = await Promise.all(
        videoClips.map(async (clip) => {
          if (clip.analysis) return clip;
          const analysis = await analyzeVideo(clip.file);
          return { ...clip, analysis };
        })
      );
      setVideoClips(updatedClips);

      const result = await generateNarrationFromVideos(
        updatedClips.map(c => ({ name: c.name, analysis: c.analysis ?? '', duration: c.duration })),
        selectedVoice
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
      // 1. Build segments — keep in a local var so we don't read stale state later
      let segments = voiceover.segments ?? [];

      if (voiceover.file && segments.length === 0) {
        const result = await analyzeVoiceover(voiceover.file);
        segments = result.segments;
        setVoiceover(prev => prev ? { ...prev, transcription: result.transcription, segments } : null);
      } else if (voiceover.transcription && segments.length === 0) {
        // AI-generated audio: synthesize word-based segments from the transcription text
        const words = voiceover.transcription.split(/\s+/).filter(Boolean);
        const wordsPerSeg = Math.max(1, Math.round(words.length / Math.max(videoClips.length, 1)));
        const wordDuration = voiceover.duration / Math.max(words.length, 1);
        for (let i = 0; i < words.length; i += wordsPerSeg) {
          const chunk = words.slice(i, i + wordsPerSeg);
          segments.push({ text: chunk.join(' '), start: i * wordDuration, end: (i + chunk.length) * wordDuration });
        }
        setVoiceover(prev => prev ? { ...prev, segments } : null);
      }

      // 2. Analyze videos (only those without analysis)
      const updatedClips = await Promise.all(
        videoClips.map(async (clip) => {
          if (clip.analysis) return clip;
          const analysis = await analyzeVideo(clip.file);
          return { ...clip, analysis };
        })
      );
      setVideoClips(updatedClips);

      // 3. Suggest alignment using the freshly computed segments
      const alignment = await suggestAlignment(
        segments,
        updatedClips.map(c => ({ id: c.id, name: c.name, analysis: c.analysis!, duration: c.trimmedDuration ?? c.duration }))
      );

      // 4. Apply alignment
      const alignedClips = updatedClips.map(clip => {
        const match = alignment.find(a => a.videoId === clip.id);
        return match ? { ...clip, startTime: match.startTime } : clip;
      });
      setVideoClips(alignedClips);
    } catch (error) {
      console.error("Alignment failed:", error);
      alert("Failed to align clips. Please try again.");
    } finally {
      setIsAligning(false);
    }
  };

  const removeVideo = (id: string) => {
    setVideoClips(videoClips.filter(c => c.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-zinc-900 font-sans">
      {/* Header */}
      <header className="h-16 border-b bg-white flex items-center justify-between px-8 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">SyncVoice</h1>
            <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">AI Video Aligner</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 rounded-lg text-xs font-medium text-zinc-600">
            <Clock className="w-3.5 h-3.5" />
            {currentTime.toFixed(2)}s
          </div>
        </div>
      </header>

      {/* Mode Selector */}
      <div className="border-b bg-white px-8 py-3 flex items-center gap-3">
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider mr-2">Workflow</span>
        {([
          { id: 'upload-both', label: 'Videos + Audio', icon: <Music className="w-3.5 h-3.5" />, color: 'emerald' },
          { id: 'script-video', label: 'Script + Videos', icon: <FileText className="w-3.5 h-3.5" />, color: 'blue' },
          { id: 'video-only', label: 'Videos Only', icon: <Wand2 className="w-3.5 h-3.5" />, color: 'violet' },
        ] as const).map(m => (
          <button
            key={m.id}
            onClick={() => handleModeChange(m.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all",
              mode === m.id
                ? m.color === 'emerald' ? "bg-emerald-600 text-white shadow shadow-emerald-200"
                  : m.color === 'blue' ? "bg-blue-600 text-white shadow shadow-blue-200"
                  : "bg-violet-600 text-white shadow shadow-violet-200"
                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
            )}
          >
            {m.icon}
            {m.label}
          </button>
        ))}
      </div>

      <main className="p-8 max-w-[1600px] mx-auto grid grid-cols-12 gap-8">
        {/* Sidebar: Assets */}
        <div className="col-span-3 space-y-6">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Music className="w-4 h-4" /> Voiceover
              </h2>
            </div>

            {/* Mode A: Upload audio file */}
            {mode === 'upload-both' && (
              !voiceover ? (
                <FileUploader
                  label="Upload Voiceover"
                  accept={{ 'audio/*': ['.mp3', '.wav', '.m4a'] }}
                  onFilesAdded={handleVoiceoverUpload}
                  multiple={false}
                  icon={<Music className="w-6 h-6" />}
                />
              ) : (
                <VoiceoverCard voiceover={voiceover} onRemove={() => setVoiceover(null)} />
              )
            )}

            {/* Mode B: Script input → TTS */}
            {mode === 'script-video' && (
              !voiceover ? (
                <div className="space-y-3">
                  <textarea
                    value={script}
                    onChange={e => setScript(e.target.value)}
                    placeholder="Paste or type your narration script here..."
                    className="w-full h-36 text-xs p-3 rounded-xl border border-zinc-200 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 text-zinc-700 placeholder:text-zinc-400"
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedVoice}
                      onChange={e => setSelectedVoice(e.target.value)}
                      className="flex-1 text-xs border border-zinc-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    >
                      {VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <button
                      onClick={handleGenerateFromScript}
                      disabled={!script.trim() || isGeneratingAudio}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      {isGeneratingAudio ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic2 className="w-3.5 h-3.5" />}
                      Generate
                    </button>
                  </div>
                </div>
              ) : (
                <VoiceoverCard voiceover={voiceover} onRemove={() => setVoiceover(null)} />
              )
            )}

            {/* Mode C: AI auto-narration from videos */}
            {mode === 'video-only' && (
              !voiceover ? (
                <div className="space-y-3">
                  <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 text-xs text-violet-700 leading-relaxed flex gap-3">
                    <Wand2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <p>AI will analyze your videos and write + generate a narration automatically.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedVoice}
                      onChange={e => setSelectedVoice(e.target.value)}
                      className="flex-1 text-xs border border-zinc-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                    >
                      {VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <button
                      onClick={handleGenerateNarration}
                      disabled={videoClips.length === 0 || isGeneratingAudio}
                      className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      {isGeneratingAudio ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      Narrate
                    </button>
                  </div>
                </div>
              ) : (
                <VoiceoverCard voiceover={voiceover} onRemove={() => setVoiceover(null)} />
              )
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Video className="w-4 h-4" /> Video Clips
              </h2>
              <span className="text-[10px] font-bold bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">
                {videoClips.length}
              </span>
            </div>
            
            <FileUploader
              label="Add Videos"
              accept={{ 'video/*': ['.mp4', '.mov', '.webm'] }}
              onFilesAdded={handleVideoUpload}
              icon={<Video className="w-6 h-6" />}
            />

            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {videoClips.map((clip) => (
                  <motion.div
                    key={clip.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={cn(
                      "bg-white border rounded-2xl p-3 shadow-sm group transition-all",
                      activeVideoId === clip.id ? "border-emerald-500 ring-1 ring-emerald-500/20" : "hover:border-zinc-300"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-zinc-100 rounded-lg overflow-hidden relative">
                          <video src={clip.url} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="w-4 h-4 text-white fill-white" />
                          </div>
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-xs font-medium truncate w-32">{clip.name}</p>
                          <p className="text-[10px] text-zinc-400">{clip.duration.toFixed(1)}s</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => removeVideo(clip.id)}
                        className="p-2 text-zinc-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {clip.analysis && (
                      <div className="mt-2 text-[10px] text-zinc-500 italic bg-zinc-50 p-2 rounded-lg border border-zinc-100">
                        {clip.analysis}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>
        </div>

        {/* Main Content: Preview & Timeline */}
        <div className="col-span-9 space-y-8">
          {/* Preview Area */}
          <section className="aspect-video bg-zinc-900 rounded-3xl overflow-hidden relative shadow-2xl border border-white/10">
            <div className="absolute inset-0 flex items-center justify-center">
              {activeVideoId ? (
                videoClips.map((clip) => (
                  <video
                    key={clip.id}
                    ref={(el) => { if (el) videoRefs.current[clip.id] = el; }}
                    src={clip.url}
                    className={cn(
                      "absolute inset-0 w-full h-full object-contain transition-opacity duration-300",
                      activeVideoId === clip.id ? "opacity-100" : "opacity-0 pointer-events-none"
                    )}
                    muted
                    playsInline
                  />
                ))
              ) : (
                <div className="text-center space-y-4">
                  <div className="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center mx-auto">
                    <Video className="w-8 h-8 text-zinc-600" />
                  </div>
                  <p className="text-zinc-500 text-sm font-medium">No active clip at this time</p>
                </div>
              )}
            </div>
            
            {/* Overlay Info */}
            <div className="absolute top-6 left-6 flex items-center gap-3">
              <div className="px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10 text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                Live Preview
              </div>
            </div>
          </section>

          {/* Timeline Area */}
          <Timeline
            voiceover={voiceover}
            videoClips={videoClips}
            onVideoClipChange={setVideoClips}
            onAutoAlign={handleAutoAlign}
            isAligning={isAligning}
            currentTime={currentTime}
            onTimeUpdate={setCurrentTime}
          />

          {/* Instructions / Help */}
          <div className="grid grid-cols-3 gap-6">
            <div className="bg-white border rounded-2xl p-6 flex gap-4">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold mb-1">1. Upload Assets</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">Add your voiceover track and the video clips you want to sync.</p>
              </div>
            </div>
            <div className="bg-white border rounded-2xl p-6 flex gap-4">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold mb-1">2. AI Analysis</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">Click "Auto-Align" to let Gemini analyze content and suggest timing.</p>
              </div>
            </div>
            <div className="bg-white border rounded-2xl p-6 flex gap-4">
              <div className="w-10 h-10 bg-zinc-50 text-zinc-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <Info className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold mb-1">3. Fine Tune</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">Drag clips on the timeline to perfect the timing and sequence.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
function VoiceoverCard({ voiceover, onRemove }: { voiceover: Voiceover; onRemove: () => void }) {
  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm group">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
            <Music className="w-4 h-4" />
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-medium truncate w-32">{voiceover.file?.name ?? 'AI Generated'}</p>
            <p className="text-[10px] text-zinc-400">{voiceover.duration.toFixed(1)}s</p>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="p-2 text-zinc-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      {voiceover.transcription && (
        <div className="mt-2 p-3 bg-zinc-50 rounded-xl text-[11px] text-zinc-600 leading-relaxed max-h-32 overflow-y-auto border border-zinc-100">
          <span className="font-bold text-zinc-400 uppercase text-[9px] block mb-1">Transcription</span>
          {voiceover.transcription}
        </div>
      )}
    </div>
  );
}