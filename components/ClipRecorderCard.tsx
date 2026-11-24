"use client";

// Record a short sign clip for a gloss (Text→BIM playback source). Stored locally only.
import { useEffect, useRef, useState } from "react";
import { CameraHandle, openCamera } from "@/services/camera";
import { recordClip, blobToDataUrl } from "@/services/clipRecorder";
import { saveClip, getClip, deleteClip } from "@/db/repositories";
import { getHandLandmarker, drawHandOverlay } from "@/ai/landmark/handLandmarker";

const MAX_MS = 4000;

export default function ClipRecorderCard({ glossId, gloss }: { glossId: string; gloss: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleRef = useRef<CameraHandle | null>(null);
  const recRef = useRef<{ stop(): Promise<Blob> } | null>(null);
  const startedRef = useRef(0);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<Awaited<ReturnType<typeof getHandLandmarker>> | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(-1);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<"idle" | "cam" | "recording" | "saving">("idle");
  const [hasClip, setHasClip] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(MAX_MS);

  useEffect(() => {
    getClip(glossId).then((c) => {
      if (c) { setHasClip(true); setClipUrl(c.dataUrl); }
    });
    getHandLandmarker().then((lm) => { landmarkerRef.current = lm; });
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); handleRef.current?.stop(); };
  }, [glossId]);

  const startCam = async () => {
    handleRef.current = await openCamera("user");
    streamRef.current = handleRef.current.stream;
    const v = videoRef.current!;
    v.srcObject = handleRef.current.stream;
    await v.play();
    setPhase("cam");
    const overlayLoop = () => {
      rafRef.current = requestAnimationFrame(overlayLoop);
      const lm = landmarkerRef.current;
      const vid = videoRef.current;
      const canvas = overlayRef.current;
      if (!lm || !vid || vid.readyState < 2 || !canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const ts = vid.currentTime * 1000;
      if (ts <= lastTsRef.current) return;
      lastTsRef.current = ts;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const res = lm.detectForVideo(vid, ts);
      if (res.landmarks?.length) {
        drawHandOverlay(ctx, { landmarks: res.landmarks, ts }, vid.videoWidth, vid.videoHeight, canvas.width, canvas.height);
      }
    };
    rafRef.current = requestAnimationFrame(overlayLoop);
  };

  const startRec = () => {
    if (!handleRef.current) return;
    startedRef.current = Date.now();
    setRemaining(MAX_MS);
    const iv = setInterval(() => {
      const left = MAX_MS - (Date.now() - startedRef.current);
      setRemaining(Math.max(0, left));
      if (left <= 0) { clearInterval(iv); stopRec(); }
    }, 100);
    recordClip(handleRef.current.stream).then((h) => { recRef.current = h; setPhase("recording"); });
  };

  const stopOverlay = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const canvas = overlayRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const stopRec = async () => {
    if (!recRef.current) return;
    setPhase("saving");
    const blob = await recRef.current.stop();
    recRef.current = null;
    const dataUrl = await blobToDataUrl(blob);
    await saveClip({ glossId, dataUrl, durationMs: Date.now() - startedRef.current, createdAt: Date.now() });
    setClipUrl(dataUrl);
    setHasClip(true);
    stopOverlay();
    handleRef.current?.stop();
    handleRef.current = null;
    setPhase("idle");
  };

  const removeClip = async () => {
    await deleteClip(glossId);
    setHasClip(false); setClipUrl(null);
  };

  const pct = (remaining / MAX_MS) * 100;

  return (
    <div className="glass-card p-4 space-y-3">
      <p className="text-sm font-bold">Klip Isyarat: <span style={{ color: "#ff7a1a" }}>{gloss}</span></p>
      <p className="text-[11px] text-white/50">Rakam demo isyarat (maks 4 saat) — diputar semula dalam Terjemah. Disimpan pada peranti sahaja.</p>

      <div className="relative aspect-video rounded-2xl overflow-hidden bg-black/60">
        {clipUrl && phase === "idle" ? (
          <video src={clipUrl} className="absolute inset-0 w-full h-full object-cover" controls muted playsInline />
        ) : (
          <>
            <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
            <canvas ref={overlayRef} width={480} height={270} className="absolute inset-0 w-full h-full" style={{ transform: "scaleX(-1)" }} />
          </>
        )}
        {phase === "recording" && (
          <>
            <div className="absolute top-0 inset-x-0 h-1.5" style={{ background: "rgba(255,255,255,0.15)" }}>
              <div className="h-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#ff2d78,#ff7a1a)", transition: "width 100ms linear" }} />
            </div>
            <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-black animate-pulse" style={{ background: "rgba(255,45,120,0.85)" }}>
              ● {Math.ceil(remaining / 1000)}s
            </span>
          </>
        )}
      </div>

      {phase === "idle" && (
        <div className="flex gap-2">
          {!hasClip ? (
            <button className="btn-neon flex-1" onClick={startCam}>Rakam Klip</button>
          ) : (
            <>
              <button className="btn-ghost flex-1" onClick={startCam}>Rakam Semula</button>
              <button className="btn-ghost" style={{ borderColor: "#ff2d78", color: "#ff2d78" }} onClick={removeClip}>Padam</button>
            </>
          )}
        </div>
      )}
      {phase === "cam" && <button className="btn-neon w-full" onClick={startRec}>● Mula Rakam</button>}
      {phase === "recording" && <button className="btn-neon w-full" onClick={stopRec}>Berhenti</button>}
      {phase === "saving" && <button className="btn-ghost w-full" disabled>Menyimpan…</button>}
    </div>
  );
}
