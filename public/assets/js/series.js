/* ============================================================
   系列详情页逻辑
   ============================================================ */

(async function () {
  renderNav('home');
  const ok = await requireAuth();
  if (!ok) return;

  const seriesId = Number(Pulse.getQueryParam('id'));
  if (!Number.isInteger(seriesId) || seriesId <= 0) {
    Pulse.toast('无效的系列 ID', 'error');
    setTimeout(() => (window.location.href = '/index.html'), 1500);
    return;
  }

  let data;
  try {
    data = await api.series.get(seriesId);
  } catch (e) {
    Pulse.toast(e.message || '加载失败', 'error');
    setTimeout(() => (window.location.href = '/index.html'), 1500);
    return;
  }

  const s = data.series;
  const episodes = data.episodes || [];

  /* 渲染横幅 */
  renderBanner(s, data.episode_count, data.completed_count);

  /* 渲染集数 */
  renderEpisodes(episodes);

  /* 设置页面标题 */
  document.title = `${s.name} · PULSE 每日训练`;
})();

/* ---------- 系列横幅 ---------- */
function renderBanner(s, total, completed) {
  const banner = $('#seriesBanner');
  const cover = Pulse.safeUrl(s.cover) || Pulse.DEFAULT_COVER;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  banner.innerHTML = `
    <div class="series-banner-bg">
      <img src="${Pulse.escapeHtml(cover)}" alt="${Pulse.escapeHtml(s.name)}" />
      <div class="series-banner-overlay"></div>
    </div>
    <div class="container series-banner-content">
      <a href="/index.html" class="series-back">
        <i class="fa-solid fa-arrow-left"></i>
        <span>返回首页</span>
      </a>
      <div class="series-banner-info">
        <div class="series-banner-tag">
          <i class="fa-solid fa-layer-group"></i>
          <span>训练系列</span>
        </div>
        <h1 class="series-banner-title">${Pulse.escapeHtml(s.name)}</h1>
        ${s.description ? `<p class="series-banner-desc">${Pulse.escapeHtml(s.description)}</p>` : ''}
        <div class="series-banner-stats">
          <div class="series-banner-stat">
            <div class="series-banner-stat-num">${total}</div>
            <div class="series-banner-stat-label">总集数</div>
          </div>
          <div class="series-banner-stat">
            <div class="series-banner-stat-num accent">${completed}</div>
            <div class="series-banner-stat-label">已完成</div>
          </div>
          <div class="series-banner-stat">
            <div class="series-banner-stat-num primary">${total - completed}</div>
            <div class="series-banner-stat-label">未完成</div>
          </div>
        </div>
        ${pct > 0 ? `
          <div class="series-banner-progress">
            <div class="series-banner-progress-label">完成进度 ${pct}%</div>
            <div class="series-banner-progress-track">
              <div class="series-banner-progress-fill" style="width:${pct}%"></div>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  /* 封面加载失败回退 */
  const img = $('.series-banner-bg img', banner);
  if (img) Pulse.coverOnError(img);
}

/* ---------- 集数列表 ---------- */
function renderEpisodes(episodes) {
  const grid = $('#episodeGrid');
  $('#episodeCount').textContent = `${episodes.length} 集`;

  if (episodes.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state-icon"><i class="fa-solid fa-video-slash"></i></div>
        <h3>系列暂无视频</h3>
        <p>前往管理页面添加视频到此系列。</p>
        <a href="/admin.html" class="btn btn-primary"><i class="fa-solid fa-plus"></i> 管理视频</a>
      </div>`;
    return;
  }

  grid.innerHTML = episodes
    .map((v) => Pulse.renderVideoCard(v, true))
    .join('');

  $$('#episodeGrid .video-thumb img').forEach(Pulse.coverOnError);

  $$('#episodeGrid .video-card[data-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      if (id) window.location.href = `/player.html?v=${id}`;
    });
  });
}
