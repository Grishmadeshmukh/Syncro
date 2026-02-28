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
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Sort clips and chain them back-to-back from time 0, preserving AI-suggested order.
function chainClips(clips: VideoClip[]): VideoClip[] {
  if (clips.length === 0) return [];
  const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
  let cursor = 0;
  return sorted.map(clip => {
    const positioned = { ...clip, startTime: cursor };
    cursor += clip.duration;
    return positioned;
  });
}

export default function App() {
  const [videoClips, setVideoClips] = useState<VideoClip[]>([]);
  const [voiceover, setVoiceover] = useState<Voiceover | null>(null);
  const [isAligning, setIsAligning] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement>>({});

  // Sync video playback with timeline time.
  // Guarantees a clip is always visible — when currentTime falls in a gap or past
  // the last clip, we virtually loop the clip sequence so there's never a blank screen.
  useEffect(() => {
    if (videoClips.length === 0) {
      setActiveVideoId(null);
      return;
    }

    const sorted = [...videoClips].sort((a, b) => a.startTime - b.startTime);

    // 1. Clip that directly covers current time
    const coveringClip = sorted.find(
      clip => currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration
    );

    if (coveringClip) {
      setActiveVideoId(coveringClip.id);
      const video = videoRefs.current[coveringClip.id];
      if (video) {
        const t = currentTime - coveringClip.startTime;
        if (Math.abs(video.currentTime - t) > 0.1) video.currentTime = t;
      }
      return;
    }

    // 2. No clip at this time — virtually loop the full clip sequence so the
    //    screen is never blank (handles gaps from manual drags AND audio longer than video).
    const totalClipDuration = sorted.reduce((sum, c) => sum + c.duration, 0);
    if (totalClipDuration <= 0) return;

    // Map currentTime into [0, totalClipDuration) cyclically
    const loopedTime = currentTime % totalClipDuration;
    let elapsed = 0;
    for (const clip of sorted) {
      if (loopedTime >= elapsed && loopedTime < elapsed + clip.duration) {
        setActiveVideoId(clip.id);
        const video = videoRefs.current[clip.id];
        if (video) {
          const t = loopedTime - elapsed;
          if (Math.abs(video.currentTime - t) > 0.1) video.currentTime = t;
        }
        return;
      }
      elapsed += clip.duration;
    }

    // Fallback: hold on the last frame of the last clip
    const last = sorted[sorted.length - 1];
    setActiveVideoId(last.id);
    const lastVideo = videoRefs.current[last.id];
    if (lastVideo) lastVideo.currentTime = last.duration;
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

      // 5. Chain clips back-to-back (preserving AI order, closing all gaps).
      //    The preview's virtual-looping handles any remaining time beyond the last clip,
      //    so there is never a blank screen regardless of audio/video length mismatch.
      setVideoClips(chainClips(alignedClips));
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
    <div className="min-h-screen bg-[#1a1625] text-violet-100 font-sans">
      {/* Header */}
      <header className="h-16 border-b border-violet-800/50 bg-violet-950/80 flex items-center justify-between px-8 sticky top-0 z-50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">Syncro</h1>
            <p className="text-[10px] text-violet-400 uppercase tracking-widest font-bold">AI Video Aligner</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-900/50 border border-violet-700/50 rounded-lg text-xs font-medium text-violet-300">
            <Clock className="w-3.5 h-3.5" />
            {currentTime.toFixed(2)}s
          </div>
        </div>
      </header>

      <main className="p-8 max-w-[1600px] mx-auto grid grid-cols-12 gap-8">
        {/* Sidebar: Assets */}
        <div className="col-span-3 space-y-6">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-violet-400 flex items-center gap-2">
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
              <div className="bg-violet-900/30 border border-violet-700/50 rounded-2xl p-4 shadow-sm group">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-violet-500/30 text-violet-300 rounded-lg flex items-center justify-center">
                      <Music className="w-4 h-4" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-sm font-medium truncate w-32 text-violet-100">{voiceover.file.name}</p>
                      <p className="text-[10px] text-violet-400">{(voiceover.duration).toFixed(1)}s</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setVoiceover(null)}
                    className="p-2 text-violet-400 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {voiceover.transcription && (
                  <div className="mt-2 p-3 bg-violet-950/50 rounded-xl text-[11px] text-violet-300 leading-relaxed max-h-32 overflow-y-auto border border-violet-700/30">
                    <span className="font-bold text-violet-400 uppercase text-[9px] block mb-1">Transcription</span>
                    {voiceover.transcription}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-violet-400 flex items-center gap-2">
                <Video className="w-4 h-4" /> Video Clips
              </h2>
              <span className="text-[10px] font-bold bg-violet-800/50 text-violet-300 px-2 py-0.5 rounded-full border border-violet-600/50">
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
                      "bg-violet-900/30 border border-violet-700/50 rounded-2xl p-3 shadow-sm group transition-all",
                      activeVideoId === clip.id ? "border-violet-400 ring-1 ring-violet-400/30" : "hover:border-violet-600"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-violet-950 rounded-lg overflow-hidden relative">
                          <video src={clip.url} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="w-4 h-4 text-white fill-white" />
                          </div>
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-xs font-medium truncate w-32 text-violet-100">{clip.name}</p>
                          <p className="text-[10px] text-violet-400">{clip.duration.toFixed(1)}s</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => removeVideo(clip.id)}
                        className="p-2 text-violet-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {clip.analysis && (
                      <div className="mt-2 text-[10px] text-violet-400 italic bg-violet-950/50 p-2 rounded-lg border border-violet-700/30">
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
          <section className="aspect-video bg-black rounded-3xl overflow-hidden relative shadow-2xl border border-violet-800/40">
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
                  <div className="w-20 h-20 bg-violet-800/50 rounded-full flex items-center justify-center mx-auto border border-violet-600/30">
                    <Video className="w-8 h-8 text-violet-500" />
                  </div>
                  <p className="text-violet-400 text-sm font-medium">No active clip at this time</p>
                </div>
              )}
            </div>
            
            {/* Overlay Info */}
            <div className="absolute top-6 left-6 flex items-center gap-3">
              <div className="px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-violet-500/30 text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <div className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" />
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
            <div className="bg-violet-900/30 border border-violet-700/50 rounded-2xl p-6 flex gap-4">
              <div className="w-10 h-10 bg-violet-500/30 text-violet-300 rounded-xl flex items-center justify-center flex-shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold mb-1 text-violet-100">1. Upload Assets</h3>
                <p className="text-xs text-violet-400 leading-relaxed">Add your voiceover track and the video clips you want to sync.</p>
              </div>
            </div>
            <div className="bg-violet-900/30 border border-violet-700/50 rounded-2xl p-6 flex gap-4">
              <div className="w-10 h-10 bg-violet-500/30 text-violet-300 rounded-xl flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold mb-1 text-violet-100">2. AI Analysis</h3>
                <p className="text-xs text-violet-400 leading-relaxed">Click "Auto-Align" to let Gemini analyze content and suggest timing.</p>
              </div>
            </div>
            <div className="bg-violet-900/30 border border-violet-700/50 rounded-2xl p-6 flex gap-4">
              <div className="w-10 h-10 bg-violet-500/30 text-violet-300 rounded-xl flex items-center justify-center flex-shrink-0">
                <Info className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold mb-1 text-violet-100">3. Fine Tune</h3>
                <p className="text-xs text-violet-400 leading-relaxed">Drag clips on the timeline to perfect the timing and sequence.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
