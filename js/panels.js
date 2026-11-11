/* WORLDWAVE 侧栏：左侧分级电台目录、右侧播放详情与功能设置。
   普通脚本（非 module），通过 window.WW_EARTH 与 3D 地球双向联动。
   视图采用栈 + 面包屑，支持 root → 大洲 → 国家 → 城市 → 电台 的嵌套分级。
   UI 要点：播放中动态均衡器、大洲配色图标、行内快速收藏、键盘 ↑↓ 导航、
   播放行自动滚动定位、浮层提示（toast）。 */
(() => {
 'use strict';
/* ---------- 线性图标（统一 1.7 描边，避免字符图标在不同系统里字形不一） ---------- */
const ICON = {
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3.7l2.55 5.3 5.8.82-4.2 4.05 1 5.73L12 16.9l-5.15 2.7 1-5.73-4.2-4.05 5.8-.82z"/></svg>',
  starOn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.7l2.55 5.3 5.8.82-4.2 4.05 1 5.73L12 16.9l-5.15 2.7 1-5.73-4.2-4.05 5.8-.82z"/></svg>',
  loc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="3.3"/><path d="M12 2.6v3.2M12 18.2v3.2M2.6 12h3.2M18.2 12h3.2"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.2 4.6l11 7.4-11 7.4z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="4.8" width="3.6" height="14.4" rx="1.2"/><rect x="13.4" y="4.8" width="3.6" height="14.4" rx="1.2"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M10.4 13.6a4 4 0 005.66 0l2.4-2.4a4 4 0 10-5.66-5.66l-1 1"/><path d="M13.6 10.4a4 4 0 00-5.66 0l-2.4 2.4a4 4 0 105.66 5.66l1-1"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  sort: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3"/></svg>',
  fav: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3.7l2.55 5.3 5.8.82-4.2 4.05 1 5.73L12 16.9l-5.15 2.7 1-5.73-4.2-4.05 5.8-.82z"/></svg>',
  his: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3.2 2"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3.1"/><path d="M12 2.8v2.4M12 18.8v2.4M4.5 12H2.1M21.9 12h-2.4M6.3 6.3L4.6 4.6M19.4 19.4l-1.7-1.7M17.7 6.3l1.7-1.7M4.6 19.4l1.7-1.7" stroke-linecap="round"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="8.6"/><path d="M12 10.8v5.4M12 7.9v.1"/></svg>',
  dice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="16" height="16" rx="4.2"/><circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.2" fill="currentColor" stroke="none"/></svg>',
  wave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4.6 10.4v3.2M9 7.6v8.8M13.4 5v14M17.8 8.6v6.8"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10.8" cy="10.8" r="6.2"/><path d="M15.6 15.6l4.4 4.4"/></svg>',
  panel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3.2" y="4.6" width="17.6" height="14.8" rx="3.2"/><path d="M9.4 4.6v14.8"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'
};
function svgIco(k) { const s = document.createElement('span'); s.innerHTML = ICON[k] || ''; return s.firstChild || document.createTextNode(''); }
function fillIco(host, k) { host.innerHTML = ICON[k] || ''; return host; }
/* 流来源域名：用于说明这条音频从哪来（真实取自 stream 字段，不做推测） */
function hostOf(s) {
  try { return new URL(s.stream).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
}
function kmText(d) {
  if (!Number.isFinite(d)) return '';
  if (d < 1) return Math.round(d * 1000) + ' m';
  if (d < 10) return d.toFixed(1) + ' km';
  return Math.round(d) + ' km';
}
window.WW_tierClass = t => tierClass(t);
const $ = id => document.getElementById(id);
 const KEY = { fav: 'ww.fav.v2', his: 'ww.his.v2', left: 'ww.panel.left', right: 'ww.panel.right', set: 'ww.settings.v2', sort: 'ww.sort.v1' };
 const CONTS = ['亚洲', '欧洲', '非洲', '北美洲', '南美洲', '大洋洲', '南极洲', '其他'];
 /* 大洲视觉元数据：图标 + 配色（低饱和、专业观感） */
 const CONT_META = {
  '亚洲': { ico: '⬢', cls: 'c-as' }, '欧洲': { ico: '⬡', cls: 'c-eu' },
  '非洲': { ico: '▲', cls: 'c-af' }, '北美洲': { ico: '◆', cls: 'c-na' },
  '南美洲': { ico: '◇', cls: 'c-sa' }, '大洋洲': { ico: '◎', cls: 'c-oc' },
  '南极洲': { ico: '❄', cls: 'c-an' }, '其他': { ico: '⋯', cls: 'c-ot' }
 };
 /* 卡片 logo 渐变（按大洲 / 中国），高端质感 */
 const GRAD = {
  '亚洲': 'g-as', '欧洲': 'g-eu', '非洲': 'g-af', '北美洲': 'g-na',
  '南美洲': 'g-sa', '大洋洲': 'g-oc', '南极洲': 'g-an', '其他': 'g-ot'
 };
 function continentGrad(s) { if (!s) return 'g-ot'; const c = continentOf(countryOf(s), s.lat, s.lon); return GRAD[c] || 'g-ot'; }
 const C2C = {
  'The United States Of America': '北美洲', 'United States': '北美洲', 'Canada': '北美洲', 'Mexico': '北美洲',
  'Cuba': '北美洲', 'Jamaica': '北美洲', 'Guatemala': '北美洲', 'Panama': '北美洲', 'Costa Rica': '北美洲',
  'Dominican Republic': '北美洲', 'Haiti': '北美洲', 'Puerto Rico': '北美洲',
  'Germany': '欧洲', 'France': '欧洲', 'Spain': '欧洲', 'Italy': '欧洲', 'The Netherlands': '欧洲',
  'The United Kingdom Of Great Britain And Northern Ireland': '欧洲', 'United Kingdom': '欧洲',
  'Poland': '欧洲', 'Portugal': '欧洲', 'Sweden': '欧洲', 'Norway': '欧洲', 'Finland': '欧洲',
  'Denmark': '欧洲', 'Switzerland': '欧洲', 'Austria': '欧洲', 'Belgium': '欧洲', 'Greece': '欧洲',
  'Czech Republic': '欧洲', 'Ireland': '欧洲', 'Hungary': '欧洲', 'Romania': '欧洲',
  'Ukraine': '欧洲', 'Bulgaria': '欧洲', 'Croatia': '欧洲', 'Serbia': '欧洲', 'Iceland': '欧洲',
  'Brazil': '南美洲', 'Argentina': '南美洲', 'Chile': '南美洲', 'Colombia': '南美洲',
  'Peru': '南美洲', 'Venezuela': '南美洲', 'Ecuador': '南美洲', 'Bolivia': '南美洲',
  'Uruguay': '南美洲', 'Paraguay': '南美洲',
  'The Russian Federation': '亚洲', 'Russia': '亚洲', 'China': '亚洲', 'Japan': '亚洲',
  'Republic Of Korea': '亚洲', 'India': '亚洲', 'Indonesia': '亚洲', 'Türkiye': '亚洲',
  'Turkey': '亚洲', 'Iran': '亚洲', 'Israel': '亚洲', 'Saudi Arabia': '亚洲',
  'Philippines': '亚洲', 'Thailand': '亚洲', 'Viet Nam': '亚洲', 'Malaysia': '亚洲',
  'Pakistan': '亚洲', 'Bangladesh': '亚洲', 'Kazakhstan': '亚洲', 'United Arab Emirates': '亚洲',
  'Australia': '大洋洲', 'New Zealand': '大洋洲', 'Papua New Guinea': '大洋洲', 'Fiji': '大洋洲',
  'South Africa': '非洲', 'Nigeria': '非洲', 'Egypt': '非洲', 'Algeria': '非洲',
  'Morocco': '非洲', 'Kenya': '非洲', 'Ghana': '非洲', 'Tunisia': '非洲', 'Ethiopia': '非洲',
  'Tanzania': '非洲', 'Uganda': '非洲', 'Senegal': '非洲', 'Cameroon': '非洲',
  /* 亚洲 / 中东 / 中亚 */
  'The United Arab Emirates': '亚洲', 'The Philippines': '亚洲', 'Sri Lanka': '亚洲',
  'Lebanon': '亚洲', 'Iraq': '亚洲', 'Jordan': '亚洲', 'Kuwait': '亚洲', 'Nepal': '亚洲',
  'Singapore': '亚洲', 'Islamic Republic Of Iran': '亚洲', 'Azerbaijan': '亚洲',
  'Cambodia': '亚洲', 'Maldives': '亚洲', 'Kyrgyzstan': '亚洲', 'Armenia': '亚洲',
  'The Republic Of Korea': '亚洲', 'Syrian Arab Republic': '亚洲', 'Qatar': '亚洲',
  'Oman': '亚洲', 'Yemen': '亚洲', 'Georgia': '亚洲',
  'Brunei Darussalam': '亚洲', '中国香港': '亚洲', '中国澳门': '亚洲', '中国台湾': '亚洲',
  /* 欧洲 */
  'Bosnia And Herzegovina': '欧洲', 'Estonia': '欧洲', 'Czechia': '欧洲',
  'Slovenia': '欧洲', 'Slovakia': '欧洲', 'Latvia': '欧洲', 'Belarus': '欧洲',
  'The Faroe Islands': '欧洲', 'Lithuania': '欧洲', 'Republic Of North Macedonia': '欧洲',
  'Isle Of Man': '欧洲', 'Luxembourg': '欧洲', 'Jersey': '欧洲', 'Monaco': '欧洲',
  'Albania': '欧洲', 'Guernsey': '欧洲', 'Liechtenstein': '欧洲', 'Montenegro': '欧洲',
  'The Holy See': '欧洲', 'Cyprus': '欧洲', 'The Republic Of Moldova': '欧洲',
  'Malta': '欧洲', 'Andorra': '欧洲', 'San Marino': '欧洲',
  'The United Kingdom Of Great Bri': '欧洲', 'The United Kingdom Of Great Britain And Norther': '欧洲',
  /* 非洲与印度洋岛屿 */
  'Reunion': '非洲', 'Cabo Verde': '非洲', 'Madagascar': '非洲', 'Mauritius': '非洲',
  'United Republic Of Tanzania': '非洲', 'Angola': '非洲', 'Mozambique': '非洲',
  'Namibia': '非洲', 'Coted Ivoire': '非洲', 'Libya': '非洲', 'Benin': '非洲',
  'Ascension And Tristan Da Cunha Saint Helena': '非洲', 'The Niger': '非洲',
  'The Sudan': '非洲', 'The Democratic Republic Of The Congo': '非洲',
  'Burkina Faso': '非洲', 'Mali': '非洲', 'Guinea': '非洲', 'Somalia': '非洲',
  'Seychelles': '非洲', 'Mayotte': '非洲', 'Zimbabwe': '非洲',
  'The French Southern Territories': '非洲',
  /* 美洲 */
  'The Dominican Republic': '北美洲', 'Bolivarian Republic Of Venezuela': '南美洲',
  'Guyana': '南美洲', 'Suriname': '南美洲', 'The Falkland Islands Malvinas': '南美洲',
  'Saint Lucia': '北美洲', 'El Salvador': '北美洲', 'Nicaragua': '北美洲',
  'The United States Minor Outlying Islands': '北美洲', 'Honduras': '北美洲',
  'The Cayman Islands': '北美洲', 'Guadeloupe': '北美洲', 'US Virgin Islands': '北美洲',
  'The Bahamas': '北美洲', 'Trinidad And Tobago': '北美洲', 'Martinique': '北美洲',
  'Saint Pierre And Miquelon': '北美洲', 'British Virgin Islands': '北美洲',
  'Dutch Part Sint Maarten': '北美洲', 'Dominica': '北美洲', 'Barbados': '北美洲',
  /* 大洋洲 */
  'Vanuatu': '大洋洲', 'French Polynesia': '大洋洲', 'Tonga': '大洋洲',
  'New Caledonia': '大洋洲', 'Guam': '大洋洲'
 };
 /* 目录里的历史/截断名称统一为规范地区名，避免列表出现重复或不规范表述 */
 const NORM = {
  'Hong Kong': '中国香港', 'Hong Kong SAR': '中国香港',
  'Macao': '中国澳门', 'Macau': '中国澳门',
  'Republic Of China': '中国台湾', 'Taiwan': '中国台湾', 'Taiwan, Province Of China': '中国台湾',
  'The United Kingdom Of Great Bri': 'The United Kingdom Of Great Britain And Northern Ireland',
  'The United Kingdom Of Great Britain And Norther': 'The United Kingdom Of Great Britain And Northern Ireland'
 };
 const MODE_TXT = { idle: '就绪', loading: '连接中', playing: '播放中', paused: '已暂停', error: '播放失败' };
 let stations = [], idx = null, current = null, mode = 'idle';
 let fav = load(KEY.fav, []), his = load(KEY.his, []), settings = load(KEY.set, {});
 const L = { stack: [{ v: 'root', title: '发现' }], limit: 120, filter: 'all', sort: load('ww.sort.v1', 'default') };
 const R = { stack: [{ v: 'now', title: '播放' }] };
 /* WAVE DECK：列表密度视图 + 右栏折叠区块状态（视图偏好持久化） */
 const V = { view: load('ww.view.v1', 'card'), folds: { alt: true, near: true, resume: true, hot: true, tools: true } };

 function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v === null ? d : v; } catch (e) { return d; } }
 function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 隐私模式 */ } }
 function fmt(n) { return Number(n).toLocaleString('zh-CN'); }
 function compact(s) {
  return { name: s.name, city: s.city, lat: s.lat, lon: s.lon, stream: s.stream,
   alts: (s.alts || []).map(a => ({ name: a.name, stream: a.stream })) };
 }
 function same(a, b) { return !!a && !!b && a.lat === b.lat && a.lon === b.lon && a.name === b.name; }
 function isFav(s) { return fav.some(x => same(x, s)); }
 function countryOf(s) {
  const p = (s.city || '').trim().split(',');
  const raw = (p[p.length - 1] || '').trim() || '未知地区';
  return NORM[raw] || raw;
 }
 function cityOf(s) {
  const p = (s.city || '').trim().split(',');
  return p.length > 1 ? p.slice(0, -1).join(',').trim() : (p[0] || '其他');
 }
/* 列表展示用：城市 + 规范地区名，避免出现原始超长 / 不规范地名 */
function cityMeta(s) {
  const p = (s.city || '').trim().split(',');
  if (p.length > 1) {
   const tail = p.pop().trim();
   const head = p.join(',').trim();
   return (head ? head + ', ' : '') + (NORM[tail] || tail);
  }
  return (s.city || '').trim() || '—';
}
/* 只取城市（不重复国家）：用于已显示距离的「附近」列表，避免尾部被截断看不到关键信息 */
function cityShort(s) {
  const p = (s.city || '').trim().split(',');
  return (p[0] || '').trim() || cityMeta(s);
}
 function byGeo(lat, lon) {
  if (lat < -60) return '南极洲';
  if ((lon >= 110 || lon <= -150) && lat >= -50 && lat < 8) return '大洋洲';
  if (lon >= -170 && lon <= -30 && lat >= 7 && lat <= 75) return '北美洲';
  if (lon >= -82 && lon <= -34 && lat >= -56 && lat <= 13) return '南美洲';
  if (lon >= -25 && lon <= 45 && lat >= 34 && lat <= 72) return '欧洲';
  if (lon >= -20 && lon <= 52 && lat >= -36 && lat < 37) return '非洲';
  if (lon >= 25 && lon <= 180 && lat >= -12 && lat <= 80) return '亚洲';
  return '其他';
 }
 function continentOf(name, lat, lon) { return C2C[name] || byGeo(lat, lon); }
 /* 相关度排序：名称精确 > 名称前缀 > 名称包含 > 城市 > 其它 */
 function matchRank(s, q) {
  const n = (s.name || '').toLowerCase(), c = (s.city || '').toLowerCase();
  if (n === q) return 0;
  if (n.indexOf(q) === 0) return 1;
  if (n.indexOf(q) >= 0) return 2;
  if (c.indexOf(q) >= 0) return 3;
  return 4;
 }
 function rankList(list, q) {
  return list.slice().sort((a, b) => matchRank(a, q) - matchRank(b, q) || a.name.localeCompare(b.name));
 }
 function distKm(a, b) {
  const d = Math.PI / 180, dlat = (b.lat - a.lat) * d, dlon = (b.lon - a.lon) * d;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
 }

 function rebuildIndex() {
  const byCont = new Map(), byCountry = new Map(), byCity = new Map();
  CONTS.forEach(c => byCont.set(c, []));
  stations.forEach(s => {
   const country = countryOf(s), city = cityOf(s), cont = continentOf(country, s.lat, s.lon);
   if (!byCont.has(cont)) byCont.set(cont, []);
   byCont.get(cont).push(s);
   const ck = cont + '|' + country;
   if (!byCountry.has(ck)) byCountry.set(ck, { cont, country, list: [] });
   byCountry.get(ck).list.push(s);
   const cityk = ck + '|' + city;
   if (!byCity.has(cityk)) byCity.set(cityk, { cont, country, city, list: [] });
   byCity.get(cityk).list.push(s);
  });
  idx = { byCont, byCountry, byCity };
 }

 /* ---------- 通用小组件 ---------- */
 function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
 /* 分组标题：把「标题 · 数量」拆成标题 + 计数胶囊，层级更清晰 */
function sec(text) {
  const e = el('div', 'psec');
  const m = String(text).match(/^(.*?)\s*·\s*([\d,]+)(\s*.*)$/);
  if (m) {
    e.appendChild(el('span', '', m[1]));
    e.appendChild(el('span', 'cnt', m[2]));
  } else e.textContent = text;
  return e;
}
function empty(text, ico, acts) {
  const e = el('div', 'pempty');
  const lines = String(text).split('\n');
  if (ico) {
   const d = el('div', 'eico');
   if (ICON[ico]) fillIco(d, ico); else d.textContent = ico;
   e.appendChild(d);
  }
  e.appendChild(el('div', 'etitle', lines[0]));
  if (lines.length > 1) e.appendChild(el('div', 'ehint', lines.slice(1).join(' ')));
  if (acts && acts.length) {
   const w = el('div', 'eacts');
   acts.forEach(a => {
    const b = el('button', 'ebtn', a.label);
    b.type = 'button';
    b.addEventListener('click', a.fn);
    w.appendChild(b);
   });
   e.appendChild(w);
  }
  return e;
}
/* 目录骨架屏：目录请求返回前先给出结构，避免空白闪跳 */
function skeleton(n) {
  const f = document.createDocumentFragment();
  for (let i = 0; i < (n || 6); i++) {
   const r = el('div', 'skrow');
   r.appendChild(el('span', 'sklogo'));
   const m = el('span', 'skmain');
   const a = el('div', 'skb'); a.style.width = (52 + (i * 13) % 34) + '%';
   m.appendChild(a); m.appendChild(el('div', 'skb s'));
   r.appendChild(m);
   f.appendChild(r);
  }
  return f;
}
 /* 播放中的动态均衡器标识 */
 function eq() {
  const e = el('span', 'eq');
  e.setAttribute('aria-hidden', 'true');
  e.appendChild(el('i')); e.appendChild(el('i')); e.appendChild(el('i'));
  return e;
 }
 /* 行内快速收藏按钮。状态就地同步，不重绘整栏（避免丢失滚动位置）。 */
function syncFav(s) {
  document.querySelectorAll('.pfav').forEach(b => {
   if (!b._s || !same(b._s, s)) return;
   const on = isFav(s);
   b.classList.toggle('on', on);
   b.innerHTML = ICON[on ? 'starOn' : 'star'];
   b.title = on ? '取消收藏' : '收藏';
   b.setAttribute('aria-label', (on ? '取消收藏 ' : '收藏 ') + s.name);
  });
}
function favBtn(s) {
  const on = isFav(s);
  const b = el('button', 'abtn pfav' + (on ? ' on' : ''));
  b.type = 'button';
  b._s = s;
  b.title = on ? '取消收藏' : '收藏';
  b.setAttribute('aria-label', (on ? '取消收藏 ' : '收藏 ') + s.name);
  b.innerHTML = ICON[on ? 'starOn' : 'star'];
  b.addEventListener('click', ev => {
   ev.stopPropagation();
   if (isFav(s)) fav = fav.filter(x => !same(x, s));
   else { fav = [compact(s), ...fav].slice(0, 200); toast('已收藏 · ' + s.name); }
   save(KEY.fav, fav);
   syncFav(s);
   /* 根视图的收藏计数、右栏 hero 的星标状态需要跟随更新 */
   if (L.stack[L.stack.length - 1].v === 'root') renderL();
   if (current && same(current, s) && R.stack[R.stack.length - 1].v === 'now') renderR();
  });
  return b;
}
/* 只定位不播放：浏览目录时先看位置，再决定是否收听 */
function locBtn(s) {
  const b = el('button', 'abtn loc');
  b.type = 'button';
  b.innerHTML = ICON.loc;
  b.title = '仅在地球上定位';
  b.setAttribute('aria-label', '在地球上定位 ' + s.name);
  b.addEventListener('click', ev => {
   ev.stopPropagation();
   const E = window.WW_EARTH;
   if (E && E.flyTo) E.flyTo(s.lat, s.lon, 3.15);
  });
  return b;
}
/* 中国电台四级 → 配色类名（卡片 pill 与悬停浮层 tier 共用） */
function tierClass(t) {
  if (t === '国家级') return 't-national';
  if (t === '省级') return 't-provincial';
  if (t === '市级') return 't-city';
  if (t === '网络电台') return 't-net';
  return '';
}
/* 徽标配色：以所在大洲色相为家族基准，再按站名哈希做轻微偏移，
   避免「一整屏同色字母块」的单调感（同洲仍能一眼归类）。 */
const HUE = { '亚洲': 34, '欧洲': 204, '非洲': 20, '北美洲': 122, '南美洲': 276, '大洋洲': 178, '南极洲': 200, '其他': 210 };
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function logoBg(s) {
  if (!s) return '';
  const cont = s.cn ? '中国' : continentOf(countryOf(s), s.lat, s.lon);
  const base = s.cn ? 2 : (HUE[cont] != null ? HUE[cont] : 210);
  const h = hashStr((s.name || '') + '|' + (s.city || ''));
  const j = s.cn ? 6 : 15;
  const hue = (base + ((h % (j * 2 + 1)) - j) + 360) % 360;
  const sat = s.cn ? 60 : 40 + ((h >> 8) % 12);
  const l1 = 59 + ((h >> 12) % 7);
  const l2 = 39 + ((h >> 16) % 7);
  return 'linear-gradient(145deg,hsl(' + hue + ' ' + sat + '% ' + l1 + '%),hsl(' + hue + ' ' + sat + '% ' + l2 + '%))';
}
function row(o) {
  const s = o.station;
  const b = el('button', (o.on ? 'prow acard on' : 'prow acard') + (V.view === 'compact' ? ' compact' : ''));
  b.type = 'button';
  const grad = (s && s.cn) ? 'g-cn' : continentGrad(s);
  const logo = el('span', 'alogo ' + grad);
  logo.textContent = (o.name || '?').trim().charAt(0).toUpperCase();
  const lbg = logoBg(s);
  if (lbg) logo.style.background = lbg;
  b.appendChild(logo);
  /* 第一行：站名（主信息）+ 播放中均衡器；第二行：距离 / 地点 / 分级或备用流数 */
  const main = el('span', 'pmain');
  const nameRow = el('span', 'pnamerow');
  nameRow.appendChild(el('span', 'pname', o.name));
  if (o.on) { const e = el('span', 'pname-eq'); e.appendChild(eq()); nameRow.appendChild(e); }
  main.appendChild(nameRow);
  const meta = el('span', 'pmeta');
  if (o.dist != null) meta.appendChild(el('span', 'dchip', kmText(o.dist)));
  meta.appendChild(el('span', 'mtxt', o.meta || '—'));
  if (s && s.cn && s.tier) meta.appendChild(el('span', 'apill ' + tierClass(s.tier), s.tier));
  else if (s && s.alts && s.alts.length) {
   const t = el('span', 'malt', (s.alts.length + 1) + ' 台');
   t.title = '同一坐标共 ' + (s.alts.length + 1) + ' 台电台';
   meta.appendChild(t);
  }
  main.appendChild(meta);
  b.appendChild(main);
  const acts = el('span', 'acts');
  if (s) { acts.appendChild(locBtn(s)); acts.appendChild(favBtn(s)); }
  b.appendChild(acts);
  if (o.click) b.addEventListener('click', o.click);
  if (o.name) b.title = (o.meta ? (o.name + ' · ' + o.meta) : o.name) + (o.station && o.station.alts && o.station.alts.length ? ' · ' + o.station.alts.length + ' 路备用流' : '');
  if (s) {
   const E = window.WW_EARTH;
   const hintOn = () => { if (E && E.hintStation) { const i = stations.indexOf(s); if (i >= 0) E.hintStation(i); } };
   const hintOff = () => { if (E && E.clearHint) E.clearHint(); };
   b.addEventListener('mouseenter', hintOn);
   b.addEventListener('mouseleave', hintOff);
   b.addEventListener('focus', hintOn);
   b.addEventListener('blur', hintOff);
  }
  return b;
}
/* 右栏功能入口：图标 + 标题 + 说明 + 数值 + 右侧指示箭头 */
function feat(o) {
  const b = el('button', 'pcard');
  b.type = 'button';
  const ico = el('span', 'ico');
  fillIco(ico, o.icon || 'gear');
  b.appendChild(ico);
  const main = el('span', 'pmain');
  main.appendChild(el('span', 'pname', o.name));
  if (o.meta) main.appendChild(el('span', 'pmeta', o.meta));
  b.appendChild(main);
  if (o.num != null) b.appendChild(el('span', 'pnum', String(o.num)));
  const chev = el('span', 'chev');
  fillIco(chev, 'chev');
  b.appendChild(chev);
  b.addEventListener('click', o.click);
  return b;
}
 function more(frag, total, shown) {
  if (total <= shown) return;
  const b = el('button', 'pmore', '加载更多（还有 ' + fmt(total - shown) + ' 个）');
  b.type = 'button';
  b.addEventListener('click', () => { L.limit += 60; renderL(); });
  frag.appendChild(b);
 }
function play(s) {
  const E = window.WW_EARTH;
  if (!E || !s) return;
  E.flyTo(s.lat, s.lon, 3.15);
  E.playStation(s);
  his = [compact(s), ...his.filter(x => !same(x, s))].slice(0, 40);
  save(KEY.his, his);
}
 function lPush(v, title, params) {
  L.stack.push(Object.assign({ v, title }, params || {}));
  L.limit = 60; renderL();
 }
 function rPush(v, title, params) {
  R.stack.push(Object.assign({ v, title }, params || {}));
  renderR();
 }

 /* ---------- 浮层提示 ---------- */
 let toastTimer = null;
 function toast(msg) {
  let t = $('wwToast');
  if (!t) {
   t = el('div'); t.id = 'wwToast'; t.setAttribute('role', 'status');
   document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
 }

 /* ---------- 左侧目录 ---------- */
 function crumbs(host, stack, back) {
  host.innerHTML = '';
  stack.forEach((it, i) => {
   if (i) host.appendChild(el('span', '', '›'));
   const b = el('button', '', it.title);
   b.type = 'button';
   b.addEventListener('click', () => { const s = stack.slice(0, i + 1); back(s); });
   host.appendChild(b);
  });
 }
function renderL() {
  const top = L.stack[L.stack.length - 1], body = $('lBody');
  crumbs($('lCrumb'), L.stack, s => { L.stack = s; L.limit = 120; renderL(); });
  $('lBack').disabled = L.stack.length <= 1;
  mountFilters(top.v === 'root');
  renderNowStrip();
  body.innerHTML = '';
  /* 快照到位前 stations 只有 6 个预置点；此时显示骨架屏，避免统计条短暂出现错误数字 */
  if (stations.length < 20) { body.appendChild(skeleton(7)); return; }
  const f = document.createDocumentFragment();
  switch (top.v) {
   case 'root': renderRoot(f); break;
   case 'list': renderStationList(f, top); break;
  }
  body.appendChild(f);
  $('lCount').textContent = fmt(stations.length) + ' 个点位';
}
/* 根视图：分类标签（单步筛选）+ 扁平电台列表，去掉多层钻取。 */
const CHIPS = [
  ['all', '全部'], ['cn', '中国'], ['亚洲', '亚洲'], ['欧洲', '欧洲'],
  ['北美洲', '北美洲'], ['非洲', '非洲'], ['南美洲', '南美洲'],
  ['大洋洲', '大洋洲'], ['hot', '热门'], ['fav', '收藏'], ['recent', '最近']
];
function filterStations(filter) {
  if (filter === 'all') return stations;
  if (filter === 'cn') return stations.filter(s => s.cn);
  if (filter === 'hot') return stations.filter(s => s.alts && s.alts.length)
    .sort((a, b) => b.alts.length - a.alts.length).slice(0, 300);
  if (filter === 'fav') return fav;
  if (filter === 'recent') return his;
  return stations.filter(s => continentOf(countryOf(s), s.lat, s.lon) === filter);
}
function labelOf(filter) {
  return { all: '全部电台', cn: '中国电台', hot: '热门电台', fav: '我的收藏', recent: '最近播放' }[filter]
   || (filter + '电台');
}
function chipRow() {
  const wrap = el('div', 'chips');
  CHIPS.forEach(([key, label]) => {
   const b = el('button', 'chip' + (L.filter === key ? ' on' : ''), label);
   b.type = 'button';
   b.dataset.k = key;
   b.setAttribute('aria-pressed', L.filter === key ? 'true' : 'false');
   b.addEventListener('click', () => setFilter(key));
   wrap.appendChild(b);
  });
  return wrap;
}
/* 分类标签挂在滚动区之外（#lFilter），列表下拉时保持固定；点击大洲标签同时把地球转到该大洲 */
const CHIP_VIEW = {
  'cn': [34.2, 104, 3.55],
  '亚洲': [30, 95, 5.6], '欧洲': [50, 14, 5.0], '北美洲': [45, -100, 5.4],
  '非洲': [3, 20, 5.4], '南美洲': [-17, -60, 5.2], '大洋洲': [-25, 141, 5.0]
};
function setFilter(key) {
  L.filter = key; L.limit = 120;
  const host = $('lFilter');
  if (host) [].forEach.call(host.querySelectorAll('.chip'), c => {
   const on = c.dataset.k === key;
   c.classList.toggle('on', on);
   c.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const body = $('lBody');
  if (body) {
   body.innerHTML = '';
   const f = document.createDocumentFragment();
   renderRoot(f);
   body.appendChild(f);
   body.scrollTop = 0;
  }
  const v = CHIP_VIEW[key], E = window.WW_EARTH;
  if (v && E && E.flyTo) E.flyTo(v[0], v[1], v[2], { dur: 1350 });
}
function mountFilters(show) {
  const host = $('lFilter');
  if (!host) return;
  host.hidden = !show;
  host.innerHTML = '';
  if (show) host.appendChild(chipRow());
}
/* 排序：默认（目录原序）/ 名称 / 热度（同点位备用流数量，真实可算） */
const SORTS = [['default', '默认'], ['name', '名称'], ['hot', '热度']];
function sortList(list) {
  const m = L.sort || 'default';
  if (m === 'name') return list.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN'));
  if (m === 'hot') return list.slice().sort((a, b) => ((b.alts || []).length - (a.alts || []).length));
  return list;
}
function sortBtn() {
  const cur = SORTS.find(x => x[0] === L.sort) || SORTS[0];
  const b = el('button', 'sortbtn');
  b.type = 'button';
  fillIco(b, 'sort');
  b.title = '排序方式：' + cur[1] + '，点击切换';
  b.setAttribute('aria-label', '切换排序方式，当前' + cur[1]);
  b.addEventListener('click', () => {
    const i = SORTS.findIndex(x => x[0] === L.sort);
    L.sort = SORTS[(i + 1) % SORTS.length][0];
    save(KEY.sort, L.sort);
    const body = $('lBody');
    if (body) {
      body.innerHTML = '';
      const fr = document.createDocumentFragment();
      renderRoot(fr);
      body.appendChild(fr);
    }
    toast('排序：' + (SORTS.find(x => x[0] === L.sort) || SORTS[0])[1]);
  });
  return b;
}
function statLine() {
  const cnCount = stations.filter(s => s.cn).length;
  const countries = new Set(stations.map(countryOf)).size;
  const w = el('div', 'statline');
  const st = el('div', 'stats');
  st.appendChild(el('b', '', fmt(stations.length)));
  st.appendChild(el('span', '', '台 ·'));
  st.appendChild(el('b', '', fmt(countries)));
  st.appendChild(el('span', '', '地区 ·'));
  st.appendChild(el('b', '', fmt(cnCount)));
  st.appendChild(el('span', '', '中国'));
  w.appendChild(st);
  const tools = el('div', 'tools');
  tools.appendChild(sortBtn());
  tools.appendChild(viewSwitch());
  w.appendChild(tools);
  return w;
}
/* 卡片 / 紧凑视图切换：本地记忆，切换只重绘列表 */
function viewSwitch() {
  const w = el('div', 'viewsw');
  [['card', 'grid', '卡片视图'], ['compact', 'list', '紧凑视图']].forEach(([k, ico, title]) => {
    const b = el('button', V.view === k ? 'on' : '');
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.setAttribute('aria-pressed', V.view === k ? 'true' : 'false');
    fillIco(b, ico);
    b.addEventListener('click', () => {
      if (V.view === k) return;
      V.view = k;
      save('ww.view.v1', k);
      renderL();
      toast(k === 'card' ? '卡片视图' : '紧凑视图 · 一屏看更多');
    });
    w.appendChild(b);
  });
  return w;
}
/* 左栏常驻「正在收听」条：播放态在任何滚动位置都可见 */
function renderNowStrip() {
  const host = $('lNow');
  if (!host) return;
  host.innerHTML = '';
  host.classList.toggle('idle', !current);
  const disc = el('div', 'ldisc');
  if (current) {
    const lab = el('span', '', (current.name || '?').trim().charAt(0).toUpperCase());
    const bg = logoBg(current);
    if (bg) lab.style.background = bg;
    disc.appendChild(lab);
  } else fillIco(disc, 'wave');
  host.appendChild(disc);
  const body = el('div', 'lbody');
  body.appendChild(el('span', 'lcap', current ? (mode === 'playing' ? '正在收听' : '已选择') : '待机'));
  const nm = el('div', 'lname');
  nm.appendChild(el('span', 'txt', current ? current.name : '选择一台开始收听'));
  if (current && mode === 'playing') { const e = el('span'); e.appendChild(eq()); nm.appendChild(e); }
  body.appendChild(nm);
  host.appendChild(body);
  const btn = el('button', 'lbtn');
  btn.type = 'button';
  if (current) {
    btn.innerHTML = mode === 'playing' ? ICON.pause : ICON.play;
    btn.title = mode === 'playing' ? '暂停' : '继续播放';
    btn.addEventListener('click', () => window.WW_EARTH.togglePlay());
  } else {
    btn.innerHTML = ICON.dice;
    btn.title = '随机听一台';
    btn.addEventListener('click', randomPlay);
  }
  btn.setAttribute('aria-label', btn.title);
  host.appendChild(btn);
}
/* 右栏可折叠区块 */
function fold(key, title, count, fill) {
  const box = el('div', 'wdsec' + (V.folds[key] ? ' open' : ''));
  const head = el('button');
  head.type = 'button';
  head.appendChild(el('span', '', title));
  head.appendChild(el('span', 'num', String(count)));
  const ch = el('span', 'chev');
  fillIco(ch, 'chev');
  head.appendChild(ch);
  head.addEventListener('click', () => {
    V.folds[key] = !V.folds[key];
    box.classList.toggle('open', !!V.folds[key]);
  });
  box.appendChild(head);
  const body = el('div', 'wdbody');
  fill(body);
  box.appendChild(body);
  return box;
}
/* 2×2 功能磁贴 */
function tile(o) {
  const b = el('button', 'wdtile');
  b.type = 'button';
  const ic = el('div', 'ti');
  fillIco(ic, o.icon);
  b.appendChild(ic);
  b.appendChild(el('div', 'tn', o.name));
  b.appendChild(el('div', 'tv' + (o.small ? ' sm' : ''), o.value));
  b.addEventListener('click', o.click);
  return b;
}
function renderRoot(f) {
  f.appendChild(statLine());
  if (L.filter === 'cn') { renderChina(f, sortList(filterStations('cn'))); return; }
  const items = sortList(filterStations(L.filter));
  if (!items.length) {
   f.appendChild(sec(labelOf(L.filter) + ' · 0 个'));
   if (L.filter === 'fav') {
    f.appendChild(empty('还没有收藏的电台\n点卡片右侧的星标就能收藏', 'star', [
     { label: '看热门电台', fn: () => setFilter('hot') },
     { label: '回到全部', fn: () => setFilter('all') }
    ]));
   } else if (L.filter === 'recent') {
    f.appendChild(empty('还没有收听记录\n播放后自动保留最近 40 条', 'his', [
     { label: '随机听一台', fn: randomPlay },
     { label: '看热门电台', fn: () => setFilter('hot') }
    ]));
   } else {
    f.appendChild(empty('这个分类下暂时没有电台\n换个标签，或在地球上点绿点收听', 'wave', [
     { label: '回到全部', fn: () => setFilter('all') }
    ]));
   }
   return;
  }
  f.appendChild(sec(labelOf(L.filter) + ' · ' + fmt(items.length) + ' 个'));
  renderStationRows(f, items, null, 'l');
}
function randomPlay() {
  if (!stations.length) return;
  play(stations[Math.floor(Math.random() * stations.length)]);
}
/* 中国电台：按 国家级 / 省级 / 市级 / 网络电台 四级直接平铺，层级标题内联，不额外钻取 */
function renderChina(f, items) {
  if (!items.length) { f.appendChild(empty('暂无中国电台数据')); return; }
  const order = ['国家级', '省级', '市级', '网络电台'];
  const byTier = {};
  items.forEach(s => { const t = s.tier || '网络电台'; (byTier[t] = byTier[t] || []).push(s); });
  order.forEach(t => {
   const list = byTier[t];
   if (!list || !list.length) return;
   f.appendChild(sec(t + ' · ' + list.length));
   list.forEach(s => f.appendChild(row({ name: s.name, meta: cityMeta(s), station: s,
    on: same(current, s), click: () => play(s) })));
  });
}
function renderStationList(f, top, side) {
  const items = top.items || [];
  const q = (top.query || '').trim().toLowerCase();
  const list = q ? rankList(items.filter(s => (s.name + ' ' + s.city).toLowerCase().indexOf(q) >= 0), q) : items;
  f.appendChild(sec(top.title + ' · ' + fmt(list.length) + ' 个电台'));
  if (!list.length) {
   f.appendChild(empty(q ? '没有匹配的电台\n换一个关键词，或试试城市名 / 国家名' : '这里还没有电台\n在地球上点一个绿点，即可开始收听', 'search', [
    { label: '看热门电台', fn: () => { L.stack = [{ v: 'root', title: '发现' }]; setFilter('hot'); } }
   ]));
   return;
  }
  renderStationRows(f, list, null, side);
}
function renderStationRows(f, list, title, side) {
  if (title) f.appendChild(sec(title));
  const isLeft = side !== 'r';
  const shown = Math.min(isLeft ? L.limit : 200, list.length);
  for (let i = 0; i < shown; i++) {
   const s = list[i];
   f.appendChild(row({ name: s.name, meta: cityMeta(s), station: s,
    on: same(current, s), click: () => play(s) }));
  }
  if (isLeft) more(f, list.length, shown);
  else if (list.length > shown) f.appendChild(empty('仅显示最近 ' + shown + ' 个，共 ' + fmt(list.length) + ' 个电台'));
}

 /* ---------- 右侧播放 / 功能 ---------- */
 function renderR() {
  const top = R.stack[R.stack.length - 1], body = $('rBody');
  crumbs($('rCrumb'), R.stack, s => { R.stack = s; renderR(); });
  $('rBack').disabled = R.stack.length <= 1;
  body.innerHTML = '';
  const f = document.createDocumentFragment();
  switch (top.v) {
   case 'now': renderNow(f); break;
   case 'list': renderStationList(f, top, 'r'); break;
   case 'settings': renderSettings(f); break;
   case 'about': renderAbout(f); break;
  }
  body.appendChild(f);
  eqVizUpdate();
  const st = $('rState');
  st.dataset.mode = mode;
  st.textContent = MODE_TXT[mode] || '就绪';
 }
 /* ===== EQ 与睡眠定时器 =====
    真实音频滤波需把 <audio> 接入 WebAudio，第三方电台流普遍不返回 CORS 头，
    接入后会静音。因此默认使用「视觉律动」模式：三段增益始终控制律动形态并持久化；
    只有明确开启、且流与页面同源时才建立 BiquadFilter 链，避免破坏播放。 */
 const EQ_KEY = 'ww.eq.v1';
 const EQ_PRESETS = {
  flat:   { name: '平直', g: [0, 0, 0] },
  vocal:  { name: '人声', g: [-3, 4, 2] },
  bass:   { name: '低音', g: [7, -1, 1] },
  bright: { name: '明亮', g: [-2, 1, 6] }
 };
 const EQ = Object.assign({ preset: 'flat', g: [0, 0, 0], real: false }, load(EQ_KEY, {}));
 if (!Array.isArray(EQ.g) || EQ.g.length !== 3) EQ.g = [0, 0, 0];
 const SLEEP = { deadline: 0, leftMin: 0, tick: null };
 let eqAudio = null;
 function saveEQ() { save(EQ_KEY, { preset: EQ.preset, g: EQ.g, real: EQ.real }); }
 function eqVizUpdate(root) {
  /* 允许传入尚未插入文档的局部容器，避免 querySelectorAll(document) 落空 */
  (root || document).querySelectorAll('.eqviz i').forEach((b, i) => {
   const band = Math.floor(i / 3), bump = (i % 3 === 1) ? 5 : 0;
   const g = EQ.g[band] || 0;
   b.style.setProperty('--h', (8 + (g + 12) / 24 * 16 + bump).toFixed(1) + 'px');
   b.style.setProperty('--d', (i * 0.14).toFixed(2) + 's');
  });
 }
 function eqApply() {
  if (eqAudio) {
   eqAudio.low.gain.value = EQ.g[0];
   eqAudio.mid.gain.value = EQ.g[1];
   eqAudio.high.gain.value = EQ.g[2];
  }
  eqVizUpdate();
 }
 function eqEnableReal(on) {
  const E = window.WW_EARTH, a = E && E.audio;
  if (!on) { EQ.real = false; saveEQ(); toast('已切回视觉律动模式'); return; }
  if (!a || !a.src) { EQ.real = false; saveEQ(); renderR(); return; }
  let same = false;
  try { same = new URL(a.src, location.href).origin === location.origin; } catch (e) { }
  if (!same) {
   EQ.real = false; saveEQ();
   toast('该电台流不开放跨域音频处理，真实 EQ 不可用');
   renderR(); return;
  }
  try {
   const C = window.AudioContext || window.webkitAudioContext;
   const ctx = new C(), src = ctx.createMediaElementSource(a);
   const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 200;
   const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = .8;
   const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 4000;
   src.connect(low); low.connect(mid); mid.connect(high); high.connect(ctx.destination);
   eqAudio = { ctx, low, mid, high };
   EQ.real = true; saveEQ(); eqApply(); toast('真实 EQ 已启用');
  } catch (e) {
   EQ.real = false; saveEQ(); toast('浏览器不支持音频处理'); renderR();
  }
 }
 function fmtSleep(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
 }
 function startSleep(min) {
  SLEEP.deadline = Date.now() + min * 60000;
  SLEEP.leftMin = min;
  clearInterval(SLEEP.tick);
  SLEEP.tick = setInterval(() => {
   const left = SLEEP.deadline - Date.now();
   if (left <= 0) {
    clearInterval(SLEEP.tick); SLEEP.tick = null; SLEEP.deadline = 0;
    const E = window.WW_EARTH;
    if (E && E.audio && !E.audio.paused) E.togglePlay();
    toast('睡眠定时已到 · 播放已暂停');
    renderR(); return;
   }
   const b = document.querySelector('.sleepdisp b');
   if (b) b.textContent = fmtSleep(left);
  }, 1000);
  toast('睡眠定时 ' + min + ' 分钟');
  renderR();
 }
 function cancelSleep() {
  clearInterval(SLEEP.tick); SLEEP.tick = null; SLEEP.deadline = 0;
  toast('已取消睡眠定时'); renderR();
 }
 function soundSection() {
  return fold('tools', '音效与定时', 'EQ', body => {
   const panel = el('div', 'eqpanel');
   const viz = el('div', 'eqviz');
   for (let i = 0; i < 9; i++) viz.appendChild(el('i'));
   panel.appendChild(viz);
   ['低频', '中频', '高频'].forEach((lab, i) => {
    const r = el('div', 'eqrow');
    r.appendChild(el('label', '', lab));
    const inp = el('input');
    inp.type = 'range'; inp.min = '-12'; inp.max = '12'; inp.step = '1';
    inp.value = String(EQ.g[i]);
    inp.setAttribute('aria-label', lab + '增益');
    const v = el('span', 'v', (EQ.g[i] > 0 ? '+' : '') + EQ.g[i] + ' dB');
    inp.addEventListener('input', () => {
     EQ.g[i] = parseInt(inp.value, 10);
     EQ.preset = 'custom'; saveEQ();
     v.textContent = (EQ.g[i] > 0 ? '+' : '') + EQ.g[i] + ' dB';
     eqApply();
     document.querySelectorAll('.eqpresets button').forEach(b => b.classList.remove('on'));
    });
    r.appendChild(inp); r.appendChild(v); panel.appendChild(r);
   });
   const pre = el('div', 'eqpresets');
   Object.keys(EQ_PRESETS).forEach(k => {
    const p = EQ_PRESETS[k];
    const b = el('button', EQ.preset === k ? 'on' : '', p.name);
    b.type = 'button';
    b.addEventListener('click', () => {
     EQ.preset = k; EQ.g = p.g.slice(); saveEQ(); renderR(); toast('EQ 预设 · ' + p.name);
    });
    pre.appendChild(b);
   });
   panel.appendChild(pre);
   const sw = el('label', 'eqswitch');
   const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!EQ.real;
   cb.addEventListener('change', () => eqEnableReal(cb.checked));
   sw.appendChild(cb);
   sw.appendChild(el('span', '', '启用真实音频滤波（仅同源流可用）'));
   panel.appendChild(sw);
   panel.appendChild(el('div', 'eqnote',
    '第三方电台流通常不提供 CORS，接入音频处理会导致静音；默认视觉律动模式，滑块与偏好始终生效。'));
   const sl = el('div', 'sleep');
   const row = el('div', 'sleeprow');
   [15, 30, 45, 60].forEach(m => {
    const b = el('button', (SLEEP.deadline && SLEEP.leftMin === m) ? 'on' : '', m + ' 分');
    b.type = 'button';
    b.addEventListener('click', () => startSleep(m));
    row.appendChild(b);
   });
   sl.appendChild(row);
   const disp = el('div', 'sleepdisp');
   const remain = SLEEP.deadline ? Math.max(0, SLEEP.deadline - Date.now()) : 0;
   disp.appendChild(el('span', '', SLEEP.deadline ? '剩余时间' : '睡眠定时'));
   disp.appendChild(el('b', '', SLEEP.deadline ? fmtSleep(remain) : '--:--'));
   if (SLEEP.deadline) {
    const c = el('button', '', '取消');
    c.type = 'button';
    c.addEventListener('click', cancelSleep);
    disp.appendChild(c);
   }
   sl.appendChild(disp);
   panel.appendChild(sl);
   body.appendChild(panel);
   eqVizUpdate(panel);
  });
 }

 function renderNow(f) {
  const E = window.WW_EARTH;
  if (!current) { renderIdle(f); return; }
  /* ---------- 正在播放 hero ---------- */
  const hero = el('div', 'nhero nstage');
  const st = el('div', 'nstate');
  const chip = el('div', 'nchip');
  chip.dataset.mode = mode;
  if (mode === 'playing') chip.appendChild(eq());
  chip.appendChild(el('span', '', ({ playing: '正在播放', loading: '正在连接', error: '播放失败', paused: '已暂停' })[mode] || '已选择'));
  st.appendChild(chip);
  if (current.cn && current.tier) {
   const pill = el('span', 'apill ' + tierClass(current.tier) + ' ntier', current.tier);
   st.appendChild(pill);
  }
  hero.appendChild(st);

  const main = el('div', 'nmain');
  const disc = el('div', 'disc' + (mode === 'playing' ? ' spin' : ''));
  const lab = el('div', 'dlabel ' + ((current.cn) ? 'g-cn' : continentGrad(current)));
  lab.textContent = (current.name || '?').trim().charAt(0).toUpperCase();
  const dbg = logoBg(current);
  if (dbg) lab.style.background = dbg;
  disc.appendChild(lab);
  disc.appendChild(el('div', 'dhole'));
  main.appendChild(disc);

  const body = el('div', 'nbody');
  body.appendChild(el('div', 'nname', current.name));
  const meta = el('div', 'nmeta');
  meta.appendChild(el('span', 'nm', cityMeta(current)));
  const host = hostOf(current);
  if (host) meta.appendChild(el('span', 'nsrc', host));
  if (current.alts && current.alts.length) {
   const t = el('span', 'malt', '同址 ' + (current.alts.length + 1) + ' 台');
   t.title = '同一坐标共 ' + (current.alts.length + 1) + ' 台电台';
   meta.appendChild(t);
  }
  body.appendChild(meta);
  main.appendChild(body);
  hero.appendChild(main);

  /* ---------- 主控制条：4 个圆形次级操作围绕 44px 播放主钮 ---------- */
  const acts = el('div', 'nactions');
  const iconBtn = (kind, title, fn, cls) => {
   const b = el('button', 'nbtn icon' + (cls ? ' ' + cls : ''));
   b.type = 'button';
   b.innerHTML = ICON[kind];
   b.title = title;
   b.setAttribute('aria-label', title);
   b.addEventListener('click', fn);
   acts.appendChild(b);
   return b;
  };
  iconBtn(isFav(current) ? 'starOn' : 'star', isFav(current) ? '取消收藏' : '收藏这台', () => {
   if (isFav(current)) { fav = fav.filter(x => !same(x, current)); toast('已取消收藏'); }
   else { fav = [compact(current), ...fav].slice(0, 200); toast('已收藏 · ' + current.name); }
   save(KEY.fav, fav);
   syncFav(current);
   renderR();
   if (L.stack[L.stack.length - 1].v === 'root') renderL();
  }, isFav(current) ? 'on' : '');
  iconBtn('loc', '在地球上定位', () => E.flyTo(current.lat, current.lon, 3.2));
  const play = el('button', 'nbtn primary');
  play.type = 'button';
  play.innerHTML = (mode === 'playing' ? ICON.pause : ICON.play) + '<span>' + (mode === 'playing' ? '暂停' : '播放') + '</span>';
  play.title = mode === 'playing' ? '暂停播放' : '继续播放';
  play.setAttribute('aria-label', play.title);
  play.addEventListener('click', () => E.togglePlay());
  acts.appendChild(play);
  iconBtn('link', '复制分享链接', () => {
   const url = location.href.split('#')[0] + '#@' + current.lat.toFixed(4) + ',' + current.lon.toFixed(4) + ',3.2';
   if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast('链接已复制到剪贴板')).catch(() => toast(url));
   else toast(url);
  });
  iconBtn('dice', '随机听一台', randomPlay);
  hero.appendChild(acts);

  f.appendChild(hero);
  f.appendChild(soundSection());

  /* ---------- 同址电台：可折叠（默认展开） ---------- */
  const AS = E.altState;
  if (AS && AS.list.length > 1) {
   f.appendChild(fold('alt', '同址电台', AS.list.length + ' 台', body => {
    AS.list.forEach(item => {
     const on = item.j === AS.idx;
     const b = el('button', 'nalt' + (on ? ' on' : ''));
     b.type = 'button';
     b.appendChild(el('span', 'idx', String(item.j + 1)));
     b.appendChild(el('span', 'nm', item.name));
     if (on) b.appendChild(el('span', 'now', '当前'));
     b.addEventListener('click', () => {
      if (on) return;
      E.playAlt(item.j);
      toast('已切换 · ' + item.name);
      setTimeout(renderR, 80);
     });
     body.appendChild(b);
    });
   }));
  }

  /* ---------- 附近电台：可折叠（默认收起，减少长滚动） ---------- */
  const near = stations.filter(s => !same(s, current))
   .map(s => ({ s, d: distKm(current, s) })).sort((a, b) => a.d - b.d).slice(0, 5);
  f.appendChild(fold('near', '附近电台', near.length, body => {
   near.forEach(x => body.appendChild(row({ name: x.s.name, station: x.s,
    meta: cityShort(x.s), dist: x.d, click: () => play(x.s) })));
   const all = el('button', 'pmore', '查看附近全部电台');
   all.type = 'button';
   all.addEventListener('click', () => {
    const list = stations.filter(s => !same(s, current)).map(s => ({ s, d: distKm(current, s) }))
     .sort((a, b) => a.d - b.d).slice(0, 200).map(x => x.s);
    rPush('list', '附近', { items: list });
   });
   body.appendChild(all);
  }));
  renderFeatures(f);
 }
 /* 未播放时的右栏：把空白变成可行动的入口 */
 function renderIdle(f) {
  const hero = el('div', 'nhero idle nstage');
  const st = el('div', 'nstate');
  const chip = el('div', 'nchip');
  chip.dataset.mode = 'idle';
  chip.appendChild(el('span', '', '待机'));
  st.appendChild(chip);
  hero.appendChild(st);
  const main = el('div', 'nmain');
  const disc = el('div', 'disc');
  const lab = el('div', 'dlabel g-ot');
  fillIco(lab, 'wave');
  disc.appendChild(lab);
  disc.appendChild(el('div', 'dhole'));
  main.appendChild(disc);
  const body = el('div', 'nbody');
  body.appendChild(el('div', 'nname', '选择一台电台'));
  const meta = el('div', 'nmeta');
  meta.appendChild(el('span', 'nm', '点地球上的绿点，或从左侧目录挑选'));
  body.appendChild(meta);
  main.appendChild(body);
  hero.appendChild(main);
  const acts = el('div', 'nactions');
  const b1 = el('button', 'nbtn primary');
  b1.type = 'button';
  b1.innerHTML = ICON.dice + '<span>随机听一台</span>';
  b1.addEventListener('click', randomPlay);
  acts.appendChild(b1);
  const b2 = el('button', 'nbtn icon');
  b2.type = 'button';
  b2.innerHTML = ICON.panel;
  b2.title = '展开左侧目录';
  b2.setAttribute('aria-label', '展开左侧电台目录');
  b2.addEventListener('click', () => setPanel('left', true, true));
  acts.appendChild(b2);
  hero.appendChild(acts);
  f.appendChild(hero);
  f.appendChild(soundSection());

  /* 待机时把内容收进可折叠区块，避免一大片长滚动 */
  if (his.length) {
   const recent = his.slice(0, 3);
   f.appendChild(fold('resume', '继续收听', recent.length, body => {
    recent.forEach(s => body.appendChild(row({ name: s.name, station: s,
     meta: cityMeta(s), click: () => play(s) })));
   }));
  }
  const hot = filterStations('hot').filter(s => !his.some(x => same(x, s))).slice(0, 4);
  if (hot.length) {
   f.appendChild(fold('hot', '热门电台', hot.length, body => {
    hot.forEach(s => body.appendChild(row({ name: s.name, station: s,
     meta: cityShort(s), click: () => play(s) })));
   }));
  }
  renderFeatures(f);
 }
 /* 功能入口：真实数值用等宽数字，空值显示 — */
 function renderFeatures(f) {
  const g = el('div', 'wdtiles');
  g.appendChild(tile({ icon: 'fav', name: '我的收藏',
   value: fav.length ? fmt(fav.length) : '—', click: () => rPush('list', '收藏', { items: fav }) }));
  g.appendChild(tile({ icon: 'his', name: '最近播放',
   value: his.length ? fmt(his.length) : '—', click: () => rPush('list', '最近', { items: his }) }));
  g.appendChild(tile({ icon: 'gear', name: '显示与画质', value: '画质 · 旋转 · 地名', small: true,
   click: () => rPush('settings', '设置') }));
  g.appendChild(tile({ icon: 'info', name: '快捷键与关于', value: '操作说明 · 版本', small: true,
   click: () => rPush('about', '关于') }));
  f.appendChild(g);
 }
 function renderSettings(f) {
  const E = window.WW_EARTH;
  f.appendChild(sec('显示'));
  f.appendChild(segRow('画质模式', '自动按帧率调整采样倍率', [['自动', 'auto'], ['高清', 'high'], ['省电', 'eco']],
   settings.quality || 'auto', v => { settings.quality = v; save(KEY.set, settings); E.setQualityMode(v); renderR(); }));
  f.appendChild(segRow('自动旋转', '交互后会自动停止', [['开', '1'], ['关', '0']],
   settings.rotate === false ? '0' : '1', v => { settings.rotate = v === '1'; save(KEY.set, settings); E.setAutoRotate(settings.rotate); renderR(); }));
  f.appendChild(segRow('地图地名', '大洲与国家名称', [['显示', '1'], ['隐藏', '0']],
   settings.labels === false ? '0' : '1', v => { settings.labels = v === '1'; save(KEY.set, settings); E.setLabelsVisible(settings.labels); renderR(); }));
  f.appendChild(segRow('电台绿点', '所有坐标点', [['显示', '1'], ['隐藏', '0']],
   settings.points === false ? '0' : '1', v => { settings.points = v === '1'; save(KEY.set, settings); E.setPointsVisible(settings.points); renderR(); }));
  f.appendChild(sec('音量'));
  const volWrap = el('div', 'volrow');
  const vol = el('input');
  vol.type = 'range'; vol.min = '0'; vol.max = '1'; vol.step = '0.05';
  vol.setAttribute('aria-label', '音量');
  const volPct = el('span', 'volval', Math.round(E.audio.volume * 100) + '%');
  vol.value = String(E.audio.volume);
  vol.addEventListener('input', () => {
   E.audio.volume = parseFloat(vol.value);
   volPct.textContent = Math.round(E.audio.volume * 100) + '%';
   const bottom = $('rVol'); if (bottom) bottom.value = vol.value;
   try { localStorage.setItem('ww.volume.v2', vol.value); } catch (e) { /* noop */ }
  });
  volWrap.appendChild(vol); volWrap.appendChild(volPct);
  f.appendChild(volWrap);
  f.appendChild(sec('运行状态'));
  const info = E.info;
  [['电台点位', fmt(info.count)], ['采样倍率', info.quality], ['画质模式', info.qualityMode],
   ['绘制调用', info.render.calls], ['三角面', fmt(info.render.triangles)],
   ['卫星瓦片', info.tiles.ready ? '已加载 ' + info.tiles.key : '未启用（远景或网络不可用）']]
   .forEach(([k, v]) => { const d = el('div', 'kv'); d.appendChild(el('span', '', k)); d.appendChild(el('b', '', String(v))); f.appendChild(d); });
  const reset = el('button', 'pmore', '恢复默认设置');
  reset.type = 'button';
  reset.addEventListener('click', () => {
   settings = {}; save(KEY.set, settings); applySettings(); renderR();
   toast('已恢复默认设置');
  });
  f.appendChild(reset);
 }
 function segRow(name, hint, opts, cur, pick) {
  const r = el('div', 'setrow');
  const left = el('div');
  left.appendChild(el('span', '', name));
  left.appendChild(el('small', '', hint));
  r.appendChild(left);
  const seg = el('div', 'seg');
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', name);
  opts.forEach(([label, val]) => {
   const b = el('button', String(val) === String(cur) ? 'on' : '', label);
   b.type = 'button';
   b.setAttribute('role', 'radio');
   b.setAttribute('aria-checked', String(String(val) === String(cur)));
   b.addEventListener('click', () => pick(val));
   seg.appendChild(b);
  });
  r.appendChild(seg);
  return r;
 }
 function renderAbout(f) {
  f.appendChild(sec('操作'));
  [['拖拽 / 方向键', '旋转地球'], ['滚轮 / + -', '缩放（0 复位）'], ['点击绿点', '播放该点电台'],
   ['/ 或 ⌕', '搜索电台'], ['Space', '播放 / 暂停'], ['G', '收藏当前电台'], ['N', '随机听一台'],
   ['↑ ↓', '在列表中移动选择'], ['F', '影院模式（收起面板）'], ['Esc', '停止 / 关闭搜索'],
   ['卡片 / 紧凑', '左栏统计条右侧切换列表密度']]
   .forEach(([k, v]) => { const d = el('div', 'kv'); d.appendChild(el('span', '', k)); d.appendChild(el('b', '', v)); f.appendChild(d); });
  f.appendChild(sec('数据'));
  [['电台目录', 'Radio Browser 社区公开目录'], ['卫星影像', 'Esri World Imagery / Maxar'],
   ['地球底图', '8K Blue Marble 日面 + 夜灯'], ['点位数量', fmt(stations.length) + ' 个真实经纬度']]
   .forEach(([k, v]) => { const d = el('div', 'kv'); d.appendChild(el('span', '', k)); d.appendChild(el('b', '', String(v))); f.appendChild(d); });
  const meta = document.querySelector('meta[name="ww-build"]');
  if (meta) { const d = el('div', 'kv'); d.appendChild(el('span', '', '构建版本')); d.appendChild(el('b', '', meta.content)); f.appendChild(d); }
  f.appendChild(empty('电台流由第三方提供，可能随时失效\n页面会自动记录失败并跳过', 'info'));
 }

 /* 播放状态变化时就地更新 hero（不整栏重绘，避免丢失滚动位置与焦点） */
 function syncHeroMode() {
  const chip = document.querySelector('.nhero .nchip');
  if (chip) {
   chip.dataset.mode = mode;
   chip.innerHTML = '';
   if (mode === 'playing') chip.appendChild(eq());
   chip.dataset.mode = current ? mode : 'idle';
   chip.appendChild(el('span', '', !current ? '待机' : (({ playing: '正在播放', loading: '正在连接', error: '播放失败', paused: '已暂停' })[mode] || '已选择')));
  }
  const play = document.querySelector('.nhero .nbtn.primary');
  if (play) {
   play.innerHTML = (mode === 'playing' ? ICON.pause : ICON.play) + '<span>' + (mode === 'playing' ? '暂停' : '播放') + '</span>';
   play.title = mode === 'playing' ? '暂停播放' : '继续播放';
  }
  const disc = document.querySelector('.nhero .disc');
  if (disc) disc.classList.toggle('spin', mode === 'playing');
 }

 /* ---------- 折叠 / 事件 ---------- */
 function setPanel(side, open, persist) {
  document.body.dataset[side] = open ? '1' : '0';
  const panel = $(side === 'left' ? 'leftPanel' : 'rightPanel');
  const w = panel ? panel.offsetWidth : 288;
  document.documentElement.style.setProperty(side === 'left' ? '--lw' : '--rw', open ? w + 'px' : '0px');
  if (persist) save(side === 'left' ? KEY.left : KEY.right, open ? '1' : '0');
 }
 function applySettings() {
  const E = window.WW_EARTH;
  E.setQualityMode(settings.quality || 'auto');
  E.setAutoRotate(settings.rotate !== false);
  E.setLabelsVisible(settings.labels !== false);
  E.setPointsVisible(settings.points !== false);
 }
 /* 面板列表内 ↑↓ 键盘导航：在可见行之间移动焦点 */
 function bindArrowNav(bodyId) {
  const body = $(bodyId);
  if (!body) return;
  body.addEventListener('keydown', e => {
   if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
   const rows = Array.from(body.querySelectorAll('button')).filter(b => !b.disabled && b.offsetParent);
   if (!rows.length) return;
   const i = rows.indexOf(document.activeElement);
   const n = i < 0 ? 0 : (e.key === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1));
   rows[n].focus();
   e.preventDefault();
  });
 }
 function bind() {
  $('lBack').addEventListener('click', () => { if (L.stack.length > 1) { L.stack.pop(); L.limit = 60; renderL(); } });
  $('rBack').addEventListener('click', () => { if (R.stack.length > 1) { R.stack.pop(); renderR(); } });
  $('lCollapse').addEventListener('click', () => setPanel('left', false, true));
  $('rCollapse').addEventListener('click', () => setPanel('right', false, true));
  $('leftTab').addEventListener('click', () => setPanel('left', true, true));
  $('rightTab').addEventListener('click', () => setPanel('right', true, true));
  bindArrowNav('lBody');
  bindArrowNav('rBody');
  let searchTimer = null;
  $('lSearch').addEventListener('input', e => {
   clearTimeout(searchTimer);
   const q = e.target.value.trim();
   searchTimer = setTimeout(() => {
    if (!q) {
     if (L.stack[L.stack.length - 1].v === 'search') L.stack.pop();
     renderL(); return;
    }
    const needle = q.toLowerCase();
    const items = rankList(stations.filter(s => (s.name + ' ' + s.city).toLowerCase().indexOf(needle) >= 0), needle).slice(0, 400);
    L.stack = [{ v: 'root', title: '发现' }, { v: 'list', title: '搜索', query: q, items }];
    L.limit = 60; renderL();
   }, 140);
  });
  $('lSearch').addEventListener('keydown', e => {
   if (e.key === 'Escape') { e.target.value = ''; if (L.stack[L.stack.length - 1].v === 'search') L.stack.pop(); renderL(); e.target.blur(); }
  });
  window.addEventListener('ww:select', e => {
   current = e.detail.station;
   his = [compact(current), ...his.filter(x => !same(x, current))].slice(0, 40);
   save(KEY.his, his);
   R.stack = [{ v: 'now', title: '播放' }];
   renderR(); renderL();
   /* 播放行滚动到可见范围（若当前列表包含它） */
   const on = $('lBody') && $('lBody').querySelector('.prow.on');
   if (on) on.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  window.addEventListener('ww:stop', () => { current = null; renderR(); renderL(); });
  window.addEventListener('ww:mode', e => {
   mode = e.detail.mode;
   const t = $('rState');
   if (t) { t.dataset.mode = mode; t.textContent = MODE_TXT[mode] || '就绪'; }
   syncHeroMode();
   renderNowStrip();
  });
  window.addEventListener('ww:catalog', () => {
   stations = window.WW_EARTH.stations;
   rebuildIndex(); renderL(); renderR();
  });
  /* 窗口尺寸变化会改变窄屏下的面板宽度，需同步 CSS 变量以免影响底部控制条宽度 */
  window.addEventListener('resize', () => {
   setPanel('left', document.body.dataset.left === '1', false);
   setPanel('right', document.body.dataset.right === '1', false);
  });
  /* F：影院模式，一键收起 / 恢复两侧面板 */
  window.addEventListener('keydown', e => {
   if (e.key !== 'f' && e.key !== 'F') return;
   const tag = e.target && e.target.tagName;
   if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
   const open = document.body.dataset.left === '1' || document.body.dataset.right === '1';
   setPanel('left', !open, true);
   setPanel('right', !open, true);
  });
  /* WAVE DECK 快捷键：Space 播放/暂停、G 收藏当前台、N 随机一台 */
  window.addEventListener('keydown', e => {
   const tag = e.target && e.target.tagName;
   if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
   const E = window.WW_EARTH;
   if (e.code === 'Space') {
    if (tag === 'BUTTON' || tag === 'SELECT') return;
    e.preventDefault();
    if (current && E) E.togglePlay(); else randomPlay();
   } else if (e.key === 'g' || e.key === 'G') {
    if (!current) return;
    if (isFav(current)) { fav = fav.filter(x => !same(x, current)); toast('已取消收藏'); }
    else { fav = [compact(current), ...fav].slice(0, 200); toast('已收藏 · ' + current.name); }
    save(KEY.fav, fav); syncFav(current); renderR(); renderL();
   } else if (e.key === 'n' || e.key === 'N') {
    randomPlay();
   }
  });
 }
 function valid(s) {
  return s && typeof s.name === 'string' && Number.isFinite(s.lat) && Number.isFinite(s.lon) &&
   typeof s.stream === 'string' && s.stream.indexOf('https://') === 0 &&
   Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180;
 }
 function boot() {
  if (!window.WW_EARTH) return setTimeout(boot, 60);
  /* localStorage 可能被手工篡改或来自旧版本，先清洗再渲染，避免 NaN 坐标污染相机 */
  fav = (Array.isArray(fav) ? fav : []).filter(valid);
  his = (Array.isArray(his) ? his : []).filter(valid);
  stations = window.WW_EARTH.stations;
  rebuildIndex();
  applySettings();
  const narrow = window.innerWidth < 1100;
  const lv = localStorage.getItem(KEY.left), rv = localStorage.getItem(KEY.right);
  setPanel('left', lv === null ? !narrow : lv === '1', false);
  setPanel('right', rv === null ? !narrow : rv === '1', false);
  bind(); renderL(); renderR();
 }
 boot();
})();
