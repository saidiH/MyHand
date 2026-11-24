"use client";

// AI classifier — Stage 1 sign recognition with gating (SDDD §4.2, §4.3)
import * as tf from "@tensorflow/tfjs";

export const FIXED_LEN = 32;
export const FEATURE_DIM = 126;
const CLASSIFY_EVERY_MS = 150;        // run classifier ~6.7x/s (SDDD §4.2)
const CONF_THRESHOLD = 0.75;          // τ (FR-004)
const STABLE_K = 3;                   // consecutive agreeing windows
const COOLDOWN_MS = 1500;             // debounce between repeats

export interface PackConfig {
  labels: string[];
  glossary: { id: string; gloss: string; msWord: string }[];
  accuracy: number;
  accuracyReport?: { valAccuracy: number };
}


/** Prefix a same-origin asset path with the deployment basePath (GitHub Pages /MyHand). */
function assetUrl(path: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base = (process.env.NEXT_PUBLIC_BASE_PATH as string | undefined) ?? "";
  return base + path;
}

export type LoadPhase = "json" | "weights" | "compile" | "ready";

/** Per-feature normalisation params exported from training (replaces the Normalization layer). */
let normParams: { mean: number[]; variance: number[] } | null = null;

let modelPromise: Promise<{ model: tf.LayersModel; pack: PackConfig }> | null = null;
/** Progress listener: 0..100. */
export let onModelProgress: ((pct: number, phase: LoadPhase) => void) | null = null;
export function setModelProgressListener(fn: ((pct: number, phase: LoadPhase) => void) | null) {
  onModelProgress = fn;
}

/** Fetch a URL reporting byte progress via onProgress(loadedBytes, totalBytes). */
async function fetchWithProgress(url: string, onProgress: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(url);
  const total = Number(res.headers.get("content-length")) || 400_000;
  if (!res.body) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  const buf = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  return buf.buffer;
}

export async function getStage1Classifier() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const report = (pct: number, phase: LoadPhase) => onModelProgress?.(Math.min(100, Math.round(pct)), phase);
      report(2, "json");
      // 1. model topology (json) — weight it as 0..10%
      const jsonBuf = await fetchWithProgress(assetUrl("/models/stage1/model.json"), (l, t) => report(2 + (l / t) * 8, "json"));
      const topology = JSON.parse(new TextDecoder().decode(jsonBuf));
      report(10, "json");
      // 2. weight shards — 10..85%
      const manifest = topology.weightsManifest?.[0];
      const paths: string[] = manifest?.paths ?? ["group1-shard1of1.bin"];
      const totalWeights = 204_564; // known shard size (converter omits dataSizeBytes)
      let loadedAll = 0;
      const buffers: ArrayBuffer[] = [];
      for (const p of paths) {
        const buf = await fetchWithProgress(assetUrl(`/models/stage1/${p}`), (l) => {
          report(10 + Math.min(75, ((loadedAll + l) / Math.max(1, totalWeights)) * 75), "weights");
        });
        loadedAll += buf.byteLength;
        buffers.push(buf);
      }
      report(85, "compile");
      // 3. install into tfjs via io.registerWeightLoader equivalent:
      // simplest reliable path: provide a custom weight-fetch handler by monkey-patching fetch is messy —
      // instead load via tf with requestOverride using the buffers we already fetched.
      // assemble a single weight buffer for tf.io.fromMemory
      const total = buffers.reduce((n, b) => n + b.byteLength, 0);
      const merged = new Uint8Array(total);
      let off = 0;
      for (const b of buffers) { merged.set(new Uint8Array(b), off); off += b.byteLength; }
      // layers format: model_config may arrive as a JSON string — parse it
      const mt = topology.modelTopology;
      if (typeof mt.model_config === "string") mt.model_config = JSON.parse(mt.model_config);
      const weightSpecs = manifest?.weights;
      const artifacts = {
        modelTopology: mt,
        weightSpecs,
        weightData: merged.buffer,
      };
      const model = await tf.loadLayersModel(tf.io.fromMemory(artifacts));
      report(90, "compile");
      // normalization is applied in JS (params exported to norm.json)
      const normRes = await fetch(assetUrl("/models/stage1/norm.json"));
      normParams = (await normRes.json()) as { mean: number[]; variance: number[] };
      report(94, "compile");
      // warm-up so the first real sign isn't slow
      tf.tidy(() => { model.predict(tf.zeros([1, FIXED_LEN, FEATURE_DIM])); });
      const packRes = await fetch(assetUrl("/models/stage1/pack.json"));
      const pack = (await packRes.json()) as PackConfig & { accuracyReport: { valAccuracy: number } };
      report(100, "ready");
      return { model, pack: { ...pack, accuracy: pack.accuracyReport?.valAccuracy ?? 0 } };
    })();
  }
  return modelPromise;
}

/** Flatten one frame to 126 features (2 hands × 21 × xyz), matching capture.ts. */
export function flattenHands(landmarks: { x: number; y: number; z: number }[][]): number[] {
  const out: number[] = [];
  for (let h = 0; h < 2; h++) {
    const hand = landmarks[h];
    if (hand) for (const p of hand) out.push(p.x, p.y, p.z);
    else for (let i = 0; i < 21; i++) out.push(0, 0, 0);
  }
  return out;
}

/**
 * Windowed recognizer: accumulates frames, resamples to FIXED_LEN like training,
 * classifies every CLASSIFY_EVERY_MS, and gates output (stability + threshold + cooldown).
 */
export class SignRecognizer {
  private model: tf.LayersModel;
  private pack: PackConfig;
  private window: number[][] = [];
  private lastClassify = 0;
  private lastAccepted = 0;
  private recent: { label: number; conf: number }[] = [];

  constructor(model: tf.LayersModel, pack: PackConfig) {
    this.model = model;
    this.pack = pack;
  }

  pushFrame(landmarks: { x: number; y: number; z: number }[][]) {
    const raw = flattenHands(landmarks);
    if (normParams) {
      for (let i = 0; i < raw.length; i++) {
        raw[i] = (raw[i] - normParams.mean[i]) / (normParams.variance[i] + 1e-6);
      }
    }
    this.window.push(raw);
    if (this.window.length > FIXED_LEN * 2) this.window.shift();
  }

  reset() {
    this.window = [];
    this.recent = [];
  }

  /** Returns a stable prediction or null. */
  maybeClassify(now: number): { gloss: string; confidence: number } | null {
    if (now - this.lastClassify < CLASSIFY_EVERY_MS) return null;
    this.lastClassify = now;
    if (this.window.length < FIXED_LEN) return null;

    // resample window -> FIXED_LEN (same as training pipeline)
    const T = this.window.length;
    const out: number[][] = [];
    for (let i = 0; i < FIXED_LEN; i++) {
      const idx = Math.floor((i / (FIXED_LEN - 1)) * (T - 1));
      out.push(this.window[idx]);
    }
    const shaped = tf.tensor3d(out.flat() as number[], [1, FIXED_LEN, FEATURE_DIM]);
    let data: Float32Array | undefined;
    try {
      const probs = this.model.predict(shaped) as tf.Tensor<tf.Rank>;
      data = probs.dataSync() as Float32Array;
      const arr = Array.from(data as ArrayLike<number>);
      const best = arr.indexOf(Math.max(...arr));
      const conf = data[best];
      probs.dispose();

      // gating: threshold + stability + cooldown (SDDD §4.3)
      if (conf < CONF_THRESHOLD) { this.recent = []; return null; }
      this.recent.push({ label: best, conf });
      if (this.recent.length > STABLE_K) this.recent.shift();
      const stable = this.recent.length === STABLE_K && this.recent.every((r) => r.label === best);
      if (!stable) return null;
      if (now - this.lastAccepted < COOLDOWN_MS) return null;
      this.lastAccepted = now;
      this.recent = [];
      const g = this.pack.glossary[best] ?? { gloss: this.pack.labels[best], id: "", msWord: "" };
      return { gloss: g.gloss, confidence: conf };
    } finally {
      shaped.dispose();
    }
  }
}
