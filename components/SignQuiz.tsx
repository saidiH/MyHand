"use client";

// Sign quiz — flashcard game over recorded clips (FR-025/026). Local XP + streaks.
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { listClips } from "@/db/repositories";
import { SignClip } from "@/db/schema";
import { useGamification } from "@/features/gamification/useGamification";
import { vibrate } from "@/services/device";

const GLOSS_NAMES: Record<string, string> = {
  "stage1:TOLONG": "TOLONG",
  "stage1:TERIMA KASIH": "TERIMA KASIH",
  "stage1:MAKAN": "MAKAN",
  "stage1:SAYA": "SAYA",
  "stage1:MAAF": "MAAF",
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const QUIZ_LEN = 10;

export default function SignQuiz() {
  const [clips, setClips] = useState<SignClip[]>([]);
  const [seed, setSeed] = useState(0);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [finished, setFinished] = useState(false);
  const { earn } = useGamification();

  const questions = useMemo(() => {
    // quiz of QUIZ_LEN questions, sampled with repetition if clips < QUIZ_LEN
    if (clips.length === 0) return [];   // guard: never loop on empty clip list
    const qs: SignClip[] = [];
    let guard = 0;
    while (qs.length < QUIZ_LEN && guard < QUIZ_LEN * 10) {
      qs.push(...shuffle(clips));
      guard++;
    }
    return qs.slice(0, QUIZ_LEN);
  }, [clips, seed]);
  const current = questions[round];
  const options = useMemo(() => {
    if (!current) return [];
    const others = shuffle(clips.filter((c) => c.glossId !== current.glossId)).slice(0, 2);
    return shuffle([current, ...others]);
  }, [current, clips, round]);

  useEffect(() => {
    listClips().then(setClips);
  }, []);

  if (clips.length < 2) {
    return <p className="text-center text-white/40 text-sm py-8">Rekod sekurang-kurangnya 2 klip dalam tab Klip Demo untuk main kuiz.</p>;
  }

  const restart = () => {
    setSeed((s) => s + 1);
    setRound(0); setScore(0); setFinished(false); setPicked(null);
  };

  const answer = (glossId: string) => {
    if (picked || finished) return;
    setPicked(glossId);
    if (glossId === current.glossId) {
      setScore((s) => s + 1);
      vibrate(35);
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 900);
      earn(5);
    } else {
      vibrate([60, 40, 60]);
    }
    setTimeout(() => {
      setPicked(null);
      if (round + 1 >= QUIZ_LEN) {
        setFinished(true);
        earn(10); // bonus for completing the round
      } else {
        setRound((r) => r + 1);
      }
    }, 1100);
  };

  if (finished) {
    const pct = Math.round((score / QUIZ_LEN) * 100);
    const msg = pct >= 80 ? "Cemerlang! ⭐" : pct >= 50 ? "Bagus! 💪" : "Terus berlatih! 🌱";
    return (
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card p-6 text-center space-y-4">
        <div className="text-5xl font-black neon-gradient-text">{pct}%</div>
        <p className="font-bold">{msg}</p>
        <p className="text-sm text-white/60">{score}/{QUIZ_LEN} betul · +{score * 5 + 10} XP</p>
        <button className="btn-neon w-full" onClick={restart}>Main Lagi</button>
      </motion.div>
    );
  }

  return (
    <div className="glass-card p-4 space-y-3 relative overflow-hidden">
      <AnimatePresence>
        {celebrate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center"
            style={{ background: "rgba(34,229,255,0.2)" }}>
            <span className="text-4xl">🎉</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between text-sm">
        <span className="text-white/60">Soalan {round + 1}/{QUIZ_LEN}</span>
        <span className="font-black" style={{ color: "#22e5ff" }}>Skor: {score}</span>
      </div>

      <div className="relative aspect-video rounded-2xl overflow-hidden bg-black/70">
        <video key={current.glossId} src={current.dataUrl} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
      </div>
      <p className="text-center text-xs text-white/60">Apakah isyarat ini?</p>

      <div className="grid grid-cols-1 gap-2">
        {options.map((o) => {
          const isRight = o.glossId === current.glossId;
          const state = !picked ? "idle" : isRight ? "right" : o.glossId === picked ? "wrong" : "dim";
          return (
            <motion.button key={o.glossId} whileTap={{ scale: 0.97 }}
              onClick={() => answer(o.glossId)}
              className="rounded-2xl py-3 font-bold text-sm transition-colors"
              style={{
                background: state === "right" ? "linear-gradient(90deg,#22e5ff,#a855f7)"
                  : state === "wrong" ? "#ff2d78"
                  : state === "dim" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)",
                color: state === "dim" ? "rgba(255,255,255,0.4)" : "#fff",
                border: "1px solid rgba(255,255,255,0.15)",
              }}>
              {GLOSS_NAMES[o.glossId] ?? o.glossId}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
