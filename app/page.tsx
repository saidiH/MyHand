"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getProfile } from "@/db/repositories";
import { useGamification } from "@/features/gamification/useGamification";

const actions = [
  { href: "/kamera", label: "Kamera Isyarat", desc: "Isyarat → Teks", icon: "🖐️", grad: "linear-gradient(135deg,#ff2d78,#ff7a1a)" },
  { href: "/terjemah", label: "Terjemah", desc: "Suara/Teks → Isyarat", icon: "💬", grad: "linear-gradient(135deg,#22e5ff,#a855f7)" },
  { href: "/latih", label: "Latih", desc: "Belajar & kuiz", icon: "🎓", grad: "linear-gradient(135deg,#ff7a1a,#ffd21a)" },
  { href: "/sejarah", label: "Sejarah", desc: "Log & memo", icon: "📋", grad: "linear-gradient(135deg,#a855f7,#ff2d78)" },
];

export default function Home() {
  const [name, setName] = useState("Sahabat");
  const { streak, xp } = useGamification();

  useEffect(() => {
    getProfile().then((p) => setName(p.displayName));
  }, []);

  return (
    <div className="space-y-5">
      <header className="pt-2">
        <h1 className="text-3xl font-black">
          Hai, <span className="neon-gradient-text">{name}</span>! 👋
        </h1>
        <p className="text-white/60 text-sm mt-1">Sedia untuk berkomunikasi dalam Bahasa Isyarat Malaysia?</p>
      </header>

      <div className="flex gap-3">
        <div className="glass-card flex-1 p-3 text-center">
          <div className="text-2xl font-black" style={{ color: "#ff2d78" }}>🔥 {streak}</div>
          <div className="text-[11px] text-white/60">Hari berturut</div>
        </div>
        <div className="glass-card flex-1 p-3 text-center">
          <div className="text-2xl font-black" style={{ color: "#22e5ff" }}>⚡ {xp}</div>
          <div className="text-[11px] text-white/60">XP dikumpul</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {actions.map((a) => (
          <Link key={a.href} href={a.href} className="glass-card p-4 flex flex-col gap-2 active:scale-95 transition-transform">
            <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl" style={{ background: a.grad }}>{a.icon}</span>
            <span className="font-bold leading-tight">{a.label}</span>
            <span className="text-[11px] text-white/55">{a.desc}</span>
          </Link>
        ))}
      </div>

      <div className="glass-card p-4">
        <p className="text-xs text-white/60 leading-relaxed">
          <strong className="text-white/80">Nota:</strong> MyHand mengenal pasti isyarat dalam set yang dimuatkan sahaja.
          Semua pemprosesan AI berlaku pada peranti anda — tiada video atau audio dihantar ke mana-mana pelayan. 🔒
        </p>
      </div>
    </div>
  );
}
