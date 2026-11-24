// Typed repositories — all persistence goes through here (SDDD §2.2)
import { db, Profile, Setting, Gloss, SignPack, Sample, RecognitionLog, TranslationLog, Memo, Gamification } from "./schema";

export async function getProfile(): Promise<Profile> {
  const p = await db.profile.get("local");
  if (p) return p;
  const fresh: Profile = { id: "local", displayName: "Sahabat", createdAt: Date.now() };
  await db.profile.put(fresh);
  return fresh;
}

export async function setDisplayName(name: string) {
  await db.profile.update("local", { displayName: name });
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.settings.get(key);
  return s ? (s.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
}

export async function installPack(pack: SignPack, glosses: Gloss[]) {
  await db.transaction("rw", db.packs, db.glosses, async () => {
    await db.packs.put(pack);
    await db.glosses.bulkPut(glosses);
  });
}

export async function activePackId(): Promise<string | null> {
  return getSetting<string | null>("activePackId", null);
}

export async function setActivePack(packId: string | null) {
  await setSetting("activePackId", packId);
}

export async function glossesForPack(packId: string): Promise<Gloss[]> {
  return db.glosses.where("packId").equals(packId).toArray();
}

export async function addSample(sample: Sample) {
  return db.samples.add(sample);
}

export async function samplesForGloss(glossId: string): Promise<Sample[]> {
  return db.samples.where("glossId").equals(glossId).toArray();
}

export async function logRecognition(entry: RecognitionLog) {
  return db.recognitionLogs.add(entry);
}

export async function logTranslation(entry: TranslationLog) {
  return db.translationLogs.add(entry);
}

export async function recentRecognitions(limit = 100): Promise<RecognitionLog[]> {
  return db.recognitionLogs.orderBy("ts").reverse().limit(limit).toArray();
}

export async function recentTranslations(limit = 100): Promise<TranslationLog[]> {
  return db.translationLogs.orderBy("ts").reverse().limit(limit).toArray();
}

export async function deleteRecognition(id: number) {
  return db.recognitionLogs.delete(id);
}

export async function deleteTranslation(id: number) {
  return db.translationLogs.delete(id);
}

export async function clearAllData() {
  await Promise.all([
    db.profile.clear(), db.settings.clear(), db.glosses.clear(),
    db.packs.clear(), db.samples.clear(), db.recognitionLogs.clear(),
    db.translationLogs.clear(), db.memos.clear(), db.gamification.clear(),
  ]);
}

export async function addMemo(text: string) {
  return db.memos.add({ text, createdAt: Date.now(), pinned: false });
}

export async function listMemos(): Promise<Memo[]> {
  return db.memos.orderBy("createdAt").reverse().toArray();
}

export async function deleteMemo(id: number) {
  return db.memos.delete(id);
}

export async function addXp(amount: number) {
  const g = (await db.gamification.get("local")) ?? { id: "local", streak: 0, xp: 0, lastPlayed: 0 };
  const today = new Date().toDateString();
  const last = g.lastPlayed ? new Date(g.lastPlayed).toDateString() : "";
  let streak = g.streak;
  if (last !== today) streak = last === new Date(Date.now() - 86400000).toDateString() ? streak + 1 : 1;
  await db.gamification.put({ ...g, xp: g.xp + amount, streak, lastPlayed: Date.now() });
}

export async function getGamification(): Promise<Gamification> {
  return (await db.gamification.get("local")) ?? { id: "local", streak: 0, xp: 0, lastPlayed: 0 };
}

export async function exportAllData(): Promise<string> {
  const data = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    profile: await db.profile.toArray(),
    settings: await db.settings.toArray(),
    glosses: await db.glosses.toArray(),
    packs: await db.packs.toArray(),
    samples: await db.samples.toArray(),
    recognitionLogs: await db.recognitionLogs.toArray(),
    translationLogs: await db.translationLogs.toArray(),
    memos: await db.memos.toArray(),
    gamification: await db.gamification.toArray(),
  };
  return JSON.stringify(data, null, 2);
}

export async function storageEstimate(): Promise<{ usage: number; quota: number }> {
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  }
  return { usage: 0, quota: 0 };
}

// Sign clips (Text→BIM playback source)
import { SignClip } from "./schema";

export async function saveClip(clip: SignClip) {
  return db.clips.put(clip);
}

export async function getClip(glossId: string): Promise<SignClip | undefined> {
  return db.clips.get(glossId);
}

export async function listClips(): Promise<SignClip[]> {
  return db.clips.toArray();
}

export async function deleteClip(glossId: string) {
  return db.clips.delete(glossId);
}
