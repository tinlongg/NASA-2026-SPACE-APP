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
  cupola:      { name: 'Cupola',                a: [-2.2, -.5, -1.65], b: [-2.2, -1.1, -1.65], r: 0.36 },
  quest:       { name: 'Quest airlock',         a: [-2.2, 0, 0.72], b: [-2.2, 0, 1.75], r: 0.42 },
};
export const ROOM_IDS = Object.keys(MODULES).filter(id => !MODULES[id].private);

const SEGMENTS = 10, DISTANCE = 70;
export const STATUS_COLOUR = { none: '#9aa0a9', idle: '#a9aeb7', moving: '#3f9c68', still: '#c8923e', checking: '#c8923e', alert: '#d3574b', offline: '#4d5057' };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const length = Math.hypot(...a) || 1; return [a[0] / length, a[1] / length, a[2] / length]; };

/** Rotates a world point by yaw (about y) then pitch (about x). */
const CENTRE = [-2.8, 0.3, 0]; // the model turns about the middle of the station, not the origin
export function rotate(point, yaw, pitch) {
  return rotateDirection(sub(point,CENTRE),yaw,pitch);
}
/** Normals have direction but no position: never subtract the station centre. */
export function rotateDirection([x,y,z],yaw,pitch){
 const cy=Math.cos(yaw),sy=Math.sin(yaw),x1=x*cy+z*sy,z1=-x*sy+z*cy,cp=Math.cos(pitch),sp=Math.sin(pitch);
 return [x1,y*cp-z1*sp,y*sp+z1*cp];
}

/** Perspective: returns [screenX, screenY, depth, scale] for a rotated point, in a width x height canvas. */
export function project(point, width, height) {
  const depth = DISTANCE + point[2], scale = (Math.min(width, height) * 2.05) / depth;
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
  const structure=[],arrays=[],details=[];
  const beam=(a,b,r=.045,color='#b8c1cb')=>structure.push({points:[a,b],normal:[0,1,0],double:true,line:true,r,color});
  // Open lattice backbone, four photovoltaic mast assemblies, eight main wings.
  for(let z=-12;z<12;z+=1.5){
   for(const x of[-.38,.38])for(const y of[1.05,1.8])beam([x,y,z],[x,y,z+1.5]);
   for(const x of[-.38,.38]){beam([x,1.05,z],[x,1.8,z+1.5],.025);beam([x,1.8,z],[x,1.05,z+1.5],.025);}
   for(const y of[1.05,1.8])beam([-.38,y,z],[.38,y,z+1.5],.025);
  }
  beam([0,0,0],[0,1.4,0],.16);
  for(const z of[-10.8,-7.3,7.3,10.8]){
   beam([0,1.45,z],[0,2.05,z],.12,'#c5ad77');
   for(const side of[-1,1]){
    const x0=side>0?.55:-7.3,x1=side>0?7.3:-.55;
    // Paired blankets, with a central mast and individual photovoltaic cells.
    for(const dz of[-.8,.15]){
     arrays.push({...panel(x0,x1,z+dz,z+dz+.65,2.05),color:'#91704c',wing:true});
     for(let x=x0+.06;x<x1-.1;x+=.45)for(let k=0;k<2;k++)details.push({...panel(x,x+.37,z+dz+.035+k*.3,z+dz+.3+k*.3,2.065),color:'#364c78',double:true});
    }
    beam([x0,2.1,z],[x1,2.1,z],.035,'#dfc18a');
   }
  }
  // Cell blankets are visible from either side of the thin panel backing.
  details.push(...details.map(p=>({...p,points:p.points.map(([x,y,z])=>[x,y-.03,z])})));
  // Russian segment arrays and the white thermal radiator banks.
  for(const side of[-1,1]){
   arrays.push({...panel(-9,-7.4,side*1.0,side*3.5,.2),color:'#3c587c'});
   for(const z of[side*2.3,side*3.8])for(let i=0;i<5;i++)details.push({...panel(-3.6+i*.6,-3.04+i*.6,z,z+side*1.1,1.35),color:'#d9dedc'});
  }
  const modules=Object.entries(MODULES).flatMap(([id,m])=>cylinder(m.a,m.b,m.r).map(p=>({...p,module:id})));
  // End collars and ribs catch sunlight on the insulated module hulls.
  for(const m of Object.values(MODULES))for(const t of[.05,.25,.75,.95]){
   const axis=sub(m.b,m.a),c=add(m.a,mul(axis,t));details.push(...cylinder(c,add(c,mul(norm(axis),.055)),m.r*1.025).map(p=>({...p,color:'#e0e4e6'})));
  }
  // Kibo exposed facility, logistics canister, docking adapter and Canadarm2.
  details.push(...box([2.05,-.25,-4.6],[3.25,.05,-3.5]).map(p=>({...p,color:'#cbd0d4'})));
  details.push(...cylinder([2.65,.4,-1.65],[2.65,1.55,-1.65],.43).map(p=>({...p,color:'#c3cbd3'})));
  details.push(...cylinder([3.4,0,0],[4.4,0,0],.3).map(p=>({...p,color:'#9cabbc'})));
  beam([0,1.8,1.3],[1.6,3.3,2.1],.09,'#e7e4dc');beam([1.6,3.3,2.1],[3.6,2.6,1.2],.09,'#e7e4dc');beam([3.6,2.6,1.2],[4.3,1.8,1.2],.09,'#e7e4dc');
  return {structure,arrays,modules,details};
}
/** Which module is under a screen point, or null. Compares the point to each module's projected axis. */
export function pick(x, y, view) {
  let best = null;
  for (const [id, module] of Object.entries(MODULES)) {
    const a = project(rotate(module.a, view.yaw, view.pitch), view.width, view.height), b = project(rotate(module.b, view.yaw, view.pitch), view.width, view.height);
    const dx = b[0] - a[0], dy = b[1] - a[1], span = dx * dx + dy * dy, t = span ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / span)) : 0;
    const distance = Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)), reach = Math.max(4, module.r * (a[3] + b[3]) / 2 * 1.05);
    if (distance <= reach && (!best || a[2] + t * (b[2] - a[2]) < best.depth)) best = { id, depth: a[2] + t * (b[2] - a[2]) };
  }
  return best?.id ?? null;
}

const LIGHT = norm([-0.4, 0.85, 0.5]);
function shade(hex, brightness) {
  const channel = offset => Math.round(parseInt(hex.slice(offset, offset + 2), 16) * brightness);
  return `rgb(${Math.min(255, channel(1))}, ${Math.min(255, channel(3))}, ${Math.min(255, channel(5))})`;
}

/** Binds the model to a canvas: drag to turn, click to pick, redraw only when the view or camera status changes. */
export function createIssView(canvas, { onSelect, getStatuses }) {
  const context = canvas.getContext('2d'), scene = buildScene(), view = { yaw: -0.55, pitch: 0.65, width: 600, height: 380, zoom:1, panX:0, panY:0 };
  let selected = null, hovered = null, dragging = null, frame = 0, dirty = true, statusKey = '';


  const modulePolygons=Object.fromEntries(Object.keys(MODULES).map(id=>[id,scene.modules.filter(p=>p.module===id)])),fills=new Map();
  function resize() { const ratio = (dragging?1:Math.min(window.devicePixelRatio || 1,1.5)), width = canvas.clientWidth || 600, height = Math.round(width * 0.62); if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); } view.width = canvas.width; view.height = canvas.height; return ratio; }
  function draw() {
    const ratio = resize(), statuses = getStatuses?.() ?? {};
    context.clearRect(0, 0, canvas.width, canvas.height);
    const polygons = [],cy=Math.cos(view.yaw),sy=Math.sin(view.yaw),cp=Math.cos(view.pitch),sp=Math.sin(view.pitch);
    const transform=(point,direction=false)=>{const x=point[0]-(direction?0:CENTRE[0]),y=point[1]-(direction?0:CENTRE[1]),z=point[2]-(direction?0:CENTRE[2]),rx=x*cy+z*sy,rz=-x*sy+z*cy;return [rx,y*cp-rz*sp,y*sp+rz*cp];};
    const screen=point=>{const [x,y,z]=transform(point),depth=DISTANCE+z,scale=Math.min(view.width,view.height)*2.05/depth*view.zoom;return[view.width/2+x*scale+view.panX*ratio,view.height/2-y*scale+view.panY*ratio,depth,scale];};
    const cachedFill=(polygon,base,brightness)=>{const key=(polygon.color||base)+polygon.normal.join(',');if(!fills.has(key))fills.set(key,shade(polygon.color||base,brightness(polygon.normal)));return fills.get(key);};
    const enqueue = (list, base, brightness, extra = {}) => { for (const polygon of list) { const normal=transform(polygon.normal,true);if(normal[2]>=.02&&!polygon.double)continue;const points=polygon.points.map(screen); polygons.push({ points, depth: points.reduce((sum, point) => sum + point[2], 0) / points.length, fill: cachedFill(polygon,base,brightness), ...extra, module: polygon.module, line:polygon.line, radius:polygon.r }); } };
    enqueue(scene.arrays, '#3b66b0', normal => 0.8 + 0.3 * Math.abs(dot(norm(normal), LIGHT)), { stroke: 'rgba(160,190,235,.5)' });
    if(!dragging)enqueue(scene.details, '#cbd0d5', normal => 0.7 + 0.3 * Math.abs(dot(normal,LIGHT)), {stroke:'rgba(10,20,32,.16)'});
    enqueue(scene.structure, '#b4b9c1', normal => 0.6 + 0.5 * Math.max(0, dot(norm(normal), LIGHT)), { stroke: 'rgba(175,190,210,.25)', width:.45 });
    for (const [id] of Object.entries(MODULES)) {
      const status = statuses[id] ?? (MODULES[id].private ? 'offline' : 'none'), base = STATUS_COLOUR[status] ?? STATUS_COLOUR.none;
      enqueue(modulePolygons[id], base, normal => 0.62 + 0.55 * Math.max(0, dot(norm(normal), LIGHT)), { stroke: id === selected ? '#ececef' : id === hovered ? 'rgba(236,237,239,.7)' : 'rgba(0,0,0,.35)', width: id === selected ? 2.5 : 1 });
    }
    polygons.sort((p, q) => q.depth - p.depth);
    for (const polygon of polygons) {
      context.beginPath(); polygon.points.forEach((point, index) => index ? context.lineTo(point[0], point[1]) : context.moveTo(point[0], point[1])); if(!polygon.line)context.closePath();
      if(polygon.line){context.strokeStyle=polygon.fill;context.lineWidth=Math.max(.55*ratio,polygon.radius*2*polygon.points[0][3]);context.stroke();continue;}
      context.fillStyle = polygon.fill; context.fill(); context.strokeStyle = polygon.stroke ?? 'rgba(0,0,0,.3)'; context.lineWidth = (polygon.width ?? 1) * ratio; context.stroke();
    }
    context.font = `${Math.round(11 * ratio)}px system-ui, sans-serif`; context.textAlign = 'center';
    for (const [id, module] of Object.entries(MODULES)) {
      const centre = screen(mul(add(module.a,module.b),.5)), label = module.name.split(' (')[0].split(':')[0];
      const hot = id === selected || id === hovered; if (!hot && !statuses[id]) continue;
      const width = context.measureText(label).width + 10 * ratio, top = centre[1] - module.r * centre[3] - 20 * ratio;
      context.fillStyle = 'rgba(18,19,20,.85)'; context.fillRect(centre[0] - width / 2, top, width, 18 * ratio); context.fillStyle = '#ececef'; context.fillText(label, centre[0], top + 13 * ratio);
    }
  }

  function loop(now) {
    frame = requestAnimationFrame(loop);
    if (!canvas.offsetParent) { return; } // hidden tab: draw nothing

    const nextStatus=JSON.stringify(getStatuses?.()??{}), size=canvas.clientWidth;
    if(nextStatus!==statusKey||size!==view.clientWidth){dirty=true;statusKey=nextStatus;view.clientWidth=size;}
    if(dirty){draw();dirty=false;}
  }
  const local = event => { const rect = canvas.getBoundingClientRect(), ratio = canvas.width / rect.width; return [(event.clientX - rect.left) * ratio, (event.clientY - rect.top) * ratio]; };
  canvas.addEventListener('pointerdown', event => { if(event.button!==undefined&&![0,2].includes(event.button))return;dragging = { x: event.clientX, y: event.clientY, moved: false, pan:event.button===2 }; canvas.setPointerCapture(event.pointerId); dirty=true; });
  canvas.addEventListener('pointermove', event => {
    if (dragging) { const dx = event.clientX - dragging.x, dy = event.clientY - dragging.y; if (Math.abs(dx) + Math.abs(dy) > 3) dragging.moved = true; dirty=true;if(dragging.pan){view.panX+=dx;view.panY+=dy;}else{view.yaw += dx * 0.012; view.pitch = Math.max(-1.2, Math.min(1.2, view.pitch + dy * 0.009));} dragging.x = event.clientX; dragging.y = event.clientY; return; }
    const [x, y] = local(event); const nextHover=pick(view.width/2+(x-view.width/2-view.panX*(canvas.width/canvas.clientWidth))/view.zoom,view.height/2+(y-view.height/2-view.panY*(canvas.width/canvas.clientWidth))/view.zoom,view);if(nextHover!==hovered)dirty=true;hovered=nextHover; canvas.style.cursor = hovered ? 'pointer' : 'grab';
  });
  canvas.addEventListener('pointerup', event => { const moved = dragging?.moved; dragging = null; dirty=true; if (!moved&&event.button!==2) { const [x, y] = local(event); const id = pick(view.width/2+(x-view.width/2)/view.zoom,view.height/2+(y-view.height/2)/view.zoom,view); if (id) { dirty=true;selected = id; onSelect?.(id); } } });
  canvas.addEventListener('pointercancel',()=>{dragging=null;hovered=null;dirty=true;});
  canvas.addEventListener('lostpointercapture',()=>{dragging=null;dirty=true;});
  canvas.addEventListener('pointerleave', () => { hovered = null; dirty=true; });
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  canvas.addEventListener('wheel', event => {event.preventDefault();const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?canvas.clientWidth:1);view.zoom=Math.max(.65,Math.min(1.8,view.zoom*Math.exp(-delta*.0015)));dirty=true;}, { passive: false });
  frame = requestAnimationFrame(loop);
  return { reset(){dragging=null;hovered=null;view.yaw=-.55;view.pitch=.65;view.zoom=1;view.panX=0;view.panY=0;dirty=true;}, select(id) { selected = id; dirty=true; }, view, stop() { cancelAnimationFrame(frame); } };
}
