export type CaptionSegment = { text: string; start: number; end: number };

function pad2(n: number) { return String(Math.floor(n)).padStart(2, '0'); }
function pad3(n: number) { return String(Math.floor(n)).padStart(3, '0'); }

function toSRTTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s % 1) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)},${pad3(ms)}`;
}

function toVTTTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s % 1) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)}.${pad3(ms)}`;
}

export function generateSRT(segments: CaptionSegment[]): string {
  return segments
    .map((seg, i) =>
      `${i + 1}\n${toSRTTime(seg.start)} --> ${toSRTTime(seg.end)}\n${seg.text}`
    )
    .join('\n\n');
}

export function generateVTT(segments: CaptionSegment[]): string {
  const entries = segments
    .map(seg => `${toVTTTime(seg.start)} --> ${toVTTTime(seg.end)}\n${seg.text}`)
    .join('\n\n');
  return `WEBVTT\n\n${entries}`;
}

export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
