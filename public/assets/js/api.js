/* ============================================================
   API 封装：统一 fetch，处理认证、错误、JSON
   ============================================================ */

async function request(path, options = {}) {
  const opts = {
    credentials: 'include',
    headers: { 'X-Timezone-Offset': String(new Date().getTimezoneOffset()) },
    ...options,
  };
  /* 合并调用方传入的 headers（保留默认时区头） */
  if (options.headers) {
    Object.assign(opts.headers, options.headers);
  }
  if (opts.body && typeof opts.body !== 'string' && !(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch (e) {
    throw new ApiError('网络连接失败，请检查网络', 0, e);
  }
  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    data = await res.json().catch(() => null);
  }
  if (!res.ok) {
    const msg = (data && data.error) || `请求失败 (${res.status})`;
    if (res.status === 401) {
      redirectLogin();
      throw new ApiError('未登录', 401);
    }
    throw new ApiError(msg, res.status);
  }
  return data;
}

class ApiError extends Error {
  constructor(message, status, cause) {
    super(message);
    this.status = status;
    this.cause = cause;
  }
}

function redirectLogin() {
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  if (!window.location.pathname.endsWith('/login.html')) {
    window.location.href = `/login.html?next=${next}`;
  }
}

const api = {
  get: (p, opts) => request(p, { method: 'GET', ...opts }),
  post: (p, body, opts) => request(p, { method: 'POST', body, ...opts }),
  put: (p, body, opts) => request(p, { method: 'PUT', body, ...opts }),
  del: (p, opts) => request(p, { method: 'DELETE', ...opts }),

  /* 认证 */
  auth: {
    status: () => api.get('/api/auth/status'),
    login: (password) => api.post('/api/auth/login', { password }),
    logout: () => api.post('/api/auth/logout'),
  },

  /* 视频 */
  videos: {
    list: () => api.get('/api/videos'),
    get: (id) => api.get(`/api/videos/${id}`),
    create: (data) => api.post('/api/videos', data),
    update: (id, data) => api.put(`/api/videos/${id}`, data),
    remove: (id) => api.del(`/api/videos/${id}`),
  },

  /* 观看记录 */
  history: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return api.get(`/api/history${qs ? '?' + qs : ''}`);
    },
    stats: (month) => api.get(`/api/history/stats?month=${month}`),
    record: (data) => api.post('/api/history', data),
    delete: (id) => api.del(`/api/history/${id}`),
    recordBeacon: (data) => {
      /* 页面卸载时用 sendBeacon 保证送达
         sendBeacon 不支持自定义请求头，把时区偏移放进 body */
      try {
        const payload = { ...data, tz_offset: new Date().getTimezoneOffset() };
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        return navigator.sendBeacon('/api/history', blob);
      } catch (e) {
        return false;
      }
    },
  },

  /* 系列 */
  series: {
    list: () => api.get('/api/series'),
    get: (id) => api.get(`/api/series/${id}`),
    update: (id, data) => api.put(`/api/series/${id}`, data),
  },
};

window.ApiError = ApiError;
window.api = api;
