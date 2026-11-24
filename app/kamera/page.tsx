"use client";

// Kamera — BIM → Text (M01). P06d: live Stage 1 recognition with neon overlay + gating.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import CameraView from "@/components/CameraView";
import { getHandLandmarker, drawHandOverlay } from "@/ai/landmark/handLandmarker";
import { getStage1Classifier, SignRecognizer, setModelProgressListener } from "@/ai/classifier/stage1";
import { logRecognition } from "@/db/repositories";
import { vibrate } from "@/services/device";
import { useGamification } from "@/features/gamification/useGamification";

export default function KameraPage() {
  const landmarkerRef = useRef<Awaited<ReturnType<typeof getHandLandmarker>> | null>(null);
  const recognizerRef = useRef<SignRecognizer | null>(null);
  const lastVideoTsRef = useRef(-1);
  const [hands, setHands] = useState(0);
  const [aiReady, setAiReady] = useState(false);
  const [current, setCurrent] = useState<{ gloss: string; confidence: number } | null>(null);
  const [sentence, setSentence] = useState<string[]>([]);
  const [packInfo, setPackInfo] = useState("");
  const [loadPct, setLoadPct] = useState(0);
  const [loadPhase, setLoadPhase] = useState("");
  const { earn } = useGamification();

  useEffect(() => {
    setModelProgressListener((pct, phase) => { setLoadPct(pct); setLoadPhase(phase); });
    (async () => {
      const [lm, cls] = await Promise.all([getHandLandmarker(), getStage1Classifier()]);
      landmarkerRef.current = lm;
      recognizerRef.current = new SignRecognizer(cls.model, cls.pack);
      setPackInfo(`Set (5 isyarat) · tepat ${Math.round(cls.pack.accuracy * 100)}%`);
      setAiReady(true);
    })();
  }, []);

  const onFrame = (video: HTMLVideoElement, ctx: CanvasRenderingContext2D) => {
    const lm = landmarkerRef.current;
    const rec = recognizerRef.current;
    if (!lm || !rec) return;
    const ts = video.currentTime * 1000;
    if (ts <= lastVideoTsRef.current) return;
    lastVideoTsRef.current = ts;
    const res = lm.detectForVideo(video, ts);
    const landmarks = res.landmarks ?? [];
    setHands(landmarks.length);
    if (landmarks.length) {
      drawHandOverlay(ctx, { landmarks, ts }, video.videoWidth, video.videoHeight, ctx.canvas.width, ctx.canvas.height);
      rec.pushFrame(landmarks);
      const pred = rec.maybeClassify(performance.now());
      if (pred) {
        setCurrent(pred);
        vibrate(35);
        earn(2);
        setSentence((s) => [...s.slice(-7), pred.gloss]);
        logRecognition({
          gloss: pred.gloss,
          glossId: `stage1:${pred.gloss}`,
          confidence: pred.confidence,
          packId: "stage1",
          modelVersion: "1.0.0",
          ts: Date.now(),
        });
      }
    } else {
      rec.reset();
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between pt-1">
        <h1 className="text-xl font-black">BIM Kamera</h1>
        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: "rgba(255,45,120,0.2)", color: "#ff2d78" }}>
          {packInfo || "Set (—)"}
        </span>
      </header>

      <CameraView
        onFrame={onFrame}
        onStatusChange={(s) => { if (s === "live") { setHands(0); setCurrent(null); } }}
        hudExtra={
          <>
            <div className="absolute top-2 inset-x-3 pointer-events-none">
              {!aiReady && (
                <div className="glass-card p-2.5 mx-auto w-56 text-center" style={{ background: "rgba(168,85,247,0.25)" }}>
                  <p className="text-[11px] font-bold" style={{ color: "#e9d5ff" }}>
                    Memuatkan AI… {loadPct}%
                  </p>
                  <p className="text-[10px] text-white/60 leading-none mt-0.5">
                    {loadPhase === "json" ? "Membaca struktur model" : loadPhase === "weights" ? "Memuat turun berat model" : loadPhase === "compile" ? "Menyiapkan AI" : "Sedia"}
                  </p>
                  <div className="h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ background: "rgba(255,255,255,0.15)" }}>
                    <div className="h-full rounded-full" style={{ width: `${loadPct}%`, background: "linear-gradient(90deg,#a855f7,#ff2d78,#ff7a1a)", transition: "width 120ms linear" }} />
                  </div>
                </div>
              )}
              {aiReady && hands > 0 && (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: "rgba(34,229,255,0.25)", color: "#22e5ff" }}>
                  {hands === 1 ? "1 tangan dikesan" : `${hands} tangan dikesan`}
                </span>
              )}
            </div>
            <div className="absolute bottom-3 inset-x-3 pointer-events-none">
              <AnimatePresence mode="popLayout">
                {current && (
                  <motion.div
                    key={current.gloss + sentence.length}
                    initial={{ scale: 0.6, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 18 }}
                    className="glass-card neon-glow py-4 text-center"
                  >
                    <div className="text-4xl font-black neon-gradient-text">{current.gloss}</div>
                    <div className="text-[11px] text-white/50 mt-1">
                      Keyakinan {Math.round(current.confidence * 100)}% · Mengesan isyarat dalam set sahaja
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        }
      />

      <div className="glass-card p-3 min-h-[52px]">
        <p className="text-[11px] text-white/50 mb-1">Ayat</p>
        <p className="font-bold tracking-wide">
          {sentence.length === 0 ? <span className="text-white/40">—</span> : sentence.join("  ·  ")}
        </p>
      </div>

      <p className="text-center text-[11px] text-white/40 px-6">
        Stage 1 aktif: TOLONG · TERIMA KASIH · MAKAN · SAYA · MAAF — tanda isyarat anda dengan jelas.
      </p>
    </div>
  );
}
