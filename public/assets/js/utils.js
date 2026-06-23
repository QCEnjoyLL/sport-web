/* ============================================================
   PULSE 通用工具
   ============================================================ */

/* ---------- DOM 辅助 ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined) {
      node.setAttribute(k, v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

/* ---------- 通知系统 ---------- */
function ensureToastWrap() {
  let wrap = $('#toastWrap');
  if (!wrap) {
    wrap = el('div', { id: 'toastWrap', class: 'toast-wrap' });
    document.body.appendChild(wrap);
  }
  return wrap;
}

const TOAST_ICONS = {
  success: 'fa-circle-check',
  error: 'fa-circle-xmark',
  warning: 'fa-triangle-exclamation',
  info: 'fa-circle-info',
};

function toast(message, type = 'info', duration = 3200) {
  const wrap = ensureToastWrap();
  const t = el(
    'div',
    { class: `toast ${type}`, role: 'status' },
    el('i', { class: `fa-solid ${TOAST_ICONS[type] || TOAST_ICONS.info}` }),
    el('span', {}, message)
  );
  wrap.appendChild(t);
  const remove = () => {
    t.classList.add('leaving');
    setTimeout(() => t.remove(), 250);
  };
  const timer = setTimeout(remove, duration);
  t.addEventListener('click', () => {
    clearTimeout(timer);
    remove();
  });
  return t;
}

/* ---------- 时间格式化 ---------- */
function fmtDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function fmtDate(ts, opts = {}) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (opts.relative) {
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (opts.full) {
    return `${y}-${m}-${day} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  if (y === now.getFullYear()) return `${m}-${day}`;
  return `${y}-${m}-${day}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------- 节流 / 防抖 ---------- */
function throttle(fn, wait) {
  let last = 0;
  let timer = null;
  let lastArgs = null;
  return function (...args) {
    const now = Date.now();
    lastArgs = args;
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      clearTimeout(timer);
      timer = null;
      last = now;
      fn.apply(this, lastArgs);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn.apply(this, lastArgs);
      }, remaining);
    }
  };
}

function debounce(fn, wait) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/* ---------- 转义 ---------- */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------- URL 参数 ---------- */
function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/* ---------- 默认封面回退 ---------- */
const DEFAULT_COVER = '/assets/img/default-cover.svg';

function coverOnError(img) {
  img.addEventListener('error', function handler() {
    if (img.src !== DEFAULT_COVER && !img.src.endsWith('default-cover.svg')) {
      img.src = DEFAULT_COVER;
    }
    img.removeEventListener('error', handler);
  });
}

/* ---------- 视频链接规范化（alist 网页路径 → 直链）----------
   alist 的网页路径返回 HTML，无法直接播放。
   直链规则：在域名根路径后插入 /d
   例：https://alist.xxx.com/云盘/视频.mp4 → https://alist.xxx.com/d/云盘/视频.mp4
   已是直链（/d/）或本地路径则不处理。 */
function normalizeVideoUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  // 相对路径（本站代理等）直接返回
  if (trimmed.startsWith('/')) return trimmed;
  let u;
  try {
    u = new URL(trimmed);
  } catch {
    return trimmed;
  }
  // 已经是直链或 API 路径，不处理
  if (u.pathname.startsWith('/d/') || u.pathname === '/d' || u.pathname.startsWith('/api/')) {
    return trimmed;
  }
  // 路径以视频扩展名结尾，疑似 alist 网页路径 → 转直链
  if (/\.(mp4|m4v|webm|mov|mkv|m3u8|ts)(\?|$|#)/i.test(u.pathname)) {
    u.pathname = '/d' + u.pathname;
    return u.toString();
  }
  return trimmed;
}

/* ---------- URL 安全校验（防 javascript: XSS） ---------- */
function safeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  /* 相对路径（以 / 开头）允许 */
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  /* 空字符串或非 http(s) 协议拒绝 */
  let u;
  try {
    u = new URL(trimmed);
  } catch {
    /* 可能是相对路径（不含协议），允许 */
    if (/^[a-zA-Z0-9]/.test(trimmed)) return trimmed;
    return '';
  }
  if (u.protocol === 'http:' || u.protocol === 'https:') return trimmed;
  return '';
}

/* ---------- 共享视频卡片模板 ---------- */
function renderVideoCard(v, inSeries) {
  const cover = safeUrl(v.cover) || DEFAULT_COVER;
  const hasProgress = v.last_watched_at && (v.last_progress || 0) > 0 && !v.completed;
  const pct = hasProgress && v.duration ? Math.min(100, Math.round((v.last_progress / v.duration) * 100)) : 0;
  const episodeBadge = inSeries && v.episode ? `<div class="video-episode-badge">第${v.episode}集</div>` : '';
  return `
  <div class="video-card" data-id="${v.id}">
    <div class="video-thumb">
      <img src="${escapeHtml(cover)}" alt="${escapeHtml(v.title)}" />
      <div class="video-play"><i class="fa-solid fa-play"></i></div>
      ${v.duration ? `<div class="video-duration">${fmtDuration(v.duration)}</div>` : ''}
      ${v.completed ? `<div class="video-done-badge"><i class="fa-solid fa-check"></i></div>` : ''}
      ${hasProgress ? `<div class="video-progress-track"><div class="video-progress-fill" style="width:${pct}%"></div></div>` : ''}
      ${episodeBadge}
    </div>
    <div class="video-info">
      <div class="video-title">${escapeHtml(v.title)}</div>
      <div class="video-meta">
        ${v.completed ? '<i class="fa-solid fa-check" style="color:var(--success)"></i><span style="color:var(--success)">已完成</span>' : hasProgress ? '<i class="fa-solid fa-forward"></i><span>已看 ' + pct + '%</span>' : '<i class="fa-solid fa-circle-play"></i><span>未观看</span>'}
        ${v.last_watched_at ? `<span class="dot-sep"></span><span>${fmtDate(v.last_watched_at, { relative: true })}</span>` : ''}
      </div>
    </div>
  </div>`;
}

/* ---------- 暴露到全局 ---------- */
window.Pulse = {
  $,
  $$,
  el,
  toast,
  fmtDuration,
  fmtDate,
  todayStr,
  throttle,
  debounce,
  escapeHtml,
  safeUrl,
  getQueryParam,
  coverOnError,
  normalizeVideoUrl,
  renderVideoCard,
  DEFAULT_COVER,
};
