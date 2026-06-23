/* ============================================================
   训练记录时间线：月份切换、统计、时间线、删除
   ============================================================ */

(async function () {
  renderNav('history');
  const ok = await requireAuth();
  if (!ok) return;

  const monthLabel = $('#monthLabel');
  const calendarGrid = $('#calendarGrid');
  const timeline = $('#timeline');
  const emptyBox = $('#historyEmpty');
  const deleteMask = $('#deleteMask');
  const deleteHint = $('#deleteHint');

  let current = new Date(); // 当前查看的月份
  let pendingDeleteId = null;
  let selectedDate = null; // null=显示全月，或 'YYYY-MM-DD'=只显示该天
  let allHistoryData = null; // 缓存全量记录，供日历筛选使用

  /* 获取今天日期字符串 */
  function getTodayStr() {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }

  /* DOM */
  const backTodayBtn = $('#backToday');

  /* 统计 DOM */
  const statDays = $('#statDays');
  const statCompleted = $('#statCompleted');
  const statMinutes = $('#statMinutes');
  const statStreak = $('#statStreak');

  /* 月份切换 */
  $('#prevMonth').addEventListener('click', () => {
    current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    selectedDate = null;
    backTodayBtn.style.display = 'none';
    loadAll();
  });
  $('#nextMonth').addEventListener('click', () => {
    const now = new Date();
    if (current.getFullYear() >= now.getFullYear() && current.getMonth() >= now.getMonth()) return;
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    selectedDate = null;
    backTodayBtn.style.display = 'none';
    loadAll();
  });

  /* 回到今日 */
  backTodayBtn.addEventListener('click', async () => {
    selectedDate = getTodayStr();
    current = new Date();
    backTodayBtn.style.display = 'none';
    await loadAll();
    /* 高亮今天 */
    setTimeout(() => {
      const cell = document.querySelector(`.cal-cell[data-date="${selectedDate}"]`);
      if (cell) cell.classList.add('active');
    }, 50);
  });

  /* 删除弹窗 */
  $('#deleteCancel').addEventListener('click', () => closeDelete());
  $('#deleteClose').addEventListener('click', () => closeDelete());
  $('#deleteMask').addEventListener('click', (e) => {
    if (e.target === deleteMask) closeDelete();
  });
  $('#deleteConfirm').addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    try {
      await api.history.delete(pendingDeleteId);
      Pulse.toast('记录已删除', 'success');
      closeDelete();
      await loadAll();
    } catch (e) {
      Pulse.toast(e.message || '删除失败', 'error');
    }
  });

  function openDelete(id, hint) {
    pendingDeleteId = id;
    deleteHint.textContent = hint || '';
    deleteMask.classList.add('show');
  }

  function closeDelete() {
    deleteMask.classList.remove('show');
    pendingDeleteId = null;
  }

  /** 显示某天无训练记录的提示 */
  function showNoRecordTip(dateStr) {
    // 移除旧提示
    const old = document.querySelector('.history-no-record-tip');
    if (old) old.remove();

    const parts = dateStr.split('-');
    const label = `${parseInt(parts[1])}月${parseInt(parts[2])}日`;

    const tip = document.createElement('div');
    tip.className = 'history-no-record-tip';
    tip.innerHTML = `
      <i class="fa-regular fa-calendar-xmark"></i>
      <span>${label} 无训练记录</span>
      <button class="tip-close" title="关闭">&times;</button>
    `;
    timeline.insertBefore(tip, timeline.firstChild);

    // 点击关闭按钮移除提示
    tip.querySelector('.tip-close').addEventListener('click', () => tip.remove());
    // 3秒后自动消失
    setTimeout(() => { if (tip.parentNode) tip.remove(); }, 3000);
  }

  /* 渲染日历 */
  function renderCalendar(trainDaysMap, year, month) {
    const weekHeaders = ['一', '二', '三', '四', '五', '六', '日'];
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // 当月第一天和总天数
    const firstDay = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();

    // 第一天是周几 (0=Sun, 1=Mon...)，转成周一为起始的偏移
    let startOffset = firstDay.getDay() - 1; // Mon-start: 一=0 ... 日=6
    if (startOffset < 0) startOffset = 6; // 周日 -> 最后列

    let html = '<div class="cal-month-label">' +
      '<span class="cal-month-num">' + year + '年' + month + '月</span>' +
      '</div>';
    html += '<div class="cal-header">' +
      weekHeaders.map(d => '<span>' + d + '</span>').join('') +
      '</div>';
    html += '<div class="cal-body">';

    // 空白格子
    for (let i = 0; i < startOffset; i++) {
      html += '<div class="cal-cell empty"></div>';
    }

    // 日期格子
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayInfo = trainDaysMap[dateStr];
      const isToday = dateStr === todayStr;

      let cls = 'cal-cell';
      if (isToday) cls += ' today';
      if (dayInfo) {
        cls += ' has-record';
        cls += dayInfo.allCompleted ? ' all-done' : ' partial';
      }

      const dotHtml = dayInfo ? '<div class="cal-dot"></div>' : '';

      html += `<div class="${cls}" data-date="${dateStr}">
        <span class="cal-day-num">${d}</span>
        ${dotHtml}
      </div>`;
    }

    html += '</div>';
    calendarGrid.innerHTML = html;

    // 绑定点击：所有日期格子（除空白）都可点击
    $$('.cal-cell:not(.empty)', calendarGrid).forEach(cell => {
      cell.addEventListener('click', () => {
        const date = cell.dataset.date;
        if (!date) return;

        // 高亮当前选中日期
        $$('.cal-cell', calendarGrid).forEach(c => c.classList.remove('active'));
        cell.classList.add('active');

        // 设置筛选日期并重新渲染时间线
        selectedDate = date;
        const y = current.getFullYear();
        const m = current.getMonth() + 1;
        renderTimelineFiltered(y, m);
        /* 点击非今天日期才显示回到今日按钮 */
        if (date !== getTodayStr()) {
          backTodayBtn.style.display = 'inline-flex';
        } else {
          backTodayBtn.style.display = 'none';
        }
      });
    });
  }

  /* 加载统计 + 时间线 */
  async function loadAll() {
    const y = current.getFullYear();
    const m = current.getMonth() + 1;
    const monthStr = `${y}-${String(m).padStart(2, '0')}`;
    monthLabel.textContent = `${y} 年 ${m} 月`;

    timeline.innerHTML = '<div class="history-loading">加载中...</div>';
    emptyBox.style.display = 'none';

    try {
      const [statsRes, listRes] = await Promise.all([
        api.history.stats(monthStr),
        api.history.list({ days: 366 }), // 获取足够多记录以覆盖整年
      ]);

      renderStats(statsRes);

      // 缓存全量记录
      allHistoryData = listRes;

      // 构建日历数据：标记有训练的日期
      const all = (listRes && listRes.history) || [];
      const trainDaysMap = {};
      for (const h of all) {
        const d = new Date(h.started_at * 1000);
        const dy = d.getFullYear();
        const dm = d.getMonth() + 1;
        if (dy !== y || dm !== m) continue;
        const key = `${dy}-${String(dm).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!trainDaysMap[key]) trainDaysMap[key] = { count: 0, completed: 0 };
        trainDaysMap[key].count += 1;
        if (h.completed) trainDaysMap[key].completed += 1;
      }
      // 标记是否全部完成
      for (const k of Object.keys(trainDaysMap)) {
        const info = trainDaysMap[k];
        info.allCompleted = info.count > 0 && info.completed === info.count;
      }

      renderCalendar(trainDaysMap, y, m);
      renderTimelineFiltered(y, m);
    } catch (e) {
      timeline.innerHTML = '';
      Pulse.toast(e.message || '加载失败', 'error');
    }
  }

  /** 根据 selectedDate 过滤并渲染时间线 */
  function renderTimelineFiltered(targetYear, targetMonth) {
    if (!allHistoryData) return;
    if (selectedDate) {
      // 只显示选中日期的记录
      const fakeRes = { history: (allHistoryData.history || []).filter(h => {
        const d = new Date(h.started_at * 1000);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return key === selectedDate;
      })};
      renderTimeline(fakeRes, targetYear, targetMonth);
      /* 只有选中非今天的日期才显示"回到今日"按钮 */
      if (selectedDate && selectedDate !== getTodayStr()) {
        backTodayBtn.style.display = '';
      } else {
        backTodayBtn.style.display = 'none';
      }
    } else {
      // 显示整个月
      renderTimeline(allHistoryData, targetYear, targetMonth);
      backTodayBtn.style.display = 'none';
    }
  }

  function renderStats(d) {
    d = d || {};
    statDays.textContent = d.month_train_days || 0;
    statCompleted.textContent = d.month_completed || 0;
    statMinutes.textContent = Math.round((d.month_total_seconds || 0) / 60);
    statStreak.textContent = d.streak || 0;
  }

  function renderTimeline(res, targetYear, targetMonth) {
    const all = (res && res.history) || [];
    const keySet = new Set();
    const map = {};

    for (const h of all) {
      const d = new Date(h.started_at * 1000);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      if (y !== targetYear || m !== targetMonth) continue;

      const key = `${y}-${String(m).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!keySet.has(key)) {
        keySet.add(key);
        map[key] = { date: d, items: [], totalSeconds: 0, completed: 0 };
      }
      const grp = map[key];
      grp.items.push(h);
      grp.totalSeconds += h.duration || h.progress || 0;
      if (h.completed) grp.completed += 1;
    }

    const keys = Object.keys(map).sort((a, b) => (a > b ? -1 : 1));

    if (keys.length === 0) {
      timeline.innerHTML = '';
      emptyBox.style.display = '';
      return;
    }

    emptyBox.style.display = 'none';
    timeline.innerHTML = keys
      .map((key) => {
        const grp = map[key];
        const d = grp.date;
        const weekday = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
        const isDone = grp.completed > 0 && grp.completed === grp.items.length;
        const dotClass = isDone ? 'done' : '';

        const itemsHtml = grp.items
          .map((h) => {
            const cover = h.video_cover || Pulse.DEFAULT_COVER;
            const title = h.video_title || '未知视频';
            const pct = h.duration > 0 ? Math.min(100, Math.round((h.progress / h.duration) * 100)) : 0;
            const completed = h.completed ? 'done' : '';
            const vid = h.video_id || '';
            return `
              <div class="history-item" data-video-id="${vid}">
                <div class="history-item-cover">
                  <img src="${Pulse.escapeHtml(cover)}" data-fallback="1" />
                </div>
                <div class="history-item-info">
                  <div class="history-item-title">${Pulse.escapeHtml(title)}</div>
                  <div class="history-item-meta">
                    <span class="${completed}">
                      <i class="fa-solid fa-${completed ? 'check' : 'forward'}"></i>
                      ${completed ? '已完成' : '已看 ' + pct + '%'}
                    </span>
                    <span style="margin-left:8px"><i class="fa-solid fa-clock"></i> ${Pulse.fmtDuration(h.progress)}</span>
                  </div>
                </div>
                <div class="history-item-actions">
                  <button class="icon-btn danger" data-del="${h.id}" title="删除此记录">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </div>
              </div>`;
          })
          .join('');

        return `
        <div class="history-day" data-date="${key}">
          <div class="history-day-dot ${dotClass}"></div>
          <div class="history-day-date">
            ${d.getMonth() + 1}月${d.getDate()}日 周${weekday}
            <span class="day-label">${grp.items.length} 次训练 · ${Math.round(grp.totalSeconds / 60)} 分钟</span>
          </div>
          ${isDone ? `<div class="history-day-stats"><span class="done-num"><i class="fa-solid fa-check"></i> ${grp.completed}/${grp.items.length} 完成</span></div>` : ''}
          <div class="history-day-items">
            ${itemsHtml}
          </div>
        </div>`;
      })
      .join('');

    /* 绑定封面加载失败回退 */
    $$('.history-item-cover img[data-fallback]', timeline).forEach(Pulse.coverOnError);

    /* 绑定记录点击跳转 + 删除按钮 */
    $$('.history-item', timeline).forEach((item) => {
      item.addEventListener('click', () => {
        const vid = item.dataset.videoId;
        if (vid) window.location.href = `/player.html?v=${vid}`;
      });
    });
    $$('[data-del]', timeline).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.del);
        const hint = btn.closest('.history-item')?.querySelector('.history-item-title')?.textContent || '';
        openDelete(id, `「${hint.slice(0, 30)}」`);
      });
    });
  }

  /* 初始加载：默认选中今天 */
  selectedDate = getTodayStr();
  await loadAll();
  /* 初始高亮今天 */
  setTimeout(() => {
    const todayCell = document.querySelector(`.cal-cell[data-date="${selectedDate}"]`);
    if (todayCell) todayCell.classList.add('active');
  }, 100);
})();
