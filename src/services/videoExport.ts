import type { VideoClip, Voiceover } from '../types';

const OUTPUT_WIDTH = 1280;
const OUTPUT_HEIGHT = 720;
const FPS = 30;

function preloadVideos(clips: VideoClip[]): Promise<HTMLVideoElement[]> {
  const elements = clips.map((clip) => {
    const video = document.createElement('video');
    video.src = clip.url;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    return new Promise<HTMLVideoElement>((resolve, reject) => {
      video.onloadeddata = () => resolve(video);
      video.onerror = () => reject(new Error(`Failed to load ${clip.name}`));
    });
  });
  return Promise.all(elements);
}

function getActiveClip(clips: VideoClip[], time: number): { clip: VideoClip; index: number } | null {
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    if (time >= clip.startTime && time < clip.startTime + clip.duration) {
      return { clip, index: i };
    }
  }
  return null;
}

/**
 * Records the current timeline (video clips + optional voiceover) to a WebM blob.
 * Plays back in real-time and captures via Canvas + MediaRecorder.
 */
export async function recordTimelineToWebM(
  videoClips: VideoClip[],
  voiceover: Voiceover | null,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const sortedClips = [...videoClips].sort((a, b) => a.startTime - b.startTime);
  const totalDuration = Math.max(
    voiceover?.duration ?? 0,
    ...sortedClips.map((c) => c.startTime + c.duration),
    1
  );

  const videoElements = await preloadVideos(sortedClips);

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');

  const stream = canvas.captureStream(FPS);

  let audioStream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let audioEl: HTMLAudioElement | null = null;

  if (voiceover) {
    audioEl = new Audio(voiceover.url);
    audioCtx = new AudioContext();
    const source = audioCtx.createMediaElementSource(audioEl);
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(dest);
    source.connect(audioCtx.destination);
    audioStream = dest.stream;
  }

  const combinedStream = audioStream
    ? new MediaStream([...stream.getVideoTracks(), ...audioStream.getAudioTracks()])
    : new MediaStream(stream.getVideoTracks());

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : 'video/webm';
  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 2500000,
    audioBitsPerSecond: 128000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      audioEl?.pause();
      audioCtx?.close();
      combinedStream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: mimeType });
      resolve(blob);
    };
    recorder.onerror = () => reject(new Error('Recording failed'));

    recorder.start(100);

    const startTime = performance.now();
    audioEl?.play().catch(() => {});

    const tick = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      if (elapsed >= totalDuration) {
        recorder.stop();
        return;
      }
      onProgress?.(elapsed, totalDuration);

      const active = getActiveClip(sortedClips, elapsed);
      if (active) {
        const video = videoElements[active.index];
        const relativeTime = elapsed - active.clip.startTime;
        if (Math.abs(video.currentTime - relativeTime) > 0.05) {
          video.currentTime = relativeTime;
        }
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
        try {
          ctx.drawImage(video, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
        } catch {
          // frame may not be ready
        }
      } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      }

      if (audioEl && voiceover && Math.abs(audioEl.currentTime - elapsed) > 0.1) {
        audioEl.currentTime = elapsed;
      }

      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

let ffmpegLoaded: Promise<{ ffmpeg: import('@ffmpeg/ffmpeg').FFmpeg; fetchFile: typeof import('@ffmpeg/util').fetchFile }> | null = null;

async function loadFfmpeg() {
  if (ffmpegLoaded) return ffmpegLoaded;
  const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
    import('@ffmpeg/ffmpeg'),
    import('@ffmpeg/util'),
  ]);
  const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  ffmpegLoaded = Promise.resolve({ ffmpeg, fetchFile });
  return ffmpegLoaded;
}

/**
 * Converts a WebM blob to MP4 using ffmpeg.wasm.
 */
export async function webmToMp4(webmBlob: Blob): Promise<Blob> {
  const { ffmpeg, fetchFile } = await loadFfmpeg();
  const data = new Uint8Array(await webmBlob.arrayBuffer());
  await ffmpeg.writeFile('input.webm', data);
  await ffmpeg.exec(['-i', 'input.webm', 'output.mp4']);
  const out = await ffmpeg.readFile('output.mp4');
  await ffmpeg.deleteFile('input.webm');
  await ffmpeg.deleteFile('output.mp4');
  return new Blob([out], { type: 'video/mp4' });
}
