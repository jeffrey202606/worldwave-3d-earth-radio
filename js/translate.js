/* WORLDWAVE — 实时语音内容翻译框
 * ---------------------------------------------------------------------------
 * 取代中间底部旧播放条。两层免费能力，全部无需 API Key、无需后端：
 *
 *   ① 语音 → 文字：浏览器内置 Web Speech API（Chrome / Edge 自带，免费、无密钥）。
 *      识别麦克风 / 系统声音，continuous + interimResults 逐句输出。
 *   ② 文字 → 译文：免费公共 AI 大模型翻译接口，三级自动降级：
 *        AI 大模型   Pollinations  text.pollinations.ai    （CORS: *，开放式 LLM）
 *        快速接口    MyMemory      api.mymemory.translated.net（CORS: *，自动检测源语言）
 *        Google      translate.googleapis.com/translate_a/single（国内常被墙，兜底）
 *
 * 已知边界（并在界面里如实写明）：
 *   - 公开电台流绝大多数不带 CORS 头，浏览器不能通过 WebAudio 读取跨域音频 PCM；
 *     强行 createMediaElementSource 反而会让声音变哑，所以这里绝不劫持播放链路。
 *   - 浏览器语音识别使用默认音频输入设备，需要用户授权麦克风；要「纯线路录音」
 *     可在系统里把立体声混音设为默认输入，或直接用下方输入框粘贴文字。
 *   - 免费公共接口有配额 / 限流，因此做了超时、降级和手动切换引擎。
 *
 * 对外只暴露 window.WW_TRANS（状态、语言表、注入文本、翻译、控制），便于自检。
 * 普通脚本，无框架、无构建依赖；CSP connect-src 'self' https: 已允许上述 https 端点。
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var KEY = 'ww.trans.v1';
  var MAX_LINES = 40;

  /* 目标语言：主流语种，含简体中文 */
  var LANGS = [
    { c: 'zh-CN', n: '简体中文', mm: 'zh-CN', gx: 'zh-CN', ai: 'Simplified Chinese' },
    { c: 'en',    n: 'English',  mm: 'en',    gx: 'en',    ai: 'English' },
    { c: 'ja',    n: '日本語',   mm: 'ja',    gx: 'ja',    ai: 'Japanese' },
    { c: 'ko',    n: '한국어',   mm: 'ko',    gx: 'ko',    ai: 'Korean' },
    { c: 'es',    n: 'Español',  mm: 'es',    gx: 'es',    ai: 'Spanish' },
    { c: 'fr',    n: 'Français', mm: 'fr',    gx: 'fr',    ai: 'French' },
    { c: 'de',    n: 'Deutsch',  mm: 'de',    gx: 'de',    ai: 'German' },
    { c: 'ru',    n: 'Русский',  mm: 'ru',    gx: 'ru',    ai: 'Russian' },
    { c: 'pt',    n: 'Português',mm: 'pt',    gx: 'pt',    ai: 'Portuguese' },
    { c: 'it',    n: 'Italiano', mm: 'it',    gx: 'it',    ai: 'Italian' },
    { c: 'ar',    n: 'العربية',  mm: 'ar',    gx: 'ar',    ai: 'Arabic' }
  ];

  /* 源语言：c 同时用作 MyMemory / Google 的语种码，s 是 Web Speech 的 BCP-47 */
  var SOURCES = [
    { c: 'auto', n: '自动',        s: '' },
    { c: 'en',   n: '英语',        s: 'en-US' },
    { c: 'es',   n: '西班牙语',    s: 'es-ES' },
    { c: 'fr',   n: '法语',        s: 'fr-FR' },
    { c: 'de',   n: '德语',        s: 'de-DE' },
    { c: 'ja',   n: '日语',        s: 'ja-JP' },
    { c: 'ko',   n: '韩语',        s: 'ko-KR' },
    { c: 'ru',   n: '俄语',        s: 'ru-RU' },
    { c: 'pt',   n: '葡萄牙语',    s: 'pt-BR' },
    { c: 'it',   n: '意大利语',    s: 'it-IT' },
    { c: 'ar',   n: '阿拉伯语',    s: 'ar-SA' },
    { c: 'zh-CN',n: '中文',        s: 'zh-CN' },
    { c: 'nl',   n: '荷兰语',      s: 'nl-NL' },
    { c: 'pl',   n: '波兰语',      s: 'pl-PL' },
    { c: 'tr',   n: '土耳其语',    s: 'tr-TR' },
    { c: 'hi',   n: '印地语',      s: 'hi-IN' }
  ];

  /* 站点城市串 → 识别语种，用于「自动」模式下按电台所在地区猜语种 */
  var COUNTRY_LANG = [
    ['united states', 'en-US'], ['united kingdom', 'en-GB'], ['england', 'en-GB'],
    ['australia', 'en-AU'], ['canada', 'en-CA'], ['ireland', 'en-IE'],
    ['new zealand', 'en-NZ'], ['singapore', 'en-SG'], ['south africa', 'en-ZA'],
    ['nigeria', 'en-NG'], ['india', 'hi-IN'],
    ['brazil', 'pt-BR'], ['巴西', 'pt-BR'], ['portugal', 'pt-PT'],
    ['spain', 'es-ES'], ['西班牙', 'es-ES'], ['méxico', 'es-MX'], ['mexico', 'es-MX'],
    ['argentina', 'es-AR'], ['colombia', 'es-CO'], ['chile', 'es-CL'], ['peru', 'es-PE'],
    ['venezuela', 'es-VE'], ['cuba', 'es-CU'], ['ecuador', 'es-EC'], ['uruguay', 'es-UY'],
    ['bolivia', 'es-BO'], ['guatemala', 'es-GT'], ['puerto rico', 'es-PR'],
    ['france', 'fr-FR'], ['法国', 'fr-FR'], ['belgium', 'fr-BE'], ['monaco', 'fr-FR'],
    ['germany', 'de-DE'], ['德国', 'de-DE'], ['austria', 'de-AT'], ['switzerland', 'de-CH'],
    ['italy', 'it-IT'], ['意大利', 'it-IT'],
    ['japan', 'ja-JP'], ['日本', 'ja-JP'], ['korea', 'ko-KR'], ['韩国', 'ko-KR'],
    ['china', 'zh-CN'], ['中国', 'zh-CN'], ['hong kong', 'zh-HK'], ['macao', 'zh-HK'],
    ['macau', 'zh-HK'], ['taiwan', 'zh-TW'],
    ['russia', 'ru-RU'], ['俄罗斯', 'ru-RU'], ['ukraine', 'uk-UA'],
    ['poland', 'pl-PL'], ['netherlands', 'nl-NL'], ['turkey', 'tr-TR'],
    ['greece', 'el-GR'], ['sweden', 'sv-SE'], ['norway', 'nb-NO'],
    ['denmark', 'da-DK'], ['finland', 'fi-FI'],
    ['egypt', 'ar-EG'], ['saudi', 'ar-SA'], ['morocco', 'ar-MA'], ['algeria', 'ar-DZ'],
    ['tunisia', 'ar-TN'], ['iraq', 'ar-IQ'], ['united arab', 'ar-AE'],
    ['israel', 'he-IL'], ['iran', 'fa-IR'], ['thailand', 'th-TH'],
    ['vietnam', 'vi-VN'], ['indonesia', 'id-ID'], ['philippines', 'fil-PH']
  ];

  var ENGINE_MODES = [
    { v: 'auto',   n: 'AI 优先 · 降级' },
    { v: 'ai',     n: '仅 AI 大模型' },
    { v: 'fast',   n: '仅快速接口' },
    { v: 'google', n: '仅 Google' }
  ];
  var ENGINE_LABEL = { ai: 'AI 大模型', fast: '快速接口', google: 'Google' };

  function defaults() {
    return { target: 'zh-CN', source: 'auto', engine: 'auto', folded: false };
  }
  function loadCfg() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || '{}');
      var o = defaults();
      if (d && typeof d === 'object') {
        if (typeof d.target === 'string') o.target = d.target;
        if (typeof d.source === 'string') o.source = d.source;
        if (typeof d.engine === 'string') o.engine = d.engine;
        o.folded = !!d.folded;
      }
      return o;
    } catch (e) { return defaults(); }
  }
  function saveCfg() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* noop */ } }

  var cfg = loadCfg();
  var lines = [];
  var seq = 0;
  var listening = false, recWanted = false, rec = null, restartTimer = 0;
  var interim = '', lastFinal = '', netErr = 0;
  var station = null, lastEngine = '', lastDetected = '';
  var busy = 0, errState = '', errTimer = 0;

  function target() {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i].c === cfg.target) return LANGS[i];
    return LANGS[0];
  }
  function langName(code) {
    if (!code) return '';
    var c = String(code).split('-')[0].toLowerCase();
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i].c.split('-')[0].toLowerCase() === c) return LANGS[i].n;
    for (var j = 0; j < SOURCES.length; j++) if (SOURCES[j].c.split('-')[0].toLowerCase() === c) return SOURCES[j].n;
    return c.toUpperCase();
  }
  function guessSpeech(st) {
    if (!st) return '';
    if (st.cn) return 'zh-CN';
    var city = String(st.city || '').toLowerCase();
    for (var i = 0; i < COUNTRY_LANG.length; i++) {
      if (city.indexOf(COUNTRY_LANG[i][0]) >= 0) return COUNTRY_LANG[i][1];
    }
    return '';
  }
  function speechLang() {
    if (cfg.source && cfg.source !== 'auto') {
      for (var i = 0; i < SOURCES.length; i++) if (SOURCES[i].c === cfg.source) return SOURCES[i].s;
      return cfg.source;
    }
    var g = guessSpeech(station);
    if (g) return g;
    return navigator.language || 'en-US';
  }
  /* 语音识别出的句子可用电台所在地区辅助翻译；手动输入的文字一律自动检测 */
  function fromStation() {
    if (cfg.source && cfg.source !== 'auto') return cfg.source;
    var g = guessSpeech(station);
    if (!g) return 'auto';
    if (g.indexOf('zh') === 0) return 'zh-CN';
    return g.split('-')[0];
  }

  /* ---------- 免费翻译接口 ---------- */
  function fetchText(url, ms, asJson) {
    var ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ac) ac.abort(); }, ms);
    var opt = { credentials: 'omit', referrerPolicy: 'no-referrer' };
    if (ac) opt.signal = ac.signal;
    return fetch(url, opt).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return asJson ? r.json() : r.text();
    }).then(function (v) { clearTimeout(timer); return v; }, function (e) { clearTimeout(timer); throw e; });
  }
  function clean(s) {
    var x = String(s == null ? '' : s).trim();
    x = x.replace(/^```[a-z]*\s*/i, '').replace(/```$/, '').trim();
    x = x.replace(/^(翻译|译文|翻译结果|Translation|Translated text|Output)\s*[:：]\s*/i, '');
    x = x.replace(/^["'“”‘’「」《》]+|["'“”‘’「」《》]+$/g, '');
    x = x.replace(/\s+/g, ' ').trim();
    return x;
  }
  /* ① 免费 AI 大模型：Pollinations 开放式文本推理，GET 免密钥，返回纯文本 */
  function trAI(text, from) {
    var t = target();
    var hint = (from && from !== 'auto')
      ? 'The source language is ' + langName(from) + '. '
      : 'Detect the source language automatically. ';
    /* 提示词保持极短：Pollinations 冷启动耗时与 token 数强相关，长提示会拖到 9s+ */
    var prompt = 'Translate into ' + t.ai + ' as a live radio subtitle. ' + hint +
      'Output ONLY the translation, nothing else.\n' + text;
    var url = 'https://text.pollinations.ai/' + encodeURIComponent(prompt) + '?model=openai';
    return fetchText(url, 11000, false).then(function (out) {
      var v = clean(out);
      if (!v) throw new Error('AI 返回空内容');
      return { text: v, detected: from === 'auto' ? '' : from };
    });
  }
  /* ② MyMemory：官方免费额度，支持 autodetect 并回传 detectedLanguage */
  function trFast(text, from) {
    var lp = (from && from !== 'auto' ? from : 'autodetect') + '|' + target().mm;
    var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) +
      '&langpair=' + encodeURIComponent(lp);
    return fetchText(url, 7000, true).then(function (d) {
      var rd = d && d.responseData;
      var out = rd && rd.translatedText;
      if (!out || /MYMEMORY WARNING|QUERY LENGTH LIMIT|PLEASE SELECT TWO DISTINCT/i.test(out)) {
        throw new Error('快速接口：' + (d && d.responseDetails || out || '空结果'));
      }
      return {
        text: clean(out),
        detected: (rd.detectedLanguage || '').split('-')[0] || (from !== 'auto' ? from : '')
      };
    });
  }
  /* ③ Google 非官方公开端点：国内常被阻断，只作最后兜底 */
  function trGoogle(text, from) {
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' +
      encodeURIComponent(from && from !== 'auto' ? from : 'auto') +
      '&tl=' + encodeURIComponent(target().gx) + '&dt=t&q=' + encodeURIComponent(text);
    return fetchText(url, 5000, true).then(function (d) {
      var parts = d && d[0] ? d[0].filter(function (x) { return x && x[0]; })
        .map(function (x) { return x[0]; }).join('') : '';
      var v = clean(parts);
      if (!v) throw new Error('Google 返回空内容');
      return { text: v, detected: (d && d[2] ? String(d[2]).split('-')[0] : '') || '' };
    });
  }
  var ENGINE_FN = { ai: trAI, fast: trFast, google: trGoogle };

  function wrap(p, id) {
    return p.then(function (r) { return { ok: true, r: r, id: id }; },
                  function (e) { return { ok: false, e: e, id: id }; });
  }
  function pack(x) {
    return { text: x.r.text, engine: ENGINE_LABEL[x.id], id: x.id, detected: x.r.detected || '' };
  }
  function onlyOk(p) {
    /* 失败的请求变成「永不 resolve」，这样 Promise.race 只会等成功的那个 */
    return p.then(function (x) { return x.ok ? x : new Promise(function () {}); });
  }
  /* 自动模式：并行请求「免费 AI 大模型」与「快速接口」，谁先成功谁先上屏。
     - 每次翻译都真实调用免费 AI 大模型接口；
     - 快速接口约 1s 返回，先把字幕打出来，保证实时感；
     - AI 大模型随后返回时通过 onUpgrade 把该行升级成大模型译文（引擎徽标同步更新）；
     - 两者都挂才走 Google 兜底。
     这样既满足「用 AI 大模型 API 实现」，又不用让用户等 3~9 秒才看到第一句字幕。 */
  function trAuto(text, from, onUpgrade) {
    var ai = wrap(ENGINE_FN.ai(text, from), 'ai');
    var fast = wrap(ENGINE_FN.fast(text, from), 'fast');
    ai.then(function (x) { if (x.ok && onUpgrade) onUpgrade(pack(x)); });
    return Promise.race([
      onlyOk(fast), onlyOk(ai),
      new Promise(function (_, rej) { setTimeout(function () { rej(new Error('翻译超时')); }, 9000); })
    ]).then(pack).catch(function () {
      return ENGINE_FN.google(text, from).then(function (r) {
        return pack({ ok: true, r: r, id: 'google' });
      });
    });
  }

  /* 并发闸门：切换目标语言会一次重译多条，免费接口对并发敏感，限制并行度可避免限流 */
  var jobs = [], active = 0, MAX_PARALLEL = 2;
  function enqueue(fn) {
    return new Promise(function (resolve, reject) {
      jobs.push({ fn: fn, resolve: resolve, reject: reject });
      pump();
    });
  }
  function pump() {
    while (active < MAX_PARALLEL && jobs.length) {
      (function (job) {
        active++;
        Promise.resolve().then(job.fn).then(job.resolve, job.reject).then(
          function () { active--; pump(); },
          function () { active--; pump(); }
        );
      })(jobs.shift());
    }
  }

  function translateText(text, from, onUpgrade) {
    text = String(text == null ? '' : text).trim();
    if (!text) return Promise.reject(new Error('待翻译文本为空'));
    /* 源语言与目标语言一致时不打扰免费接口，直接沿用原文 */
    if (from && from !== 'auto' &&
        from.split('-')[0].toLowerCase() === target().c.split('-')[0].toLowerCase()) {
      return Promise.resolve({ text: text, engine: '原文（同语种）', id: 'same', detected: from });
    }
    var pref = cfg.engine;
    if (pref !== 'auto' && !ENGINE_FN[pref]) pref = 'auto';
    return enqueue(function () {
      if (pref === 'auto') return trAuto(text, from || 'auto', onUpgrade);
      return ENGINE_FN[pref](text, from || 'auto').then(function (r) {
        if (!r || !r.text) throw new Error('空译文');
        return pack({ ok: true, r: r, id: pref });
      });
    });
  }

  /* ---------- 字幕渲染 ---------- */
  function hhmm(d) {
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
  }
  function scrollBottom() {
    var b = $('trBody'); if (b) b.scrollTop = b.scrollHeight;
  }
  function lineNode(l) {
    var wrap = document.createElement('div');
    wrap.className = 'trline'; wrap.dataset.lineId = String(l.id);
    var o = document.createElement('div'); o.className = 'trorig'; o.textContent = l.orig;
    var t = document.createElement('div');
    t.className = 'trtrans' + (l.pending ? ' pending' : '') + (l.fail ? ' fail' : '');
    t.textContent = l.pending ? '翻译中…' : l.trans;
    var bits = [hhmm(l.time)];
    if (l.detected) bits.push('识别语种 ' + langName(l.detected));
    if (l.engine) bits.push(l.engine);
    if (l.station) bits.push(l.station);
    var m = document.createElement('div'); m.className = 'trmeta'; m.textContent = bits.join(' · ');
    wrap.appendChild(o); wrap.appendChild(t); wrap.appendChild(m);
    return wrap;
  }
  function renderLines() {
    var b = $('trBody'); if (!b) return;
    b.textContent = '';
    if (!lines.length && !interim) {
      var e = document.createElement('div');
      e.className = 'trempty';
      e.innerHTML = '<b>实时字幕</b> · 点「开始收音」并允许麦克风，浏览器会逐句识别正在播放的声音，' +
        '再调用免费 AI 翻译接口把译文显示在这里。<br>也可以直接在下方输入 / 粘贴一句外语，回车立即体验翻译。';
      b.appendChild(e);
    } else {
      for (var i = 0; i < lines.length; i++) b.appendChild(lineNode(lines[i]));
      if (interim) {
        var it = document.createElement('div');
        it.className = 'trinterim'; it.textContent = '识别中 · ' + interim;
        b.appendChild(it);
      }
    }
    scrollBottom();
  }
  function alive(line, rev) { return line.rev === rev && lines.indexOf(line) >= 0; }
  function applyResult(line, r) {
    line.pending = false; line.fail = false;
    line.trans = r.text; line.engine = r.engine;
    line.detected = r.detected || line.detected;
    lastEngine = r.engine;
    if (r.detected) lastDetected = r.detected;
    updateTag();
  }
  function runTranslation(line, text, from) {
    var rev = line.rev;
    busy++; paintStatus();
    /* AI 大模型返回较慢时，用它把已经上屏的快速译文「升级」掉 */
    var upgrade = function (r) {
      if (!alive(line, rev)) return;
      applyResult(line, r); renderLines();
    };
    translateText(text, from, upgrade).then(function (r) {
      if (!alive(line, rev)) return;
      /* 升级已经先落地的情况下，不要再退回成较早的那版译文 */
      if (line.engine === 'AI 大模型' && r.engine !== 'AI 大模型') return;
      applyResult(line, r);
    }).catch(function () {
      if (!alive(line, rev)) return;
      line.pending = false; line.fail = true;
      line.trans = '翻译接口暂不可用，可切换引擎或稍后重试';
      flashError('翻译接口暂不可用');
    }).then(function () {
      busy = Math.max(0, busy - 1);
      renderLines(); paintStatus();
    });
  }
  function pushLine(orig, from) {
    var line = {
      id: ++seq, rev: 0, orig: orig, from: from || 'auto', trans: '', pending: true, fail: false,
      time: new Date(), engine: '', detected: '',
      station: station ? station.name : ''
    };
    lines.push(line);
    while (lines.length > MAX_LINES) lines.shift();
    renderLines();
    runTranslation(line, orig, from || 'auto');
    return line.id;
  }
  /* 公开注入口：手动输入、语音识别、自检脚本都走这里 */
  function feed(text, from) {
    var t = String(text == null ? '' : text).trim().replace(/\s+/g, ' ').slice(0, 600);
    if (!t) return 0;
    errState = '';
    return pushLine(t, from || 'auto');
  }
  function clear() {
    lines = []; interim = ''; lastFinal = '';
    renderLines(); paintStatus();
  }
  function retranslate() {
    var tail = lines.slice(-3);
    tail.forEach(function (l) {
      /* rev 自增，让上一轮仍在飞的 AI 升级回调失效，避免覆盖新目标语言的译文 */
      l.rev = (l.rev || 0) + 1;
      l.pending = true; l.fail = false; l.trans = ''; l.engine = ''; l.detected = '';
      runTranslation(l, l.orig, l.from || 'auto');
    });
    renderLines();
  }

  /* ---------- 状态条 ---------- */
  function notify(msg) {
    if (typeof window.toast === 'function') { try { window.toast(msg); } catch (e) { /* noop */ } }
  }
  function flashError(msg) {
    errState = msg; paintStatus(); notify(msg);
    clearTimeout(errTimer);
    errTimer = setTimeout(function () { errState = ''; paintStatus(); }, 6000);
  }
  function paintStatus() {
    var box = $('wwTrans'); if (!box) return;
    var st = listening ? 'listening' : 'idle';
    if (busy > 0) st = 'translating';
    if (errState) st = 'error';
    box.dataset.state = st;
    var el = $('trStat');
    if (el) el.textContent = errState || (busy > 0 ? '翻译中'
      : (listening ? '聆听中 · ' + speechLang() : '待机'));
  }
  function updateTag() {
    var el = $('trEngineTag');
    if (!el) return;
    el.textContent = lastEngine ? '引擎 ' + lastEngine : '引擎 —';
    el.title = lastEngine ? '最近一次译文由 ' + lastEngine + ' 提供' : '尚未产生译文';
  }

  /* ---------- Web Speech API ---------- */
  function startRec() {
    if (!recWanted) return;
    try {
      var r = new SR();
      rec = r;
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.lang = speechLang();
      r.onresult = function (ev) {
        var it = '';
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
          var res = ev.results[i];
          var txt = res && res[0] && res[0].transcript ? String(res[0].transcript).trim() : '';
          if (!txt) continue;
          if (res.isFinal) {
            if (txt !== lastFinal) { lastFinal = txt; feed(txt, fromStation()); }
          } else it += (it ? ' ' : '') + txt;
        }
        interim = it; renderLines();
      };
      r.onerror = function (ev) {
        var code = ev && ev.error ? ev.error : 'unknown';
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          flashError('需要麦克风权限'); notify('请在地址栏允许麦克风，或改用下方输入框');
          setTimeout(stop, 30);
        } else if (code === 'audio-capture') {
          flashError('找不到麦克风'); setTimeout(stop, 30);
        } else if (code === 'network') {
          netErr++;
          flashError('语音服务不可达');
          notify('浏览器语音服务不可达，可直接用下方输入框翻译');
          if (netErr >= 2) setTimeout(stop, 30);
        } else if (code === 'no-speech' || code === 'aborted') {
          /* 由 onend 自动续接，不打断用户 */
        } else {
          flashError('识别：' + code);
        }
      };
      r.onend = function () {
        if (!recWanted) return;
        clearTimeout(restartTimer);
        restartTimer = setTimeout(startRec, 420);
      };
      r.start();
      paintStatus();
    } catch (e) {
      flashError('无法启动识别：' + (e && e.message ? e.message : '未知错误'));
      recWanted = false; listening = false; rec = null;
      syncStartBtn(); paintStatus();
    }
  }
  function restartRec() {
    if (!rec) return;
    try { rec.onend = null; rec.stop(); } catch (e) { /* noop */ }
    rec = null;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(function () { if (recWanted) startRec(); }, 280);
  }
  function syncStartBtn() {
    var b = $('trStart'); if (!b) return;
    b.textContent = listening ? '停止收音' : '开始收音';
    b.classList.toggle('primary', !listening);
  }
  function start() {
    if (!SR) {
      flashError('浏览器不支持语音识别');
      notify('建议用 Chrome / Edge 打开；也可直接用输入框翻译');
      return;
    }
    recWanted = true; listening = true; errState = ''; netErr = 0;
    syncStartBtn(); paintStatus(); startRec();
  }
  function stop() {
    recWanted = false;
    clearTimeout(restartTimer);
    if (rec) { try { rec.onend = null; rec.stop(); } catch (e) { /* noop */ } rec = null; }
    listening = false; interim = ''; lastFinal = '';
    syncStartBtn(); renderLines(); paintStatus();
  }

  /* ---------- UI 绑定 ---------- */
  function option(value, label) {
    var o = document.createElement('option'); o.value = value; o.textContent = label; return o;
  }
  function fillSelects() {
    var t = $('trTarget');
    LANGS.forEach(function (L) { t.appendChild(option(L.c, L.n)); });
    t.value = cfg.target;
    var s = $('trSource');
    SOURCES.forEach(function (L) { s.appendChild(option(L.c, L.n)); });
    s.value = cfg.source;
    var e = $('trEngine');
    ENGINE_MODES.forEach(function (M) { e.appendChild(option(M.v, M.n)); });
    e.value = (cfg.engine === 'auto' || !!ENGINE_FN[cfg.engine]) ? cfg.engine : 'auto';
  }
  function applyFold() {
    var box = $('wwTrans'), b = $('trFold');
    if (box) box.classList.toggle('folded', !!cfg.folded);
    if (b) { b.textContent = cfg.folded ? '⌃' : '⌄'; b.setAttribute('aria-expanded', cfg.folded ? 'false' : 'true'); }
  }
  function toggleFold() { cfg.folded = !cfg.folded; saveCfg(); applyFold(); }
  function sendInput() {
    var i = $('trInput');
    if (!i) return;
    var v = i.value;
    if (!String(v).trim()) return;
    i.value = '';
    feed(v, 'auto');
  }
  function wire() {
    $('trTarget').addEventListener('change', function (e) {
      cfg.target = e.target.value; saveCfg(); retranslate();
    });
    $('trSource').addEventListener('change', function (e) {
      cfg.source = e.target.value; saveCfg();
      if (listening) restartRec();
      paintStatus();
    });
    $('trEngine').addEventListener('change', function (e) { cfg.engine = e.target.value; saveCfg(); });
    $('trStart').addEventListener('click', function () { listening ? stop() : start(); });
    $('trClear').addEventListener('click', clear);
    $('trFold').addEventListener('click', toggleFold);
    $('trSend').addEventListener('click', sendInput);
    /* 输入框内所有按键都留在框内：否则全局 Space / / 等快捷键会抢走输入 */
    $('wwTrans').addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.target && e.target.id === 'trInput' && e.key === 'Enter') {
        e.preventDefault(); sendInput();
      }
    });
    window.addEventListener('ww:select', function (e) {
      station = e.detail && e.detail.station ? e.detail.station : null;
      var el = $('trStation');
      if (el) el.textContent = station
        ? station.name + (station.city ? ' · ' + station.city : '') : '未选择电台';
      if (listening) restartRec();
      paintStatus();
    });
    window.addEventListener('ww:stop', function () {
      station = null;
      var el = $('trStation'); if (el) el.textContent = '未选择电台';
      paintStatus();
    });
    window.addEventListener('ww:mode', paintStatus);
  }
  function init() {
    if (!$('wwTrans')) return;
    fillSelects(); wire(); applyFold(); renderLines(); updateTag(); paintStatus();
  }

  /* 调试 / 自检钩子：无需真实麦克风即可验证整条字幕与翻译链路 */
  window.WW_TRANS = {
    langs: function () { return LANGS.map(function (L) { return { code: L.c, name: L.n }; }); },
    sources: function () { return SOURCES.map(function (S) { return { code: S.c, name: S.n }; }); },
    engines: function () { return ENGINE_MODES.slice(); },
    state: function () {
      return {
        target: cfg.target, source: cfg.source, engine: cfg.engine, folded: cfg.folded,
        listening: listening, sr: !!SR, speechLang: speechLang(), interim: interim,
        lastEngine: lastEngine, lastDetected: lastDetected,
        station: station ? station.name : null,
        status: $('trStat') ? $('trStat').textContent : '',
        lines: lines.map(function (l) {
          return { orig: l.orig, trans: l.trans, pending: l.pending, fail: l.fail, engine: l.engine };
        })
      };
    },
    setTarget: function (v) { cfg.target = v; saveCfg(); $('trTarget').value = v; retranslate(); },
    setSource: function (v) { cfg.source = v; saveCfg(); $('trSource').value = v; if (listening) restartRec(); paintStatus(); },
    setEngine: function (v) { cfg.engine = v; saveCfg(); $('trEngine').value = v; },
    feed: feed,
    translate: function (t, f) { return translateText(t, f || 'auto'); },
    start: start, stop: stop, clear: clear, fold: toggleFold,
    guess: function (city) { return guessSpeech({ city: city }); },
    supported: !!SR
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
