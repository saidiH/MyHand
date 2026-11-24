"use client";
import { useEffect, useState } from "react";
import { getGamification, addXp } from "@/db/repositories";

export function useGamification() {
  const [state, setState] = useState({ streak: 0, xp: 0 });

  useEffect(() => {
    getGamification().then((g) => setState({ streak: g.streak, xp: g.xp }));
  }, []);

  const earn = async (amount: number) => {
    await addXp(amount);
    const g = await getGamification();
    setState({ streak: g.streak, xp: g.xp });
  };

  return { ...state, earn };
}
