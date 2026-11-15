// A rotatable 3D model of the International Space Station for the Stations page, drawn on a 2D canvas with
// a small perspective projection (no libraries). It is a simplified schematic, not an engineering model:
// modules are cylinders along the station's long axis (x), the truss runs across it (z), y is up.
export const MODULES = {
  zvezda:      { name: 'Zvezda service module', a: [-9.4, 0, 0],   b: [-6.4, 0, 0],   r: 0.60 },
  zarya:       { name: 'Zarya',                 a: [-6.4, 0, 0],   b: [-3.0, 0, 0],   r: 0.62 },
  unity:       { name: 'Unity (Node 1)',        a: [-3.0, 0, 0],   b: [-1.4, 0, 0],   r: 0.72 },
  destiny:     { name: 'Destiny (US laboratory)', a: [-1.4, 0, 0], b: [1.9, 0, 0],    r: 0.68 },
  harmony:     { name: 'Harmony (Node 2): crew quarters', a: [1.9, 0, 0], b: [3.4, 0, 0], r: 0.72, private: true },
  columbus:    { name: 'Columbus (European laboratory)', a: [2.65, 0, 0.72], b: [2.65, 0, 3.0], r: 0.55 },
  kibo:        { name: 'Kibo (Japanese laboratory)', a: [2.65, 0, -0.72], b: [2.65, 0, -3.5], r: 0.6 },
  tranquility: { name: 'Tranquility (Node 3, exercise)', a: [-2.2, 0, -0.72], b: [-2.2, 0, -2.4], r: 0.6 },
  cupola:      { name: 'Cupola',                a: [-2.2, 0, -2.4], b: [-2.2, 0, -2.85], r: 0.36 },
  quest:       { name: 'Quest airlock',         a: [-2.2, 0, 0.72], b: [-2.2, 0, 1.75], r: 0.42 },
};
export const ROOM_IDS = Object.keys(MODULES).filter(id => !MODULES[id].private);

const SEGMENTS = 14, FOCAL = 3.0, DISTANCE = 24;
export const STATUS_COLOUR = { none: '#9aa0a9', idle: '#a9aeb7', moving: '#3f9c68', still: '#c8923e', checking: '#c8923e', alert: '#d3574b', offline: '#4d5057' };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const length = Math.hypot(...a) || 1; return [a[0] / length, a[1] / length, a[2] / length]; };

/** Rotates a world point by yaw (about y) then pitch (about x). */
const CENTRE = [-2.8, 0.3, 0]; // the model turns about the middle of the station, not the origin
export function rotate(point, yaw, pitch) {
  const [x, y, z] = [point[0] - CENTRE[0], point[1] - CENTRE[1], point[2] - CENTRE[2]], cy = Math.cos(yaw), sy = Math.sin(yaw), x1 = x * cy + z * sy, z1 = -x * sy + z * cy, cp = Math.cos(pitch), sp = Math.sin(pitch);
  return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
}
/** Perspective: returns [screenX, screenY, depth, scale] for a rotated point, in a width x height canvas. */
export function project(point, width, height) {
  const depth = DISTANCE + point[2], scale = (FOCAL * Math.min(width, height) * 0.5) / depth * (DISTANCE / 16);
  return [width / 2 + point[0] * scale, height / 2 - point[1] * scale, depth, scale];
}

/** Polygons (world space) for one cylinder: its sides and two end caps. */
function cylinder(a, b, radius) {
  const axis = norm(sub(b, a)), helper = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], u = norm(cross(axis, helper)), v = cross(axis, u), ring = [];
  for (let index = 0; index < SEGMENTS; index++) { const angle = (index / SEGMENTS) * Math.PI * 2; ring.push(add(mul(u, Math.cos(angle) * radius), mul(v, Math.sin(angle) * radius))); }
  const polygons = [];
  for (let index = 0; index < SEGMENTS; index++) {
    const next = (index + 1) % SEGMENTS, middle = add(mul(add(ring[index], ring[next]), 0.5), [0, 0, 0]);
    polygons.push({ points: [add(a, ring[index]), add(a, ring[next]), add(b, ring[next]), add(b, ring[index])], normal: norm(middle) });
  }
  polygons.push({ points: ring.map(offset => add(a, offset)), normal: mul(axis, -1) }, { points: ring.map(offset => add(b, offset)), normal: axis });
  return polygons;
}
const box = (min, max) => {
  const corner = (x, y, z) => [x ? max[0] : min[0], y ? max[1] : min[1], z ? max[2] : min[2]];
  const faces = [[[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1], [-1, 0, 0]], [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0], [1, 0, 0]], [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0], [0, -1, 0]], [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1], [0, 1, 0]], [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, -1]], [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1], [0, 0, 1]]];
  return faces.map(face => ({ points: face.slice(0, 4).map(c => corner(...c)), normal: face[4] }));
};
const panel = (x0, x1, z0, z1, y) => ({ points: [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], normal: [0, 1, 0], double: true });

/** Everything to draw, in world space: station structure plus the modules (tagged with their id). */
export function buildScene() {
  const structure = [...box([-0.35, 1.15, -7.2], [0.35, 1.45, 7.2]), ...box([-0.3, 0.62, -0.3], [0.3, 1.2, 0.3])];
  const arrays = [];
  for (const side of [-1, 1]) for (const offset of [-1.25, 1.25]) arrays.push(panel(offset - 0.8, offset + 0.8, side * 7.4, side * 12, 1.3));
  for (const side of [-1, 1]) arrays.push(panel(-9.0, -7.4, side * 1.0, side * 3.3, 0.2));
  const modules = Object.entries(MODULES).flatMap(([id, module]) => cylinder(module.a, module.b, module.r).map(polygon => ({ ...polygon, module: id })));
  return { structure, arrays, modules };
}

/** Which module is under a screen point, or null. Compares the point to each module's projected axis. */
export function pick(x, y, view) {
  let best = null;
  for (const [id, module] of Object.entries(MODULES)) {
    const a = project(rotate(module.a, view.yaw, view.pitch), view.width, view.height), b = project(rotate(module.b, view.yaw, view.pitch), view.width, view.height);
    const dx = b[0] - a[0], dy = b[1] - a[1], span = dx * dx + dy * dy, t = span ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / span)) : 0;
    const distance = Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)), reach = Math.max(10, module.r * (a[3] + b[3]) / 2 * 1.05);
    if (distance <= reach && (!best || a[2] + t * (b[2] - a[2]) < best.depth)) best = { id, depth: a[2] + t * (b[2] - a[2]) };
  }
  return best?.id ?? null;
}

const LIGHT = norm([-0.4, 0.85, 0.5]);
function shade(hex, brightness) {
  const channel = offset => Math.round(parseInt(hex.slice(offset, offset + 2), 16) * brightness);
  return `rgb(${Math.min(255, channel(1))}, ${Math.min(255, channel(3))}, ${Math.min(255, channel(5))})`;
}

/** Binds the model to a canvas: drag to turn, click to pick, slow spin when idle. */
export function createIssView(canvas, { onSelect, getStatuses }) {
  const context = canvas.getContext('2d'), scene = buildScene(), view = { yaw: -0.65, pitch: 0.32, width: 600, height: 380 };
  let selected = null, hovered = null, dragging = null, frame = 0, still = false, last = performance.now();
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() { const ratio = window.devicePixelRatio || 1, width = canvas.clientWidth || 600, height = Math.round(width * 0.62); if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); } view.width = canvas.width; view.height = canvas.height; return ratio; }
  function draw() {
    const ratio = resize(), statuses = getStatuses?.() ?? {};
    context.clearRect(0, 0, canvas.width, canvas.height);
    const polygons = [];
    const add = (list, base, brightness, extra = {}) => { for (const polygon of list) { const points = polygon.points.map(point => project(rotate(point, view.yaw, view.pitch), view.width, view.height)); const normal = rotate(polygon.normal, view.yaw, view.pitch), facing = normal[2] < 0.02 || polygon.double; if (!facing) continue; polygons.push({ points, depth: points.reduce((sum, point) => sum + point[2], 0) / points.length, fill: shade(base, brightness(polygon.normal)), ...extra, module: polygon.module }); } };
    add(scene.arrays, '#3b66b0', normal => 0.8 + 0.3 * Math.abs(dot(norm(normal), LIGHT)), { stroke: 'rgba(160,190,235,.5)' });
    add(scene.structure, '#b4b9c1', normal => 0.6 + 0.5 * Math.max(0, dot(norm(rotateLight(normal)), LIGHT)), { stroke: 'rgba(0,0,0,.35)' });
    for (const [id] of Object.entries(MODULES)) {
      const status = statuses[id] ?? (MODULES[id].private ? 'offline' : 'none'), base = STATUS_COLOUR[status] ?? STATUS_COLOUR.none;
      add(scene.modules.filter(polygon => polygon.module === id), base, normal => 0.62 + 0.55 * Math.max(0, dot(norm(normal), LIGHT)), { stroke: id === selected ? '#ececef' : id === hovered ? 'rgba(236,237,239,.7)' : 'rgba(0,0,0,.35)', width: id === selected ? 2.5 : 1 });
    }
    polygons.sort((p, q) => q.depth - p.depth);
    for (const polygon of polygons) {
      context.beginPath(); polygon.points.forEach((point, index) => index ? context.lineTo(point[0], point[1]) : context.moveTo(point[0], point[1])); context.closePath();
      context.fillStyle = polygon.fill; context.fill(); context.strokeStyle = polygon.stroke ?? 'rgba(0,0,0,.3)'; context.lineWidth = (polygon.width ?? 1) * ratio; context.stroke();
    }
    context.font = `${Math.round(11 * ratio)}px system-ui, sans-serif`; context.textAlign = 'center';
    for (const [id, module] of Object.entries(MODULES)) {
      const centre = project(rotate(mul(add(module.a, module.b), 0.5), view.yaw, view.pitch), view.width, view.height), label = module.name.split(' (')[0].split(':')[0];
      const hot = id === selected || id === hovered; if (!hot && !statuses[id]) continue;
      const width = context.measureText(label).width + 10 * ratio, top = centre[1] - module.r * centre[3] - 20 * ratio;
      context.fillStyle = 'rgba(18,19,20,.85)'; context.fillRect(centre[0] - width / 2, top, width, 18 * ratio); context.fillStyle = '#ececef'; context.fillText(label, centre[0], top + 13 * ratio);
    }
  }
  const rotateLight = normal => normal;
  function loop(now) {
    frame = requestAnimationFrame(loop);
    if (!canvas.offsetParent) { last = now; return; } // hidden tab: draw nothing
    if (!dragging && !reduced && !still && !hovered) view.yaw += (now - last) * 0.00006;
    last = now; draw();
  }
  const local = event => { const rect = canvas.getBoundingClientRect(), ratio = canvas.width / rect.width; return [(event.clientX - rect.left) * ratio, (event.clientY - rect.top) * ratio]; };
  canvas.addEventListener('pointerdown', event => { dragging = { x: event.clientX, y: event.clientY, moved: false }; canvas.setPointerCapture(event.pointerId); still = true; });
  canvas.addEventListener('pointermove', event => {
    if (dragging) { const dx = event.clientX - dragging.x, dy = event.clientY - dragging.y; if (Math.abs(dx) + Math.abs(dy) > 3) dragging.moved = true; view.yaw += dx * 0.008; view.pitch = Math.max(-1.2, Math.min(1.2, view.pitch + dy * 0.006)); dragging.x = event.clientX; dragging.y = event.clientY; return; }
    const [x, y] = local(event); hovered = pick(x, y, view); canvas.style.cursor = hovered ? 'pointer' : 'grab';
  });
  canvas.addEventListener('pointerup', event => { const moved = dragging?.moved; dragging = null; if (!moved) { const [x, y] = local(event); const id = pick(x, y, view); if (id) { selected = id; onSelect?.(id); } } });
  canvas.addEventListener('pointerleave', () => { hovered = null; });
  canvas.addEventListener('wheel', event => { event.preventDefault(); }, { passive: false });
  frame = requestAnimationFrame(loop);
  return { select(id) { selected = id; }, view, stop() { cancelAnimationFrame(frame); } };
}
