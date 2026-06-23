/* ============================================================
   认证状态管理
   ============================================================ */

async function checkAuth() {
  try {
    const r = await api.auth.status();
    if (r && r.authenticated) {
      localStorage.setItem('pulse_role', r.role || 'admin');
    } else {
      localStorage.removeItem('pulse_role');
    }
    return !!(r && r.authenticated);
  } catch {
    return false;
  }
}

async function getAuthStatus() {
  try {
    const r = await api.auth.status();
    if (r && r.authenticated) {
      localStorage.setItem('pulse_role', r.role || 'admin');
    } else {
      localStorage.removeItem('pulse_role');
    }
    return r || { authenticated: false, role: null };
  } catch {
    return { authenticated: false, role: null };
  }
}

async function requireAuth() {
  const status = await getAuthStatus();
  if (!status.authenticated) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login.html?next=${next}`;
    return false;
  }
  const nav = document.getElementById('nav');
  if (nav && nav.dataset.active !== undefined) renderNav(nav.dataset.active);
  return true;
}

async function requireAdmin() {
  const status = await getAuthStatus();
  if (!status.authenticated) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login.html?next=${next}`;
    return false;
  }
  if (status.role === 'guest') {
    Pulse.toast('访客模式不能进入管理页', 'warning');
    setTimeout(() => (window.location.href = '/index.html'), 800);
    return false;
  }
  const nav = document.getElementById('nav');
  if (nav && nav.dataset.active !== undefined) renderNav(nav.dataset.active);
  return true;
}

function isGuestMode() {
  return localStorage.getItem('pulse_role') === 'guest';
}

async function logout() {
  try {
    await api.auth.logout();
  } catch {
    /* 忽略 */
  }
  localStorage.removeItem('pulse_role');
  window.location.href = '/login.html';
}

/* 渲染导航栏（注入到 #nav 占位） */
function renderNav(active = '') {
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.dataset.active = active;
  const guest = isGuestMode();
  nav.innerHTML = `
    <nav class="nav">
      <div class="container nav-inner">
        <a href="/index.html" class="nav-brand">
          <img src="/assets/img/logo.svg" alt="PULSE" />
        </a>
        <div class="nav-links">
          <a href="/index.html" class="nav-link ${active === 'home' ? 'active' : ''}">
            <i class="fa-solid fa-house"></i><span>首页</span>
          </a>
          ${guest ? '' : `
            <a href="/history.html" class="nav-link ${active === 'history' ? 'active' : ''}">
              <i class="fa-solid fa-chart-line"></i><span>记录</span>
            </a>
            <a href="/admin.html" class="nav-link ${active === 'admin' ? 'active' : ''}">
              <i class="fa-solid fa-sliders"></i><span>管理</span>
            </a>
          `}
        </div>
        <div class="nav-user">
          ${guest ? '<span class="nav-role-badge"><i class="fa-solid fa-user"></i> 访客</span>' : ''}
          <button class="nav-btn-icon" id="logoutBtn" title="登出">
            <i class="fa-solid fa-right-from-bracket"></i>
          </button>
        </div>
      </div>
    </nav>
  `;
  const lb = document.getElementById('logoutBtn');
  if (lb) lb.addEventListener('click', logout);
}

window.checkAuth = checkAuth;
window.getAuthStatus = getAuthStatus;
window.requireAuth = requireAuth;
window.requireAdmin = requireAdmin;
window.isGuestMode = isGuestMode;
window.logout = logout;
window.renderNav = renderNav;
