/* ============================================================
   认证状态管理
   ============================================================ */

async function checkAuth() {
  try {
    const r = await api.auth.status();
    return !!(r && r.authenticated);
  } catch {
    return false;
  }
}

async function requireAuth() {
  const ok = await checkAuth();
  if (!ok) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login.html?next=${next}`;
    return false;
  }
  return true;
}

async function logout() {
  try {
    await api.auth.logout();
  } catch {
    /* 忽略 */
  }
  window.location.href = '/login.html';
}

/* 渲染导航栏（注入到 #nav 占位） */
function renderNav(active = '') {
  const nav = document.getElementById('nav');
  if (!nav) return;
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
          <a href="/history.html" class="nav-link ${active === 'history' ? 'active' : ''}">
            <i class="fa-solid fa-chart-line"></i><span>记录</span>
          </a>
          <a href="/admin.html" class="nav-link ${active === 'admin' ? 'active' : ''}">
            <i class="fa-solid fa-sliders"></i><span>管理</span>
          </a>
        </div>
        <div class="nav-user">
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
window.requireAuth = requireAuth;
window.logout = logout;
window.renderNav = renderNav;
