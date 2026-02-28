import { VideoClip } from '../types';

/** Extract a frame from a video file at the given local timestamp. Returns a JPEG data URL. */
export function captureVideoFrame(clip: VideoClip, localTime: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = clip.url;
    video.muted = true;
    video.preload = 'auto';

    const cleanup = () => { try { video.remove(); } catch { /* ignore */ } };

    const onLoadedData = () => {
      video.currentTime = Math.max(0, Math.min(localTime, video.duration - 0.05));
    };

    const onSeeked = () => {
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { cleanup(); reject(new Error('Canvas context unavailable')); return; }
      ctx.drawImage(video, 0, 0, w, h);
      cleanup();
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };

    const onError = () => { cleanup(); reject(new Error('Video load error')); };

    video.addEventListener('loadeddata', onLoadedData, { once: true });
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });

    document.body.appendChild(video);
    video.load();
  });
}

/**
 * Takes a JPEG data URL, draws it onto a canvas, overlays a text quote,
 * and returns a new JPEG data URL. Rejects if the image is invalid.
 */
export function addQuoteOverlay(imageDataUrl: string, quote: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onerror = () => reject(new Error('Failed to load image for overlay'));

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context unavailable')); return; }

      ctx.drawImage(img, 0, 0);

      const trimmed = quote.trim();
      if (!trimmed) { resolve(canvas.toDataURL('image/jpeg', 0.93)); return; }

      const fontSize = Math.max(20, Math.round(canvas.width * 0.038));
      ctx.font = `bold ${fontSize}px Inter, Arial, sans-serif`;
      ctx.textAlign = 'center';

      const maxWidth = canvas.width * 0.8;
      const lines = wrapText(ctx, trimmed, maxWidth);
      if (lines.length === 0) { resolve(canvas.toDataURL('image/jpeg', 0.93)); return; }

      const lineHeight = fontSize * 1.3;
      const padX = 28;
      const padY = 14;
      const boxH = lines.length * lineHeight + padY * 2;
      const widths = lines.map(l => ctx.measureText(l).width);
      const boxW = Math.min(Math.max(...widths) + padX * 2, canvas.width - 60);
      const boxX = (canvas.width - boxW) / 2;
      const boxY = canvas.height - boxH - 48;

      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(boxX, boxY, boxW, boxH, 10);
      } else {
        ctx.rect(boxX, boxY, boxW, boxH);
      }
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${fontSize}px Inter, Arial, sans-serif`;
      lines.forEach((line, i) => {
        ctx.fillText(line, canvas.width / 2, boxY + padY + (i + 0.8) * lineHeight, maxWidth);
      });

      resolve(canvas.toDataURL('image/jpeg', 0.93));
    };

    img.src = imageDataUrl;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Wait long enough for browser to initiate the download before revoking
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Determine which clip (and its local time) is active at a given global timeline time. */
export function getClipAtTime(
  clips: VideoClip[],
  time: number
): { clip: VideoClip; localTime: number } | null {
  if (clips.length === 0) return null;
  const sorted = [...clips]
    .filter(c => c.duration > 0)
    .sort((a, b) => a.startTime - b.startTime);
  if (sorted.length === 0) return null;

  const covering = sorted.find(c => time >= c.startTime && time < c.startTime + c.duration);
  if (covering) return { clip: covering, localTime: time - covering.startTime };

  const total = sorted.reduce((s, c) => s + c.duration, 0);
  if (total <= 0) return null;
  const looped = time % total;
  let acc = 0;
  for (const c of sorted) {
    if (looped >= acc && looped < acc + c.duration) return { clip: c, localTime: looped - acc };
    acc += c.duration;
  }
  return null;
}
