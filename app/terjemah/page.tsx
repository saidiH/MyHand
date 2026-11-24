"use client";

// Terjemah — Text/Voice → BIM (M02 / FR-013..019). P08: full playback engine.
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { supportsSpeech } from "@/services/device";
import { getClip, logTranslation } from "@/db/repositories";
import { SignClip } from "@/db/schema";

interface PlayedGloss {
  word: string;
  glossId: string | null;
  gloss: string | null;
  clip: SignClip | null;
}

const PACK_GLOSSES = [
  { id: "stage1:TOLONG", gloss: "TOLONG", msWord: "tolong" },
  { id: "stage1:TERIMA KASIH", gloss: "TERIMA KASIH", msWord: "terima kasih" },
  { id: "stage1:MAKAN", gloss: "MAKAN", msWord: "makan" },
  { id: "stage1:SAYA", gloss: "SAYA", msWord: "saya" },
  { id: "stage1:MAAF", gloss: "MAAF", msWord: "maaf" },
];

export default function TerjemahPage() {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState<PlayedGloss[]>([]);
  const [playing, setPlaying] = useState(-1);
  const [flipped, setFlipped] = useState(false);
  const [speed, setSpeed] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const speechOK = useMemo(() => supportsSpeech(), []);

  const mapToGlosses = (input: string): PlayedGloss[] => {
    const words = input.toLowerCase().replace(/[.,!?]/g, "").split(/\s+/).filter(Boolean);
    return words.map((w) => {
      const g = PACK_GLOSSES.find((g) => g.msWord.split(" ").includes(w));
      return { word: w, glossId: g?.id ?? null, gloss: g?.gloss ?? null, clip: null };
    });
  };

  const translate = async (input: string) => {
    const mapped = mapToGlosses(input);
    for (const m of mapped) {
      if (m.glossId) m.clip = (await getClip(m.glossId)) ?? null;
    }
    setResult(mapped);
    await logTranslation({ input, glossIds: mapped.filter((m) => m.gloss).map((m) => m.gloss!), ts: Date.now() });
  };

  // sequential playback
  useEffect(() => {
    if (playing < 0 || !result.length) return;
    const cur = result[playing];
    if (!cur?.clip) { setPlaying((p) => p + 1); return; }
    const v = videoRef.current;
    if (v) {
      v.playbackRate = speed;
      v.play().catch(() => {});
      const advance = () => setTimeout(() => setPlaying((p) => (p < result.length - 1 ? p + 1 : -1)), 250);
      v.onended = advance;
      // fallback timer in case onended doesn't fire on muted data-url videos
      const t = setTimeout(() => { if (v.ended || v.paused) advance(); }, (cur.clip.durationMs || 3000) / speed + 500);
      return () => clearTimeout(t);
    }
  }, [playing, result, speed]);

  const startListening = () => {
    interface SpeechResultEvent { results: { 0: { 0: { transcript: string } } } }
    interface SpeechRecog {
      lang: string; interimResults: boolean;
      onresult: ((e: SpeechResultEvent) => void) | null;
      onend: (() => void) | null; onerror: (() => void) | null;
      start(): void;
    }
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecog; webkitSpeechRecognition?: new () => SpeechRecog };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;
    const recog = new SR();
    recog.lang = "ms-MY";
    recog.interimResults = false;
    recog.onresult = (e: SpeechResultEvent) => {
      const said = e.results[0][0].transcript;
      setText(said);
      translate(said);
    };
    recog.onend = () => setListening(false);
    recog.onerror = () => setListening(false);
    setListening(true);
    recog.start();
  };

  const playAll = () => {
    const first = result.findIndex((r) => r.clip);
    setPlaying(first >= 0 ? first : -1);
  };

  const hasMissing = result.some((r) => !r.gloss);
  const nextMissingWords = result.filter((r) => !r.gloss).map((r) => r.word);

  return (
    <div className={flipped ? "space-y-4 fixed inset-0 z-50 p-4" : "space-y-4"} style={flipped ? { background: "#0b0e1a" } : undefined}>
      {!flipped && (
        <header className="flex items-center justify-between pt-1">
          <h1 className="text-xl font-black">Terjemah ke Isyarat</h1>
          <button className="btn-ghost px-3 text-xs" onClick={() => setFlipped(true)}>Flip 🔄</button>
        </header>
      )}

      {!flipped && (
        <div className="glass-card p-4 space-y-3">
          <textarea rows={2} placeholder="Taip atau cakap dalam Bahasa Melayu…" value={text} onChange={(e) => setText(e.target.value)} className="w-full resize-none" />
          <div className="flex gap-2">
            <button className="btn-neon flex-1" onClick={() => translate(text)} disabled={!text.trim()}>Terjemah</button>
            {speechOK && (
              <button className={listening ? "btn-ghost px-5 animate-pulse" : "btn-ghost px-5"} style={listening ? { borderColor: "#ff2d78" } : undefined} onClick={startListening} aria-label="Cakap">🎤</button>
            )}
          </div>
          {!speechOK && <p className="text-[11px] text-white/40">Mikrofon tidak disokong — sila taip.</p>}
        </div>
      )}

      {result.length > 0 && (
        <div className="glass-card p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {result.map((r, i) => (
              <span key={i}
                onClick={() => r.clip && setPlaying(i)}
                className="px-3 py-1.5 rounded-full text-sm font-bold cursor-pointer"
                style={
                  r.gloss
                    ? playing === i
                      ? { background: "linear-gradient(90deg,#ff2d78,#ff7a1a)", color: "#fff" }
                      : { background: "linear-gradient(90deg,rgba(255,45,120,0.3),rgba(34,229,255,0.3))" }
                    : { background: "rgba(255,45,120,0.12)", color: "#ff2d78", textDecoration: "underline dotted" }
                }
                title={r.gloss ? "Main klip ini" : "Tiada isyarat dalam set"}>
                {r.gloss ?? r.word + " ❓"}
              </span>
            ))}
          </div>

          <div className="relative aspect-video rounded-2xl overflow-hidden bg-black/70">
            {playing >= 0 && result[playing]?.clip ? (
              <video ref={videoRef} src={result[playing].clip!.dataUrl} className="absolute inset-0 w-full h-full object-cover" muted playsInline style={{ transform: "scaleX(-1)" }} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm">
                {playing === -1 && result.some((r) => r.clip) ? "Tekan Main untuk papar isyarat" : "—"}
              </div>
            )}
            {flipped && playing >= 0 && result[playing]?.gloss && (
              <motion.div key={playing} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute bottom-2 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full glass-card text-lg font-black neon-gradient-text">
                {result[playing].gloss}
              </motion.div>
            )}
          </div>

          <div className="flex gap-2 items-center">
            <button className="btn-neon flex-1" onClick={playAll} disabled={!result.some((r) => r.clip)}>▶ Main Semua</button>
            <button className="btn-ghost px-4" onClick={() => setSpeed((s) => (s === 1 ? 0.6 : s === 0.6 ? 1.5 : 1))} aria-label="Kelajuan">{speed === 1 ? "1x" : speed === 0.6 ? "0.6x" : "1.5x"}</button>
            {flipped && <button className="btn-ghost px-4" onClick={() => setFlipped(false)}>Keluar</button>}
          </div>

          {hasMissing && (
            <p className="text-[11px] text-white/45">❓ Tiada isyarat untuk: {nextMissingWords.join(", ")}. Rekod klip dalam Latih.</p>
          )}
        </div>
      )}

      {!flipped && (
        <p className="text-center text-[11px] text-white/40 px-6">
          Klip demo direkod melalui Latih → Klip Isyarat. Flip mode untuk serahkan telefon kepada rakan.
        </p>
      )}
    </div>
  );
}
