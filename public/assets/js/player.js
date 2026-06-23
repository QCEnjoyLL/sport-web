/* 播放页逻辑：加载视频、进度上报、续看、快捷键、上下导航 */
(async function () {
  renderNav('');
  const ok = await requireAuth();
  if (!ok) return;

  const id = Number(Pulse.getQueryParam('v'));
  if (!Number.isInteger(id) || id <= 0) {
    Pulse.toast('无效的视频', 'error');
    setTimeout(() => (location.href = '/index.html'), 1200);
    return;
  }

  const video = $('#player');
  const loading = $('#playerLoading');
  const resumeBanner = $('#resumeBanner');
  const resumeTime = $('#resumeTime');
  const resumeBtn = $('#resumeBtn');

  let allVideos = [];
  let videoData = null;
  let historyData = null;
  let pendingProgress = 0;

  /* 加载视频 + 全列表（用于上下导航） */
  try {
    const [vRes, listRes] = await Promise.all([api.videos.get(id), api.videos.list()]);
    videoData = vRes.video;
    historyData = vRes.history;
    allVideos = (listRes && listRes.videos) || [];
  } catch (e) {
    Pulse.toast(e.message || '加载失败', 'error');
    loading.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${Pulse.escapeHtml(e.message || '加载失败')}`;
    return;
  }

  if (!videoData) {
    loading.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> 视频不存在';
    return;
  }

  /* 渲染信息 */
  $('#bcTitle').textContent = videoData.title;
  $('#videoTitle').textContent = videoData.title;
  const meta = $('#videoMeta');
  const parts = [];
  if (videoData.series) parts.push(`<span class="badge badge-accent"><i class="fa-solid fa-layer-group"></i> ${Pulse.escapeHtml(videoData.series)}${videoData.episode ? ' #' + videoData.episode : ''}</span>`);
  if (videoData.duration) parts.push(`<span><i class="fa-solid fa-clock"></i> ${Pulse.fmtDuration(videoData.duration)}</span>`);
  if (historyData && historyData.last_watch_at) {
    parts.push(`<span><i class="fa-solid fa-clock-rotate-left"></i> 上次观看 ${Pulse.fmtDate(historyData.last_watch_at, { relative: true })}</span>`);
  }
  if (historyData && historyData.completed) parts.push(`<span class="badge badge-success"><i class="fa-solid fa-check"></i> 已完成</span>`);
  if (videoData.created_at) parts.push(`<span><i class="fa-solid fa-calendar"></i> ${Pulse.fmtDate(videoData.created_at)}</span>`);
  meta.innerHTML = parts.join('<span class="dot-sep"></span>');

  const desc = $('#videoDesc');
  if (videoData.description && videoData.description.trim()) {
    desc.textContent = videoData.description;
    desc.style.display = '';
  }

  /* 设置视频源：通过后端代理 /api/play/:id 处理 OpenList 签名刷新或普通视频直链跳转 */
  video.poster = Pulse.getVideoCover(videoData);
  video.src = `/api/play/${id}`;

  /* 续看提示 */
  const resumeFrom = historyData && historyData.progress > 0 && !historyData.completed ? historyData.progress : 0;
  if (resumeFrom > 5 && (!videoData.duration || resumeFrom < videoData.duration * 0.95)) {
    resumeTime.textContent = Pulse.fmtDuration(resumeFrom);
    resumeBanner.classList.add('show');
    resumeBtn.addEventListener('click', () => {
      video.currentTime = resumeFrom;
      resumeBanner.classList.remove('show');
      video.play().catch(() => {});
    });
    /* 8 秒后自动消失 */
    setTimeout(() => resumeBanner.classList.remove('show'), 8000);
  }

  /* 上下导航 + 系列侧边栏 */
  renderNavCards();
  renderSidebar();

  /* ---------- 事件 ---------- */
  video.addEventListener('loadedmetadata', () => {
    loading.classList.add('hide');
    const dur = Math.floor(video.duration || 0);
    if (dur && dur !== videoData.duration) {
      /* 时长与库中不一致，静默更新 */
      api.videos.update(id, { duration: dur }).catch(() => {});
    }
  });

  video.addEventListener('canplay', () => {
    loading.classList.add('hide');
  });

  video.addEventListener('error', () => {
    /* 302 重定向后视频加载失败，常见原因：
       1. 跨域/防盗链 2. token 权限不足 3. 链接失效
       主动 fetch 检查后端返回的具体错误 */
    fetch(`/api/play/${id}`, { method: 'GET', credentials: 'include' })
      .then((r) => {
        if (r.ok) {
          /* 后端返回 200 但 video 标签报错 → 可能是目标 URL 跨域或防盗链 */
          loading.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> 视频加载失败（可能跨域或防盗链限制）`;
        } else {
          return r.json().then((d) => {
            loading.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${d.error || '视频加载失败'}<br/><span style="font-size:12px;color:var(--text-dim)">${d.hint || ''}</span>`;
          }).catch(() => {
            loading.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> 视频加载失败 (HTTP ${r.status})`;
          });
        }
      })
      .catch(() => {
        loading.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> 视频加载失败，请检查链接`;
      });
    loading.classList.remove('hide');
  });

  /* 开始播放 → 上报 */
  video.addEventListener('play', () => {
    reportProgress(false);
  });

  /* 每 10 秒上报进度 */
  const throttledReport = Pulse.throttle(() => {
    if (!video.paused) reportProgress(false);
  }, 10000);
  video.addEventListener('timeupdate', throttledReport);

  /* 完成判定 */
  video.addEventListener('ended', () => {
    pendingProgress = Math.floor(video.currentTime || 0);
    reportProgress(true);
    Pulse.toast('训练完成！继续保持', 'success');
  });

  /* 暂停/离开页面上报 */
  video.addEventListener('pause', () => {
    if (video.currentTime > 0) reportProgress(false);
  });

  /* 页面卸载用 sendBeacon 保证送达（guard 防重复发送） */
  let flushed = false;
  const flush = () => {
    if (flushed) return;
    if (video.currentTime > 0) {
      flushed = true;
      pendingProgress = Math.floor(video.currentTime || 0);
      const completed = videoData.duration > 0 && pendingProgress >= videoData.duration * 0.9;
      api.history.recordBeacon({
        video_id: id,
        progress: pendingProgress,
        duration: Math.floor(video.duration || 0),
        completed: completed ? 1 : 0,
      });
    }
  };
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  /* 快捷键 */
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        video.paused ? video.play() : video.pause();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 5);
        break;
      case 'ArrowRight':
        e.preventDefault();
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
        break;
      case 'ArrowUp':
        e.preventDefault();
        video.volume = Math.min(1, Math.round((video.volume + 0.1) * 10) / 10);
        break;
      case 'ArrowDown':
        e.preventDefault();
        video.volume = Math.max(0, Math.round((video.volume - 0.1) * 10) / 10);
        break;
    }
  });

  /* ---------- 上报函数 ---------- */
  function reportProgress(forceCompleted) {
    pendingProgress = Math.floor(video.currentTime || 0);
    const dur = Math.floor(video.duration || 0);
    const completed = (forceCompleted || (dur > 0 && pendingProgress >= dur * 0.95)) ? 1 : 0;
    api
      .history
      .record({
        video_id: id,
        progress: pendingProgress,
        duration: dur,
        completed,
      })
      .catch(() => {});
  }

  /* ---------- 上下导航卡 ---------- */
  function renderNavCards() {
    const idx = allVideos.findIndex((v) => v.id === id);
    const prev = idx > 0 ? allVideos[idx - 1] : null;
    const next = idx >= 0 && idx < allVideos.length - 1 ? allVideos[idx + 1] : null;
    const nav = $('#playerNav');
    nav.innerHTML = `
      ${renderCard(prev, 'prev', '上一个', 'fa-arrow-left')}
      ${renderCard(next, 'next', '下一个', 'fa-arrow-right')}
    `;
    $$('.nav-card[data-href]', nav).forEach((card) => {
      card.addEventListener('click', () => {
        if (card.dataset.href) location.href = card.dataset.href;
      });
    });
    /* 封面加载失败回退 */
    $$('.nav-card-thumb img[data-fallback]', nav).forEach(Pulse.coverOnError);
  }

  function renderCard(v, dir, label, icon) {
    if (!v) {
      return `<div class="nav-card ${dir} disabled"><div style="flex:1"></div><div class="nav-card-text"><div class="nav-card-label">${label}</div><div class="nav-card-title" style="color:var(--text-dim)">没有了</div></div></div>`;
    }
    const cover = Pulse.getVideoCover(v);
    const thumb = `<div class="nav-card-thumb"><img src="${Pulse.escapeHtml(cover)}" data-fallback="1" /></div>`;
    const text = `<div class="nav-card-text"><div class="nav-card-label">${label}</div><div class="nav-card-title">${Pulse.escapeHtml(v.title)}</div></div>`;
    if (dir === 'prev') {
      return `<div class="nav-card ${dir}" data-href="/player.html?v=${v.id}">${thumb}${text}</div>`;
    }
    return `<div class="nav-card ${dir}" data-href="/player.html?v=${v.id}">${text}${thumb}</div>`;
  }

  /* ---------- 系列侧边栏 ---------- */
  function renderSidebar() {
    const sidebars = $('#playerSidebar');
    const list = $('#sidebarList');
    const nameEl = $('#sidebarSeriesName');

    if (!videoData.series) {
      sidebars.style.display = 'none';
      return;
    }

    const seriesVideos = allVideos
      .filter((v) => v.series === videoData.series)
      .sort((a, b) => (a.episode || 0) - (b.episode || 0) || a.id - b.id);

    if (seriesVideos.length <= 1) {
      sidebars.style.display = 'none';
      return;
    }

    sidebars.style.display = '';
    nameEl.textContent = videoData.series;

    list.innerHTML = seriesVideos
      .map((v) => {
        const isActive = v.id === videoData.id;
        const cover = Pulse.getVideoCover(v);
        const pct = v.duration > 0 && v.last_progress ? Math.min(100, Math.round((v.last_progress / v.duration) * 100)) : 0;
        const done = v.completed;
        return `
          <div class="sidebar-item ${isActive ? 'active' : ''} ${done ? 'completed' : ''}" data-id="${v.id}">
            <div class="sidebar-item-ep">${v.episode ? '第' + v.episode + '集' : ''}</div>
            <div class="sidebar-item-thumb">
              <img src="${Pulse.escapeHtml(cover)}" data-fallback="1" />
            </div>
            <div class="sidebar-item-info">
              <div class="sidebar-item-title">${Pulse.escapeHtml(v.title)}</div>
              <div class="sidebar-item-meta">
                ${done ? '<i class="fa-solid fa-check"></i> 已完成' : pct > 0 ? '<i class="fa-solid fa-forward"></i> ' + pct + '%' : '<i class="fa-solid fa-circle-play"></i> 未观看'}
              </div>
            </div>
            ${pct > 0 && !done ? `<div class="sidebar-item-progress"><div class="sidebar-item-progress-fill" style="width:${pct}%"></div></div>` : ''}
          </div>`;
      })
      .join('');

    $$('.sidebar-item[data-id]', list).forEach((item) => {
      item.addEventListener('click', () => {
        const vid = item.dataset.id;
        if (vid && vid !== String(videoData.id)) {
          location.href = `/player.html?v=${vid}`;
        }
      });
    });
    /* 封面加载失败回退 */
    $$('.sidebar-item-thumb img[data-fallback]', list).forEach(Pulse.coverOnError);
  }
})();
