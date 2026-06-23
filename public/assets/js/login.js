/* 登录页逻辑 */
(function () {
  const form = document.getElementById('loginForm');
  const pwd = document.getElementById('password');
  const btn = document.getElementById('loginBtn');
  const errBox = document.getElementById('loginError');
  const errMsg = document.getElementById('loginErrorMsg');
  const eye = document.getElementById('toggleEye');
  const guestHint = document.getElementById('guestHint');
  const guestPasswordBtn = document.getElementById('guestPasswordBtn');

  function goNext(role) {
    const raw = Pulse.getQueryParam('next') || '/index.html';
    /* 防止 open redirect：只允许同站相对路径 */
    let next = (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\\\')) ? raw : '/index.html';
    if (role === 'guest' && next.startsWith('/admin.html')) next = '/index.html';
    window.location.href = next;
  }

  function renderGuestHint(status) {
    const guestPassword = status && status.guest_enabled ? status.guest_password : '';
    if (!guestPassword || !guestHint || !guestPasswordBtn) return;
    guestPasswordBtn.textContent = guestPassword;
    guestHint.style.display = '';
    guestPasswordBtn.onclick = () => {
      pwd.value = guestPassword;
      pwd.focus();
    };
  }

  renderGuestHint({ guest_enabled: true, guest_password: 'guest' });

  /* 已登录则跳转；未登录时用接口返回的配置覆盖默认访客密码 */
  api.auth
    .status()
    .then((r) => {
      if (r && r.authenticated) {
        localStorage.setItem('pulse_role', r.role || 'admin');
        goNext(r.role || 'admin');
        return;
      }
      renderGuestHint(r);
    })
    .catch(() => {});

  function showError(msg) {
    errMsg.textContent = msg;
    errBox.classList.add('show');
    setTimeout(() => errBox.classList.remove('show'), 3000);
  }

  /* 密码可见切换 */
  eye.addEventListener('click', () => {
    if (pwd.type === 'password') {
      pwd.type = 'text';
      eye.classList.remove('fa-eye');
      eye.classList.add('fa-eye-slash');
    } else {
      pwd.type = 'password';
      eye.classList.remove('fa-eye-slash');
      eye.classList.add('fa-eye');
    }
    pwd.focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = pwd.value.trim();
    if (!password) {
      showError('请输入密码');
      return;
    }
    btn.classList.add('loading');
    btn.disabled = true;
    try {
      const r = await api.auth.login(password);
      localStorage.setItem('pulse_role', r?.role || 'admin');
      goNext(r?.role || 'admin');
    } catch (err) {
      showError(err.message || '登录失败');
      btn.classList.remove('loading');
      btn.disabled = false;
      pwd.select();
    }
  });

  /* 回车提交 & 聚焦 */
  pwd.focus();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') form.requestSubmit();
  });
})();
