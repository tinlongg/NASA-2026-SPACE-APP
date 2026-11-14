export const VISION_MODULE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs';
export const VISION_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
export const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
export const MODEL_ASSETS = [VISION_MODULE, POSE_MODEL, ...['vision_wasm_internal.js','vision_wasm_internal.wasm','vision_wasm_nosimd_internal.js','vision_wasm_nosimd_internal.wasm'].map(name => `${VISION_WASM}/${name}`)];
export const SHELL_ASSETS = ['/', '/index.html', '/styles.css', '/app.js', '/detector.js', '/fixtures.js', '/research-ui.js', '/offline-config.js', '/fallback.json', '/research.js', '/research.css', '/data/nasa-research.json'];
export function cacheableAsset(requestUrl, origin) {
  const url = new URL(requestUrl);
  return MODEL_ASSETS.includes(url.href) || (url.origin === origin && !url.search && SHELL_ASSETS.includes(url.pathname));
}
