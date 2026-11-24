"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Utama", icon: "🏠" },
  { href: "/kamera", label: "Kamera", icon: "🖐️" },
  { href: "/terjemah", label: "Terjemah", icon: "💬" },
  { href: "/latih", label: "Latih", icon: "🎓" },
  { href: "/sejarah", label: "Sejarah", icon: "📋" },
  { href: "/tetapan", label: "Tetapan", icon: "⚙️" },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 border-t border-white/10"
      style={{ background: "rgba(11,14,26,0.92)", backdropFilter: "blur(14px)" }}
    >
      <div className="max-w-lg mx-auto flex justify-between px-2 py-1.5">
        {items.map((it) => {
          const active = pathname === it.href;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-col items-center justify-center flex-1 py-1.5 rounded-2xl text-[11px] font-semibold transition-colors ${
                active ? "text-white" : "text-white/50"
              }`}
              style={active ? { background: "linear-gradient(90deg, rgba(255,45,120,0.35), rgba(34,229,255,0.25))" } : undefined}
            >
              <span className="text-lg leading-none mb-0.5">{it.icon}</span>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
