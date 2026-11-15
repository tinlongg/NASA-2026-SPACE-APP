// Journal photos: downscale and re-encode in the browser (drops EXIF), then upload as base64 JPEG.
export const PHOTO_EDGE = 768, PHOTO_QUALITY = 0.7;

export async function downscaleJpeg(source) {
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  const scale = Math.min(1, PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height); bitmap.close?.();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY));
  if (!blob) throw new Error('This browser could not prepare the photo.');
  const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return { image: btoa(binary), width, height, blob };
}

/** One still from the webcam; the stream is released immediately. */
export async function webcamStill() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
  try {
    const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = stream;
    await video.play(); await new Promise(resolve => setTimeout(resolve, 400));
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  } finally { stream.getTracks().forEach(track => track.stop()); }
}

export const dayKey = iso => { const date = new Date(iso); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
/** Groups entries by local day, newest day first. */
export function groupByDay(entries) {
  const days = new Map();
  for (const entry of entries) { const key = dayKey(entry.date); if (!days.has(key)) days.set(key, []); days.get(key).push(entry); }
  return [...days].map(([day, items]) => ({ day, items })).sort((a, b) => (a.day < b.day ? 1 : -1));
}
