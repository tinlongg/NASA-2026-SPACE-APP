export const VISION_MODULE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs';
export const VISION_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
const modelUrl = variant => `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${variant}/float16/1/pose_landmarker_${variant}.task`;
export const POSE_MODELS = { lite: modelUrl('lite'), full: modelUrl('full'), heavy: modelUrl('heavy') };
export const POSE_MODEL = POSE_MODELS.lite;
export const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
// "Download camera model" prepares lite and full. Heavy is 31 MB: it is cached the first time it is
// selected online, so it is allowed in the cache but not part of the offline preparation.
export const MODEL_ASSETS = [VISION_MODULE, POSE_MODELS.lite, POSE_MODELS.full, FACE_MODEL, ...['vision_wasm_internal.js','vision_wasm_internal.wasm','vision_wasm_nosimd_internal.js','vision_wasm_nosimd_internal.wasm'].map(name => `${VISION_WASM}/${name}`)];
export const SHELL_ASSETS = ['/', '/index.html', '/styles.css', '/app.js', '/journal-sentiment.js', '/sentiment-lexicon.js', '/sentiment-license.txt', '/detector.js', '/fixtures.js', '/offline-config.js', '/crew-sync.js', '/account.js', '/journal-photo.js', '/suit-layers.js', '/camera-health.js', '/people.js', '/voice-answer.js', '/checkin.js', '/voice/web-alert.mp3', '/voice/web-checkin.mp3', '/crew-sync.css', '/research.js', '/research.css', '/data/nasa-research.json'];
export function cacheableAsset(requestUrl, origin) {
  const url = new URL(requestUrl);
  return MODEL_ASSETS.includes(url.href) || url.href === POSE_MODELS.heavy || (url.origin === origin && !url.search && SHELL_ASSETS.includes(url.pathname));
}
