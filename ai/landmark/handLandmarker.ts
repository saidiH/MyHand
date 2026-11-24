"use client";

// AI layer — landmark extraction (SDDD §4.1). Hand-only for P05.
// Assets are served from /public and cached by the service worker for offline use.
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

let handLandmarkerPromise: Promise<HandLandmarker> | null = null;

export async function getHandLandmarker(): Promise<HandLandmarker> {
  if (!handLandmarkerPromise) {
    handLandmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      return HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
      });
    })();
  }
  return handLandmarkerPromise;
}

export interface HandFrame {
  landmarks: { x: number; y: number; z: number }[][]; // 0..2 hands, 21 points, normalised
  ts: number;
}

/**
 * Draw neon skeleton overlay.
 * videoW/H are intrinsic video dimensions; canvasW/H the canvas pixel size.
 * The video is displayed with object-cover, so we map normalized landmarks
 * through the same cover-crop transform (scale + center offset).
 */
export function drawHandOverlay(
  ctx: CanvasRenderingContext2D,
  frame: HandFrame,
  videoW: number,
  videoH: number,
  canvasW: number,
  canvasH: number
) {
  // object-cover mapping: scale video until it covers canvas, then center-crop
  const scale = Math.max(canvasW / videoW, canvasH / videoH);
  const drawnW = videoW * scale;
  const drawnH = videoH * scale;
  const offsetX = (canvasW - drawnW) / 2;
  const offsetY = (canvasH - drawnH) / 2;
  const toX = (nx: number) => offsetX + nx * drawnW;
  const toY = (ny: number) => offsetY + ny * drawnH;
  const CONNECTIONS: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 4],          // thumb
    [0, 5], [5, 6], [6, 7], [7, 8],          // index
    [5, 9], [9, 10], [10, 11], [11, 12],     // middle
    [9, 13], [13, 14], [14, 15], [15, 16],   // ring
    [13, 17], [17, 18], [18, 19], [19, 20],  // pinky
    [0, 17],                                  // palm base
  ];
  const jointColors = ["#ff2d78", "#ff7a1a", "#ffd21a", "#22e5ff", "#a855f7"];

  for (const hand of frame.landmarks) {
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 8;
    // bones
    for (const [a, b] of CONNECTIONS) {
      const pa = hand[a], pb = hand[b];
      ctx.strokeStyle = "rgba(34, 229, 255, 0.85)";
      ctx.shadowColor = "#22e5ff";
      ctx.beginPath();
      ctx.moveTo(toX(pa.x), toY(pa.y));
      ctx.lineTo(toX(pb.x), toY(pb.y));
      ctx.stroke();
    }
    // glowing joints
    ctx.shadowBlur = 12;
    hand.forEach((p, i) => {
      ctx.fillStyle = jointColors[i % jointColors.length];
      ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath();
      ctx.arc(toX(p.x), toY(p.y), i === 0 ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.shadowBlur = 0;
}
