"use client";

// AI capture — keypoint sequence recording with quality gate (SDDD §4.5, FR-020/021)
import type { HandFrame } from "../landmark/handLandmarker";
import type { HandLandmarker } from "@mediapipe/tasks-vision";

export interface CaptureConfig {
  minDurationMs: number; // default 800
  maxDurationMs: number; // default 2500
  maxDropoutRatio: number; // default 0.10
}

export const DEFAULT_CAPTURE: CaptureConfig = {
  minDurationMs: 800,
  maxDurationMs: 2500,
  maxDropoutRatio: 0.1,
};

export interface QualityCheck {
  ok: boolean;
  reason: string;
}

export function checkHandVisibility(frame: HandFrame): QualityCheck {
  if (frame.landmarks.length === 0) return { ok: false, reason: "Tiada tangan dikesan" };
  return { ok: true, reason: "" };
}

/** Flatten a hand frame into a numeric feature row (both hands padded to fixed size). */
export function flattenFrame(frame: HandFrame): number[] {
  const out: number[] = [];
  for (let h = 0; h < 2; h++) {
    const hand = frame.landmarks[h];
    if (hand) {
      for (const p of hand) out.push(p.x, p.y, p.z);
    } else {
      for (let i = 0; i < 21; i++) out.push(0, 0, 0);
    }
  }
  return out; // 126 values: 2 hands × 21 points × (x,y,z)
}

export const FEATURE_DIM = 126;

/** Buffer that accumulates frames while recording, with quality metrics. */
export class CaptureBuffer {
  readonly frames: number[][] = [];
  readonly timestamps: number[] = [];
  private handlessFrames = 0;
  private config: CaptureConfig;

  constructor(config: CaptureConfig = DEFAULT_CAPTURE) {
    this.config = config;
  }

  add(frame: HandFrame) {
    this.frames.push(flattenFrame(frame));
    this.timestamps.push(frame.ts);
    if (frame.landmarks.length === 0) this.handlessFrames++;
  }

  get durationMs(): number {
    if (this.timestamps.length < 2) return 0;
    return this.timestamps[this.timestamps.length - 1] - this.timestamps[0];
  }

  evaluate(): { ok: boolean; quality: number; reason: string } {
    if (this.frames.length < 8) return { ok: false, quality: 0, reason: "Terlalu pendek — rekod lebih lama" };
    if (this.durationMs < this.config.minDurationMs)
      return { ok: false, quality: 0, reason: "Terlalu pantas — rekod lebih perlahan" };
    if (this.durationMs > this.config.maxDurationMs)
      return { ok: false, quality: 0, reason: "Terlalu panjang — rekod lebih ringkas" };
    const dropout = this.handlessFrames / this.frames.length;
    if (dropout > this.config.maxDropoutRatio)
      return { ok: false, quality: 0, reason: "Tangan keluar dari bingkai — cuba lagi" };
    const quality = Math.round((1 - dropout) * 100) / 100;
    return { ok: true, quality, reason: "" };
  }
}

/** Run landmarker over a video element; returns null when no new frame. */
export async function detectFrame(
  landmarker: HandLandmarker,
  video: HTMLVideoElement,
  lastTs: number
): Promise<HandFrame | null> {
  const ts = video.currentTime * 1000;
  if (ts <= lastTs) return null;
  const res = landmarker.detectForVideo(video, ts);
  return { landmarks: res.landmarks ?? [], ts };
}
