"use client";

// Latih — on-phone keypoint capture (M03 / FR-020..022). P06a full implementation.
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import CameraView from "@/components/CameraView";
import { getHandLandmarker, drawHandOverlay } from "@/ai/landmark/handLandmarker";
import { CaptureBuffer, DEFAULT_CAPTURE } from "@/ai/capture/capture";
import { db } from "@/db/schema";
import { addSample, samplesForGloss } from "@/db/repositories";
import { vibrate, downloadJson } from "@/services/device";
import ClipRecorderCard from "@/components/ClipRecorderCard";
import SignQuiz from "@/components/SignQuiz";

const TARGET = 15;
const RECORD_MS = DEFAULT_CAPTURE.maxDurationMs;
const PACK_GLOSSES = [
  { id: "stage1:TOLONG", gloss: "TOLONG" },
  { id: "stage1:TERIMA KASIH", gloss: "TERIMA KASIH" },
  { id: "stage1:MAKAN", gloss: "MAKAN" },
  { id: "stage1:SAYA", gloss: "SAYA" },
  { id: "stage1:MAAF", gloss: "MAAF" },
];
const MOTION_TRIGGER = 0.008; // avg frame-diff that counts as "moving"
const MOTION_SETTLE = 0.004; // below this for 400ms ends a capture early (gesture complete)

/** Eye-catching recording progress bar shown at the top during capture. */
function RecordProgress({ startAt }: { startAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(iv);
  }, []);
  const elapsed = Math.min(RECORD_MS, now - startAt);
  const pct = (elapsed / RECORD_MS) * 100;
  const remaining = Math.max(0, Math.ceil((RECORD_MS - elapsed) / 1000));
  return (
    <div className="absolute top-0 inset-x-0 z-20 pointer-events-none">
      <div className="h-2 w-full" style={{ background: "rgba(255,255,255,0.15)" }}>
        <div
          className="h-full"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg,#ff2d78,#ff7a1a,#ffd21a)",
            boxShadow: "0 0 12px rgba(255,122,26,0.9)",
            transition: "width 50ms linear",
          }}
        />
      </div>
      <div className="mt-1.5 flex justify-center">
        <span
          className="px-3 py-1 rounded-full text-xs font-black tracking-wider animate-pulse"
          style={{ background: "rgba(255,45,120,0.85)", color: "#fff", boxShadow: "0 0 16px rgba(255,45,120,0.8)" }}
        >
          ● REKOD — {remaining}s
        </span>
      </div>
    </div>
  );
}

export default function LatihPage() {
  const [gloss, setGloss] = useState("");
  const [samples, setSamples] = useState(0);
  const [phase, setPhase] = useState<"idle" | "countdown" | "recording" | "done">("idle");
  const [recordStart, setRecordStart] = useState(0);
  const [doneFlash, setDoneFlash] = useState(false);
  const [tab, setTab] = useState<"sampel" | "klip" | "kuiz">("sampel");
  const [countdown, setCountdown] = useState(3);
  const [feedback, setFeedback] = useState("");
  const landmarkerRef = useRef<Awaited<ReturnType<typeof getHandLandmarker>> | null>(null);
  const lastTsRef = useRef(-1);
  const bufferRef = useRef<CaptureBuffer | null>(null);
  const glossRef = useRef("");
  glossRef.current = gloss;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const motionRef = useRef(0);
  const lastFrameRef = useRef<number[] | null>(null);
  const settleStartRef = useRef(0);

  useEffect(() => {
    getHandLandmarker().then((lm) => { landmarkerRef.current = lm; });
  }, []);

  const refreshCount = useCallback(async (g: string) => {
    if (!g) { setSamples(0); return; }
    const list = await samplesForGloss(`local:${g.trim().toUpperCase()}`);
    setSamples(list.length);
  }, []);

  useEffect(() => { refreshCount(gloss); }, [gloss, refreshCount]);

  const beginRecording = () => {
    if (!gloss.trim() || !landmarkerRef.current) return;
    setPhase("countdown");
    setCountdown(3);
    let n = 3;
    const iv = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(iv);
        bufferRef.current = new CaptureBuffer(DEFAULT_CAPTURE);
        lastFrameRef.current = null;
        settleStartRef.current = 0;
        setRecordStart(Date.now());
        setPhase("recording");
        vibrate(60);
        setTimeout(finishRecording, DEFAULT_CAPTURE.maxDurationMs);
      } else setCountdown(n);
    }, 800);
  };

  const finishRecording = async () => {
    const buf = bufferRef.current;
    const g = glossRef.current.trim().toUpperCase();
    if (!buf || !g) return;
    setPhase("idle");
    const evalr = buf.evaluate();
    if (!evalr.ok) {
      setFeedback(`❌ ${evalr.reason}`);
      vibrate([80, 60, 80]);
      return;
    }
    setDoneFlash(true);
    setTimeout(() => setDoneFlash(false), 1200);
    await addSample({
      glossId: `local:${g}`,
      frames: buf.frames,
      quality: evalr.quality,
      deviceInfo: navigator.userAgent,
      createdAt: Date.now(),
    });
    setFeedback(`✓ Sampel diterima (kualiti ${Math.round(evalr.quality * 100)}%)`);
    vibrate(35);
    refreshCount(g);
  };

  const cancelRecording = () => {
    bufferRef.current = null;
    setPhase("idle");
    setFeedback("");
  };

  const onFrame = (video: HTMLVideoElement, ctx: CanvasRenderingContext2D) => {
    const lm = landmarkerRef.current;
    if (!lm) return;
    const ts = video.currentTime * 1000;
    if (ts <= lastTsRef.current) return;
    lastTsRef.current = ts;
    const res = lm.detectForVideo(video, ts);
    const frame = { landmarks: res.landmarks ?? [], ts };

    // motion level = mean abs diff of right-hand landmarks vs previous frame
    let motion = 0;
    if (frame.landmarks.length > 0) {
      const flat: number[] = [];
      for (const p of frame.landmarks[0]) flat.push(p.x, p.y);
      const prev = lastFrameRef.current;
      if (prev && prev.length === flat.length) {
        motion = flat.reduce((a, v, i) => a + Math.abs(v - prev[i]), 0) / flat.length;
      }
      lastFrameRef.current = flat;
    } else {
      lastFrameRef.current = null;
    }
    motionRef.current = motion;

    if (phaseRef.current === "recording" && bufferRef.current) {
      bufferRef.current.add(frame);
      // auto-end early when gesture settles (motion low for 400ms after at least 800ms recorded)
      if (motion < MOTION_SETTLE && bufferRef.current.durationMs > DEFAULT_CAPTURE.minDurationMs) {
        if (!settleStartRef.current) settleStartRef.current = ts;
        else if (ts - settleStartRef.current > 400) { settleStartRef.current = 0; finishRecording(); return; }
      } else {
        settleStartRef.current = 0;
      }
    }
    if (frame.landmarks.length) drawHandOverlay(ctx, frame, video.videoWidth, video.videoHeight, ctx.canvas.width, ctx.canvas.height);
  };

  const exportDataset = async () => {
    const all = await db.samples.toArray();
    downloadJson(`myhand-dataset-${Date.now()}.json`, JSON.stringify({ schemaVersion: 1, samples: all }, null, 2));
  };

  const clearGlossSamples = async () => {
    const id = `local:${glossRef.current.trim().toUpperCase()}`;
    const list = await samplesForGloss(id);
    await db.samples.bulkDelete(list.map((s) => s.id!));
    setFeedback("Sampel dipadam");
    refreshCount(glossRef.current);
  };

  const pct = Math.min(100, (samples / TARGET) * 100);

  return (
    <div className="space-y-4">
      <header className="pt-1">
        <h1 className="text-xl font-black">Latih Isyarat</h1>
        <p className="text-white/55 text-sm">Rekod {TARGET} sampel bagi setiap isyarat.</p>
      </header>

      <div className="flex gap-2">
        {(["sampel", "klip", "kuiz"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="btn-ghost flex-1 text-xs capitalize"
            style={tab === t ? { background: "linear-gradient(90deg,rgba(255,45,120,0.4),rgba(34,229,255,0.35))", borderColor: "transparent" } : undefined}>
            {t === "sampel" ? "Sampel Data" : t === "klip" ? "Klip Demo" : "Kuiz 🎮"}
          </button>
        ))}
      </div>

      {tab === "klip" && (
        <div className="space-y-3">
          {PACK_GLOSSES.map((g) => (
            <ClipRecorderCard key={g.id} glossId={g.id} gloss={g.gloss} />
          ))}
        </div>
      )}

      {tab === "kuiz" && <SignQuiz />}

      {tab === "sampel" && (
      <div className="glass-card p-4 space-y-3">
        <input
          placeholder="Perkataan isyarat (cth: MAKAN)"
          value={gloss}
          onChange={(e) => setGloss(e.target.value.toUpperCase())}
          className="w-full"
          disabled={phase !== "idle"}
        />
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-white/60">Sampel: {gloss || "—"}</span>
            <span className="font-black" style={{ color: samples >= TARGET ? "#22e5ff" : "#ff2d78" }}>{samples}/{TARGET}</span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
            <motion.div
              className="h-full rounded-full"
              animate={{ width: `${Math.max(2, pct)}%` }}
              style={{ background: "linear-gradient(90deg,#ff2d78,#ff7a1a,#22e5ff)" }}
            />
          </div>
        </div>

        {phase === "idle" && (
          <button className="btn-neon w-full" onClick={beginRecording} disabled={!gloss.trim()}>
            Rekod Sampel
          </button>
        )}
        {phase === "countdown" && (
          <button className="btn-ghost w-full" onClick={cancelRecording}>Batal ({countdown}…)</button>
        )}
        {phase === "recording" && (
          <button className="btn-neon w-full animate-pulse" onClick={finishRecording}>
            ● Merekod… (sekarang juga)
          </button>
        )}
        {feedback && <p className="text-xs text-center" style={{ color: feedback.startsWith("✓") ? "#22e5ff" : "#ff2d78" }}>{feedback}</p>}
        {samples > 0 && (
          <button className="btn-ghost w-full text-xs" onClick={clearGlossSamples}>Padam semua sampel isyarat ini</button>
        )}
      </div>

      )}

      {tab === "sampel" && (
      <CameraView onFrame={onFrame} hudExtra={
        <>
          {phase === "recording" && <RecordProgress startAt={recordStart} />}
          <AnimatePresence>
            {doneFlash && (
              <motion.div
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-30 flex items-center justify-center"
                style={{ background: "rgba(34,229,255,0.25)" }}
              >
                <span className="px-6 py-3 rounded-2xl text-2xl font-black neon-gradient-text glass-card">
                  ✓ BERJAYA!
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          {phase === "idle" && (
            <div className="absolute top-2 inset-x-3 pointer-events-none">
              <div className="glass-card p-2 mx-auto w-52" style={{ background: "rgba(34,229,255,0.12)" }}>
                <p className="text-[10px] text-white/70 text-center leading-tight">
                  Aras gerakan {motionRef.current > MOTION_TRIGGER ? "🟢" : motionRef.current > 0.002 ? "🟡" : "⚪"}
                </p>
                <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: "rgba(255,255,255,0.12)" }}>
                  <div className="h-full rounded-full" style={{
                    width: `${Math.min(100, motionRef.current * 1200)}%`,
                    background: motionRef.current > MOTION_TRIGGER ? "linear-gradient(90deg,#22e5ff,#a855f7)" : "rgba(255,255,255,0.3)",
                    transition: "width 120ms linear",
                  }} />
                </div>
                <p className="text-[9px] text-white/45 text-center mt-0.5">Gerakkan tangan — bar mesti hijau semasa merekod</p>
              </div>
            </div>
          )}
          {phase === "countdown" ? (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(11,14,26,0.5)" }}>
            <motion.span key={countdown} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="text-8xl font-black neon-gradient-text">{countdown}</motion.span>
          </div>
        ) : null}
        </>
      } />
      )}

      <button className="btn-ghost w-full text-sm" onClick={exportDataset}>
        Eksport Dataset (JSON) — untuk latihan ml/
      </button>
    </div>
  );
}
