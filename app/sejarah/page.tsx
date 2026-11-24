"use client";

// Sejarah — logs & memos (M04)
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  recentRecognitions, recentTranslations, deleteRecognition, deleteTranslation,
  addMemo, listMemos, deleteMemo, exportAllData,
} from "@/db/repositories";
import { RecognitionLog, TranslationLog, Memo } from "@/db/schema";
import { shareText, downloadJson } from "@/services/device";

type Tab = "isyarat" | "terjemah" | "memo";

export default function SejarahPage() {
  const [tab, setTab] = useState<Tab>("isyarat");
  const [recogs, setRecogs] = useState<RecognitionLog[]>([]);
  const [trans, setTrans] = useState<TranslationLog[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [newMemo, setNewMemo] = useState("");

  const refresh = useCallback(async () => {
    setRecogs(await recentRecognitions());
    setTrans(await recentTranslations());
    setMemos(await listMemos());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const time = (ts: number) => new Date(ts).toLocaleString("ms-MY", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between pt-1">
        <h1 className="text-xl font-black">Sejarah</h1>
        <button
          className="btn-ghost px-4 text-xs"
          onClick={async () => downloadJson(`myhand-backup-${Date.now()}.json`, await exportAllData())}
        >
          Eksport
        </button>
      </header>

      <div className="flex gap-2">
        {(["isyarat", "terjemah", "memo"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="btn-ghost flex-1 text-xs capitalize"
            style={tab === t ? { background: "linear-gradient(90deg,rgba(255,45,120,0.4),rgba(34,229,255,0.35))", borderColor: "transparent" } : undefined}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "isyarat" && (
        <div className="space-y-2">
          {recogs.length === 0 && <p className="text-center text-white/40 text-sm py-8">Tiada lagi pengesanan.</p>}
          {recogs.map((r) => (
            <motion.div key={r.id} layout className="glass-card p-3 flex items-center justify-between">
              <div>
                <div className="font-bold">{r.gloss}</div>
                <div className="text-[11px] text-white/45">{time(r.ts)} · {Math.round(r.confidence * 100)}%</div>
              </div>
              <div className="flex gap-2">
                <button className="text-lg" aria-label="Kongsi" onClick={() => shareText("MyHand", `Isyarat: ${r.gloss}`)}>📤</button>
                <button className="text-lg" aria-label="Padam" onClick={async () => { await deleteRecognition(r.id!); refresh(); }}>🗑️</button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {tab === "terjemah" && (
        <div className="space-y-2">
          {trans.length === 0 && <p className="text-center text-white/40 text-sm py-8">Tiada lagi terjemahan.</p>}
          {trans.map((t) => (
            <motion.div key={t.id} layout className="glass-card p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold truncate">{t.input}</div>
                <div className="text-[11px] text-white/45">{time(t.ts)} · {t.glossIds.length} isyarat</div>
              </div>
              <button className="text-lg" aria-label="Padam" onClick={async () => { await deleteTranslation(t.id!); refresh(); }}>🗑️</button>
            </motion.div>
          ))}
        </div>
      )}

      {tab === "memo" && (
        <div className="space-y-2">
          <div className="glass-card p-3 flex gap-2">
            <input
              className="flex-1"
              placeholder="Frasa pantas (cth: Saya pekak, sila baca skrin)"
              value={newMemo}
              onChange={(e) => setNewMemo(e.target.value)}
            />
            <button
              className="btn-neon px-4"
              disabled={!newMemo.trim()}
              onClick={async () => { await addMemo(newMemo.trim()); setNewMemo(""); refresh(); }}
            >
              + Simpan
            </button>
          </div>
          {memos.map((m) => (
            <motion.div key={m.id} layout className="glass-card p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{m.text}</div>
                <div className="text-[11px] text-white/45">{time(m.createdAt)}</div>
              </div>
              <button className="text-lg" aria-label="Padam" onClick={async () => { await deleteMemo(m.id!); refresh(); }}>🗑️</button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
