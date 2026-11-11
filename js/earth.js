/* WORLDWAVE Prototype 06 — 高清 3D 地球电台地图。
   - 8K 全球底图 + 在线卫星瓦片局部覆盖（Esri World Imagery，离线回退 8K）
   - 名称贴合球面、按缩放分级、运行时屏幕重叠剔除
   - 电台点恒定屏幕像素、屏幕空间精确拾取、簇内多台切换
   独立于旧版 js/globe.js；单文件版由 tools/build-single-file.py 生成。 */
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';

(() => {
 'use strict';
 const host = document.getElementById('earth');
 if (!host) return;

 const R = 2.35, FOV = 34, MARK_R = R * 1.002;
const TEX = {
 day: './vendor/earth-day-4k.jpg',
 dayLo: './vendor/earth-day-2k.jpg',
 night: './vendor/earth-night-4k.jpg',
 nightLo: './vendor/earth-night-2k.jpg',
 topo: './vendor/earth-topology.png',
 clouds: './vendor/clouds.png'
};
 /* 单文件版会把下面三处替换：快照内联、快照 URL 置空、瓦片本地目录置空。 */
 const SNAPSHOT_INLINE = null;
 const SNAPSHOT_URL = './data/radio-stations.json';
 /* 在线瓦片直连；tools/cache-tiles.py 可生成 tiles/ 供离线部署，届时改为 './tiles' */
 const TILE_BASE = '';
 const API_URL = 'https://de1.api.radio-browser.info/json/stations/search?limit=500&has_geo_info=true&hidebroken=true&order=clickcount&reverse=true';
 const TILE_REMOTE = (z, x, y) => 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + z + '/' + y + '/' + x;
 const STORE_BAD = 'ww.badstreams.v2', STORE_VOL = 'ww.volume.v2';

 const $ = id => document.getElementById(id);
 const ui = {
  bar: $('bar'), title: $('rTitle'), cluster: $('rCluster'), status: $('status'),
  prev: $('rPrev'), next: $('rNext'), toggle: $('rToggle'), stop: $('rStop'),
  vol: $('rVol'), searchBtn: $('rSearch'), search: $('search'), q: $('q'),
  results: $('results'), info: $('rInfo'), tip: $('tip')
 };
 const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
 const mem = navigator.deviceMemory || 4;
 const LOW = mobile || mem <= 2;
 const PIXEL_BUDGET = LOW ? 3.2e6 : 7.0e6;
 const DPR_CAP = LOW ? 1.4 : 2;

 function say(text) { if (ui.status) ui.status.textContent = text; }
 function setMode(mode, text) {
  if (ui.bar) ui.bar.dataset.mode = mode;
  if (ui.title) ui.title.textContent = text;
  say(text);
  window.dispatchEvent(new CustomEvent('ww:mode', { detail: { mode, text } }));
 }
 function readSet(key) {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return new Set(Array.isArray(v) ? v : []); }
  catch (e) { return new Set(); }
 }
 function writeSet(key, set) {
  try { localStorage.setItem(key, JSON.stringify([...set].slice(-400))); } catch (e) { /* 隐私模式 */ }
 }
 let badStreams = readSet(STORE_BAD);

 /* ===================== 渲染器 / 场景 ===================== */
 let renderer;
 try {
  renderer = new THREE.WebGLRenderer({ antialias: !LOW, alpha: false, powerPreference: 'high-performance' });
 } catch (err) {
  showFallback();
  return;
 }
 renderer.outputColorSpace = THREE.SRGBColorSpace;
 renderer.toneMapping = THREE.ACESFilmicToneMapping;
 renderer.toneMappingExposure = 1.32;
 host.appendChild(renderer.domElement);

 const scene = new THREE.Scene();
 scene.background = new THREE.Color(0x02050c);
 const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 300);
 camera.position.set(0, 0.35, 9.0);
 const controls = new OrbitControls(camera, renderer.domElement);
 controls.enableDamping = true;
 controls.dampingFactor = 0.045;
 controls.enablePan = false;
 controls.minDistance = 2.42;
 controls.maxDistance = 26;
 controls.rotateSpeed = 0.55;
 controls.zoomSpeed = 0.85;
 controls.autoRotate = !reducedMotion;
 controls.autoRotateSpeed = 0.22;
 controls.addEventListener('start', () => {
 controls.autoRotate = false;
 dragging = true;
 if (flyRAF) { cancelAnimationFrame(flyRAF); flyRAF = null; }
});
controls.addEventListener('end', () => {
 dragging = false;
 /* 松手后再补一次，避免停在旧瓦片上 */
 TILE.last = 0;
 setTimeout(() => { if (!dragging) refreshTiles(false); }, 180);
});

/* ===================== 平滑变焦 =====================
   OrbitControls 的 dolly 是「一格一跳」，滚轮缩放会顿。这里接管精确指针设备
   的滚轮：只改写目标距离，由渲染循环按 0.18 的系数缓动逼近，滚多少滑多少。
   触屏仍走 OrbitControls 原生双指缩放，避免自实现捏合手感更差。 */
const finePointer = !!(window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches);
let zoomGoal = camera.position.length();
let zoomUntil = 0;
if (finePointer) controls.enableZoom = false;
const clampDist = v => Math.min(controls.maxDistance, Math.max(controls.minDistance, v));
renderer.domElement.addEventListener('wheel', e => {
 if (!finePointer) return;
 e.preventDefault();
 controls.autoRotate = false;
 if (flyRAF) { cancelAnimationFrame(flyRAF); flyRAF = null; }
 const unit = e.deltaMode === 1 ? 18 : (e.deltaMode === 2 ? 400 : 1);
 zoomGoal = clampDist(zoomGoal * Math.exp(e.deltaY * unit * 0.0011));
 zoomUntil = performance.now() + 240;
 /* 一旦拉近到需要看清海岸线的距离，就立刻把 8K 提上来，而不是等空闲 */
 if (zoomGoal < 4.6) upgradeDay();
}, { passive: false });

 scene.add(new THREE.AmbientLight(0x9fb9d4, 0.95));
 /* 太阳方向按 UTC 时间估算，随真实昼夜移动；补光保证夜面不死黑。 */
 const sun = new THREE.DirectionalLight(0xfff1d8, 2.1);
 const nowUTC = new Date();
 const utcHour = nowUTC.getUTCHours() + nowUTC.getUTCMinutes() / 60;
 const dayOfYear = Math.floor((nowUTC - Date.UTC(nowUTC.getUTCFullYear(), 0, 0)) / 86400000);
 const decl = 23.44 * Math.sin(2 * Math.PI * (dayOfYear - 81) / 365);
 function geoToVec3(lat, lon, radius) {
  const phi = (90 - lat) * Math.PI / 180, theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
   -radius * Math.sin(phi) * Math.cos(theta),
   radius * Math.cos(phi),
   radius * Math.sin(phi) * Math.sin(theta)
  );
 }
 sun.position.copy(geoToVec3(decl, (12 - utcHour) * 15, 8));
 scene.add(sun);
 const fill = new THREE.DirectionalLight(0x4a7fc0, 0.42);
 fill.position.set(4, -1.5, -4);
 scene.add(fill);

 /* 星空：远景可见，贴近地表时淡出以免穿透 */
 const starGeo = new THREE.BufferGeometry();
 const starPos = new Float32Array(1100 * 3);
 for (let i = 0; i < 1100; i++) {
  const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
  const r = 70 + Math.random() * 40, s = Math.sqrt(1 - u * u);
  starPos[i * 3] = r * s * Math.cos(a);
  starPos[i * 3 + 1] = r * u;
  starPos[i * 3 + 2] = r * s * Math.sin(a);
 }
 starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
 const starMat = new THREE.PointsMaterial({ color: 0xa8c4e0, size: 0.42, sizeAttenuation: true, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false });
 scene.add(new THREE.Points(starGeo, starMat));

 /* ===================== 地球本体 ===================== */
 const loader = new THREE.TextureLoader();
 const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
 const tune = (t, srgb = true) => {
  t.anisotropy = maxAniso; t.wrapS = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true; return t;
 };
 const earthGroup = new THREE.Group();
 scene.add(earthGroup);

 /* 贴图分级：先用 2K 预览秒出地球，空闲时再换 4K 高清。
    8K（8192×4096）在弱机解码要 3–6s，且近景本来由卫星瓦片接管，
    4K 已足够；换来首屏与首次缩放都不再被解码卡住。 */
 const whenIdle = fn => {
  if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 1500 });
  else setTimeout(fn, 900);
 };
 const hiResAllowed = () => {
  const c = navigator.connection;
  if (c && /(^|-)2g$/.test(String(c.effectiveType || ''))) return false;
  if ((navigator.deviceMemory || 4) < 2) return false;
  return true;
 };
 /* 用 img.decode() 让解码发生在合成线程，再把已解码的位图交给 GPU，
    避免 8K 到位时整个球面卡一帧。 */
 function swapTexture(url, apply) {
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
   try {
    const t = tune(new THREE.Texture(img));
    t.needsUpdate = true;
    if (renderer.initTexture) renderer.initTexture(t);
    apply(t);
   } catch (e) { /* 解码失败保留预览贴图 */ }
  };
  img.onerror = () => {};
  img.src = url;
 }

 const earthMat = new THREE.MeshPhongMaterial({
  color: 0xffffff, specular: new THREE.Color(0x000000), shininess: 0,
  bumpScale: 0.03, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.18
 });
 earthGroup.add(new THREE.Mesh(new THREE.SphereGeometry(R, LOW ? 160 : 256, LOW ? 80 : 128), earthMat));

 let dayTex = null;
 const applyDay = t => {
  const old = dayTex;
  dayTex = t;
  earthMat.map = t; earthMat.emissiveMap = t; earthMat.needsUpdate = true;
  if (old && old !== t) old.dispose();
 };
 let dayHi = false;
 const upgradeDay = () => {
  if (dayHi || !hiResAllowed()) return;
  dayHi = true;
  const doSwap = () => {
   /* 正在滚轮变焦时不换贴图：GPU 上传 8K 会掉一帧，等手停下来再换 */
   if (performance.now() < zoomUntil || dragging) { setTimeout(doSwap, 500); return; }
   swapTexture(TEX.day, t => { applyDay(t); mark('tex-8k'); });
  };
  whenIdle(doSwap);
 };
 loader.load(TEX.dayLo, t => {
  applyDay(tune(t));
  mark('tex-preview');
  /* 首帧之后再排队升 8K，避免和首屏渲染抢主线程 */
  setTimeout(upgradeDay, 700);
 }, undefined, () => {
  /* 预览缺失时退到 8K 直连，保证不出现无贴图的蓝色球 */
  loader.load(TEX.day, t => applyDay(tune(t)),
   undefined, () => { earthMat.color.set(0x31536a); earthMat.emissiveIntensity = 0; });
 });
 loader.load(TEX.topo, t => { earthMat.bumpMap = tune(t, false); earthMat.needsUpdate = true; });

 const nightUniform = {
  nightMap: { value: null },
  lightDir: { value: sun.position.clone().normalize() },
  strength: { value: 0.55 }
 };
 const nightMat = new THREE.ShaderMaterial({
  uniforms: nightUniform,
  vertexShader: [
   'varying vec2 vUv; varying vec3 vN;',
   'void main(){ vUv=uv; vN=normalize(normalMatrix*normal);',
   ' gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }'
  ].join('\n'),
  fragmentShader: [
   'uniform sampler2D nightMap; uniform vec3 lightDir; uniform float strength;',
   'varying vec2 vUv; varying vec3 vN;',
   'void main(){',
   ' float d=dot(normalize(vN),normalize(lightDir));',
   ' float night=1.0-smoothstep(-0.24,0.18,d);',
   ' vec3 c=texture2D(nightMap,vUv).rgb;',
   ' gl_FragColor=vec4(c*night*strength,1.0);',
   '}'
  ].join('\n'),
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
 });
 let nightTex = null, nightAdded = false;
 const applyNight = t => {
  const old = nightTex;
  nightTex = t;
  nightUniform.nightMap.value = t;
  if (!nightAdded) {
   const night = new THREE.Mesh(new THREE.SphereGeometry(R * 1.0016, 160, 80), nightMat);
   night.renderOrder = 1; night.name = 'night'; earthGroup.add(night);
   nightAdded = true;
  }
  if (old && old !== t) old.dispose();
 };
 let nightHi = false;
 const upgradeNight = () => {
  if (nightHi || !hiResAllowed()) return;
  nightHi = true;
  const doSwap = () => {
   if (performance.now() < zoomUntil || dragging) { setTimeout(doSwap, 500); return; }
   swapTexture(TEX.night, t => { applyNight(t); mark('tex-8k-night'); });
  };
  whenIdle(doSwap);
 };
 loader.load(TEX.nightLo, t => {
  applyNight(tune(t));
  setTimeout(upgradeNight, 1100);
 }, undefined, () => {
  loader.load(TEX.night, t => applyNight(tune(t)));
 });

 const cloudMat = new THREE.MeshPhongMaterial({ transparent: true, opacity: 0.075, depthWrite: false });
 const clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.009, 128, 64), cloudMat);
 clouds.renderOrder = 2; earthGroup.add(clouds);
 loader.load(TEX.clouds, t => { cloudMat.map = tune(t); cloudMat.needsUpdate = true; }, undefined, () => { clouds.visible = false; });

 /* ===================== 在线卫星瓦片（近景超清） ===================== */
 /* 等距圆柱贴图放大到城市级必然被插值抹平。这里在相机贴近地表时，按视野
    中心经纬度取一组 Web Mercator 卫星瓦片，拼成贴合球面的局部影像层；
    网络不可用时自动回退到 8K 底图，不阻塞首屏。 */
 const mercY = lat => {
  const t = Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180;
  return (1 - Math.log(Math.tan(t) + 1 / Math.cos(t)) / Math.PI) / 2;
 };
 const invMercY = m => Math.atan(Math.sinh(Math.PI * (1 - 2 * m))) * 180 / Math.PI;
 function vecToGeo(v) {
  const n = v.clone().normalize();
  const lat = 90 - Math.acos(Math.max(-1, Math.min(1, n.y))) * 180 / Math.PI;
  let lon = Math.atan2(n.z, -n.x) * 180 / Math.PI - 180;
  lon = ((lon + 540) % 360) - 180;
  return { lat, lon };
 }
 const tileCache = new Map();
 const TILE = { key: '', z: 0, mesh: null, prev: null, tex: null, loading: false, req: 0, last: 0, failed: 0 };
 /* 拖拽/缩放进行中不重建瓦片：旧层会被瞬间移除、新层从 0 淡入，
    这正是「一拖动地球就闪一下」的根因。 */
 let dragging = false;
 function tileURL(z, x, y) {
  return TILE_BASE ? TILE_BASE + '/' + z + '/' + x + '/' + y + '.jpg' : TILE_REMOTE(z, x, y);
 }
 function loadTile(z, x, y) {
  const k = z + '/' + x + '/' + y;
  if (tileCache.has(k)) return tileCache.get(k);
  const p = new Promise(resolve => {
   const img = new Image();
   img.crossOrigin = 'anonymous';
   let fallback = false, done = false;
   const finish = v => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
   /* 单个瓦片挂起不能拖死整组：超时后按缺失处理，其余瓦片照常拼贴 */
   /* 超时/失败时清除缓存，网络恢复后可自动重试；缓存上限防止长时间缩放占满内存 */
   const drop = () => { tileCache.delete(k); finish(null); };
   const timer = setTimeout(drop, 9000);
   img.onload = () => {
    if (tileCache.size > 320) {
     const oldest = tileCache.keys().next().value;
     if (oldest !== undefined) tileCache.delete(oldest);
    }
    finish(img);
   };
   img.onerror = () => {
    if (!fallback && TILE_BASE) { fallback = true; img.src = TILE_REMOTE(z, x, y); }
    else drop();
   };
   img.src = tileURL(z, x, y);
  });
  tileCache.set(k, p);
  return p;
 }
 function tileSpec() {
  const dist = camera.position.length();
  if (dist > 6.2) return null;
  const geo = vecToGeo(camera.position);
  const h = Math.max(0.06, dist - R);
  const halfKm = h * (6371 / R) * Math.tan(FOV * Math.PI / 360) * 1.25;
  const halfLat = Math.min(38, Math.max(0.05, halfKm / 111));
  const halfLon = Math.min(70, halfLat / Math.max(0.15, Math.cos(geo.lat * Math.PI / 180)));
  const zIdeal = Math.max(3, Math.min(14, Math.round(Math.log2(720 / Math.max(0.02, halfLon)))));
  /* 迟滞：缩放时 zIdeal 会在 6/7 边界抖动，没有迟滞就会每 0.3s 重建一次整层 */
  const keep = TILE.z && Math.abs(zIdeal - TILE.z) <= 0.6;
  const z = keep ? TILE.z : zIdeal;
  const n = Math.pow(2, z);
  /* 中心直接取视野中心，再按「瓦片索引」取整：同一块瓦片内移动不会换 key。
     之前按视野比例量化，缩放时视野一变量化栅格也跟着变，反而每帧都换 key。 */
  const cLat = Math.max(-84, Math.min(84, geo.lat));
  const cLon = geo.lon;
  const xf0 = (cLon - halfLon + 180) / 360 * n, xf1 = (cLon + halfLon + 180) / 360 * n;
  const yf0 = mercY(cLat + halfLat) * n, yf1 = mercY(cLat - halfLat) * n;
  const cx = Math.floor((xf0 + xf1) / 2), cy = Math.floor((yf0 + yf1) / 2);
  const tx0 = Math.max(0, Math.max(Math.floor(xf0), cx - 2));
  const tx1 = Math.min(n - 1, Math.min(Math.ceil(xf1) - 1, cx + 2));
  const ty0 = Math.max(0, Math.max(Math.floor(yf0), cy - 2));
  const ty1 = Math.min(n - 1, Math.min(Math.ceil(yf1) - 1, cy + 2));
  if (tx1 < tx0 || ty1 < ty0) return null;
  return { z, n, tx0, tx1, ty0, ty1 };
 }
 function disposeTileMesh(m) {
  if (!m) return;
  earthGroup.remove(m);
  if (m.geometry) m.geometry.dispose();
  const mat = m.material;
  if (mat) { if (mat.map) mat.map.dispose(); mat.dispose(); }
 }
 function disposeTiles() {
  disposeTileMesh(TILE.mesh); TILE.mesh = null;
  disposeTileMesh(TILE.prev); TILE.prev = null;
  TILE.tex = null;
 }
 async function refreshTiles(force) {
  if (TILE.loading) return;
  if (!force && (dragging || performance.now() < zoomUntil + 120)) return;
  const spec = tileSpec();
  if (!spec) { if (TILE.mesh) TILE.mesh.visible = false; TILE.key = ''; TILE.z = 0; return; }
  const key = [spec.z, spec.tx0, spec.tx1, spec.ty0, spec.ty1].join('/');
  if (!force && key === TILE.key && TILE.mesh) return;
  TILE.loading = true;
  const req = ++TILE.req;
  const jobs = [];
  for (let y = spec.ty0; y <= spec.ty1; y++) for (let x = spec.tx0; x <= spec.tx1; x++) jobs.push({ x, y });
  let imgs;
  try { imgs = await Promise.all(jobs.map(j => loadTile(spec.z, j.x, j.y))); }
  catch (e) { imgs = []; }
  TILE.loading = false;
  if (req !== TILE.req) return;
  /* 等待期间视角已经变了：这批瓦片过期，丢掉，下一轮再取 */
  if (!force) {
   const now = tileSpec();
   if (!now) return;
   const nowKey = [now.z, now.tx0, now.tx1, now.ty0, now.ty1].join('/');
   if (nowKey !== key) return;
  }
  if (!imgs.some(Boolean)) { TILE.failed++; if (TILE.mesh) TILE.mesh.visible = false; return; }
  applyTileMesh(spec, jobs, imgs);
  TILE.key = key;
  TILE.z = spec.z;
 }
 function applyTileMesh(spec, jobs, imgs) {
  const cols = spec.tx1 - spec.tx0 + 1, rows = spec.ty1 - spec.ty0 + 1;
  const W = cols * 256, H = rows * 256;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = '#10344f'; c.fillRect(0, 0, W, H);
  jobs.forEach((j, i) => { if (imgs[i]) c.drawImage(imgs[i], (j.x - spec.tx0) * 256, (j.y - spec.ty0) * 256, 256, 256); });
  /* 四边羽化：卫星影像与 8K 底图色调不同，硬边会形成明显矩形接缝 */
  c.globalCompositeOperation = 'destination-in';
  const f = 0.11;
  const gx = c.createLinearGradient(0, 0, W, 0);
  gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(f, 'rgba(0,0,0,1)');
  gx.addColorStop(1 - f, 'rgba(0,0,0,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = gx; c.fillRect(0, 0, W, H);
  const gy = c.createLinearGradient(0, 0, 0, H);
  gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(f, 'rgba(0,0,0,1)');
  gy.addColorStop(1 - f, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = gy; c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'source-over';
  const lon0 = spec.tx0 / spec.n * 360 - 180, lon1 = (spec.tx1 + 1) / spec.n * 360 - 180;
  const m0 = spec.ty0 / spec.n, m1 = (spec.ty1 + 1) / spec.n;
  const sx = Math.min(64, cols * 10), sy = Math.min(64, rows * 10);
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= sy; j++) {
   const v = j / sy, lat = invMercY(m0 + v * (m1 - m0));
   for (let i = 0; i <= sx; i++) {
    const u = i / sx, lon = lon0 + u * (lon1 - lon0);
    const p = geoToVec3(lat, lon, R * 1.0032);
    pos.push(p.x, p.y, p.z); uv.push(u, 1 - v);
   }
  }
  for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) {
   const a = j * (sx + 1) + i, b = a + 1, c1 = a + sx + 1, d = c1 + 1;
   idx.push(a, c1, b, b, c1, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  /* 交叉淡化：旧层留到新层淡入完成再销毁，中间不出现「底图裸露」的一帧 */
  if (TILE.mesh) {
   if (TILE.prev) disposeTileMesh(TILE.prev);
   TILE.prev = TILE.mesh;
  }
  TILE.tex = new THREE.CanvasTexture(cv);
  TILE.tex.colorSpace = THREE.SRGBColorSpace;
  TILE.tex.anisotropy = maxAniso;
  const mat = new THREE.MeshBasicMaterial({
   map: TILE.tex, transparent: true, opacity: 0, depthWrite: false,
   side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, toneMapped: false
  });
  TILE.mesh = new THREE.Mesh(g, mat);
  TILE.mesh.renderOrder = 3;
  TILE.mesh.visible = false;
  earthGroup.add(TILE.mesh);
 }

 /* ===================== 电台目录 ===================== */
 const FEATURED = [
  { name: 'Radio Paradise', city: 'Paradise, United States', lat: 38.58, lon: -121.49, stream: 'https://stream.radioparadise.com/aac-320' },
  { name: 'KEXP', city: 'Seattle, United States', lat: 47.61, lon: -122.33, stream: 'https://kexp-mp3-128.streamguys1.com/kexp128.mp3' },
  { name: 'Radio Swiss Classic', city: 'Basel, Switzerland', lat: 47.56, lon: 7.59, stream: 'https://stream.srg-ssr.ch/m/rsc_de/mp3_128' },
  { name: 'WFMU', city: 'Jersey City, United States', lat: 40.72, lon: -74.04, stream: 'https://stream0.wfmu.org/freeform-128k' },
  { name: 'Radio Nova', city: 'Paris, France', lat: 48.87, lon: 2.33, stream: 'https://novazz.ice.infomaniak.ch/novazz-128.mp3' },
  { name: 'Venice Classic Radio', city: 'Venice, Italy', lat: 45.44, lon: 12.32, stream: 'https://uk2.streamingpulse.com/ssl/vcr1' }
 ];
 const BAD_URL = /\.m3u8|\.pls|\.asx|\.xspf|\/master_|\/index_/i;
 function usableStream(u) {
  return typeof u === 'string' && u.startsWith('https://') && !BAD_URL.test(u) && !badStreams.has(u);
 }
 function normalizeStation(s) {
  if (!s) return null;
  const lat = Number(s.lat), lon = Number(s.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (Math.abs(lat) < .01 && Math.abs(lon) < .01)) return null;
  const alts = Array.isArray(s.alts) ? s.alts.filter(a => a && usableStream(a.stream)) : [];
  const stream = s.stream;
  if (!usableStream(stream) && !alts.length) return null;
  return {
   name: String(s.name || '未命名电台').replace(/\s+/g, ' ').trim().slice(0, 60) || '未命名电台',
   city: String(s.city || '').slice(0, 80),
   lat, lon,
   stream: usableStream(stream) ? stream : alts[0].stream,
   alts: alts.map(a => ({ name: String(a.name || '未命名电台').slice(0, 60), stream: a.stream })),
   cn: !!s.cn, tier: s.tier || '', province: s.province || ''
  };
 }
 function parseCatalog(payload) {
  const arr = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.stations) ? payload.stations : null);
  if (!arr) throw new Error('invalid catalogue');
  return { list: arr.map(normalizeStation).filter(Boolean), meta: payload.meta || null };
 }
 let stations = [], pointArray = null, points = null, selectedRing = null, ringMat = null;
 const markerMat = new THREE.ShaderMaterial({
  uniforms: { uDpr: { value: 1 } },
  vertexShader: [
   'attribute float aBig; uniform float uDpr;',
   'void main(){',
   ' gl_PointSize=mix(3.0,6.4,aBig)*uDpr;',
   ' gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);',
   '}'
  ].join('\n'),
  fragmentShader: [
   'void main(){',
   ' float d=length(gl_PointCoord-vec2(0.5))*2.0;',
   ' float a=1.0-smoothstep(0.82,1.0,d);',
   ' if(a<0.02) discard;',
   ' gl_FragColor=vec4(0.44,0.78,0.31,a);',
   '}'
  ].join('\n'),
  transparent: true, depthWrite: false, depthTest: true, toneMapped: false
 });
 function buildPoints(list) {
  if (points) { earthGroup.remove(points); points.geometry.dispose(); }
  const n = list.length;
  const arr = new Float32Array(n * 3), big = new Float32Array(n);
  for (let i = 0; i < n; i++) {
   const v = geoToVec3(list[i].lat, list[i].lon, MARK_R);
   arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
   big[i] = ((i * 2654435761) >>> 0) % 100 < 7 ? 1 : 0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  geo.setAttribute('aBig', new THREE.BufferAttribute(big, 1));
  points = new THREE.Points(geo, markerMat);
  points.renderOrder = 4;
  earthGroup.add(points);
  pointArray = arr; stations = list;
 }
/* 选中标记：一条极细的亮环 + 一层缓慢呼吸的柔光，替代原先「粗环套粗环」的画法。
   环半径随相机距离等比缩放（见 animate），因此在任何缩放级别下屏幕尺寸恒定，
   贴近地表时不会膨胀成遮挡视野的大圆圈。 */
const RING_BASE_D = 3.15, RING_BASE_R = 0.0252, RING_W = 0.11;
let selGroup = null, selRing = null, selGlow = null, selGlowAt = 0, glowTex = null;
/* 以「相机到标记点」的距离换算缩放，使环的屏幕直径恒定（≈24px）：
   贴近地表时相机到点位只有 0.5 左右，若按到球心距离缩放，环会被放大十几倍。 */
function ringScaleFor(p) {
 const d = p ? camera.position.distanceTo(p) : Math.max(0.4, camera.position.length() - R);
 return Math.min(9, Math.max(0.03, d * 0.32));
}
function makeGlowTexture() {
 const c = document.createElement('canvas'); c.width = c.height = 128;
 const g = c.getContext('2d');
 const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
 grd.addColorStop(0.00, 'rgba(205,255,160,0.00)');
 grd.addColorStop(0.50, 'rgba(205,255,160,0.00)');
 grd.addColorStop(0.63, 'rgba(198,255,150,0.34)');
 grd.addColorStop(0.76, 'rgba(150,236,104,0.13)');
 grd.addColorStop(1.00, 'rgba(150,236,104,0.00)');
 g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
 const t = new THREE.CanvasTexture(c);
 t.colorSpace = THREE.SRGBColorSpace;
 return t;
}
function markSelected(s) {
 clearSelection();
 if (!ringMat) ringMat = new THREE.MeshBasicMaterial({ color: 0xf4ffe4, transparent: true, opacity: .95, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
 if (!glowTex) glowTex = makeGlowTexture();
 const v = geoToVec3(s.lat, s.lon, MARK_R * 1.004);
 selGroup = new THREE.Group();
 selGroup.position.copy(v);
 selGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), v.clone().normalize());
 selGroup.renderOrder = 7;
 selRing = new THREE.Mesh(new THREE.RingGeometry(RING_BASE_R, RING_BASE_R * (1 + RING_W), 96), ringMat);
 selRing.frustumCulled = false;
 selGroup.add(selRing);
 selGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTex, transparent: true, depthWrite: false, depthTest: true,
  blending: THREE.AdditiveBlending, opacity: .5, toneMapped: false
 }));
 selGlow.scale.setScalar(RING_BASE_R * 5.4);
 selGlow.frustumCulled = false;
 selGroup.add(selGlow);
 selGroup.scale.setScalar(ringScaleFor(v));
 earthGroup.add(selGroup);
 selGlowAt = performance.now();
}
function clearSelection() {
 if (selGroup) {
  earthGroup.remove(selGroup);
  if (selRing) selRing.geometry.dispose();
  if (selGlow) selGlow.material.dispose();
  selRing = selGlow = selGroup = null;
 }
 if (selectedRing) { earthGroup.remove(selectedRing); selectedRing.geometry.dispose(); selectedRing = null; }
}
 /* 列表卡片悬停时，在地球上对应点位显示一个提示环（与选中环区分色），松开后自动隐藏。 */
 let hintRing = null, hintMat = null, hintTimer = null;
function ensureHint() {
 if (hintRing) return;
 if (!hintMat) hintMat = new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: .78, depthTest: false, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
 hintRing = new THREE.Mesh(new THREE.RingGeometry(RING_BASE_R * 1.34, RING_BASE_R * 1.45, 64), hintMat);
 hintRing.renderOrder = 6; hintRing.visible = false; hintRing.frustumCulled = false;
 hintRing.scale.setScalar(ringScaleFor(hintRing.position));
 earthGroup.add(hintRing);
}
 function showHint(i) {
  ensureHint();
  if (i == null || i < 0) { if (hintRing) hintRing.visible = false; return; }
  const s = stations[i]; if (!s) return;
  const v = geoToVec3(s.lat, s.lon, MARK_R * 1.022);
  /* 提示环关闭了深度测试（否则会被地表影像吞掉），这里用几何地平线判断可见半球，
     转到背面时不再"穿球"显示。 */
  const horizon = R / Math.max(R + 0.001, camera.position.length());
  if (v.clone().normalize().dot(camera.position.clone().normalize()) < horizon - 0.004) {
   hintRing.visible = false; return;
  }
  hintRing.position.copy(v);
  hintRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), v.clone().normalize());
  hintRing.visible = true;
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { if (hintRing) hintRing.visible = false; }, 1600);
 }
 function clearHint() { if (hintTimer) clearTimeout(hintTimer); if (hintRing) hintRing.visible = false; }
 function applyCatalog(payload, label, online) {
  const parsed = parseCatalog(payload);
  if (!parsed.list.length) throw new Error('empty catalogue');
  const merged = mergeCatalog(parsed.list, online);
  buildPoints(merged);
  const extra = parsed.meta && parsed.meta.generated ? ' · 目录 ' + parsed.meta.generated.slice(0, 10) : '';
  if (!current) setMode('idle', label + ' · ' + merged.length + ' 个电台坐标点' + extra);
  console.info('[WORLDWAVE]', label, merged.length, 'markers');
  if (ui.info) ui.info.textContent = '当前目录 ' + merged.length + ' 个点位' + extra;
  window.dispatchEvent(new CustomEvent('ww:catalog', { detail: { count: merged.length, label } }));
  mark('catalog');
 }
 /* 在线刷新只补充新网格，绝不替换已验证的快照流；簇内信息也保留。
    同一 0.02° 网格内的重复点位会被合并，但被合并的流不会丢弃——挂到幸存点的
    备用流里（上限 5 路），既保持地球点位不过度重叠，又不丢可播放电台。 */
 function mergeCatalog(list, online) {
  const seen = new Map(), out = [];
  const key = s => Math.round(s.lat * 50) + ':' + Math.round(s.lon * 50);
  const featured = FEATURED.map(s => ({ ...s, alts: [] }));
  const base = online ? [...featured, ...stations] : featured;
  for (const s of [...base, ...list]) {
   const k = key(s);
   const hit = seen.get(k);
   if (hit) {
    const alts = hit.alts || (hit.alts = []);
    const known = new Set([hit.stream].concat(alts.map(a => a.stream)));
    if (alts.length < 5 && s.stream && !known.has(s.stream)) {
     alts.push({ name: s.name, stream: s.stream });
    }
    continue;
   }
   const copy = { ...s, alts: Array.isArray(s.alts) ? s.alts.slice() : [] };
   seen.set(k, copy);
   out.push(copy);
   if (out.length >= 12000) break;
  }
  return out;
 }
 async function loadSnapshot() {
  const snap = SNAPSHOT_INLINE || await (await fetch(SNAPSHOT_URL)).json();
  applyCatalog(snap, '公开电台目录', false);
 }
 async function refreshOnline() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
   const res = await fetch(API_URL, { signal: ctrl.signal });
   if (!res.ok) throw new Error('HTTP ' + res.status);
   const data = await res.json();
   if (!Array.isArray(data)) throw new Error('invalid payload');
   const list = data
    .filter(s => String(s.lastcheckok) === '1')
    .map(s => ({
     name: s.name, city: [s.state, s.country].filter(Boolean).join(', '),
     lat: s.geo_lat, lon: s.geo_long,
     stream: s.url_resolved || s.url, alts: []
    }));
   if (list.length) applyCatalog({ stations: list }, '实时目录', true);
  } catch (e) {
   console.info('[WORLDWAVE] 在线目录不可用，保留本地快照：', e && e.message ? e.message : e);
  } finally { clearTimeout(timer); }
 }

 /* ===================== 地图层名称 ===================== */
 const CONTINENTS = [
  ['亚洲', 47, 94], ['欧洲', 54, 18], ['非洲', 2, 19],
  ['北美洲', 45, -100], ['南美洲', -14, -59],
  ['大洋洲', -25, 134], ['南极洲', -78, 20]
 ];
 /* [名称, 纬度, 经度, 级别] 1=主要国家 2=其余国家（拉近后显示） */
 const COUNTRIES = [
  ['中国',35,103,1],['日本',36,138,1],['韩国',36,128,1],['印度',22,79,1],
  ['俄罗斯',61,95,1],['哈萨克斯坦',48,67,1],['沙特阿拉伯',24,45,1],
  ['伊朗',32,54,1],['土耳其',39,35,1],['印度尼西亚',-2,118,1],
  ['蒙古',46,103,1],['巴基斯坦',30,69,1],['越南',16,107,1],
  ['泰国',15,101,1],['菲律宾',12,122,1],['马来西亚',4,102,1],
  ['缅甸',21,96,1],['伊拉克',33,44,1],['阿富汗',34,66,1],
  ['朝鲜',40,127,1],['孟加拉国',24,90,1],['尼泊尔',28,84,1],
  ['乌兹别克斯坦',41,64,1],['阿联酋',24,54,1],['以色列',31,35,1],
  ['叙利亚',35,38,1],['斯里兰卡',7,81,1],['柬埔寨',12,105,1],
  ['老挝',18,103,1],['新加坡',1.3,103.8,1],['约旦',31,37,1],
  ['土库曼斯坦',40,60,2],['吉尔吉斯斯坦',41,75,2],['塔吉克斯坦',39,71,2],
  ['格鲁吉亚',42,44,2],['亚美尼亚',40,45,2],['阿塞拜疆',40,48,2],
  ['也门',15,48,2],['阿曼',21,57,2],['科威特',29,47,2],['卡塔尔',25,51,2],
  ['巴林',26,50.5,2],['黎巴嫩',34,36,2],['塞浦路斯',35,33,2],
  ['不丹',27,90,2],['马尔代夫',3,73,2],['文莱',4.5,114.7,2],
  ['东帝汶',-9,126,2],['巴勒斯坦',31.9,35.2,2],
  ['乌克兰',49,32,1],['波兰',52,19,1],['德国',51,10,1],['法国',47,2,1],
  ['英国',54,-2,1],['意大利',42,12,1],['西班牙',40,-4,1],
  ['瑞典',62,15,1],['挪威',62,9,1],['芬兰',64,26,1],['希腊',39,22,1],
  ['葡萄牙',39,-8,1],['荷兰',52,5,1],['瑞士',47,8,1],
  ['比利时',50.5,4.5,1],['奥地利',47.5,14,1],['爱尔兰',53,-8,1],
  ['丹麦',56,10,1],['捷克',49.7,15.5,1],['罗马尼亚',46,25,1],
  ['白俄罗斯',54,28,1],['匈牙利',47,19,1],['冰岛',65,-18,1],
  ['塞尔维亚',44,21,2],['克罗地亚',45,16,2],['保加利亚',43,25,2],
  ['斯洛伐克',48.7,19.5,2],['斯洛文尼亚',46,15,2],['波黑',44,18,2],
  ['阿尔巴尼亚',41,20,2],['北马其顿',41.6,21.7,2],['黑山',42.7,19.3,2],
  ['立陶宛',55,24,2],['拉脱维亚',57,25,2],['爱沙尼亚',59,26,2],
  ['摩尔多瓦',47,28.5,2],['卢森堡',49.7,6.1,2],['马耳他',35.9,14.4,2],
  ['摩纳哥',43.73,7.42,2],['圣马力诺',43.94,12.46,2],['列支敦士登',47.14,9.55,2],
  ['安道尔',42.55,1.58,2],['梵蒂冈',41.9,12.45,2],['科索沃',42.6,20.9,2],
  ['埃及',27,30,1],['南非',-29,24,1],['尼日利亚',9,8,1],
  ['阿尔及利亚',28,3,1],['摩洛哥',32,-6,1],['埃塞俄比亚',9,40,1],
  ['肯尼亚',0,38,1],['刚果（金）',-3,23,1],['坦桑尼亚',-6,35,1],
  ['苏丹',15,30,1],['利比亚',27,17,1],['安哥拉',-12,18,1],
  ['加纳',8,-2,1],['马达加斯加',-19,47,1],['突尼斯',34,10,1],
  ['索马里',6,46,1],['塞内加尔',14,-14,1],['赞比亚',-14,28,1],
  ['南苏丹',7,30,2],['厄立特里亚',15,39,2],['吉布提',11.5,43,2],
  ['乌干达',1,32,2],['卢旺达',-2,30,2],['布隆迪',-3.5,30,2],
  ['刚果（布）',-1,16,2],['加蓬',-1,12,2],['喀麦隆',6,12,2],
  ['乍得',15,19,2],['尼日尔',17,9,2],['马里',17,-3,2],
  ['毛里塔尼亚',20,-10,2],['几内亚',11,-10,2],['塞拉利昂',8.5,-11.5,2],
  ['利比里亚',6.5,-9,2],['科特迪瓦',8,-5,2],['多哥',8,1,2],
  ['贝宁',9,2,2],['布基纳法索',12.5,-1.5,2],['冈比亚',13.4,-15,2],
  ['赤道几内亚',2,10,2],['马拉维',-13,34,2],['莫桑比克',-18,35,2],
  ['津巴布韦',-19,30,2],['纳米比亚',-22,17,2],['博茨瓦纳',-22,24,2],
  ['莱索托',-29.5,28.5,2],['斯威士兰',-26.5,31.5,2],['佛得角',16,-24,2],
  ['毛里求斯',-20,57,2],['塞舌尔',-4.6,55.5,2],['科摩罗',-12,44,2],
  ['西撒哈拉',24,-13,2],['圣多美和普林西比',0.3,6.7,2],['几内亚比绍',12,-15,2],
  ['美国',39,-98,1],['加拿大',56,-106,1],['墨西哥',23,-102,1],
  ['古巴',21.5,-80,1],['巴拿马',8.5,-80,1],['危地马拉',15,-90,1],
  ['洪都拉斯',15,-86,2],['尼加拉瓜',13,-85,2],['哥斯达黎加',10,-84,2],
  ['萨尔瓦多',13.8,-88.9,2],['伯利兹',17,-88.5,2],['海地',19,-72.5,2],
  ['多米尼加',19,-70.5,2],['牙买加',18,-77.5,2],['巴哈马',25,-77,2],
  ['特立尼达和多巴哥',10.5,-61,2],
  ['巴西',-10,-52,1],['阿根廷',-35,-65,1],['智利',-35,-71,1],
  ['秘鲁',-10,-76,1],['哥伦比亚',4,-73,1],['委内瑞拉',7,-66,1],
  ['玻利维亚',-17,-65,1],['厄瓜多尔',-2,-78,1],['乌拉圭',-33,-56,1],
  ['巴拉圭',-23,-58,2],['圭亚那',5,-59,2],['苏里南',4,-56,2],
  ['澳大利亚',-25,134,1],['新西兰',-41,174,1],
  ['巴布亚新几内亚',-6,145,1],['斐济',-18,178,1],
  ['所罗门群岛',-9,160,2],['瓦努阿图',-16,167,2],['萨摩亚',-13.7,-172,2],
  ['汤加',-20,-175,2],['基里巴斯',1,173,2],['帕劳',7,134,2],
  ['密克罗尼西亚',7,150,2],['马绍尔群岛',7,170,2],['瑙鲁',-0.5,166,2],
  ['图瓦卢',-8,178,2]
 ];
 const ATLAS_W = 2048, ATLAS_H = 2048, CELL_W = 256, CELL_H = 64;
 function buildLabelLayer() {
  const cv = document.createElement('canvas');
  cv.width = ATLAS_W; cv.height = ATLAS_H;
  const c = cv.getContext('2d');
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  const fontStack = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
  const items = [
   ...CONTINENTS.map(v => ({ n: v[0], lat: v[1], lon: v[2], level: 0 })),
   ...COUNTRIES.map(v => ({ n: v[0], lat: v[1], lon: v[2], level: v[3] }))
  ];
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = maxAniso;
  /* 不做深度测试：宽文字牌的两端会随球面弯曲沉入地球而被裁掉半个字。
     可见性改由「球面切平面判定 + 地球圆盘边界裁剪」精确控制，见 updateLabels。 */
  const mat = new THREE.MeshBasicMaterial({
   map: tex, transparent: true, depthWrite: false, depthTest: false,
   side: THREE.FrontSide, opacity: .96
  });
  const cols = Math.floor(ATLAS_W / CELL_W), rows = Math.floor(ATLAS_H / CELL_H);
  const group = new THREE.Group();
  items.slice(0, cols * rows).forEach((it, slot) => {
   let fs = it.level === 0 ? 42 : (it.level === 1 ? 33 : 27);
   const setFont = () => { c.font = (it.level === 0 ? '600 ' : '500 ') + fs + 'px ' + fontStack; };
   setFont();
   let tw = c.measureText(it.n).width;
   if (tw > CELL_W - 14) { fs = Math.max(15, Math.floor(fs * (CELL_W - 14) / tw)); setFont(); tw = c.measureText(it.n).width; }
   const col = slot % cols, row = Math.floor(slot / cols);
   const cx = col * CELL_W + CELL_W / 2, cy = row * CELL_H + CELL_H / 2;
   c.lineWidth = Math.max(3, fs * .22);
   c.strokeStyle = 'rgba(0,0,0,.92)';
   c.strokeText(it.n, cx, cy);
   c.fillStyle = it.level === 0 ? 'rgba(216,240,255,.98)' : 'rgba(246,252,255,.96)';
   c.fillText(it.n, cx, cy);
   const pad = Math.max(5, fs * .28);
   const boxW = Math.min(CELL_W, tw + pad * 2);
   const ratio = boxW / CELL_H;
   const g = new THREE.PlaneGeometry(ratio, 1);
   const u0 = (cx - boxW / 2) / ATLAS_W, u1 = (cx + boxW / 2) / ATLAS_W;
   const v0 = 1 - (row + 1) * CELL_H / ATLAS_H, v1 = 1 - row * CELL_H / ATLAS_H;
   const uv = g.attributes.uv;
   uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
   const mesh = new THREE.Mesh(g, mat);
   const pos = geoToVec3(it.lat, it.lon, R * 1.002);
   mesh.position.copy(pos);
   mesh.quaternion.copy(camera.quaternion);
   mesh.userData = {
    dir: pos.clone().normalize(), level: it.level, ratio: ratio,
    px: it.level === 0 ? 30 : (it.level === 1 ? 18 : 14)
   };
   mesh.renderOrder = 6;
   group.add(mesh);
  });
  tex.needsUpdate = true;
  return group;
 }
 const labelLayer = buildLabelLayer();
 earthGroup.add(labelLayer);
 const tmpVec = new THREE.Vector3();
 function updateLabels(w, h) {
  const dist = camera.position.length();
  /* 球面切平面可见条件：dot(dir, camDir) > R/dist。
     再加一层地球投影圆盘裁剪，保证整块文字牌都落在球体轮廓内，
     既不漏字到太空，也不会在边缘被切掉半边。 */
  const cosVis = Math.min(0.985, R / dist + 0.05);
  const camDir = tmpVec.copy(camera.position).normalize();
  const maxLevel = dist > 10 ? 0 : (dist > 5.2 ? 1 : 2);
  const focal = h / (2 * Math.tan(FOV * Math.PI / 360));
  const diskR = focal * Math.tan(Math.asin(Math.min(0.999, R / dist)));
  /* 小屏上按宽度收敛字号，避免大洲名在窄视口里压过地表 */
  const pxScale = Math.min(1, Math.max(0.72, w / 1400));
  const items = [];
  for (const m of labelLayer.children) {
   const u = m.userData;
   if (u.level > maxLevel || u.dir.dot(camDir) <= cosVis) { m.visible = false; continue; }
   const v = m.position.clone().project(camera);
   if (v.z < -1 || v.z > 1) { m.visible = false; continue; }
   const sx = (v.x * .5 + .5) * w, sy = (-v.y * .5 + .5) * h;
   if (sx < 0 || sx > w || sy < 0 || sy > h) { m.visible = false; continue; }
   const halfW = u.px * u.ratio * pxScale / 2;
   if (Math.hypot(sx - w / 2, sy - h / 2) + halfW > diskR - 4) { m.visible = false; continue; }
   items.push({ m, sx, sy, wpx: u.px * u.ratio * pxScale, hpx: u.px * pxScale, level: u.level });
  }
  items.sort((a, b) => a.level - b.level || a.hpx - b.hpx);
  const placed = [];
  const k = 2 * Math.tan(FOV * Math.PI / 360) / h;
  for (const it of items) {
   const clash = placed.some(p =>
    Math.abs(p.sx - it.sx) < (p.wpx + it.wpx) / 2 + 5 &&
    Math.abs(p.sy - it.sy) < (p.hpx + it.hpx) / 2 + 2);
   it.m.visible = !clash;
   if (!clash) {
    placed.push(it);
    it.m.quaternion.copy(camera.quaternion);
    it.m.scale.setScalar(it.hpx * camera.position.distanceTo(it.m.position) * k);
   }
  }
 }

 /* ===================== 播放 ===================== */
 const audio = new Audio();
 audio.preload = 'none';
 try { audio.referrerPolicy = 'no-referrer'; } catch (e) { /* 旧浏览器 */ }
 let volume = 0.8;
 try { const v = parseFloat(localStorage.getItem(STORE_VOL)); if (Number.isFinite(v)) volume = Math.min(1, Math.max(0, v)); } catch (e) { /* noop */ }
 audio.volume = volume;
 if (ui.vol) ui.vol.value = String(volume);
 let current = null, playToken = 0;
 function enableControls(on) {
  [ui.toggle, ui.stop].forEach(b => { if (b) b.disabled = !on; });
  const multi = !!(current && current.list.length > 1);
  [ui.prev, ui.next].forEach(b => { if (b) b.disabled = !multi; });
  if (ui.cluster) {
   ui.cluster.hidden = !multi;
   if (multi) ui.cluster.textContent = (current.idx + 1) + '/' + current.list.length;
  }
 }
 function rememberBad(url) {
  badStreams.add(url); writeSet(STORE_BAD, badStreams);
 }
 function failReason(err) {
  const n = err && err.name ? err.name : '';
  if (n === 'NotSupportedError') return '浏览器不支持该音频格式';
  if (n === 'NotAllowedError') return '浏览器阻止了自动播放，请再次点击';
  return '流不可达或已失效';
 }
 /* ===================== 流域健康度 =====================
    公开电台经常 403/超时。点下去才等 8 秒报错体感很差，所以：
    ① 本地缓存最近 6 小时的探测结果；② 选台时把已知失效的排到最后；
    ③ 连接 3.6s 仍无数据就快速失败并换同址流。 */
 const HEALTH = new Map(), HEALTH_TTL = 6 * 3600 * 1000;
 try {
  const raw = JSON.parse(localStorage.getItem('ww.stream.health.v1') || '{}');
  Object.keys(raw).forEach(k => HEALTH.set(k, raw[k]));
 } catch (e) {}
 let healthSaveTimer = null;
 function saveHealth() {
  clearTimeout(healthSaveTimer);
  healthSaveTimer = setTimeout(() => {
   try {
    const out = {};
    let n = 0;
    HEALTH.forEach((v, k) => { if (n < 600) { out[k] = v; n++; } });
    localStorage.setItem('ww.stream.health.v1', JSON.stringify(out));
   } catch (e) {}
  }, 1500);
 }
 function healthOf(url) {
  const h = HEALTH.get(url);
  return h && Date.now() - h.at < HEALTH_TTL ? h.ok : null;   /* null = 未知 */
 }
 function setHealth(url, ok) {
  if (!url) return;
  HEALTH.set(url, { ok: !!ok, at: Date.now() });
  saveHealth();
 }
 const probing = new Set();
 function probeStream(url) {
  if (!url || probing.has(url)) return Promise.resolve(healthOf(url));
  const known = healthOf(url);
  if (known !== null) return Promise.resolve(known);
  probing.add(url);
  return new Promise(res => {
   const a = new Audio();
   let done = false;
   const finish = ok => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    a.removeEventListener('loadedmetadata', okFn);
    a.removeEventListener('canplay', okFn);
    a.removeEventListener('error', badFn);
    try { a.pause(); a.removeAttribute('src'); a.load(); } catch (e) {}
    probing.delete(url);
    if (ok !== null) setHealth(url, ok);
    res(ok);
   };
   const okFn = () => finish(true);
   const badFn = () => finish(false);
   /* 超时只代表「这次没测出来」，不能判死：慢网下的好流也会超时 */
   const timer = setTimeout(() => finish(null), 5200);
   a.preload = 'metadata';
   a.muted = true;
   a.addEventListener('loadedmetadata', okFn);
   a.addEventListener('canplay', okFn);
   a.addEventListener('error', badFn);
   a.src = url;
   a.load();
  });
 }

 let failTimer = null;
 function clearFailTimer() { if (failTimer) { clearTimeout(failTimer); failTimer = null; } }
 function playCurrent() {
  if (!current) return;
  const entry = current.list[current.idx];
  const my = ++playToken;
  audio.pause();
  audio.src = entry.stream;
  audio.load();
  audio.volume = volume;
  setMode('loading', '正在连接 · ' + entry.name);
  enableControls(true);
  /* 3.6s 还没有任何音频数据就判定失败，比等浏览器自己报错快得多 */
  clearFailTimer();
  failTimer = setTimeout(() => {
   if (my !== playToken) return;
   if (!audio.paused && audio.readyState >= 2) return;
   onPlayFail(new Error('timeout'), entry);
  }, 2600);
  const p = audio.play();
  if (p && typeof p.then === 'function') {
   p.then(() => {
    if (my !== playToken) return;
    clearFailTimer();
    setHealth(entry.stream, true);
    setMode('playing', '▶ ' + entry.name);
   }).catch(err => { if (my === playToken) onPlayFail(err, entry); });
  } else {
   clearFailTimer();
   setHealth(entry.stream, true);
   setMode('playing', '▶ ' + entry.name);
  }
 }
 function onPlayFail(err, entry) {
  clearFailTimer();
  rememberBad(entry.stream);
  setHealth(entry.stream, false);
  if (!current) return;
  current.tries = (current.tries || 0) + 1;
  if (current.list.length > 1 && current.tries < current.list.length) {
   current.idx = (current.idx + 1) % current.list.length;
   enableControls(true);
   setMode('loading', '换用备用流 · ' + current.list[current.idx].name + '…');
   playCurrent();
   return;
  }
  setMode('error', '无法播放 · ' + entry.name + '（' + failReason(err) + '）');
 }
 audio.addEventListener('error', () => {
  if (!current || !audio.src) return;
  const entry = current.list[current.idx];
  if (entry) onPlayFail(new Error('media error'), entry);
 });
 function selectStation(i) {
  const s = stations[i];
  if (!s) return;
  /* 候选链：本台 → 同址其它台 → 同城台 → 最近台。公开流失效很常见，
     只挂在本台上会导致「点了没声音」，扩到附近后几乎总能出声。 */
  /* 本地等值判断：earth.js 里没有 panels 的 same()，之前直接调用会抛 ReferenceError，
     导致点绿点/点卡片完全没反应。 */
  const isSame = (a, b) => !!a && !!b && a.lat === b.lat && a.lon === b.lon && a.name === b.name;
  const cityKey = x => String(x.city || '').split(',')[0].trim().toLowerCase();
  const myCity = cityKey(s);
  const cosd = x => {
   const a = geoToVec3(s.lat, s.lon, 1), b = geoToVec3(x.lat, x.lon, 1);
   return Math.max(-1, Math.min(1, a.dot(b)));
  };
  const sameCity = myCity
   ? stations.filter(x => !isSame(x, s) && cityKey(x) === myCity).slice(0, 4)
   : [];
  const nearest = stations
   .filter(x => !isSame(x, s) && cityKey(x) !== myCity)
   .map(x => ({ x, c: cosd(x) }))
   .sort((a, b) => b.c - a.c)
   .slice(0, 3)
   .map(o => o.x);
  const raw = [s, ...sameCity, ...nearest];
  const seenStream = new Set();
  const list = [];
  raw.forEach(x => {
   const alts = (x === s) ? (s.alts || []) : (x.alts || []);
   [{ name: x.name, stream: x.stream, host: x.name }, ...alts.map(a => ({ name: a.name, stream: a.stream, host: x.name }))]
    .forEach(e => {
     if (!usableStream(e.stream) || seenStream.has(e.stream)) return;
     seenStream.add(e.stream);
     list.push(e);
    });
  });
  if (!list.length) { setMode('error', '该点位暂无可播放的电台'); return; }
  /* 已知可用的排前面、未知居中、已知失效沉底：首选命中率明显更高 */
  const rank = e => { const h = healthOf(e.stream); return h === true ? 0 : (h === null ? 1 : 2); };
  list.sort((a, b) => rank(a) - rank(b));
  if (list.length > 4) list.length = 4;
  current = { i, idx: 0, tries: 0, list };
  markSelected(s);
  enableControls(true);
  window.dispatchEvent(new CustomEvent('ww:select', { detail: { station: s, index: i } }));
  playCurrent();
 }
 function stop() {
  playToken++;
  clearFailTimer();
  audio.pause();
  audio.removeAttribute('src');
  try { audio.load(); } catch (e) { /* noop */ }
  current = null;
  clearSelection();
  enableControls(false);
  window.dispatchEvent(new CustomEvent('ww:stop'));
  setMode('idle', stations.length + ' 个电台坐标点 · 点击绿点播放');
 }
 function togglePlay() {
  if (!current) return;
  if (audio.paused) {
   const my = ++playToken;
   audio.play().then(() => { if (my === playToken) setMode('playing', '▶ ' + current.list[current.idx].name); })
    .catch(err => { if (my === playToken) onPlayFail(err, current.list[current.idx]); });
  } else { audio.pause(); setMode('paused', '⏸ ' + current.list[current.idx].name); }
 }
 function step(dir) {
  if (!current || current.list.length < 2) return;
  current.idx = (current.idx + dir + current.list.length) % current.list.length;
  current.tries = 0;
  enableControls(true);
  playCurrent();
 }
 if (ui.toggle) ui.toggle.addEventListener('click', togglePlay);
 if (ui.stop) ui.stop.addEventListener('click', stop);
 if (ui.prev) ui.prev.addEventListener('click', () => step(-1));
 if (ui.next) ui.next.addEventListener('click', () => step(1));
 if (ui.vol) ui.vol.addEventListener('input', () => {
  volume = parseFloat(ui.vol.value) || 0;
  audio.volume = volume;
  try { localStorage.setItem(STORE_VOL, String(volume)); } catch (e) { /* noop */ }
 });

 /* ===================== 搜索 / 定位 ===================== */
 let searchOpen = false;
 function openSearch() {
  searchOpen = true;
  if (ui.search) ui.search.hidden = false;
  if (ui.q) { ui.q.focus(); ui.q.select(); }
  renderResults('');
 }
 function closeSearch() {
  searchOpen = false;
  if (ui.search) ui.search.hidden = true;
  if (ui.q) ui.q.blur();
 }
function focusOn(lat, lon, d) {
  const len = Math.min(controls.maxDistance, Math.max(controls.minDistance, d || 3.1));
  camera.position.copy(geoToVec3(lat, lon, len));
  controls.target.set(0, 0, 0);
  controls.autoRotate = false;
  controls.update();
  zoomGoal = len;
}
/* 平滑飞行定位：先在大圆轨迹上把目标点旋到正前方（保持当前距离），
   再在第二段缓动拉近相机距离 —— 形成「旋转到位 → 再放大」的流畅观感，
   避免瞬移或穿模。与 OrbitControls 阻尼互不打架：每帧直接写相机位置后 update。 */
let flyRAF = null, flyStartAt = 0;
/* 性能标记：用 performance.mark 记录关键阶段，便于与旧版本做同源 A/B */
function mark(name) {
 try { if (window.performance && performance.mark) performance.mark('ww:' + name); } catch (e) {}
}
function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function flyTo(lat, lon, d, opts) {
  const dur = (opts && opts.dur) || 1150;
  const toLen = Math.min(controls.maxDistance, Math.max(controls.minDistance, d || 3.15));
  if (toLen < 4.6) upgradeDay();
  const fromDir = camera.position.clone().normalize();
  const toDir = geoToVec3(lat, lon, 1).normalize();
  const fromLen = Math.max(controls.minDistance, camera.position.length());
  if (flyRAF) { cancelAnimationFrame(flyRAF); flyRAF = null; }
  controls.autoRotate = false;
  const t0 = performance.now();
  function step(now) {
    const p = Math.min(1, (now - t0) / dur);
    const e = easeInOutCubic(p);
    let dir;
    const dot = Math.min(1, Math.max(-1, fromDir.dot(toDir)));
    if (dot > 0.9995) dir = toDir.clone();
    else {
      const theta = Math.acos(dot), sin = Math.sin(theta);
      const a = Math.sin((1 - e) * theta) / sin, b = Math.sin(e * theta) / sin;
      dir = fromDir.clone().multiplyScalar(a).add(toDir.clone().multiplyScalar(b));
    }
    let len;
    if (p < 0.5) len = fromLen;                       /* 第一段：仅旋转到正前方 */
    else { const q = (p - 0.5) / 0.5; len = fromLen + (toLen - fromLen) * easeInOutCubic(q); } /* 第二段：拉近 */
    camera.position.copy(dir.multiplyScalar(len));
    controls.target.set(0, 0, 0);
    controls.update();
    if (p < 1) flyRAF = requestAnimationFrame(step);
    else { flyRAF = null; zoomGoal = camera.position.length(); }
  }
  flyStartAt = performance.now();
  mark('fly-start');
  flyRAF = requestAnimationFrame(step);
}
 function renderResults(q) {
  if (!ui.results) return;
  const needle = q.trim().toLowerCase();
  ui.results.innerHTML = '';
  if (!needle) { if (ui.info) ui.info.textContent = '输入电台名称、城市或国家；回车播放第一个结果'; return; }
  const hits = [];
  for (let i = 0; i < stations.length; i++) {
   const s = stations[i];
   if ((s.name + ' ' + s.city).toLowerCase().indexOf(needle) >= 0) hits.push(i);
  }
  /* 名称精确/前缀匹配优先，其次才是包含与城市匹配 */
  const rank = i => {
   const n = stations[i].name.toLowerCase(), c = stations[i].city.toLowerCase();
   return n === needle ? 0 : n.indexOf(needle) === 0 ? 1 : n.indexOf(needle) >= 0 ? 2 : c.indexOf(needle) >= 0 ? 3 : 4;
  };
  hits.sort((a, b) => rank(a) - rank(b));
  hits.slice(0, 8).forEach(i => {
   const s = stations[i], b = document.createElement('button');
   b.type = 'button';
   b.textContent = s.name;
   const small = document.createElement('small');
   small.textContent = (s.city || '') + (s.alts && s.alts.length ? ' · +' + s.alts.length + ' 台' : '');
   b.appendChild(small);
   b.addEventListener('click', () => { flyTo(s.lat, s.lon, 3.15); selectStation(i); closeSearch(); });
   ui.results.appendChild(b);
  });
  if (!hits.length) {
   const d = document.createElement('div');
   d.style.padding = '6px'; d.style.color = 'rgba(170,205,225,.62)'; d.textContent = '没有匹配的电台';
   ui.results.appendChild(d);
  }
  if (ui.info) ui.info.textContent = '找到 ' + hits.length + ' 个匹配';
 }
 let searchTimer = null;
 if (ui.q) ui.q.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const v = ui.q.value;
  searchTimer = setTimeout(() => renderResults(v), 110);
 });
 if (ui.q) ui.q.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
   clearTimeout(searchTimer);
   renderResults(ui.q.value);
   const first = ui.results && ui.results.querySelector('button');
   if (first) first.click();
   e.preventDefault();
  }
 });
 if (ui.searchBtn) ui.searchBtn.addEventListener('click', () => searchOpen ? closeSearch() : openSearch());

 /* ===================== 拾取（屏幕空间精确） ===================== */
 const pickVec = new THREE.Vector3();
 function pick(e) {
  if (!points || !stations.length || !pointArray) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  const dist = camera.position.length();
  const camDir = tmpVec.copy(camera.position).normalize();
  const cosVis = R * R / dist;
  camera.updateMatrixWorld();
  let best = -1, bestD = 16 * 16;
  for (let i = 0; i < stations.length; i++) {
   pickVec.set(pointArray[i * 3], pointArray[i * 3 + 1], pointArray[i * 3 + 2]);
   if (pickVec.dot(camDir) <= cosVis) continue;
   pickVec.project(camera);
   if (pickVec.z < -1 || pickVec.z > 1) continue;
   const sx = (pickVec.x * .5 + .5) * rect.width, sy = (-pickVec.y * .5 + .5) * rect.height;
   const dx = sx - px, dy = sy - py, d2 = dx * dx + dy * dy;
   if (d2 < bestD) { bestD = d2; best = i; }
  }
  return best >= 0 ? best : null;
 }
 let downPt = null, hoverAt = 0;
 renderer.domElement.addEventListener('pointerdown', e => { downPt = { x: e.clientX, y: e.clientY }; });
 renderer.domElement.addEventListener('click', e => {
  if (downPt && Math.hypot(e.clientX - downPt.x, e.clientY - downPt.y) > 6) return;
  const i = pick(e);
  if (i !== null) selectStation(i);
 });
/* 悬停浮层：鼠标移到绿色圆点上时，在光标旁显示电台名片（名称 / 地区 / 层级）。
   不触发 aria-live，避免屏幕阅读器被刷屏。 */
let hoverEl = null, hoverIdx = -1, hoverTimer = null;
function ensureHover() {
  if (hoverEl) return;
  hoverEl = document.createElement('div');
  hoverEl.id = 'wwHover';
  hoverEl.setAttribute('role', 'tooltip');
  document.body.appendChild(hoverEl);
}
function showHover(i, e) {
  ensureHover();
  const s = stations[i];
  if (!s) { hideHover(); return; }
  const tc = (s.cn && s.tier && window.WW_tierClass) ? ' ' + window.WW_tierClass(s.tier) : '';
  const tier = s.cn && s.tier ? '<span class="hv-tier' + tc + '">' + s.tier + '</span>' : '';
  const alt = (s.alts && s.alts.length) ? '<span class="hv-alt">+' + s.alts.length + ' 路</span>' : '';
  hoverEl.innerHTML = '<span class="hv-dot"></span><span class="hv-body"><span class="hv-name">' +
    (s.name || '未命名') + '</span><span class="hv-meta">' + (s.city || '未知地区') +
    '</span></span>' + tier + alt;
  hoverEl.style.display = 'flex';
  hoverEl.style.animation = 'none'; void hoverEl.offsetWidth; hoverEl.style.animation = '';
  const pad = 16, w = hoverEl.offsetWidth, h = hoverEl.offsetHeight;
  let x = e.clientX + 18, y = e.clientY + 18;
  if (x + w + pad > window.innerWidth) x = e.clientX - w - 18;
  if (y + h + pad > window.innerHeight) y = e.clientY - h - 18;
  hoverEl.style.left = Math.max(pad, x) + 'px';
  hoverEl.style.top = Math.max(pad, y) + 'px';
}
function hideHover() { if (hoverEl) hoverEl.style.display = 'none'; }
renderer.domElement.addEventListener('pointermove', e => {
  const t = performance.now();
  if (t - hoverAt < 32) return;
  hoverAt = t;
  const i = pick(e);
  renderer.domElement.style.cursor = i !== null ? 'pointer' : 'grab';
  if (i !== null) {
   if (i === hoverIdx) {
    /* 同一颗绿点：只跟随指针位置，不重放动画，避免文字闪烁 */
    clearTimeout(hoverTimer);
    showHover(i, e);
   } else {
    /* 换点：先进入 90ms 意图缓冲，扫过密集点阵时不至于一路弹名片 */
    hoverIdx = i;
    clearTimeout(hoverTimer);
    const px = e.clientX, py = e.clientY;
    hoverTimer = setTimeout(() => {
     if (hoverIdx === i) showHover(i, { clientX: px, clientY: py });
    }, 90);
   }
  } else {
   hoverIdx = -1;
   clearTimeout(hoverTimer);
   hideHover();
  }
  /* 悬停只更新可视文字，不触发 aria-live 播报，避免屏幕阅读器被刷屏 */
  if (!current && ui.title) {
   if (i !== null) {
    const s = stations[i];
    ui.title.textContent = s.name + (s.city ? ' · ' + s.city : '') + (s.alts && s.alts.length ? ' · +' + s.alts.length + ' 台' : '');
   } else ui.title.textContent = idleText();
  }
});
renderer.domElement.addEventListener('pointerleave', () => {
 hoverIdx = -1;
 clearTimeout(hoverTimer);
 hideHover();
});
/* 开始拖拽时立刻收起名片：拖动过程中名片跟着鼠标飘会非常吵 */
controls.addEventListener('start', () => {
 clearTimeout(hoverTimer);
 hoverIdx = -1;
 hideHover();
});

 /* ===================== 尺寸 / 自适应画质 ===================== */
 let quality = 1, frames = 0, fpsAt = performance.now();
 let showLabels = true, showPoints = true, qualityMode = 'auto';
 function resize() {
  const w = host.clientWidth || window.innerWidth;
  const h = host.clientHeight || window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  const budget = Math.max(dpr, Math.min(2.4, Math.sqrt(PIXEL_BUDGET / Math.max(1, w * h))));
  const ratio = Math.max(0.75, budget * quality);
  renderer.setPixelRatio(ratio);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  markerMat.uniforms.uDpr.value = ratio;
 }
 if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
 window.addEventListener('resize', resize);
 resize();
 function fpsTick(t) {
  frames++;
  if (t - fpsAt > 2200) {
   const fps = frames * 1000 / (t - fpsAt);
   if (qualityMode === 'auto') {
    if (fps < 30 && quality > 0.7) { quality = Math.max(0.7, quality - 0.12); resize(); }
    else if (fps > 54 && quality < 1) { quality = Math.min(1, quality + 0.06); resize(); }
   }
   frames = 0; fpsAt = t;
  }
 }

 const zoomBy = f => {
  camera.position.setLength(Math.min(controls.maxDistance, Math.max(controls.minDistance, camera.position.length() * f)));
  controls.autoRotate = false; controls.update();
 };
 window.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== ui.q) { openSearch(); e.preventDefault(); return; }
  if (e.key === 'Escape') { if (searchOpen) closeSearch(); else if (current) stop(); return; }
  if (document.activeElement === ui.q || document.activeElement === ui.vol) return;
  if (e.key === '+' || e.key === '=') zoomBy(0.88);
  else if (e.key === '-' || e.key === '_') zoomBy(1.13);
  else if (e.key === '0') { camera.position.set(0, 0.35, 9.0); controls.update(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
   const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), e.key === 'ArrowLeft' ? 0.09 : -0.09);
   camera.position.applyQuaternion(q); controls.autoRotate = false; controls.update(); e.preventDefault();
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
   const axis = new THREE.Vector3().crossVectors(camera.position, new THREE.Vector3(0, 1, 0)).normalize();
   const q = new THREE.Quaternion().setFromAxisAngle(axis, e.key === 'ArrowUp' ? 0.07 : -0.07);
   camera.position.applyQuaternion(q); controls.autoRotate = false; controls.update(); e.preventDefault();
  }
 });

 /* ===================== 对外接口 ===================== */
 window.WW_EARTH = {
  get stations() { return stations.slice(); },
  get audio() { return audio; },
  get tileState() { return { key: TILE.key, ready: !!(TILE.mesh && TILE.mesh.visible), failed: TILE.failed }; },
  get labels() { return labelLayer.children.filter(m => m.visible).length; },
  play: i => selectStation(typeof i === 'number' ? i : 0),
  playStation: s => {
   if (!s) return;
   let i = stations.indexOf(s);
   if (i < 0) i = stations.findIndex(x => x.lat === s.lat && x.lon === s.lon && x.name === s.name);
   if (i < 0) i = stations.findIndex(x => Math.abs(x.lat - s.lat) < 1e-6 && Math.abs(x.lon - s.lon) < 1e-6);
   if (i >= 0) selectStation(i);
  },
  stop, togglePlay, focus: (lat, lon, d) => focusOn(lat, lon, d),
  /* 当前点位可用的全部流（主源 + 备用源）与正在使用的下标，供右栏「备用流」列表展示 */
  get altState() {
   if (!current) return null;
   return {
    i: current.i, idx: current.idx,
    list: current.list.map((e, j) => ({ j, name: e.name, stream: e.stream }))
   };
  },
  /* 直接切到第 j 路流（不再重启整个点位） */
  playAlt: j => {
   if (!current) return;
   const n = current.list.length;
   if (!(j >= 0 && j < n) || j === current.idx) return;
   current.idx = j; current.tries = 0;
   enableControls(true);
   playCurrent();
  },
  flyTo: (lat, lon, d, opts) => flyTo(lat, lon, d, opts),
  probeStream,
  healthOf,
  /* 调试：拾取与选中（用于自动化验证） */
  __pickAt: (x, y) => pick({ clientX: x, clientY: y }),
  __select: i => selectStation(i),
  /* 调试：选中环的屏幕几何（环心、半径、与点位的偏差） */
  __ringDebug() {
   if (!selGroup || !selRing) return null;
   const c = selGroup.position.clone().project(camera);
   const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
   const rr = RING_BASE_R * (1 + RING_W) * selGroup.scale.x;
   const e = selGroup.position.clone().add(right.multiplyScalar(rr)).project(camera);
   const rect = renderer.domElement.getBoundingClientRect();
   const toPx = v => ({ x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height });
   const a = toPx(c), b = toPx(e);
   return {
    visible: selGroup.visible && selRing.visible,
    opacity: selRing.material.opacity,
    center: { x: +a.x.toFixed(2), y: +a.y.toFixed(2) },
    radiusPx: +Math.hypot(b.x - a.x, b.y - a.y).toFixed(2),
    glow: !!(selGlow && selGlow.visible)
   };
  },
  hintStation: i => showHint(i),
  clearHint: () => clearHint(),
  /* 供自检/调试观察选中环状态（细环是否重建、屏幕尺寸缩放是否生效） */
  get ringInfo() {
   return {
    visible: !!selGroup,
    scale: selGroup ? +selGroup.scale.x.toFixed(3) : 0,
    glow: !!selGlow,
    hint: !!(hintRing && hintRing.visible)
   };
  },
  setLabelsVisible: v => { showLabels = !!v; },
  setPointsVisible: v => { showPoints = !!v; },
  setAutoRotate: v => { controls.autoRotate = !!v && !reducedMotion; },
  setQualityMode: m => {
   qualityMode = ['auto', 'high', 'eco'].indexOf(m) >= 0 ? m : 'auto';
   quality = qualityMode === 'eco' ? 0.75 : (qualityMode === 'high' ? 1 : quality);
   resize();
  },
  get info() {
   return {
    count: stations.length, quality: +quality.toFixed(2), qualityMode,
    showLabels, showPoints, autoRotate: controls.autoRotate, rotateSpeed: +controls.rotateSpeed.toFixed(3),
    camDist: +camera.position.length().toFixed(3), zoomGoal: +zoomGoal.toFixed(3),
    flying: !!flyRAF, flyAge: flyStartAt ? Math.round(performance.now() - flyStartAt) : null,
    tiles: {
     key: TILE.key, ready: !!(TILE.mesh && TILE.mesh.visible), failed: TILE.failed,
     opacity: TILE.mesh ? +TILE.mesh.material.opacity.toFixed(3) : 0,
     prev: TILE.prev ? +TILE.prev.material.opacity.toFixed(3) : null,
     dragging
    },
    render: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }
   };
  },
  zoomTo: (d, lat, lon) => {
   const len = Math.min(controls.maxDistance, Math.max(controls.minDistance, d));
   camera.position.copy(Number.isFinite(lat) && Number.isFinite(lon) ? geoToVec3(lat, lon, len) : camera.position.clone().setLength(len));
   controls.autoRotate = false; controls.update();
  },
  screenPos: (lat, lon) => {
   const v = geoToVec3(lat, lon, MARK_R).project(camera);
   const rect = renderer.domElement.getBoundingClientRect();
   return { x: rect.left + (v.x * .5 + .5) * rect.width, y: rect.top + (-v.y * .5 + .5) * rect.height };
  }
 };

 /* ===================== 渲染循环 ===================== */
 const lightView = new THREE.Vector3();
 const idleText = () => stations.length + ' 个电台坐标点 · 点击绿点播放';
 function animate(t) {
  requestAnimationFrame(animate);
  fpsTick(t || performance.now());
  controls.update();
  /* 滚轮缩放缓动：朝目标距离线性逼近，末端收敛到 1e-3 以内再吸附 */
  if (finePointer && !flyRAF) {
   const cur = camera.position.length();
   const goal = clampDist(zoomGoal);
   if (Math.abs(goal - cur) > 1e-3) camera.position.setLength(cur + (goal - cur) * 0.18);
   else if (cur !== goal) camera.position.setLength(goal);
   if (performance.now() > zoomUntil && Math.abs(goal - cur) <= 1e-3) zoomGoal = camera.position.length();
  }
  camera.updateMatrixWorld();
  const dist = camera.position.length();
  /* 近景时降低拖拽灵敏度：贴到地表后同样的角速度会让画面扫得飞快，按距离等比收敛 */
  controls.rotateSpeed = 0.55 * Math.min(1, Math.max(0.34, dist / 9));
  /* 标记环保持恒定屏幕尺寸；选中环叠加缓慢呼吸的柔光 */
  if (selGroup) {
   /* 正对相机：贴球面的圆在斜视时会被投成椭圆，视觉中心偏到绿点之外 */
   selGroup.quaternion.copy(camera.quaternion);
   selGroup.scale.setScalar(ringScaleFor(selGroup.position));
   if (selGlow) {
    const ph = (((t || performance.now()) - selGlowAt) % 2600) / 2600;
    selGlow.scale.setScalar(RING_BASE_R * 5.4 * (1 + 0.30 * ph));
    selGlow.material.opacity = 0.46 * Math.pow(1 - ph, 1.6);
   }
  }
  if (hintRing && hintRing.visible) {
   hintRing.quaternion.copy(camera.quaternion);
   hintRing.scale.setScalar(ringScaleFor(hintRing.position));
  }
  const w = renderer.domElement.clientWidth || window.innerWidth;
  const h = renderer.domElement.clientHeight || window.innerHeight;
  starMat.opacity = 0.7 * Math.min(1, Math.max(0, (dist - 3.2) / 3.2));
  cloudMat.opacity = 0.075 * Math.min(1, Math.max(0, (dist - 2.6) / 2.2));
  nightUniform.strength.value = 0.55 * Math.min(1, Math.max(0, (dist - 3.0) / 2.2));
  lightView.copy(sun.position).transformDirection(camera.matrixWorldInverse);
  nightUniform.lightDir.value.copy(lightView);
  clouds.rotation.y += 0.0001;
  labelLayer.visible = showLabels;
  if (points) points.visible = showPoints;
  const tileWant = dist > 6.2 ? 0 : 0.98;
  if (TILE.mesh) {
   const mat = TILE.mesh.material;
   mat.opacity += (tileWant - mat.opacity) * 0.18;
   TILE.mesh.visible = mat.opacity > 0.01;
  }
  if (TILE.prev) {
   const pm = TILE.prev.material;
   /* 新层没到位就撤旧层，会露出 2K 底图 —— 那正是「闪一下」的观感来源 */
   const nm = TILE.mesh ? TILE.mesh.material : null;
   if (!nm || nm.opacity > 0.8 || !TILE.mesh.visible) pm.opacity *= 0.82;
   if (pm.opacity < 0.015) { disposeTileMesh(TILE.prev); TILE.prev = null; }
   else TILE.prev.visible = true;
  }
  if (!dragging && performance.now() > zoomUntil + 120 && (t || 0) - TILE.last > 520) {
   TILE.last = t || 0;
   refreshTiles(false);
  }
  updateLabels(w, h);
  renderer.render(scene, camera);
 }

 /* ===================== 启动 ===================== */
 buildPoints(FEATURED.map(s => ({ ...s, alts: [] })));
 enableControls(false);
 setMode('loading', '正在加载电台目录…');
 loadSnapshot().catch(err => {
  console.warn('[WORLDWAVE] 本地快照不可用：', err && err.message ? err.message : err);
  setMode('idle', '离线精选 · ' + FEATURED.length + ' 个电台');
  if (ui.info) ui.info.textContent = '目录不可用，已加载内置精选电台';
 }).finally(() => {
  /* 在线目录刷新不属于首屏关键路径，放到空闲时段，避免拖慢 load 事件 */
  const kick = () => refreshOnline();
  if (window.requestIdleCallback) window.requestIdleCallback(kick, { timeout: 2500 });
  else setTimeout(kick, 1200);
 });
 /* 分享链接支持：#@纬度,经度,相机距离 */
 try {
  const m = /^#@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?$/.exec(location.hash);
  if (m) {
   const lat = parseFloat(m[1]), lon = parseFloat(m[2]), d = parseFloat(m[3]) || 3.2;
   if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) focusOn(lat, lon, d);
  }
 } catch (e) { /* 忽略非法 hash */ }
 animate(performance.now());

 /* ===================== WebGL 不可用时的降级 ===================== */
 /* 此函数在 WebGL 探测失败时会被提前调用，必须完全自包含，
    不得引用后面才初始化的 const（否则触发 TDZ 错误）。 */
 function showFallback() {
  host.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'ww-fallback';
  const head = document.createElement('div');
  head.textContent = '此浏览器不支持 WebGL，已切换为平面地图 + 电台列表（点击名称播放）。';
  const img = document.createElement('img');
  img.alt = '世界地图'; img.src = TEX.day;
  const list = document.createElement('div');
  list.className = 'list';
  box.appendChild(head); box.appendChild(img); box.appendChild(list);
  host.appendChild(box);
  const a = new Audio(); a.preload = 'none'; a.volume = 0.8;
  const render = rows => {
   list.innerHTML = '';
   rows.slice(0, 400).forEach(s => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s.name + (s.city ? ' · ' + s.city : '');
    b.addEventListener('click', () => {
     a.pause(); a.src = s.stream;
     a.play().catch(() => { b.textContent += '（无法播放）'; });
    });
    list.appendChild(b);
   });
  };
  const use = payload => {
   const arr = Array.isArray(payload) ? payload : (payload && payload.stations) || [];
   const rows = arr.filter(s => s && typeof s.stream === 'string' &&
    s.stream.indexOf('https://') === 0 && !/\.m3u8|\.pls|\.asx/i.test(s.stream));
   if (rows.length) render(rows);
  };
  if (SNAPSHOT_INLINE) use(SNAPSHOT_INLINE);
  else fetch(SNAPSHOT_URL).then(r => r.json()).then(use).catch(() => {});
 }
})();
