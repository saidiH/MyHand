// Camera wrapper — getUserMedia with facing mode + mirror control (FR-009)
export interface CameraHandle {
  stream: MediaStream;
  stop(): void;
}

export async function openCamera(facingMode: "user" | "environment" = "user"): Promise<CameraHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  return {
    stream,
    stop: () => stream.getTracks().forEach((t) => t.stop()),
  };
}

export function permissionErrorMessage(err: unknown): string {
  const name = (err as DOMException)?.name ?? "";
  if (name === "NotAllowedError") return "Kebenaran kamera ditolak. Sila benarkan akses kamera dalam tetapan pelayar.";
  if (name === "NotFoundError") return "Kamera tidak ditemui pada peranti ini.";
  if (name === "NotReadableError") return "Kamera sedang digunakan oleh aplikasi lain.";
  return "Kamera tidak dapat dibuka. Cuba lagi.";
}
