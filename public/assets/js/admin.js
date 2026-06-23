/* 管理页逻辑：视频 CRUD + 模态框 + 批量管理 + 排序 + 系列 */
(async function () {
  renderNav('admin');
  const ok = await requireAdmin();
  if (!ok) return;

  const list = $('#adminList');
  const addBtn = $('#addBtn');
  const batchAddBtn = $('#batchAddBtn');
  const batchManageBtn = $('#batchManageBtn');

  /* 骨架 */
  list.innerHTML = Array.from({ length: 3 })
    .map(
      () => `<div class="admin-row"><div class="skeleton" style="width:140px;aspect-ratio:16/9"></div><div style="flex:1"><div class="skeleton" style="height:16px;width:50%;margin-bottom:8px"></div><div class="skeleton" style="height:12px;width:80%"></div></div></div>`
    )
    .join('');

  let videos = [];
  let seriesMeta = new Map();
  let batchMode = false;
  let selectedIds = new Set();

  try {
    const [videoRes, seriesRes] = await Promise.all([
      api.videos.list(),
      api.series.list(),
    ]);
    videos = (videoRes && videoRes.videos) || [];
    const sl = (seriesRes && seriesRes.series) || [];
    sl.forEach((s) => seriesMeta.set(s.name, s));
  } catch (e) {
    list.innerHTML = '';
    Pulse.toast(e.message || '加载失败', 'error');
    return;
  }

  renderList(videos);

  addBtn.addEventListener('click', () => openModal(null, videos));
  batchAddBtn.addEventListener('click', () => openBatchAddModal());
  batchManageBtn.addEventListener('click', () => toggleBatchMode());

  /* ---- 批量管理模式 ---- */
  function toggleBatchMode() {
    batchMode = !batchMode;
    selectedIds.clear();

    batchManageBtn.classList.toggle('btn-primary', batchMode);
    batchManageBtn.classList.toggle('btn-accent', !batchMode);
    batchManageBtn.innerHTML = batchMode
      ? '<i class="fa-solid fa-xmark"></i> 退出管理'
      : '<i class="fa-solid fa-list-check"></i> 批量管理';
    renderList(videos);
    updateBatchBar();

    /* 批量管理模式下展开所有系列方便勾选；退出后 renderList 自动还原为折叠 */
    if (batchMode) {
      $$('.admin-series-body.collapsed').forEach(body => {
        body.classList.remove('collapsed');
        const header = body.previousElementSibling;
        if (header) {
          const icon = header.querySelector('.series-toggle-btn i');
          if (icon) icon.style.transform = 'rotate(0deg)';
        }
      });
    }
  }

  function updateBatchBar() {
    const bar = $('#batchBar');
    if (!bar) return;
    const count = selectedIds.size;
    if (batchMode && count > 0) {
      bar.style.display = '';
      $('#batchBarCount').textContent = count;
    } else {
      bar.style.display = 'none';
    }
  }

  function renderList(items) {
    if (items.length === 0) {
      $('#firstHint').style.display = '';
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fa-solid fa-dumbbell"></i></div>
          <h3>训练库还是空的</h3>
          <p>点击"添加视频"，填入 OpenList 或其它可播放的视频直链。需要标题、视频链接，可选封面图。</p>
          <button class="btn btn-primary" id="firstAddBtn">
            <i class="fa-solid fa-plus"></i> 添加第一个视频
          </button>
        </div>`;
      /* 绑定事件（避免 inline onclick 违反 CSP） */
      const firstBtn = $('#firstAddBtn');
      if (firstBtn) firstBtn.addEventListener('click', () => addBtn.click());
      return;
    }
    $('#firstHint').style.display = 'none';

    /* 按系列分组 */
    const seriesMap = new Map();
    const standalone = [];
    items.forEach((v) => {
      if (v.series) {
        if (!seriesMap.has(v.series)) seriesMap.set(v.series, []);
        seriesMap.get(v.series).push(v);
      } else {
        standalone.push(v);
      }
    });

    let html = '';

    /* 渲染系列分组 */
    for (const [seriesName, seriesVideos] of seriesMap) {
      const completedCount = seriesVideos.filter((v) => v.completed).length;
      const meta = seriesMeta.get(seriesName);
      const seriesId = meta ? meta.id : null;
      const editBtn = seriesId
        ? `<button class="icon-btn series-edit-btn" data-series-id="${seriesId}" data-series-name="${Pulse.escapeHtml(seriesName)}" title="编辑系列"><i class="fa-solid fa-image"></i></button>`
        : '';
      html += `
        <div class="admin-series-group" data-series="${Pulse.escapeHtml(seriesName)}">
          <div class="admin-series-header">
            <div class="admin-series-title">
              <i class="fa-solid fa-layer-group"></i>
              <span>${Pulse.escapeHtml(seriesName)}</span>
              <span class="admin-series-count">${seriesVideos.length} 集</span>
              ${completedCount > 0 ? `<span class="badge badge-success"><i class="fa-solid fa-check"></i> ${completedCount}/${seriesVideos.length}</span>` : ''}
            </div>
            <div class="admin-series-header-right">
              ${editBtn}
              <button class="icon-btn series-toggle-btn" title="展开/折叠">
                <i class="fa-solid fa-chevron-down" style="transform:rotate(-90deg)"></i>
              </button>
            </div>
          </div>
          <div class="admin-series-body collapsed">
            ${seriesVideos.map((v, idx) => renderRow(v, idx, seriesVideos, 'series')).join('')}
          </div>
        </div>
      `;
    }

    /* 渲染独立视频 */
    if (standalone.length > 0) {
      if (seriesMap.size > 0) {
        html += `
          <div class="admin-series-group">
            <div class="admin-series-header">
              <div class="admin-series-title">
                <i class="fa-solid fa-dumbbell"></i>
                <span>独立视频</span>
                <span class="admin-series-count">${standalone.length} 个</span>
              </div>
              <button class="icon-btn series-toggle-btn" title="展开/折叠">
                <i class="fa-solid fa-chevron-down" style="transform:rotate(-90deg)"></i>
              </button>
            </div>
            <div class="admin-series-body collapsed">
              ${standalone.map((v, idx) => renderRow(v, idx, standalone, 'standalone')).join('')}
            </div>
          </div>
        `;
      } else {
        html += standalone.map((v, idx) => renderRow(v, idx, standalone, 'standalone')).join('');
      }
    }

    list.innerHTML = html;
    bindRowEvents();
  }

  function renderRow(v, idx, group, groupType) {
    const checked = selectedIds.has(v.id) ? 'checked' : '';
    const checkboxHtml = batchMode
      ? `<input type="checkbox" class="batch-checkbox" data-id="${v.id}" ${checked} />`
      : '';
    const sortBtnsHtml = batchMode
      ? `<div class="sort-btns">
           <button class="icon-btn sort-up" data-id="${v.id}" data-dir="up" data-group="${groupType}" title="上移" ${idx === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
           <button class="icon-btn sort-down" data-id="${v.id}" data-dir="down" data-group="${groupType}" title="下移" ${idx === group.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
         </div>`
      : '';

    const seriesBadge = v.series
      ? `<span class="badge badge-accent"><i class="fa-solid fa-hashtag"></i> 第${v.episode || 1}集</span>`
      : '';

    return `
      <div class="admin-row ${batchMode ? 'batch-mode' : ''} ${selectedIds.has(v.id) ? 'selected' : ''}" data-id="${v.id}">
        ${checkboxHtml}
        <div class="admin-row-thumb">
          <img src="${Pulse.escapeHtml(Pulse.getVideoCover(v))}" alt="${Pulse.escapeHtml(v.title)}" data-fallback="1" />
        </div>
        <div class="admin-row-info">
          <div class="admin-row-title">${Pulse.escapeHtml(v.title)}</div>
          <div class="admin-row-url">${Pulse.escapeHtml(v.url)}</div>
          <div class="admin-row-meta">
            ${seriesBadge}
            ${v.duration ? `<span class="badge"><i class="fa-solid fa-clock"></i> ${Pulse.fmtDuration(v.duration)}</span>` : ''}
            ${v.completed ? '<span class="badge badge-success"><i class="fa-solid fa-check"></i> 已完成</span>' : ''}
            ${v.has_password ? '<span class="badge badge-accent"><i class="fa-solid fa-lock"></i> 加密</span>' : ''}
            <span class="badge">${Pulse.fmtDate(v.created_at)}</span>
          </div>
        </div>
        <div class="admin-row-actions">
          ${sortBtnsHtml}
          <a class="icon-btn" href="/player.html?v=${v.id}" title="播放"><i class="fa-solid fa-play"></i></a>
          <button class="icon-btn" data-act="edit" title="编辑"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-btn danger" data-act="del" title="删除"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
  }

  function bindRowEvents() {
    /* 封面加载失败回退 */
    $$('.admin-row-thumb img[data-fallback]', list).forEach(Pulse.coverOnError);

    /* 系列编辑按钮 */
    $$('.series-edit-btn', list).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sid = Number(btn.dataset.seriesId);
        const sname = btn.dataset.seriesName;
        const meta = seriesMeta.get(sname) || {};
        openSeriesEditModal(sid, sname, meta.cover || '', meta.description || '');
      });
    });

    $$('.admin-row', list).forEach((row) => {
      const id = Number(row.dataset.id);

      /* 复选框 */
      const cb = $('.batch-checkbox', row);
      if (cb) {
        cb.addEventListener('change', () => {
          if (cb.checked) {
            selectedIds.add(id);
            row.classList.add('selected');
          } else {
            selectedIds.delete(id);
            row.classList.remove('selected');
          }
          updateBatchBar();
        });
        row.addEventListener('click', (e) => {
          if (!batchMode) return;
          if (e.target.closest('.admin-row-actions')) return;
          if (e.target === cb) return;
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        });
      }

      /* 编辑/删除 */
      const editBtn = $('[data-act="edit"]', row);
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const v = videos.find((x) => x.id === id);
          if (v) openModal(v, videos);
        });
      }
      const delBtn = $('[data-act="del"]', row);
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const v = videos.find((x) => x.id === id);
          if (v) confirmDelete(v, () => reload());
        });
      }

      /* 排序按钮 */
      const sortUp = $('.sort-up', row);
      if (sortUp) {
        sortUp.addEventListener('click', (e) => {
          e.stopPropagation();
          moveItem(id, -1, sortUp.dataset.group);
        });
      }
      const sortDown = $('.sort-down', row);
      if (sortDown) {
        sortDown.addEventListener('click', (e) => {
          e.stopPropagation();
          moveItem(id, 1, sortDown.dataset.group);
        });
      }
    });

    /* 系列分组折叠/展开 */
    $$('.admin-series-header').forEach((header) => {
      header.addEventListener('click', (e) => {
        // 点击按钮或编辑系列按钮时不触发折叠
        if (e.target.closest('.series-toggle-btn')) return;
        if (e.target.closest('.series-edit-btn')) return;
        const body = header.nextElementSibling;
        if (!body || !body.classList.contains('admin-series-body')) return;
        toggleSeriesBody(body, header);
      });
    });

    /* 折叠/展开按钮（阻止冒泡，单独处理） */
    $$('.series-toggle-btn', list).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const header = btn.closest('.admin-series-header');
        const body = header ? header.nextElementSibling : null;
        if (!body || !body.classList.contains('admin-series-body')) return;
        toggleSeriesBody(body, header);
      });
    });
  }

  function toggleSeriesBody(body, header) {
    const icon = header ? header.querySelector('.series-toggle-btn i') : null;
    if (body.classList.contains('collapsed')) {
      body.classList.remove('collapsed');
      if (icon) icon.style.transform = 'rotate(0deg)';
    } else {
      body.classList.add('collapsed');
      if (icon) icon.style.transform = 'rotate(-90deg)';
    }
  }

  /* 上移/下移 —— 系列内交换 episode，独立视频交换 sort_order */
  async function moveItem(id, direction, groupType) {
    /* 找到当前视频在哪个分组 */
    let group;
    if (groupType === 'series') {
      const v = videos.find((x) => x.id === id);
      if (!v || !v.series) return;
      group = videos.filter((x) => x.series === v.series);
    } else {
      group = videos.filter((x) => !x.series);
    }

    const idx = group.findIndex((v) => v.id === id);
    if (idx < 0) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= group.length) return;

    /* 交换位置 */
    [group[idx], group[targetIdx]] = [group[targetIdx], group[idx]];

    /* 构建更新项 */
    const items = group.map((v, i) => {
      if (groupType === 'series') {
        return { id: v.id, episode: i + 1 };
      } else {
        return { id: v.id, sort_order: group.length - i };
      }
    });

    /* 同步本地数据 */
    items.forEach((it) => {
      const v = videos.find((x) => x.id === it.id);
      if (v) {
        if (groupType === 'series') v.episode = it.episode;
        else v.sort_order = it.sort_order;
      }
    });

    renderList(videos);

    try {
      await api.post('/api/videos/reorder', { items });
      Pulse.toast('排序已保存', 'success');
    } catch (e) {
      Pulse.toast('排序保存失败', 'error');
      reload();
    }
  }

  async function reload() {
    try {
      const [videoRes, seriesRes] = await Promise.all([
        api.videos.list(),
        api.series.list(),
      ]);
      videos = (videoRes && videoRes.videos) || [];
      const sl = (seriesRes && seriesRes.series) || [];
      seriesMeta.clear();
      sl.forEach((s) => seriesMeta.set(s.name, s));
      renderList(videos);
      updateBatchBar();
    } catch (e) {
      Pulse.toast(e.message || '刷新失败', 'error');
    }
  }
})();

/* ---------- 批量操作工具栏 ---------- */
function setupBatchBar() {
  const bar = el('div', { id: 'batchBar', class: 'batch-bar' });
  bar.style.display = 'none';
  bar.innerHTML = `
    <div class="batch-bar-inner">
      <div class="batch-bar-info">
        <i class="fa-solid fa-check-circle"></i>
        已选 <strong id="batchBarCount">0</strong> 个视频
      </div>
      <div class="batch-bar-actions">
        <button class="btn btn-ghost btn-sm" id="batchClearBtn"><i class="fa-solid fa-xmark"></i> 取消选择</button>
        <button class="btn btn-ghost btn-sm" id="batchSelectAllBtn"><i class="fa-solid fa-check-double"></i> 全选</button>
        <button class="btn btn-ghost btn-sm" id="batchCoverBtn"><i class="fa-solid fa-image"></i> 设置封面</button>
        <button class="btn btn-ghost btn-sm" id="batchSeriesBtn"><i class="fa-solid fa-layer-group"></i> 设置系列</button>
        <button class="btn btn-danger btn-sm" id="batchDeleteBtn"><i class="fa-solid fa-trash"></i> 批量删除</button>
      </div>
    </div>
  `;
  document.body.appendChild(bar);

  $('#batchClearBtn', bar).addEventListener('click', () => {
    document.querySelectorAll('.batch-checkbox').forEach((cb) => {
      cb.checked = false;
      cb.closest('.admin-row')?.classList.remove('selected');
    });
    document.querySelectorAll('.batch-checkbox').forEach((cb) => cb.dispatchEvent(new Event('change')));
  });

  $('#batchSelectAllBtn', bar).addEventListener('click', () => {
    const allCbs = document.querySelectorAll('.batch-checkbox');
    const allChecked = Array.from(allCbs).every((cb) => cb.checked);
    allCbs.forEach((cb) => {
      cb.checked = !allChecked;
      cb.dispatchEvent(new Event('change'));
    });
  });

  $('#batchCoverBtn', bar).addEventListener('click', () => openBatchCoverModal());
  $('#batchSeriesBtn', bar).addEventListener('click', () => openBatchSeriesModal());
  $('#batchDeleteBtn', bar).addEventListener('click', () => openBatchDeleteModal());
}

setupBatchBar();

/* ---------- 批量设置系列模态框 ---------- */
function openBatchSeriesModal() {
  const ids = getSelectedIds();
  if (ids.length === 0) {
    Pulse.toast('请先选择视频', 'warning');
    return;
  }

  const mask = el('div', { class: 'modal-mask' });
  const modal = el('div', { class: 'modal', role: 'dialog', style: 'max-width:520px' });
  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">批量设置系列</div>
      <button class="modal-close" data-act="close"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="modal-body">
      <p style="margin-bottom:12px;color:var(--text-muted);font-size:13px">将为选中的 <strong>${ids.length}</strong> 个视频设置系列名称。同一系列的视频会在首页分组展示。</p>
      <div class="form-group">
        <label class="form-label">系列名称</label>
        <input class="form-input" id="batchSeriesInput" placeholder="如：HIIT 燃脂训练" maxlength="200" />
        <div class="form-hint">留空并保存可取消系列归属。</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-act="close">取消</button>
      <button class="btn btn-primary" data-act="save"><i class="fa-solid fa-check"></i> 保存</button>
    </div>
  `;
  mask.appendChild(modal);
  document.body.appendChild(mask);
  mask.classList.add('show');

  mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-act="close"]')) mask.remove(); });

  $('[data-act="save"]', modal).addEventListener('click', async () => {
    const btn = $('[data-act="save"]', modal);
    const seriesName = $('#batchSeriesInput', modal).value.trim();
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 保存中';
    try {
      await api.post('/api/videos/batch-update', { ids, series: seriesName });
      Pulse.toast(`已更新 ${ids.length} 个视频的系列`, 'success');
      mask.remove();
      setTimeout(() => location.reload(), 400);
    } catch (e) {
      Pulse.toast(e.message || '保存失败', 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> 保存';
    }
  });
}

/* ---------- 批量设置封面模态框 ---------- */
function openBatchCoverModal() {
  const ids = getSelectedIds();
  if (ids.length === 0) {
    Pulse.toast('请先选择视频', 'warning');
    return;
  }

  const mask = el('div', { class: 'modal-mask' });
  const modal = el('div', { class: 'modal', role: 'dialog', style: 'max-width:520px' });
  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">批量设置封面</div>
      <button class="modal-close" data-act="close"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="modal-body">
      <p style="margin-bottom:12px;color:var(--text-muted);font-size:13px">将为选中的 <strong>${ids.length}</strong> 个视频统一设置封面图链接。</p>
      <div class="form-group">
        <label class="form-label">封面图链接</label>
        <input class="form-input" id="batchCoverInput" placeholder="https://...jpg" type="url" />
        <div class="cover-preview empty" id="batchCoverPreview"></div>
      </div>
      <div class="form-hint">留空并保存可清除所有选中视频的封面。</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-act="close">取消</button>
      <button class="btn btn-primary" data-act="save"><i class="fa-solid fa-check"></i> 保存</button>
    </div>
  `;
  mask.appendChild(modal);
  document.body.appendChild(mask);
  mask.classList.add('show');

  mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-act="close"]')) mask.remove(); });

  const coverInput = $('#batchCoverInput', modal);
  const coverPreview = $('#batchCoverPreview', modal);

  function updatePreview() {
    const val = coverInput.value.trim();
    if (val) {
      coverPreview.classList.remove('empty');
      coverPreview.innerHTML = `<img src="${Pulse.escapeHtml(val)}" />`;
      const previewImg = coverPreview.querySelector('img');
      if (previewImg) previewImg.addEventListener('error', () => { coverPreview.classList.add('empty'); previewImg.remove(); });
    } else {
      coverPreview.classList.add('empty');
      coverPreview.innerHTML = '';
    }
  }
  coverInput.addEventListener('input', Pulse.debounce(updatePreview, 300));

  $('[data-act="save"]', modal).addEventListener('click', async () => {
    const btn = $('[data-act="save"]', modal);
    const coverUrl = coverInput.value.trim();
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 保存中';
    try {
      await api.post('/api/videos/batch-update', { ids, cover: coverUrl });
      Pulse.toast(`已更新 ${ids.length} 个视频的封面`, 'success');
      mask.remove();
      setTimeout(() => location.reload(), 400);
    } catch (e) {
      Pulse.toast(e.message || '保存失败', 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> 保存';
    }
  });
}

/* ---------- 批量删除确认模态框 ---------- */
function openBatchDeleteModal() {
  const ids = getSelectedIds();
  if (ids.length === 0) {
    Pulse.toast('请先选择视频', 'warning');
    return;
  }

  const mask = el('div', { class: 'modal-mask' });
  const modal = el('div', { class: 'modal', role: 'alertdialog', style: 'max-width:420px' });
  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">批量删除</div>
      <button class="modal-close" data-act="cancel"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="modal-body">
      <p style="margin-bottom:10px">确定删除选中的 <strong style="color:var(--danger)">${ids.length}</strong> 个视频吗？</p>
      <div style="padding:12px;background:var(--danger-soft);border:1px solid rgba(239,68,68,0.3);border-radius:8px;font-size:13px;color:var(--danger)">
        <i class="fa-solid fa-triangle-exclamation"></i> 这些视频的观看记录也会一并删除，操作不可撤销。
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-act="cancel">取消</button>
      <button class="btn btn-danger" data-act="ok"><i class="fa-solid fa-trash"></i> 确认删除 (${ids.length})</button>
    </div>
  `;
  mask.appendChild(modal);
  document.body.appendChild(mask);
  mask.classList.add('show');

  mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-act="cancel"]')) mask.remove(); });

  $('[data-act="ok"]', modal).addEventListener('click', async () => {
    const btn = $('[data-act="ok"]', modal);
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 删除中';
    try {
      await api.post('/api/videos/batch-delete', { ids });
      Pulse.toast(`已删除 ${ids.length} 个视频`, 'success');
      mask.remove();
      setTimeout(() => location.reload(), 400);
    } catch (e) {
      Pulse.toast(e.message || '删除失败', 'error');
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-trash"></i> 确认删除 (${ids.length})`;
    }
  });
}

function getSelectedIds() {
  return Array.from(document.querySelectorAll('.batch-checkbox:checked')).map((cb) => Number(cb.dataset.id));
}

/* ---------- 添加/编辑模态框 ---------- */
function openModal(video, allVideos) {
  const isEdit = !!video;
  const v = video || { title: '', url: '', cover: '', description: '', duration: 0, sort_order: 0, series: '', episode: 0, alist_password: '' };

  const mask = el('div', { class: 'modal-mask' });
  const modal = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });

  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">${isEdit ? '编辑视频' : '添加视频'}</div>
      <button class="modal-close" data-act="close"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="modal-body">
      <form id="videoForm">
        <div class="form-group">
          <label class="form-label">标题<span class="req">*</span></label>
          <input class="form-input" name="title" value="${Pulse.escapeHtml(v.title)}" placeholder="如：全身燃脂 20 分钟" required maxlength="200" />
        </div>
        <div class="form-group">
          <label class="form-label">视频直链<span class="req">*</span></label>
          <input class="form-input" name="url" value="${Pulse.escapeHtml(v.url)}" placeholder="https://openlist.example.com/d/训练/视频.mp4 或 https://cdn.example.com/video.mp4" required type="url" />
          <div class="form-hint">OpenList 链接会自动刷新签名；其它 http(s) 视频直链会直接播放。</div>
        </div>
        <div class="form-group">
          <label class="form-label">封面图链接</label>
          <input class="form-input" name="cover" value="${Pulse.escapeHtml(v.cover || '')}" placeholder="https://...jpg（可留空）" type="url" id="coverInput" />
          <div class="cover-preview empty" id="coverPreview"></div>
        </div>
        <div class="form-group">
          <label class="form-label">OpenList 目录访问密码</label>
          <input class="form-input" name="alist_password" value="" placeholder="${isEdit && v.has_password ? '已保存，留空保持不变，输入新值则覆盖' : '目录设了密码才填（可留空）'}" maxlength="200" />
          <div class="form-hint">仅当 OpenList 目录设了访问密码时填写。普通视频直链不需要此项；需要账号登录的 OpenList 资源请在部署环境中配置 token。</div>
        </div>
        <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <label class="form-label">系列名称</label>
            <input class="form-input" name="series" value="${Pulse.escapeHtml(v.series || '')}" placeholder="如：HIIT 燃脂训练（可留空）" maxlength="200" />
            <div class="form-hint">同名视频自动归为一个系列</div>
          </div>
          <div>
            <label class="form-label">集数</label>
            <input class="form-input" name="episode" type="number" min="0" value="${v.episode || 0}" />
            <div class="form-hint">系列内排序，0 表示不编号</div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">描述</label>
          <textarea class="form-textarea" name="description" placeholder="可选，训练说明" maxlength="2000">${Pulse.escapeHtml(v.description || '')}</textarea>
        </div>
        <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <label class="form-label">时长（秒）</label>
            <input class="form-input" name="duration" type="number" min="0" value="${v.duration || 0}" />
            <div class="form-hint">不知道可填 0，播放后会自动更新</div>
          </div>
          <div>
            <label class="form-label">排序权重</label>
            <input class="form-input" name="sort_order" type="number" value="${v.sort_order || 0}" />
            <div class="form-hint">越大越靠前</div>
          </div>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-act="close">取消</button>
      <button class="btn btn-primary" data-act="save" id="saveBtn"><i class="fa-solid fa-check"></i> ${isEdit ? '保存修改' : '添加'}</button>
    </div>
  `;

  mask.appendChild(modal);
  document.body.appendChild(mask);
  mask.classList.add('show');
  mask.addEventListener('click', (e) => {
    if (e.target === mask) mask.remove();
  });
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-act="close"]')) mask.remove(); });

  /* 封面预览 */
  const coverInput = $('#coverInput', modal);
  const coverPreview = $('#coverPreview', modal);
  function updatePreview() {
    const val = coverInput.value.trim();
    if (val) {
      coverPreview.classList.remove('empty');
      coverPreview.innerHTML = `<img src="${Pulse.escapeHtml(val)}" />`;
      const previewImg = coverPreview.querySelector('img');
      if (previewImg) previewImg.addEventListener('error', () => { coverPreview.classList.add('empty'); previewImg.remove(); });
    } else {
      coverPreview.classList.add('empty');
      coverPreview.innerHTML = '';
    }
  }
  coverInput.addEventListener('input', Pulse.debounce(updatePreview, 300));
  updatePreview();

  /* 保存 */
  $('#saveBtn', modal).addEventListener('click', async () => {
    const form = $('#videoForm', modal);
    const fd = new FormData(form);
    const data = {
      title: fd.get('title'),
      url: fd.get('url'),
      cover: fd.get('cover'),
      description: fd.get('description'),
      duration: Number(fd.get('duration')) || 0,
      sort_order: Number(fd.get('sort_order')) || 0,
      series: fd.get('series'),
      episode: Number(fd.get('episode')) || 0,
    };
    /* 编辑模式下，OpenList 目录密码留空表示不修改；新建时才提交空值 */
    const alistPwd = fd.get('alist_password');
    if (!isEdit || alistPwd) {
      data.alist_password = alistPwd;
    }
    if (!data.title || !data.url) {
      Pulse.toast('标题和链接不能为空', 'warning');
      return;
    }
    const btn = $('#saveBtn', modal);
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 保存中';
    try {
      if (isEdit) {
        await api.videos.update(video.id, data);
        Pulse.toast('已保存修改', 'success');
      } else {
        await api.videos.create(data);
        Pulse.toast('已添加视频', 'success');
      }
      closeModal();
      setTimeout(() => location.reload(), 400);
    } catch (e) {
      Pulse.toast(e.message || '保存失败', 'error');
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-check"></i> ${isEdit ? '保存修改' : '添加'}`;
    }
  });

  function closeModal() {
    mask.remove();
  }
}

/* ---------- 批量添加模态框 ---------- */
function openBatchAddModal() {
  const mask = el('div', { class: 'modal-mask' });
  const modal = el('div', { class: 'modal modal-lg', role: 'dialog', 'aria-modal': 'true' });

  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">批量添加视频</div>
      <button class="modal-close" data-act="close"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="modal-body">
      <div style="display:flex;gap:10px;margin-bottom:16px;align-items:flex-end;flex-wrap:wrap">
        <div class="form-group" style="flex:1;min-width:200px;margin:0">
          <label class="form-label">OpenList 目录路径</label>
          <input class="form-input" id="batchPath" value="/" placeholder="例：/视频/训练" />
        </div>
        <div class="form-group" style="flex:1;min-width:150px;margin:0">
          <label class="form-label">目录密码（可选）</label>
          <input class="form-input" id="batchPassword" value="" placeholder="目录设了密码才填" />
        </div>
        <button class="btn btn-primary" id="batchBrowseBtn" style="white-space:nowrap">
          <i class="fa-solid fa-folder-open"></i> 浏览
        </button>
      </div>

      <div class="form-group" style="margin-bottom:16px">
        <label class="form-label">系列名称（可选）</label>
        <div style="display:flex;gap:10px;align-items:center">
          <input class="form-input" id="batchSeriesName" placeholder="如：HIIT 燃脂训练（留空则不归入系列）" maxlength="200" style="flex:1" />
          <label style="font-size:13px;display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap">
            <input type="checkbox" id="batchAutoEpisode" checked /> 自动编号
          </label>
        </div>
        <div class="form-hint">填写系列名后，选中的视频会自动按文件名自然排序编号（第1集、第2集…），解决 1/10/2 的排序问题</div>
      </div>

      <div class="form-group" style="margin-bottom:16px">
        <label class="form-label">系列封面图链接（可选）</label>
        <input class="form-input" id="batchSeriesCover" placeholder="https://...jpg（系列封面图，留空则不设置）" type="url" />
        <div class="cover-preview empty" id="batchSeriesCoverPreview" style="margin-top:8px"></div>
        <div class="form-hint">设置后，该系列的封面将使用此图片（与单个视频封面独立）</div>
      </div>

      <div class="batch-breadcrumb" id="batchBreadcrumb" style="display:none;margin-bottom:12px;font-size:13px;color:var(--text-muted);align-items:center;gap:6px;flex-wrap:wrap">
      </div>

      <div id="batchContent" style="display:none">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="font-size:14px;font-weight:600">选择要添加的视频</div>
          <div style="display:flex;gap:8px;align-items:center">
            <label style="font-size:13px;display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="checkbox" id="batchSelectAll" /> 全选
            </label>
            <span style="font-size:12px;color:var(--text-dim)" id="batchSelectedCount">已选 0 个</span>
          </div>
        </div>
        <div class="batch-list" id="batchList" style="max-height:400px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px">
        </div>
      </div>

      <div id="batchLoading" style="display:none;text-align:center;padding:40px;color:var(--text-muted)">
        <span class="spinner"></span> 加载中...
      </div>

      <div id="batchError" style="display:none;padding:12px;background:var(--danger-soft);border:1px solid rgba(239,68,68,0.3);border-radius:var(--radius-sm);color:var(--danger);font-size:13px;margin-top:12px"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-act="close">取消</button>
      <button class="btn btn-accent" id="batchAddBtnConfirm" disabled>
        <i class="fa-solid fa-layer-group"></i> 批量添加 (<span id="batchAddCount">0</span>)
      </button>
    </div>
  `;

  mask.appendChild(modal);
  document.body.appendChild(mask);
  mask.classList.add('show');

  mask.addEventListener('click', (e) => {
    if (e.target === mask) mask.remove();
  });
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-act="close"]')) mask.remove(); });

  const batchPath = $('#batchPath', modal);
  const batchPassword = $('#batchPassword', modal);
  const batchBrowseBtn = $('#batchBrowseBtn', modal);
  const batchSeriesName = $('#batchSeriesName', modal);
  const batchAutoEpisode = $('#batchAutoEpisode', modal);
  const batchBreadcrumb = $('#batchBreadcrumb', modal);
  const batchContent = $('#batchContent', modal);
  const batchList = $('#batchList', modal);
  const batchLoading = $('#batchLoading', modal);
  const batchError = $('#batchError', modal);
  const batchSelectAll = $('#batchSelectAll', modal);
  const batchSelectedCount = $('#batchSelectedCount', modal);
  const batchAddBtnConfirm = $('#batchAddBtnConfirm', modal);
  const batchAddCount = $('#batchAddCount', modal);

  let currentPath = '/';
  let allVideos = [];

  batchBrowseBtn.addEventListener('click', () => browseDirectory(batchPath.value, batchPassword.value));

  batchPath.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      browseDirectory(batchPath.value, batchPassword.value);
    }
  });

  batchSelectAll.addEventListener('change', () => {
    const checked = batchSelectAll.checked;
    $$('input[data-video-index]', batchList).forEach((cb) => {
      cb.checked = checked;
    });
    updateSelection();
  });

  /* 系列封面预览 */
  const batchSeriesCover = $('#batchSeriesCover', modal);
  const batchSeriesCoverPreview = $('#batchSeriesCoverPreview', modal);
  if (batchSeriesCover && batchSeriesCoverPreview) {
    batchSeriesCover.addEventListener('input', () => {
      const url = batchSeriesCover.value.trim();
      if (url && /^https?:\/\/.+/.test(url)) {
        batchSeriesCoverPreview.classList.remove('empty');
        batchSeriesCoverPreview.innerHTML = `<img src="${Pulse.escapeHtml(url)}" alt="封面预览" onerror="this.parentElement.classList.add('empty');this.remove()" />`;
      } else {
        batchSeriesCoverPreview.classList.add('empty');
        batchSeriesCoverPreview.innerHTML = '';
      }
    });
  }

  batchAddBtnConfirm.addEventListener('click', async () => {
      const selected = getSelectedVideos();
      if (selected.length === 0) {
        Pulse.toast('请先选择要添加的视频', 'warning');
        return;
      }

      batchAddBtnConfirm.disabled = true;
      batchAddBtnConfirm.innerHTML = '<span class="spinner"></span> 添加中...';

      try {
        const seriesName = batchSeriesName.value.trim();
        const seriesCover = batchSeriesCover?.value.trim() || '';
        const r = await api.post('/api/alist/batch-add', {
          videos: selected,
          alist_password: batchPassword.value || '',
          series: seriesName || undefined,
          series_cover: seriesName && seriesCover ? seriesCover : undefined,
        });

        let msg = `成功添加 ${r.success} 个视频`;
        if (seriesName) msg += `（系列：${seriesName}）`;
        if (r.skipped > 0) msg += `，${r.skipped} 个已存在`;
        if (r.errors && r.errors.length > 0) msg += `，${r.errors.length} 个失败`;

        Pulse.toast(msg, r.success > 0 ? 'success' : 'warning');

        if (r.success > 0) {
          mask.remove();
          setTimeout(() => location.reload(), 400);
        }
      } catch (e) {
        Pulse.toast(e.message || '批量添加失败', 'error');
        batchAddBtnConfirm.disabled = false;
        batchAddBtnConfirm.innerHTML = `<i class="fa-solid fa-layer-group"></i> 批量添加 (<span id="batchAddCount">${getSelectedCount()}</span>)`;
      }
    });

  async function browseDirectory(path, password) {
    path = (path || '/').trim();
    if (!path.startsWith('/')) path = '/' + path;

    batchLoading.style.display = '';
    batchContent.style.display = 'none';
    batchError.style.display = 'none';

    try {
      const r = await api.post('/api/alist/browse', { path, password });

      currentPath = r.path;
      batchPath.value = currentPath;

      renderBreadcrumb(currentPath);
      renderList(r.directories || [], r.videos || []);

      batchLoading.style.display = 'none';
      batchContent.style.display = '';
    } catch (e) {
      batchLoading.style.display = 'none';
      batchError.style.display = '';
      batchError.textContent = e.message || '浏览失败';
    }
  }

  function renderBreadcrumb(path) {
    const parts = path.split('/').filter(Boolean);
    let breadcrumbHtml = '<i class="fa-solid fa-folder"></i> ';
    breadcrumbHtml += '<a href="#" data-path="/" style="color:var(--primary);text-decoration:none">根目录</a>';

    let accumulatedPath = '';
    parts.forEach((part, i) => {
      accumulatedPath += '/' + part;
      const p = accumulatedPath;
      breadcrumbHtml += ' <i class="fa-solid fa-chevron-right" style="font-size:10px"></i> ';
      if (i === parts.length - 1) {
        breadcrumbHtml += `<span style="color:var(--text)">${Pulse.escapeHtml(part)}</span>`;
      } else {
        breadcrumbHtml += `<a href="#" data-path="${Pulse.escapeHtml(p)}" style="color:var(--primary);text-decoration:none">${Pulse.escapeHtml(part)}</a>`;
      }
    });

    batchBreadcrumb.innerHTML = breadcrumbHtml;
    batchBreadcrumb.style.display = 'flex';

    $$('a[data-path]', batchBreadcrumb).forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        browseDirectory(link.dataset.path, batchPassword.value);
      });
    });
  }

  function renderList(directories, videos) {
    allVideos = videos;

    let html = '';

    directories.forEach((dir) => {
      html += `
        <div class="batch-item batch-dir" style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--border);cursor:pointer" data-path="${Pulse.escapeHtml(dir.path)}">
          <i class="fa-solid fa-folder" style="color:var(--primary);font-size:18px"></i>
          <span style="flex:1">${Pulse.escapeHtml(dir.name)}</span>
          <i class="fa-solid fa-chevron-right" style="color:var(--text-dim);font-size:12px"></i>
        </div>
      `;
    });

    if (videos.length === 0 && directories.length === 0) {
      html += '<div style="padding:20px;text-align:center;color:var(--text-dim)">目录为空</div>';
    }

    /* 显示编号预览（如果启用了自动编号） */
    const showEpisode = batchAutoEpisode.checked && batchSeriesName.value.trim();

    videos.forEach((video, idx) => {
      const sizeMB = (video.size / 1024 / 1024).toFixed(1);
      const episodeBadge = showEpisode ? `<span class="badge badge-accent" style="font-size:11px">#${idx + 1}</span>` : '';
      html += `
        <div class="batch-item batch-video" style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--border)">
          <input type="checkbox" data-video-index="${idx}" />
          <i class="fa-solid fa-file-video" style="color:var(--accent);font-size:18px"></i>
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Pulse.escapeHtml(video.name)} ${episodeBadge}</div>
            <div style="font-size:12px;color:var(--text-dim)">${sizeMB} MB</div>
          </div>
        </div>
      `;
    });

    batchList.innerHTML = html;

    $$('.batch-dir', batchList).forEach((item) => {
      item.addEventListener('click', () => {
        browseDirectory(item.dataset.path, batchPassword.value);
      });
    });

    $$('input[data-video-index]', batchList).forEach((cb) => {
      cb.addEventListener('change', updateSelection);
    });

    updateSelection();
  }

  /* 自动编号开关变化时重新渲染列表 */
  batchAutoEpisode.addEventListener('change', () => {
    if (allVideos.length > 0) {
      renderList([], allVideos);
    }
  });
  batchSeriesName.addEventListener('input', Pulse.debounce(() => {
    if (allVideos.length > 0) {
      renderList([], allVideos);
    }
  }, 300));

  function updateSelection() {
    const count = getSelectedCount();
    batchSelectedCount.textContent = `已选 ${count} 个`;
    batchAddCount.textContent = count;
    batchAddBtnConfirm.disabled = count === 0;

    const allCheckboxes = $$('input[data-video-index]', batchList);
    const checkedCount = allCheckboxes.filter((cb) => cb.checked).length;
    batchSelectAll.checked = allCheckboxes.length > 0 && checkedCount === allCheckboxes.length;
    batchSelectAll.indeterminate = checkedCount > 0 && checkedCount < allCheckboxes.length;
  }

  function getSelectedVideos() {
    const checked = $$('input[data-video-index]:checked', batchList);
    return checked.map((cb) => {
      const video = allVideos[Number(cb.dataset.videoIndex)];
      return {
        title: video.name.replace(/\.[^.]+$/, ''),
        url: video.path,
        cover: '',
        description: '',
        duration: 0,
        sort_order: 0,
      };
    });
  }

  function getSelectedCount() {
    return $$('input[data-video-index]:checked', batchList).length;
  }

  function closeModal() {
    mask.remove();
  }

  browseDirectory('/', '');
}

/* ---------- 系列编辑模态框 ---------- */
function openSeriesEditModal(seriesId, seriesName, currentCover, currentDescription) {
  const mask = el('div', { class: 'modal-mask' });
  const modal = el('div', { class: 'modal', role: 'dialog', style: 'max-width:560px' });

  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">编辑系列</div>
      <button class="modal-close" data-act="close"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="modal-body">
      <div style="margin-bottom:16px;padding:12px 16px;background:var(--bg-alt);border-radius:var(--radius-sm);border:1px solid var(--border)">
        <div style="font-size:13px;color:var(--text-dim);margin-bottom:4px">系列名称</div>
        <div style="font-size:16px;font-weight:600">${Pulse.escapeHtml(seriesName)}</div>
      </div>
      <div class="form-group">
        <label class="form-label">系列封面图链接</label>
        <input class="form-input" id="seriesCoverInput" value="${Pulse.escapeHtml(currentCover)}" placeholder="https://...jpg（系列封面图）" type="url" />
        <div class="cover-preview ${currentCover ? '' : 'empty'}" id="seriesCoverPreview">
          ${currentCover ? `<img src="${Pulse.escapeHtml(currentCover)}" />` : ''}
        </div>
        <div class="form-hint">这是系列在首页展示的封面图，与单个视频封面独立。</div>
      </div>
      <div class="form-group">
        <label class="form-label">系列描述</label>
        <textarea class="form-textarea" id="seriesDescInput" placeholder="可选，系列简介" maxlength="2000">${Pulse.escapeHtml(currentDescription)}</textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-act="close">取消</button>
      <button class="btn btn-primary" data-act="save"><i class="fa-solid fa-check"></i> 保存</button>
    </div>
  `;

  mask.appendChild(modal);
  document.body.appendChild(mask);
  mask.classList.add('show');

  mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-act="close"]')) mask.remove(); });

  /* 封面预览 */
  const coverInput = $('#seriesCoverInput', modal);
  const coverPreview = $('#seriesCoverPreview', modal);
  function updatePreview() {
    const val = coverInput.value.trim();
    if (val) {
      coverPreview.classList.remove('empty');
      coverPreview.innerHTML = `<img src="${Pulse.escapeHtml(val)}" />`;
      const previewImg = coverPreview.querySelector('img');
      if (previewImg) previewImg.addEventListener('error', () => { coverPreview.classList.add('empty'); previewImg.remove(); });
    } else {
      coverPreview.classList.add('empty');
      coverPreview.innerHTML = '';
    }
  }
  coverInput.addEventListener('input', Pulse.debounce(updatePreview, 300));

  $('[data-act="save"]', modal).addEventListener('click', async () => {
    const btn = $('[data-act="save"]', modal);
    const cover = coverInput.value.trim();
    const description = $('#seriesDescInput', modal).value.trim();
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 保存中';
    try {
      await api.series.update(seriesId, { cover: cover || null, description: description || null });
      Pulse.toast('系列已更新', 'success');
      mask.remove();
      setTimeout(() => location.reload(), 400);
    } catch (e) {
      Pulse.toast(e.message || '保存失败', 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> 保存';
    }
  });
}

/* ---------- 删除确认 ---------- */
function confirmDelete(video, onDone) {
  const mask = el('div', { class: 'modal-mask' });
  const modal = el('div', { class: 'modal', role: 'alertdialog', style: 'max-width:420px' });
  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">删除视频</div>
      <button class="modal-close" data-act="cancel"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="modal-body">
      <p style="margin-bottom:10px">确定删除视频吗？</p>
      <div style="padding:12px;background:var(--bg-alt);border-radius:8px;border:1px solid var(--border)">
        <div style="font-weight:600;margin-bottom:4px">${Pulse.escapeHtml(video.title)}</div>
        <div style="font-size:12px;color:var(--text-dim)">该视频的观看记录也会一并删除。</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-act="cancel">取消</button>
      <button class="btn btn-danger" data-act="ok"><i class="fa-solid fa-trash"></i> 确认删除</button>
    </div>
  `;
  mask.appendChild(modal);
  document.body.appendChild(mask);
  mask.classList.add('show');
  mask.addEventListener('click', (e) => {
    if (e.target === mask) mask.remove();
  });
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-act="cancel"]')) mask.remove(); });
  $('[data-act="ok"]', modal).addEventListener('click', async () => {
    const btn = $('[data-act="ok"]', modal);
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 删除中';
    try {
      await api.videos.remove(video.id);
      Pulse.toast('已删除', 'success');
      mask.remove();
      onDone && onDone();
    } catch (e) {
      Pulse.toast(e.message || '删除失败', 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-trash"></i> 确认删除';
    }
  });
}
