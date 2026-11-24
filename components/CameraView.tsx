"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { openCamera, permissionErrorMessage, CameraHandle } from "@/services/camera";
import { acquireWakeLock, releaseWakeLock } from "@/services/device";

type Status = "idle" | "permission" | "live" | "paused" | "denied";

interface Props {
  /** Called each rendered frame; draw AI overlay onto the given canvas ctx here */
  onFrame?: (video: HTMLVideoElement, ctx: CanvasRenderingContext2D, dtMs: number) => void;
  /** Mirror the preview (front camera default) */
  mirror?: boolean;
  onStatusChange?: (s: Status) => void;
  showHud?: boolean;
  hudExtra?: React.ReactNode;
  /** Expose imperative controls (reset clearing overlay) to parent */
  onReady?: (api: { resetOverlay: () => void }) => void;
}

/**
 * Reusable camera stage: permission flow, preview, FPS meter,
 * Jeda / Set Semula controls and wake-lock handling (FR-002, FR-005, FR-006, FR-008).
 * AI overlay drawing is delegated to onFrame via a canvas layer.
 */
export default function CameraView({ onFrame, mirror = true, onStatusChange, showHud = true, hudExtra, onReady }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);
  const framesRef = useRef<number>(0);
  const fpsStartRef = useRef<number>(0);
  const handleRef = useRef<CameraHandle | null>(null);
  const pausedRef = useRef(false);
  const onFrameRef = useRef(onFrame);
  useEffect(() => { onFrameRef.current = onFrame; }, [onFrame]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");
  const [fps, setFps] = useState(0);

  const setSt = useCallback((s: Status) => { setStatus(s); onStatusChange?.(s); }, [onStatusChange]);

  const loop = useCallback(() => {
    rafRef.current = requestAnimationFrame(loop);
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const now = performance.now();
    const dt = lastTsRef.current ? now - lastTsRef.current : 0;
    lastTsRef.current = now;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!pausedRef.current && onFrameRef.current) {
        // canvas is CSS-stretched over the video; draw in video pixel space
        onFrameRef.current(video, ctx, dt);
      }
    }
    framesRef.current++;
    if (now - fpsStartRef.current >= 1000) {
      setFps(Math.round((framesRef.current * 1000) / (now - fpsStartRef.current)));
      framesRef.current = 0;
      fpsStartRef.current = now;
    }
  }, []);

  const start = useCallback(async () => {
    setError("");
    setSt("permission");
    try {
      handleRef.current = await openCamera("user");
      const video = videoRef.current!;
      video.srcObject = handleRef.current.stream;
      await video.play();
      pausedRef.current = false;
      lastTsRef.current = 0; framesRef.current = 0; fpsStartRef.current = performance.now();
      rafRef.current = requestAnimationFrame(loop);
      await acquireWakeLock();
      setSt("live");
    } catch (err) {
      setError(permissionErrorMessage(err));
      setSt("denied");
    }
  }, [loop, setSt]);

  const pause = useCallback(async () => {
    pausedRef.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    await releaseWakeLock();
    setSt("paused");
  }, [setSt]);

  const resume = useCallback(async () => {
    pausedRef.current = false;
    await acquireWakeLock();
    setSt("live");
  }, [setSt]);

  const reset = useCallback(() => {
    pausedRef.current = false;
    lastTsRef.current = 0;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSt("live");
  }, [setSt]);

  useEffect(() => {
    onReady?.({
      resetOverlay: () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onVis = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pause]);

  const mirrorStyle = mirror ? "scaleX(-1)" : "none";

  return (
    <div className="glass-card overflow-hidden neon-glow" style={{ borderRadius: "1.5rem" }}>
      <div className="relative aspect-[3/4] bg-black/60">
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" style={{ transform: mirrorStyle }} />
        <canvas ref={canvasRef} width={480} height={640} className="absolute inset-0 w-full h-full" style={{ transform: mirrorStyle }} />

        {status === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <span className="text-5xl">🖐️</span>
            <p className="text-white/80 text-sm">Kamera diperlukan untuk mengesan isyarat tangan anda.</p>
            <button className="btn-neon px-8" onClick={start}>Buka Kamera</button>
          </div>
        )}
        {status === "permission" && <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">Memuatkan kamera…</div>}
        {status === "denied" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <span className="text-4xl">🚫</span>
            <p className="text-white/80 text-sm">{error}</p>
            <button className="btn-neon px-8" onClick={start}>Cuba Lagi</button>
          </div>
        )}

        {showHud && (status === "live" || status === "paused") && (
          <div className="absolute top-2 inset-x-2 flex items-center justify-between pointer-events-none">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: "rgba(34,229,255,0.25)", color: "#22e5ff" }}>
              {status === "live" ? "AKTIF" : "JEDA"}
            </span>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: "rgba(255,45,120,0.25)", color: "#ff2d78" }}>
              FPS: {fps}
            </span>
          </div>
        )}
        {hudExtra}
      </div>

      {(status === "live" || status === "paused") && (
        <div className="flex gap-3 p-3">
          {status === "live" ? (
            <button className="btn-neon flex-1" onClick={pause}>Jeda</button>
          ) : (
            <button className="btn-neon flex-1" onClick={resume}>Sambung</button>
          )}
          <button className="btn-ghost flex-1" onClick={reset}>Set Semula</button>
        </div>
      )}
    </div>
  );
}
