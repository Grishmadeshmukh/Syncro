import React, { useState, useRef, useEffect } from 'react';
import { VideoClip, Voiceover } from './types';
import { FileUploader } from './components/FileUploader';
import { Timeline } from './components/Timeline';
import { analyzeVoiceover, analyzeVideo, suggestAlignment } from './services/gemini';
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
  Download
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
  const videoRefs = useRef<Record<string, HTMLVideoElement>>({});

  // Sync video playback with timeline time
  useEffect(() => {
    const activeClip = videoClips.find(
      clip => currentTime >= clip.startTime && currentTime <= clip.startTime + clip.duration
    );
    
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

  const handleAutoAlign = async () => {
    if (!voiceover || videoClips.length === 0) return;
    
    setIsAligning(true);
    try {
      // 1. Analyze voiceover
      const { transcription, segments } = await analyzeVoiceover(voiceover.file);
      setVoiceover(prev => prev ? { ...prev, transcription, segments } : null);

      // 2. Analyze videos (only those without analysis)
      const updatedClips = await Promise.all(
        videoClips.map(async (clip) => {
          if (clip.analysis) return clip;
          const analysis = await analyzeVideo(clip.file);
          return { ...clip, analysis };
        })
      );
      setVideoClips(updatedClips);

      // 3. Suggest alignment
      const alignment = await suggestAlignment(
        segments,
        updatedClips.map(c => ({ id: c.id, name: c.name, analysis: c.analysis! }))
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

  const handleDownload = () => {
    const totalDuration = Math.max(
      voiceover?.duration || 0,
      ...videoClips.map((c) => c.startTime + c.duration)
    );
    const exportData = {
      exportedAt: new Date().toISOString(),
      voiceover: voiceover
        ? {
            fileName: voiceover.file.name,
            duration: voiceover.duration,
            transcription: voiceover.transcription,
          }
        : null,
      videoClips: videoClips
        .slice()
        .sort((a, b) => a.startTime - b.startTime)
        .map((clip) => ({
          id: clip.id,
          name: clip.name,
          startTime: clip.startTime,
          duration: clip.duration,
          endTime: clip.startTime + clip.duration,
          analysis: clip.analysis,
        })),
      totalDuration,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `syncvoice-alignment-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
          <button
            onClick={handleDownload}
            disabled={videoClips.length === 0}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all",
              "bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        </div>
      </header>

      <main className="p-8 max-w-[1600px] mx-auto grid grid-cols-12 gap-8">
        {/* Sidebar: Assets */}
        <div className="col-span-3 space-y-6">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Music className="w-4 h-4" /> Voiceover
              </h2>
            </div>
            {!voiceover ? (
              <FileUploader
                label="Upload Voiceover"
                accept={{ 'audio/*': ['.mp3', '.wav', '.m4a'] }}
                onFilesAdded={handleVoiceoverUpload}
                multiple={false}
                icon={<Music className="w-6 h-6" />}
              />
            ) : (
              <div className="bg-white border rounded-2xl p-4 shadow-sm group">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                      <Music className="w-4 h-4" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-sm font-medium truncate w-32">{voiceover.file.name}</p>
                      <p className="text-[10px] text-zinc-400">{(voiceover.duration).toFixed(1)}s</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setVoiceover(null)}
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
