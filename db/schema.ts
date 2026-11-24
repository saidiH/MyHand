// Dexie schema per MYHAND-SDDD-001 §3 — versioned, additive migrations only
import Dexie, { Table } from "dexie";

export interface Profile {
  id: string; // "local"
  displayName: string;
  createdAt: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface Gloss {
  id: string; // `${packId}:${gloss}`
  packId: string;
  gloss: string; // e.g. "MAAF"
  msWord: string; // matching Malay word(s), space-separated
  category: string;
  mediaRef?: string;
}

export interface SignPack {
  id: string;
  name: string;
  version: string;
  modelUrl?: string;
  accuracyReport?: string;
  installedAt: number;
}

export interface Sample {
  id?: number;
  glossId: string;
  frames: number[][]; // per-frame flattened keypoints
  quality: number;
  deviceInfo: string;
  createdAt: number;
}

export interface RecognitionLog {
  id?: number;
  glossId: string;
  gloss: string;
  confidence: number;
  packId: string;
  modelVersion: string;
  ts: number;
  corrected?: boolean;
}

export interface TranslationLog {
  id?: number;
  input: string;
  glossIds: string[];
  ts: number;
}

export interface Memo {
  id?: number;
  text: string;
  createdAt: number;
  pinned: boolean;
}

export interface Gamification {
  id: string; // "local"
  streak: number;
  xp: number;
  lastPlayed: number;
}

export interface SignClip {
  glossId: string; // primary key, one clip per gloss
  dataUrl: string; // webm data URL (local-only)
  durationMs: number;
  createdAt: number;
}

class MyHandDB extends Dexie {
  profile!: Table<Profile, string>;
  settings!: Table<Setting, string>;
  glosses!: Table<Gloss, string>;
  packs!: Table<SignPack, string>;
  samples!: Table<Sample, number>;
  recognitionLogs!: Table<RecognitionLog, number>;
  translationLogs!: Table<TranslationLog, number>;
  memos!: Table<Memo, number>;
  gamification!: Table<Gamification, string>;
  clips!: Table<SignClip, string>;

  constructor() {
    super("myhand");
    this.version(1).stores({
      profile: "id",
      settings: "key",
      glosses: "id, packId, msWord",
      packs: "id",
      samples: "++id, glossId, createdAt",
      recognitionLogs: "++id, glossId, ts",
      translationLogs: "++id, ts",
      memos: "++id, pinned, createdAt",
      gamification: "id",
    });
    this.version(2).stores({
      clips: "glossId",
    });
  }
}

export const db = new MyHandDB();
