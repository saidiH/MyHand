// Typed device-API wrappers with feature detection (SDDD §6)

export function supportsVibration(): boolean {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}

export function vibrate(pattern: number | number[] = 35): boolean {
  if (!supportsVibration()) return false;
  try { return navigator.vibrate(pattern); } catch { return false; }
}

export function supportsWakeLock(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

let wakeLockSentinel: WakeLockSentinel | null = null;

export async function acquireWakeLock(): Promise<boolean> {
  if (!supportsWakeLock()) return false;
  try {
    wakeLockSentinel = await (navigator as Navigator & { wakeLock: { request(t: "screen"): Promise<WakeLockSentinel> } }).wakeLock.request("screen");
    return true;
  } catch { return false; }
}

export async function releaseWakeLock(): Promise<void> {
  try { await wakeLockSentinel?.release(); } catch { /* ignore */ }
  wakeLockSentinel = null;
}

export function supportsSpeech(): boolean {
  return typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
}

export function supportsShare(): boolean {
  return typeof navigator !== "undefined" && !!navigator.share;
}

export async function shareText(title: string, text: string): Promise<boolean> {
  if (!supportsShare()) return false;
  try { await navigator.share({ title, text }); return true; } catch { return false; }
}

export function isSecureContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext;
}

export async function downloadJson(filename: string, json: string) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
