"use client";

// Tetapan — settings, data management (M04 / FR-030..032)
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfile, setDisplayName, exportAllData, clearAllData, storageEstimate } from "@/db/repositories";
import { downloadJson, supportsVibration, vibrate } from "@/services/device";

export default function TetapanPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [haptics, setHaptics] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [storage, setStorage] = useState({ usage: 0, quota: 0 });

  useEffect(() => {
    getProfile().then((p) => setName(p.displayName));
    storageEstimate().then(setStorage);
  }, []);

  const saveName = async () => {
    if (!name.trim()) return;
    await setDisplayName(name.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div className="space-y-4">
      <header className="pt-1">
        <h1 className="text-xl font-black">Tetapan</h1>
      </header>

      <div className="glass-card p-4 space-y-3">
        <p className="text-[11px] text-white/50">Nama paparan</p>
        <div className="flex gap-2">
          <input className="flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama anda" />
          <button className="btn-neon px-5" onClick={saveName}>{saved ? "✓" : "Simpan"}</button>
        </div>
      </div>

      {supportsVibration() && (
        <div className="glass-card p-4 flex items-center justify-between">
          <div>
            <p className="font-bold text-sm">Getaran (haptik)</p>
            <p className="text-[11px] text-white/50">Bergetar bila isyarat dikenali</p>
          </div>
          <button
            onClick={() => { const v = !haptics; setHaptics(v); if (v) vibrate(35); }}
            className="w-12 h-7 rounded-full relative transition-colors"
            style={{ background: haptics ? "linear-gradient(90deg,#ff2d78,#ff7a1a)" : "rgba(255,255,255,0.15)" }}
            aria-label="Togol getaran"
          >
            <span
              className="absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all"
              style={{ left: haptics ? "22px" : "2px" }}
            />
          </button>
        </div>
      )}

      <div className="glass-card p-4 space-y-2">
        <p className="font-bold text-sm">Storan</p>
        {storage.quota > 0 ? (
          <>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(2, (storage.usage / storage.quota) * 100)}%`, background: "linear-gradient(90deg,#22e5ff,#a855f7)" }}
              />
            </div>
            <p className="text-[11px] text-white/50">{mb(storage.usage)} daripada {mb(storage.quota)}</p>
          </>
        ) : <p className="text-[11px] text-white/50">Maklumat storan tidak tersedia.</p>}
      </div>

      <div className="glass-card p-4 space-y-3">
        <p className="font-bold text-sm">Data</p>
        <button
          className="btn-ghost w-full"
          onClick={async () => downloadJson(`myhand-backup-${Date.now()}.json`, await exportAllData())}
        >
          Eksport Semua Data (JSON)
        </button>
        {!confirmClear ? (
          <button className="btn-ghost w-full" style={{ borderColor: "#ff2d78", color: "#ff2d78" }} onClick={() => setConfirmClear(true)}>
            Kosongkan Semua Data…
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs" style={{ color: "#ff2d78" }}>Padam semua data secara kekal pada peranti ini?</p>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setConfirmClear(false)}>Batal</button>
              <button
                className="btn-neon flex-1"
                style={{ background: "#ff2d78" }}
                onClick={async () => { await clearAllData(); setConfirmClear(false); router.push("/"); }}
              >
                Ya, padam
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-white/40 px-6 pb-4">
        MyHand v0.1 (P01–P04) · Semua data disimpan pada peranti anda sahaja 🔒
      </p>
    </div>
  );
}
