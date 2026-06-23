/* ============================================================
   首页逻辑：系列卡片 + 独立视频
   ============================================================ */

(async function () {
  renderNav('home');
  const ok = await requireAuth();
  if (!ok) return;

  const grid = $('#videoGrid');
  const todayBox = $('#todayBox');

  /* 渲染骨架 */
  grid.innerHTML = Array.from({ length: 6 })
    .map(
      () => `
      <div class="video-card skeleton">
        <div class="video-thumb" style="aspect-ratio:16/9"></div>
        <div class="video-info">
          <div class="video-title-line"></div>
          <div class="video-meta-line"></div>
        </div>
      </div>`
    )
    .join('');

  /* 并行获取系列列表和视频列表 */
  let seriesList = [];
  let videos = [];
  try {
    const [seriesRes, videoRes] = await Promise.all([
      api.series.list(),
      api.videos.list(),
    ]);
    seriesList = (seriesRes && seriesRes.series) || [];
    videos = (videoRes && videoRes.videos) || [];
  } catch (e) {
    grid.innerHTML = '';
    Pulse.toast(e.message || '加载失败', 'error');
    return;
  }

  renderToday(videos);
  renderContinue(videos);
  renderNextSection(videos, seriesList);
  renderGrid(seriesList, videos);
})();

/* ---------- 今日状态 ---------- */
function renderToday(videos) {
  const todayDone = [];
  const todayInProgress = [];
  videos.forEach((v) => {
    if (!v.last_watched_at) return;
    const d = new Date(v.last_watched_at * 1000);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (!sameDay) return;
    if (v.completed) todayDone.push(v);
    else todayInProgress.push(v);
  });

  const totalToday = todayDone.length + todayInProgress.length;
  const totalSeconds = todayDone.reduce((s, v) => s + (v.duration || 0), 0) + todayInProgress.reduce((s, v) => s + (v.last_progress || 0), 0);
  const totalMinutes = Math.round(totalSeconds / 60);

  const box = $('#todayBox');
  if (totalToday === 0) {
    box.innerHTML = `
      <div class="today-label">今日状态</div>
      <div class="today-headline idle">还没动起来，<span class="accent">开始吧</span></div>
      <div class="today-stats">
        <div class="today-stat"><div class="today-stat-num">0</div><div class="today-stat-label">训练</div></div>
        <div class="today-stat"><div class="today-stat-num">0</div><div class="today-stat-label">分钟</div></div>
        <div class="today-stat"><div class="today-stat-num">0</div><div class="today-stat-label">完成</div></div>
      </div>
      ${
        videos.length
          ? `<button class="btn btn-primary btn-block" id="startToday"><i class="fa-solid fa-play"></i> 开始今日训练</button>`
          : `<a href="/admin.html" class="btn btn-ghost btn-block"><i class="fa-solid fa-plus"></i> 添加第一个视频</a>`
      }
    `;
  } else {
    const allDone = todayInProgress.length === 0 && todayDone.length > 0;
    box.innerHTML = `
      <div class="today-label">今日状态</div>
      <div class="today-headline ${allDone ? 'done' : 'idle'}">
        ${allDone ? '<i class="fa-solid fa-fire"></i> 今日已练 ' + todayDone.length + ' 次' : '今日已练 ' + totalToday + ' 次，<span class="accent">继续加油</span>'}
      </div>
      <div class="today-stats">
        <div class="today-stat"><div class="today-stat-num primary">${totalToday}</div><div class="today-stat-label">训练</div></div>
        <div class="today-stat"><div class="today-stat-num">${totalMinutes}</div><div class="today-stat-label">分钟</div></div>
        <div class="today-stat"><div class="today-stat-num accent">${todayDone.length}</div><div class="today-stat-label">完成</div></div>
      </div>
      ${
        videos.length
          ? `<button class="btn btn-primary btn-block" id="startToday"><i class="fa-solid fa-play"></i> ${allDone ? '再加练一次' : '继续训练'}</button>`
          : ''
      }
    `;
  }

  const startBtn = $('#startToday');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      const target = todayInProgress[0] || videos[0];
      if (target) window.location.href = `/player.html?v=${target.id}`;
    });
  }
}

/* ---------- 训练记录（今日训练计划） ---------- */
function renderNextSection(videos, seriesList) {
  const section = $('#nextSection');
  const grid = $('#nextGrid');

  // 1. 找最近一次完成的视频
  const completed = videos
    .filter((v) => v.completed && v.last_watched_at)
    .sort((a, b) => b.last_watched_at - a.last_watched_at);
  if (completed.length === 0) {
    section.style.display = 'none';
    return;
  }
  const lastDone = completed[0];

  // 2. 计算接下来要练的视频（最多 2 个）
  const nextVideos = computeNext(lastDone, videos, seriesList);

  // 3. 渲染
  section.style.display = '';
  let html = '';

  // 左侧：已完成的视频（大卡片）
  html += renderNextCard(lastDone, 'completed');

  // 右侧：接下来 1~2 个视频
  nextVideos.forEach((v, i) => {
    html += renderNextCard(v, i === 0 ? 'next-1' : 'next-2');
  });

  // 如果不足 3 个，用空白占位保持网格
  const totalSlots = 1 + nextVideos.length;
  if (totalSlots < 3) {
    for (let i = totalSlots; i < 3; i++) {
      html += '<div class="next-up-card" style="visibility:hidden"></div>';
    }
  }

  grid.innerHTML = html;

  // 绑定点击
  $$('.next-up-card[data-id]', grid).forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      if (id) window.location.href = `/player.html?v=${id}`;
    });
  });
}

/** 根据规则计算接下来要练的视频 */
function computeNext(lastDone, allVideos, seriesList) {
  const result = [];

  if (lastDone.series) {
    // 有系列：按规则计算
    const sameSeries = allVideos
      .filter((v) => v.series === lastDone.series)
      .sort((a, b) => (a.episode || 0) - (b.episode || 0));

    const idx = sameSeries.findIndex((v) => v.id === lastDone.id);
    const remaining = sameSeries.filter((v, i) => i > idx && !v.completed);

    if (remaining.length >= 2) {
      // 同系列还有 2+ 个未完成的视频 → 显示接下来 2 个
      result.push(remaining[0], remaining[1]);
    } else if (remaining.length === 1) {
      // 同系列只剩 1 个未完成的 → 显示它 + 下一个系列的第 1 集
      result.push(remaining[0]);
      const nextSeriesVideo = getFirstUncompletedVideoOfNextSeries(lastDone.series, allVideos, seriesList);
      if (nextSeriesVideo) result.push(nextSeriesVideo);
    } else {
      // 同系列已无未完成的 → 显示下一个系列的视频
      const nextSeriesVideo = getFirstUncompletedVideoOfNextSeries(lastDone.series, allVideos, seriesList);
      if (nextSeriesVideo) result.push(nextSeriesVideo);
      // 如果还需要第 2 个，取下一个系列的第 2 个未完成的集
      if (result.length < 2) {
        const nextName = getNextSeriesName(lastDone.series, seriesList);
        if (nextName) {
          const nextVids = allVideos
            .filter((v) => v.series === nextName && !v.completed)
            .sort((a, b) => (a.episode || 0) - (b.episode || 0));
          if (nextVids.length >= 2) result.push(nextVids[1]);
          else {
            // 下下个系列
            const nextNext = getFirstUncompletedVideoOfNextSeries(nextName, allVideos, seriesList);
            if (nextNext) result.push(nextNext);
          }
        }
      }
    }
  } else {
    // 无系列：找下一个未完成的独立视频
    const standalone = allVideos
      .filter((v) => !v.series && !v.completed)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    if (standalone.length > 0) result.push(standalone[0]);
    if (standalone.length > 1) result.push(standalone[1]);
  }

  return result.slice(0, 2);
}

/** 获取下一个系列的名称（按系列名称字母序） */
function getNextSeriesName(currentSeriesName, seriesList) {
  const sorted = [...seriesList].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const idx = sorted.findIndex((s) => s.name === currentSeriesName);
  if (idx >= 0 && idx < sorted.length - 1) return sorted[idx + 1].name;
  return null;
}

/** 获取下一个系列的第 1 个未完成的视频 */
function getFirstUncompletedVideoOfNextSeries(currentSeriesName, allVideos, seriesList) {
  const nextName = getNextSeriesName(currentSeriesName, seriesList);
  if (!nextName) return null;
  const videos = allVideos
    .filter((v) => v.series === nextName && !v.completed)
    .sort((a, b) => (a.episode || 0) - (b.episode || 0));
  return videos[0] || null;
}

function renderNextCard(video, type) {
  const cover = Pulse.safeUrl(video.cover) || Pulse.DEFAULT_COVER;
  const title = video.title || '未知视频';
  let badgeHtml = '';
  let episodeHtml = '';

  if (type === 'completed') {
    badgeHtml = '<div class="next-up-badge done"><i class="fa-solid fa-check"></i> 已完成</div>';
  } else if (type === 'next-1') {
    badgeHtml = '<div class="next-up-badge next-label"><i class="fa-solid fa-forward"></i> 接着练</div>';
  } else {
    badgeHtml = '<div class="next-up-badge next-label-2"><i class="fa-solid fa-forward"></i> 再练一个</div>';
  }

  if (video.episode) {
    episodeHtml = `<div class="next-up-episode">第 ${video.episode} 集</div>`;
  }

  const seriesLabel = video.series ? `<div class="next-up-meta"><i class="fa-solid fa-layer-group"></i> ${Pulse.escapeHtml(video.series)}</div>` : '';

  return `
    <div class="next-up-card ${type}" data-id="${video.id}">
      <div class="next-up-thumb">
        <img src="${Pulse.escapeHtml(cover)}" alt="${Pulse.escapeHtml(title)}" />
        <div class="next-up-play"><i class="fa-solid fa-play"></i></div>
        ${badgeHtml}
        ${episodeHtml}
      </div>
      <div class="next-up-info">
        <div class="next-up-title">${Pulse.escapeHtml(title)}</div>
        ${seriesLabel}
      </div>
    </div>`;
}

/* ---------- 继续观看 ---------- */
function renderContinue(videos) {
  const section = $('#continueSection');
  const strip = $('#continueStrip');
  const unfinished = videos.filter((v) => v.last_watched_at && !v.completed && (v.last_progress || 0) > 0);
  if (unfinished.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';
  strip.innerHTML = unfinished
    .map((v) => {
      const pct = v.duration ? Math.min(100, Math.round((v.last_progress / v.duration) * 100)) : 0;
      const cover = Pulse.safeUrl(v.cover) || Pulse.DEFAULT_COVER;
      return `
      <div class="video-card continue-card" data-id="${v.id}">
        <div class="video-thumb">
          <img src="${Pulse.escapeHtml(cover)}" alt="${Pulse.escapeHtml(v.title)}" />
          <div class="video-play"><i class="fa-solid fa-play"></i></div>
          <div class="video-duration">${Pulse.fmtDuration(v.last_progress)} / ${Pulse.fmtDuration(v.duration)}</div>
          <div class="video-progress-track"><div class="video-progress-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="video-info">
          <div class="video-title">${Pulse.escapeHtml(v.title)}</div>
          <div class="video-meta">
            <i class="fa-solid fa-clock-rotate-left"></i>
            <span>已看 ${pct}%</span>
            <span class="dot-sep"></span>
            <span>${Pulse.fmtDate(v.last_watched_at, { relative: true })}</span>
          </div>
        </div>
      </div>`;
    })
    .join('');
  bindCardClick(strip);
}

/* ---------- 首页网格：系列卡片 + 独立视频 ---------- */
function renderGrid(seriesList, videos) {
  const grid = $('#videoGrid');

  /* 独立视频 = 没有系列的视频 */
  const standalone = videos.filter((v) => !v.series);

  if (seriesList.length === 0 && standalone.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state-icon"><i class="fa-solid fa-dumbbell"></i></div>
        <h3>开始你的训练库</h3>
        <p>还没有视频。添加你的第一个训练视频，开启每日打卡。</p>
        <a href="/admin.html" class="btn btn-primary"><i class="fa-solid fa-plus"></i> 添加视频</a>
      </div>`;
    return;
  }

  /* 更新计数 */
  const totalCount = seriesList.length + standalone.length;
  $('#videoCount').textContent = `${totalCount} 个${seriesList.length > 0 ? ` · ${seriesList.length} 个系列` : ''}`;

  let html = '';

  /* 渲染系列卡片 */
  if (seriesList.length > 0) {
    html += '<div class="series-cards-grid">';
    for (const s of seriesList) {
      const cover = Pulse.safeUrl(s.cover) || Pulse.DEFAULT_COVER;
      const pct = s.episode_count > 0 ? Math.round((s.completed_count / s.episode_count) * 100) : 0;
      html += `
        <div class="series-card" data-series-id="${s.id}">
          <div class="series-card-cover">
            <img src="${Pulse.escapeHtml(cover)}" alt="${Pulse.escapeHtml(s.name)}" />
            <div class="series-card-overlay"></div>
            <div class="series-card-info">
              <div class="series-card-name">
                <i class="fa-solid fa-layer-group"></i>
                <span>${Pulse.escapeHtml(s.name)}</span>
              </div>
              <div class="series-card-stats">
                <span><i class="fa-solid fa-list-ol"></i> ${s.episode_count} 集</span>
                ${s.completed_count > 0 ? `<span class="series-card-done"><i class="fa-solid fa-check"></i> ${s.completed_count}</span>` : ''}
                ${s.in_progress_count > 0 ? `<span><i class="fa-solid fa-play"></i> ${s.in_progress_count}</span>` : ''}
              </div>
            </div>
            <div class="series-card-progress">
              <div class="series-card-progress-fill" style="width:${pct}%"></div>
            </div>
            <div class="series-card-enter">
              <i class="fa-solid fa-arrow-right"></i>
            </div>
          </div>
        </div>
      `;
    }
    html += '</div>';
  }

  /* 渲染独立视频 */
  if (standalone.length > 0) {
    if (seriesList.length > 0) {
      html += `
        <div class="standalone-section" style="grid-column:1/-1;margin-top:40px">
          <div class="section-head" style="margin-bottom:20px">
            <h2 class="section-title" style="font-size:24px"><span class="bar"></span>独立视频 <small>${standalone.length} 个</small></h2>
          </div>
        </div>
      `;
    }
    html += '<div class="video-grid standalone-grid">';
    html += standalone.map((v) => Pulse.renderVideoCard(v, false)).join('');
    html += '</div>';
  }

  grid.innerHTML = html;

  /* 封面加载失败回退 */
  $$('#videoGrid .video-thumb img').forEach(Pulse.coverOnError);
  $$('#videoGrid .series-card-cover img').forEach(Pulse.coverOnError);

  /* 绑定事件 */
  bindCardClick(grid);
  bindSeriesCardClick();
}

/* 系列卡片点击跳转 */
function bindSeriesCardClick() {
  $$('.series-card').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.seriesId;
      if (id) window.location.href = `/series.html?id=${id}`;
    });
  });
}

/* renderVideoCard 已抽取到 utils.js（Pulse.renderVideoCard） */

function bindCardClick(root) {
  $$('.video-card[data-id]', root).forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      if (id) window.location.href = `/player.html?v=${id}`;
    });
  });
}
