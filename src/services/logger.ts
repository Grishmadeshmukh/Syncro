export type LogStatus = 'pending' | 'success' | 'error';

export interface LogEntry {
  id: string;
  timestamp: Date;
  status: LogStatus;
  fn: string;          // human-readable function name
  model: string;       // Gemini model used
  detail: string;      // short description of the input
  durationMs?: number; // set on success/error
  error?: string;
}

type Listener = (entries: LogEntry[]) => void;

const entries: LogEntry[] = [];
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach(l => l([...entries]));
}

export function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  cb([...entries]);
  return () => listeners.delete(cb);
}

export function startLog(fn: string, model: string, detail: string): LogEntry {
  const entry: LogEntry = {
    id: Math.random().toString(36).slice(2),
    timestamp: new Date(),
    status: 'pending',
    fn,
    model,
    detail,
  };
  entries.unshift(entry); // newest first
  notify();
  return entry;
}

export function finishLog(entry: LogEntry, error?: string) {
  entry.durationMs = Date.now() - entry.timestamp.getTime();
  entry.status = error ? 'error' : 'success';
  if (error) entry.error = error;
  notify();
}
