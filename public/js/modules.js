/**
 * NexSpace 业务模块层
 * ----------------------------------------------------------------
 * 每个模块均暴露 render(rootEl) 用于渲染视图,
 * 通过 EventBus('module:updated') 触发数据刷新。
 */
(function (global) {
  'use strict';
  const {
    Api, storage, debounce, throttle, EventBus,
    formatDate, relTime, escapeHtml, newId, clone
  } = global.NS;
  const { Toast, Modal, Confirm, Prompt } = global.NS;

  /* ============================================================
   * 通用：列表空态
   * ========================================================== */
  function emptyState(text = '暂无数据，点右上角开始添加', icon = 'mdi:inbox-outline') {
    return `
      <div class="flex flex-col items-center justify-center py-16 text-slate-400">
        <iconify-icon icon="${icon}" class="text-5xl mb-3 opacity-60"></iconify-icon>
        <p class="text-sm">${escapeHtml(text)}</p>
      </div>
    `;
  }

  /* ============================================================
   * 1) Dashboard / 仪表盘
   * ========================================================== */
  const Dashboard = {
    async render(root) {
      const { data: stats = {} } = (await Api.getStats().catch(() => ({ data: { total: {} } }))) || {};
      const user = global.NS.Auth.getUser() || {};
      const hour = new Date().getHours();
      const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';

      let tasks = [], notes = [], pomos = [], tracks = [], videos = [];
      try { const tk = await Api.listTasks(); tasks = (tk.data && tk.data.items) || []; } catch {}
      try { const ns = await Api.listNotes(); notes = (ns.data && ns.data.items) || []; } catch {}
      try { const pm = await Api.listPomodoro(); pomos = (pm.data && pm.data.items) || []; } catch {}
      try { const tr = await Api.listTracks(); tracks = (tr.data && tr.data.items) || []; } catch {}
      try { const vd = await Api.listVideos(); videos = (vd.data && vd.data.items) || []; } catch {}

      const pendingTasks = tasks.filter((t) => !t.archived && t.status !== 'done').slice(0, 5);
      const recentNotes = notes.slice(0, 4);

      root.innerHTML = `
        <!-- 欢迎区 -->
        <div class="glass-card flex items-center justify-between">
          <div>
            <div class="text-xs text-slate-400">${greeting}，</div>
            <h1 class="text-2xl font-semibold mt-1">${escapeHtml(user.nickname || user.username || '朋友')}</h1>
            <p class="text-sm text-slate-500 mt-1">${escapeHtml(global.NS.randomQuote())}</p>
          </div>
          <div class="text-right">
            <div class="widget-clock text-3xl" id="dash-clock">--:--</div>
            <div class="text-xs text-slate-400 mt-1">${formatDate(Date.now(), 'YYYY年MM月DD日')}</div>
          </div>
        </div>

        <!-- 统计卡片 -->
        <div class="grid grid-cols-2 lg:grid-cols-6 gap-4">
          ${statCard('mdi:checkbox-marked-circle-outline', '已完成任务', (stats.total && stats.total.taskCompletions) || 0, 'success')}
          ${statCard('mdi:clock-time-five-outline', '专注总时长', (stats.total && stats.total.focusMinutes || 0) + ' min', 'brand')}
          ${statCard('mdi:notebook-outline', '笔记总数', (stats.total && stats.total.notes) || 0, 'purple')}
          ${statCard('mdi:bookmark-multiple-outline', '书签总数', (stats.total && stats.total.bookmarks) || 0, 'mint')}
          ${statCard('mdi:music-circle-outline', '音乐曲目', tracks.length, 'coral')}
          ${statCard('mdi:movie-open-play-outline', '视频数量', videos.length, 'brand')}
        </div>

        <!-- 快速操作 -->
        <div class="glass-card">
          <h3 class="glass-section-title mb-3">
            <iconify-icon icon="mdi:lightning-bolt-outline"></iconify-icon>
            快速操作
          </h3>
          <div class="quick-actions">
            <button class="quick-action" data-nav="tasks">
              <iconify-icon icon="mdi:plus-circle-outline"></iconify-icon>
              <span>加任务</span>
            </button>
            <button class="quick-action" data-nav="notes">
              <iconify-icon icon="mdi:notebook-edit-outline"></iconify-icon>
              <span>写笔记</span>
            </button>
            <button class="quick-action" data-nav="bookmarks">
              <iconify-icon icon="mdi:bookmark-plus-outline"></iconify-icon>
              <span>存书签</span>
            </button>
            <button class="quick-action" data-nav="calendar">
              <iconify-icon icon="mdi:calendar-plus-outline"></iconify-icon>
              <span>排日程</span>
            </button>
            <button class="quick-action" data-nav="pomodoro">
              <iconify-icon icon="mdi:timer-outline"></iconify-icon>
              <span>开专注</span>
            </button>
            <button class="quick-action" data-nav="music">
              <iconify-icon icon="mdi:music-note-plus"></iconify-icon>
              <span>传音乐</span>
            </button>
            <button class="quick-action" data-nav="videos">
              <iconify-icon icon="mdi:movie-plus-outline"></iconify-icon>
              <span>传视频</span>
            </button>
            <button class="quick-action" data-nav="clipboard">
              <iconify-icon icon="mdi:content-paste"></iconify-icon>
              <span>便签条</span>
            </button>
            <button class="quick-action" data-nav="stats">
              <iconify-icon icon="mdi:chart-line"></iconify-icon>
              <span>看趋势</span>
            </button>
          </div>
        </div>

        <!-- 月度趋势 -->
        <div class="glass-card">
          <div class="flex items-center justify-between mb-4">
            <h3 class="glass-section-title">
              <iconify-icon icon="mdi:chart-line"></iconify-icon>
              本月活跃趋势
            </h3>
            <span class="text-xs text-slate-400">${(stats.month && stats.month.length) || 0} 天有记录</span>
          </div>
          ${monthChart(stats.month || [])}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- 待办任务预览 -->
          <div class="glass-card">
            <div class="flex items-center justify-between mb-3">
              <h3 class="glass-section-title">
                <iconify-icon icon="mdi:clipboard-list-outline"></iconify-icon>
                待办任务
              </h3>
              <button class="text-xs text-brand hover:underline" data-nav="tasks">查看全部</button>
            </div>
            ${
              pendingTasks.length
                ? `<div class="space-y-2">${pendingTasks.map(taskItem).join('')}</div>`
                : emptyState('今天暂时没有待办，享受片刻清闲 ☕', 'mdi:check-all')
            }
          </div>

          <!-- 最新笔记 -->
          <div class="glass-card">
            <div class="flex items-center justify-between mb-3">
              <h3 class="glass-section-title">
                <iconify-icon icon="mdi:notebook-edit-outline"></iconify-icon>
                最近笔记
              </h3>
              <button class="text-xs text-brand hover:underline" data-nav="notes">查看全部</button>
            </div>
            ${
              recentNotes.length
                ? `<div class="space-y-2">${recentNotes.map(noteItem).join('')}</div>`
                : emptyState('还没有笔记，点击新增开始记录', 'mdi:notebook-outline')
            }
          </div>
        </div>

        <!-- 小工具集合 -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          ${widgetClock()}
          ${widgetDate()}
          ${widgetQuote()}
          ${widgetWeather()}
        </div>
      `;

      // 启动实时时钟
      const clockEl = root.querySelector('#dash-clock');
      if (clockEl) {
        const tick = () => {
          const d = new Date();
          clockEl.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        };
        tick();
        const tid = setInterval(tick, 1000);
        EventBus.on('view:leave', () => clearInterval(tid));
      }

      // 导航跳转
      root.querySelectorAll('[data-nav]').forEach((el) => {
        el.addEventListener('click', () => {
          location.hash = '#/' + el.getAttribute('data-nav');
        });
      });

      // 任务勾选
      root.querySelectorAll('.task-item').forEach((el) => {
        el.addEventListener('click', async (e) => {
          if (e.target.closest('.task-actions')) return;
          const id = el.getAttribute('data-id');
          const t = tasks.find((x) => x.id === id);
          if (!t) return;
          if (t.status === 'done') return; // 不通过 dashboard 处理完成
          try {
            await Api.updateTask(id, { status: 'done' });
            el.remove();
            Toast({ type: 'success', message: '已完成 ✓', duration: 1500 });
            EventBus.emit('dashboard:refresh');
          } catch (err) {
            Toast({ type: 'error', message: '更新失败: ' + err.message });
          }
        });
      });
    }
  };

  function statCard(icon, label, value, color) {
    const colorMap = {
      brand: 'from-brand/30 to-brand/10 text-brand',
      purple: 'from-accent-purple/30 to-accent-purple/10 text-accent-purple',
      mint: 'from-accent-mint/30 to-accent-mint/10 text-accent-mint',
      coral: 'from-accent-coral/30 to-accent-coral/10 text-accent-coral',
      success: 'from-accent-mint/30 to-accent-mint/10 text-accent-mint'
    };
    return `
      <div class="glass-card relative overflow-hidden">
        <div class="absolute -right-4 -top-4 w-20 h-20 rounded-full opacity-20 bg-gradient-to-br ${colorMap[color] || colorMap.brand}"></div>
        <div class="relative">
          <iconify-icon icon="${icon}" class="text-xl ${(colorMap[color] || colorMap.brand).split(' ').pop()}"></iconify-icon>
          <div class="text-xs text-slate-400 mt-2">${escapeHtml(label)}</div>
          <div class="text-2xl font-semibold mt-1">${escapeHtml(String(value))}</div>
        </div>
      </div>
    `;
  }

  function monthChart(monthData) {
    const days = monthData.slice(-14); // 取最近 14 天
    if (!days.length) {
      return '<p class="text-xs text-slate-400 py-6 text-center">本月还没有活动数据</p>';
    }
    const maxFocus = Math.max(...days.map((d) => d.focus || 0), 1);
    const maxTasks = Math.max(...days.map((d) => d.tasks || 0), 1);
    const html = days
      .map((d) => {
        const focusH = ((d.focus || 0) / maxFocus) * 50;
        const taskH = ((d.tasks || 0) / maxTasks) * 30;
        return `
          <div class="flex-1 flex flex-col items-center gap-1 group" title="${d.date}  专注 ${d.focus || 0}m, 任务 ${d.tasks || 0}">
            <div class="widget-bar-chart flex-col w-full" style="height: 60px">
              <div class="bar" style="height: ${focusH + 10}px"></div>
            </div>
            <div class="text-[10px] text-slate-500">${(d.date || '').slice(-2)}</div>
          </div>`;
      })
      .join('');
    return `<div class="flex items-end gap-2">${html}</div>
            <div class="flex items-center gap-3 mt-3 text-xs text-slate-400">
              <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-brand"></span>专注分钟</span>
              <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-accent-mint"></span>完成任务</span>
            </div>`;
  }

  function widgetClock() {
    return `
      <div class="glass-card">
        <div class="flex items-center gap-2 text-xs text-slate-400 mb-2">
          <iconify-icon icon="mdi:clock-outline" class="text-accent-purple"></iconify-icon>
          时钟
        </div>
        <div class="widget-clock text-3xl" data-clock>--:--:--</div>
      </div>
    `;
  }
  function widgetDate() {
    const d = new Date();
    const week = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][d.getDay()];
    return `
      <div class="glass-card">
        <div class="flex items-center gap-2 text-xs text-slate-400 mb-2">
          <iconify-icon icon="mdi:calendar-today" class="text-accent-mint"></iconify-icon>
          日期
        </div>
        <div class="text-lg font-semibold">${formatDate(d, 'YYYY-MM-DD')}</div>
        <div class="text-xs text-slate-400 mt-1">${week}</div>
      </div>
    `;
  }
  function widgetQuote() {
    const q = global.NS.randomQuote();
    return `
      <div class="glass-card">
        <div class="flex items-center gap-2 text-xs text-slate-400 mb-2">
          <iconify-icon icon="mdi:lightbulb-on-outline" class="text-yellow-400"></iconify-icon>
          灵感
        </div>
        <p class="text-sm leading-relaxed">${escapeHtml(q)}</p>
      </div>
    `;
  }
  function widgetWeather() {
    return `
      <div class="glass-card">
        <div class="flex items-center gap-2 text-xs text-slate-400 mb-2">
          <iconify-icon icon="mdi:weather-partly-cloudy" class="text-sky-400"></iconify-icon>
          天气
        </div>
        <div class="flex items-end gap-2">
          <div class="text-2xl font-semibold">22°</div>
          <div class="text-xs text-slate-400 pb-1">晴 · 北京</div>
        </div>
        <div class="text-[10px] text-slate-500 mt-2">（演示数据，可对接第三方）</div>
      </div>
    `;
  }

  /* ============================================================
   * 2) Tasks / 待办任务
   * ========================================================== */
  function taskItem(t) {
    const done = t.status === 'done';
    return `
      <div class="task-item" data-id="${t.id}">
        <span class="priority-dot priority-${t.priority || 'medium'}"></span>
        <span class="task-checkbox ${done ? 'checked' : ''}" data-act="toggle">
          ${done ? '<iconify-icon icon="mdi:check"></iconify-icon>' : ''}
        </span>
        <div class="flex-1 min-w-0">
          <div class="${done ? 'line-through text-slate-500' : ''} truncate text-sm">${escapeHtml(t.title)}</div>
          ${
            t.dueDate
              ? `<div class="text-[11px] text-slate-400 mt-0.5">
                  <iconify-icon icon="mdi:calendar-clock" class="text-xs align-text-bottom"></iconify-icon>
                  ${formatDate(t.dueDate, 'MM-DD HH:mm')}
                </div>`
              : ''
          }
        </div>
        ${t.repeat ? '<iconify-icon icon="mdi:autorenew" class="text-brand" title="重复"></iconify-icon>' : ''}
        <div class="task-actions opacity-0 hover:opacity-100 transition flex gap-1">
          <button class="btn-ghost text-xs" data-act="edit">编辑</button>
          <button class="btn-danger" data-act="del">删除</button>
        </div>
      </div>
    `;
  }

  const Tasks = {
    async render(root, params = {}) {
      const filters = { archive: 'false', ...params };
      let tasks = [];
      try {
        const r = await Api.listTasks();
        tasks = (r.data && r.data.items) || [];
      } catch (err) {
        Toast({ type: 'error', message: '加载任务失败' });
      }
      const active = tasks.filter((t) => !t.archived && t.status !== 'done');
      const done = tasks.filter((t) => t.status === 'done');
      const archived = tasks.filter((t) => t.archived);

      root.innerHTML = `
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-2">
            <button class="btn-primary" data-act="add">
              <iconify-icon icon="mdi:plus"></iconify-icon>
              新建任务
            </button>
            <select class="select" style="width: 130px" data-filter="priority">
              <option value="">全部优先级</option>
              <option value="high">紧急</option>
              <option value="medium">普通</option>
              <option value="low">低优</option>
            </select>
          </div>
          <div class="flex items-center gap-2 text-xs">
            <span class="text-slate-400">输入即搜索</span>
            <input class="input" placeholder="搜索任务..." style="width:200px" data-filter="search"/>
          </div>
        </div>

        <div class="glass-card">
          <h3 class="glass-section-title mb-3">
            <iconify-icon icon="mdi:circle-outline"></iconify-icon>
            进行中 (${active.length})
          </h3>
          <div class="space-y-2" data-list="active">
            ${active.length ? active.map(taskItem).join('') : emptyState('暂无进行中的任务', 'mdi:check-circle-outline')}
          </div>
        </div>

        <div class="glass-card">
          <h3 class="glass-section-title mb-3">
            <iconify-icon icon="mdi:check-all"></iconify-icon>
            已完成 (${done.length})
          </h3>
          <div class="space-y-2" data-list="done">
            ${done.length ? done.slice(0, 20).map(taskItem).join('') : ''}
          </div>
        </div>

        ${archived.length ? `
          <div class="glass-card">
            <h3 class="glass-section-title mb-3">
              <iconify-icon icon="mdi:archive-outline"></iconify-icon>
              已归档 (${archived.length})
            </h3>
            <div class="space-y-2">${archived.slice(0, 10).map(taskItem).join('')}</div>
          </div>
        ` : ''}
      `;

      // 搜索 + 优先级筛选（前端筛选，避免重复请求）
      const searchInput = root.querySelector('[data-filter="search"]');
      const priSelect = root.querySelector('[data-filter="priority"]');
      const applyFilter = () => {
        const q = (searchInput.value || '').toLowerCase();
        const pri = priSelect.value;
        root.querySelectorAll('.task-item').forEach((el) => {
          const txt = el.textContent.toLowerCase();
          const tDot = el.querySelector('.priority-dot');
          const tpri = tDot && [...tDot.classList].find((c) => c.startsWith('priority-'))?.replace('priority-', '');
          const ok = (!q || txt.includes(q)) && (!pri || tpri === pri);
          el.style.display = ok ? '' : 'none';
        });
      };
      searchInput.addEventListener('input', debounce(applyFilter, 200));
      priSelect.addEventListener('change', applyFilter);

      // 事件绑定
      root.querySelector('[data-act="add"]').addEventListener('click', () => Tasks.openEditor(null, () => Tasks.render(root)));
      // 操作按钮
      root.querySelectorAll('.task-item').forEach((el) => {
        el.addEventListener('click', (e) => {
          const id = el.getAttribute('data-id');
          const act = e.target.closest('[data-act]')?.getAttribute('data-act');
          if (act === 'toggle') {
            const t = tasks.find((x) => x.id === id);
            const newStatus = t.status === 'done' ? 'pending' : 'done';
            Api.updateTask(id, { status: newStatus }).then(() => {
              Toast({ type: 'success', message: newStatus === 'done' ? '已完成 ✓' : '已取消完成' });
              Tasks.render(root);
            });
          } else if (act === 'edit') {
            Tasks.openEditor(tasks.find((x) => x.id === id), () => Tasks.render(root));
          } else if (act === 'del') {
            Confirm({ title: '删除任务', message: '确认删除该任务？将进入回收站。', danger: true })
              .then((yes) => {
                if (yes) Api.deleteTask(id).then(() => {
                  Toast({ type: 'success', message: '已移入回收站' });
                  Tasks.render(root);
                });
              });
          }
        });
      });
    },

    openEditor(task, afterSave) {
      const isEdit = !!task;
      const data = task || { title: '', priority: 'medium', dueDate: null, tags: [], repeat: null, notes: '' };
      const m = Modal({
        title: isEdit ? '编辑任务' : '新建任务',
        size: 'md',
        content: `
          <div class="space-y-3">
            <div>
              <label class="text-xs text-slate-500">任务标题</label>
              <input class="input mt-1" id="ed-title" value="${escapeHtml(data.title)}" maxlength="200" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-slate-500">优先级</label>
                <select class="select mt-1" id="ed-priority">
                  <option value="high" ${data.priority === 'high' ? 'selected' : ''}>紧急</option>
                  <option value="medium" ${data.priority === 'medium' ? 'selected' : ''}>普通</option>
                  <option value="low" ${data.priority === 'low' ? 'selected' : ''}>低优</option>
                </select>
              </div>
              <div>
                <label class="text-xs text-slate-500">重复</label>
                <select class="select mt-1" id="ed-repeat">
                  <option value="" ${!data.repeat ? 'selected' : ''}>不重复</option>
                  <option value="daily" ${data.repeat === 'daily' ? 'selected' : ''}>每日</option>
                  <option value="weekly" ${data.repeat === 'weekly' ? 'selected' : ''}>每周</option>
                </select>
              </div>
            </div>
            <div>
              <label class="text-xs text-slate-500">截止时间 (可选)</label>
              <input type="datetime-local" class="input mt-1" id="ed-due" value="${data.dueDate ? data.dueDate.slice(0, 16) : ''}" />
            </div>
            <div>
              <label class="text-xs text-slate-500">备注</label>
              <textarea class="textarea mt-1" id="ed-notes" placeholder="补充说明...">${escapeHtml(data.notes || '')}</textarea>
            </div>
          </div>
        `,
        footer: `
          <button class="btn-ghost" id="ed-cancel">取消</button>
          <button class="btn-primary" id="ed-save">${isEdit ? '保存' : '新建'}</button>
        `
      });
      m.root.querySelector('#ed-cancel').addEventListener('click', m.close);
      m.root.querySelector('#ed-save').addEventListener('click', async () => {
        const payload = {
          title: m.root.querySelector('#ed-title').value.trim(),
          priority: m.root.querySelector('#ed-priority').value,
          repeat: m.root.querySelector('#ed-repeat').value || null,
          dueDate: m.root.querySelector('#ed-due').value ? new Date(m.root.querySelector('#ed-due').value).toISOString() : null,
          notes: m.root.querySelector('#ed-notes').value
        };
        if (!payload.title) return Toast({ type: 'warning', message: '请填写标题' });
        try {
          if (isEdit) await Api.updateTask(task.id, payload);
          else await Api.createTask(payload);
          Toast({ type: 'success', message: isEdit ? '已保存' : '已创建' });
          m.close();
          afterSave && afterSave();
        } catch (err) {
          Toast({ type: 'error', message: err.message || '操作失败' });
        }
      });
    }
  };

  /* ============================================================
   * 3) Notes / 富文本笔记
   * ========================================================== */
  function noteItem(n) {
    return `
      <div class="task-item" data-id="${n.id}">
        <iconify-icon icon="mdi:notebook-edit-outline" class="text-accent-purple text-lg"></iconify-icon>
        <div class="flex-1 min-w-0">
          <div class="truncate text-sm font-medium">${escapeHtml(n.title)}</div>
          <div class="text-[11px] text-slate-400 mt-0.5 line-clamp-2">${escapeHtml(n.excerpt || '')}</div>
        </div>
        <div class="text-[11px] text-slate-400">${relTime(n.updatedAt)}</div>
        <div class="opacity-0 hover:opacity-100 transition flex gap-1">
          <button class="btn-ghost text-xs" data-act="edit">查看</button>
          <button class="btn-danger" data-act="del">删除</button>
        </div>
      </div>
    `;
  }

  const Notes = {
    async render(root) {
      let notes = [];
      try { const r = await Api.listNotes(); notes = (r.data && r.data.items) || []; } catch {}
      const folders = Array.from(new Set(notes.map((n) => n.folder || '默认')));

      root.innerHTML = `
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-2 flex-wrap">
            <button class="btn-primary" data-act="add">
              <iconify-icon icon="mdi:plus"></iconify-icon>
              新建笔记
            </button>
            <select class="select" data-filter="folder" style="width: 140px">
              <option value="">全部分类</option>
              ${folders.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}
            </select>
            <input class="input" placeholder="搜索笔记..." style="width: 200px" data-filter="search" />
          </div>
        </div>

        <div class="glass-card">
          <h3 class="glass-section-title mb-3">
            <iconify-icon icon="mdi:notebook-multiple"></iconify-icon>
            笔记列表 (${notes.length})
          </h3>
          <div class="space-y-2" data-list>
            ${notes.length ? notes.map(noteItem).join('') : emptyState('暂无笔记', 'mdi:notebook-outline')}
          </div>
        </div>
      `;

      const filterFn = () => {
        const q = root.querySelector('[data-filter="search"]').value.toLowerCase();
        const f = root.querySelector('[data-filter="folder"]').value;
        root.querySelectorAll('[data-list] > div').forEach((el) => {
          const id = el.getAttribute('data-id');
          const n = notes.find((x) => x.id === id);
          if (!n) return;
          const ok = (!q || (n.title + ' ' + (n.excerpt || '')).toLowerCase().includes(q)) &&
                     (!f || (n.folder || '默认') === f);
          el.style.display = ok ? '' : 'none';
        });
      };
      root.querySelector('[data-filter="search"]').addEventListener('input', debounce(filterFn, 200));
      root.querySelector('[data-filter="folder"]').addEventListener('change', filterFn);

      root.querySelector('[data-act="add"]').addEventListener('click', () => Notes.openEditor(null, () => Notes.render(root)));
      root.querySelectorAll('[data-list] > div').forEach((el) => {
        el.addEventListener('click', (e) => {
          const id = el.getAttribute('data-id');
          const act = e.target.closest('[data-act]')?.getAttribute('data-act');
          const n = notes.find((x) => x.id === id);
          if (act === 'edit') Notes.openEditor(n, () => Notes.render(root));
          else if (act === 'del') {
            Confirm({ title: '删除笔记', message: '将进入回收站，确认？', danger: true }).then((y) => {
              if (y) Api.deleteNote(id).then(() => { Toast({ type: 'success' }); Notes.render(root); });
            });
          } else {
            Notes.openEditor(n, () => Notes.render(root));
          }
        });
      });
    },

    async openEditor(note, afterSave) {
      const isEdit = !!note;
      let data = note || { title: '未命名笔记', content: '', folder: '默认', tags: [] };
      if (isEdit) {
        const full = await Api.getNote(note.id).catch(() => ({ data: data }));
        data = full.data || data;
      }
      const m = Modal({
        title: isEdit ? '编辑笔记' : '新建笔记',
        size: 'lg',
        content: `
          <div class="grid grid-cols-3 gap-3">
            <div class="col-span-2"><input class="input" id="ed-title" placeholder="标题" value="${escapeHtml(data.title || '')}" /></div>
            <div><input class="input" id="ed-folder" placeholder="分类" value="${escapeHtml(data.folder || '默认')}" /></div>
          </div>
          <div class="mt-3">
            <textarea class="textarea" id="ed-content" rows="14" placeholder="支持简单 HTML，比如 <b>粗体</b>, <i>斜体</i>...">${escapeHtml(data.content || '')}</textarea>
            <div class="text-[11px] text-slate-400 mt-1">支持富文本 HTML 输入，可粘贴其他笔记工具导出的内容</div>
          </div>
        `,
        footer: `
          <button class="btn-ghost" id="ed-cancel">取消</button>
          <button class="btn-primary" id="ed-save">${isEdit ? '保存' : '创建'}</button>
        `
      });
      m.root.querySelector('#ed-cancel').addEventListener('click', m.close);
      m.root.querySelector('#ed-save').addEventListener('click', async () => {
        const payload = {
          title: m.root.querySelector('#ed-title').value.trim() || '未命名笔记',
          content: m.root.querySelector('#ed-content').value,
          folder: m.root.querySelector('#ed-folder').value.trim() || '默认'
        };
        try {
          if (isEdit) await Api.updateNote(note.id, payload);
          else await Api.createNote(payload);
          Toast({ type: 'success', message: '已保存' });
          m.close();
          afterSave && afterSave();
        } catch (err) { Toast({ type: 'error', message: err.message || '保存失败' }); }
      });
    }
  };

  /* ============================================================
   * 4) Bookmarks / 书签
   * ========================================================== */
  function bookmarkItem(b) {
    const domain = (() => {
      try { return new URL(b.url).hostname.replace('www.', ''); } catch { return ''; }
    })();
    return `
      <div class="bookmark-item" data-id="${b.id}">
        <div class="w-8 h-8 rounded-lg bg-brand/20 text-brand flex items-center justify-center text-sm font-semibold uppercase">
          ${escapeHtml((b.title || '?').charAt(0))}
        </div>
        <div class="flex-1 min-w-0">
          <a href="${escapeHtml(b.url)}" target="_blank" rel="noopener noreferrer"
             class="text-sm font-medium hover:text-brand truncate block">${escapeHtml(b.title)}</a>
          <div class="text-[11px] text-slate-400 truncate">${escapeHtml(domain)} · ${escapeHtml(b.folder || '')}</div>
        </div>
        <button class="btn-ghost text-xs opacity-0 group-hover:opacity-100" data-act="del">删除</button>
      </div>
    `;
  }

  const Bookmarks = {
    async render(root) {
      let list = [];
      try { const r = await Api.listBookmarks(); list = (r.data && r.data.items) || []; } catch {}
      root.innerHTML = `
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-2">
            <button class="btn-primary" data-act="add">
              <iconify-icon icon="mdi:plus"></iconify-icon>
              添加书签
            </button>
            <input class="input" placeholder="搜索书签..." style="width: 200px" data-filter="search" />
          </div>
        </div>
        <div class="glass-card">
          <h3 class="glass-section-title mb-3">
            <iconify-icon icon="mdi:bookmark-multiple-outline"></iconify-icon>
            书签列表 (${list.length})
          </h3>
          <div class="space-y-2" data-list>
            ${list.length ? list.map(bookmarkItem).join('') : emptyState('暂无书签', 'mdi:bookmark-plus-outline')}
          </div>
        </div>
      `;
      const filterFn = () => {
        const q = root.querySelector('[data-filter="search"]').value.toLowerCase();
        root.querySelectorAll('[data-list] > div').forEach((el) => {
          el.style.display = !q || el.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      };
      root.querySelector('[data-filter="search"]').addEventListener('input', debounce(filterFn, 200));

      root.querySelector('[data-act="add"]').addEventListener('click', () => Bookmarks.openEditor(null, () => Bookmarks.render(root)));
      root.querySelectorAll('[data-list] > div').forEach((el) => {
        el.addEventListener('click', (e) => {
          const id = el.getAttribute('data-id');
          const act = e.target.closest('[data-act]')?.getAttribute('data-act');
          if (act === 'del') {
            Confirm({ title: '删除书签', message: '将进入回收站。', danger: true }).then((y) => {
              if (y) Api.deleteBookmark(id).then(() => { Toast({ type: 'success' }); Bookmarks.render(root); });
            });
          } else if (!e.target.closest('a')) {
            Bookmarks.openEditor(list.find((x) => x.id === id), () => Bookmarks.render(root));
          }
        });
      });
    },

    openEditor(bm, afterSave) {
      const isEdit = !!bm;
      const d = bm || { title: '', url: '', description: '', folder: '默认' };
      const m = Modal({
        title: isEdit ? '编辑书签' : '添加书签',
        size: 'md',
        content: `
          <div class="space-y-3">
            <div><label class="text-xs text-slate-500">网址</label><input class="input mt-1" id="ed-url" value="${escapeHtml(d.url)}" placeholder="https://..." /></div>
            <div><label class="text-xs text-slate-500">标题</label><input class="input mt-1" id="ed-title" value="${escapeHtml(d.title)}" /></div>
            <div><label class="text-xs text-slate-500">分类</label><input class="input mt-1" id="ed-folder" value="${escapeHtml(d.folder)}" /></div>
            <div><label class="text-xs text-slate-500">备注</label><textarea class="textarea mt-1" id="ed-desc">${escapeHtml(d.description || '')}</textarea></div>
          </div>
        `,
        footer: `<button class="btn-ghost" id="ed-cancel">取消</button><button class="btn-primary" id="ed-save">${isEdit ? '保存' : '添加'}</button>`
      });
      m.root.querySelector('#ed-cancel').addEventListener('click', m.close);
      m.root.querySelector('#ed-save').addEventListener('click', async () => {
        const payload = {
          url: m.root.querySelector('#ed-url').value.trim(),
          title: m.root.querySelector('#ed-title').value.trim() || m.root.querySelector('#ed-url').value.trim(),
          folder: m.root.querySelector('#ed-folder').value.trim() || '默认',
          description: m.root.querySelector('#ed-desc').value
        };
        if (!payload.url || !global.NS.isValidUrl(payload.url)) return Toast({ type: 'warning', message: '请填写有效网址' });
        try {
          if (isEdit) await Api.updateBookmark(bm.id, payload);
          else await Api.createBookmark(payload);
          Toast({ type: 'success', message: '已保存' });
          m.close();
          afterSave && afterSave();
        } catch (err) { Toast({ type: 'error', message: err.message }); }
      });
    }
  };

  /* ============================================================
   * 5) Pomodoro / 番茄钟
   * ========================================================== */
  const Pomodoro = {
    timer: null,
    remaining: 25 * 60,
    total: 25 * 60,
    running: false,
    label: '专注',

    async render(root) {
      let history = [];
      try { const r = await Api.listPomodoro(); history = (r.data && r.data.items) || []; } catch {}
      const totalMin = history.reduce((s, h) => s + (h.duration || 0), 0);
      const todayKey = global.NS.todayKey();
      const todayMin = history.filter((h) => formatDate(h.startAt, 'YYYY-MM-DD') === todayKey)
                              .reduce((s, h) => s + (h.duration || 0), 0);
      root.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="glass-card lg:col-span-2 text-center">
            <div class="text-xs text-slate-400 mb-2">${Pomodoro.label}</div>
            <div class="widget-clock text-7xl my-6" id="pomo-clock">${Pomodoro.fmt(Pomodoro.remaining)}</div>
            <div class="flex items-center justify-center gap-3">
              <button class="btn-primary" data-act="start">
                <iconify-icon icon="${Pomodoro.running ? 'mdi:pause' : 'mdi:play'}"></iconify-icon>
                ${Pomodoro.running ? '暂停' : '开始'}
              </button>
              <button class="btn-ghost" data-act="reset">
                <iconify-icon icon="mdi:refresh"></iconify-icon>
                重置
              </button>
              <button class="btn-ghost" data-act="finish">
                <iconify-icon icon="mdi:check"></iconify-icon>
                完成
              </button>
            </div>
            <div class="flex items-center justify-center gap-2 mt-4">
              <span class="text-xs text-slate-400">时长</span>
              <select class="select" style="width:110px" data-act="duration">
                <option value="15">15 分钟</option>
                <option value="25" selected>25 分钟</option>
                <option value="45">45 分钟</option>
                <option value="60">60 分钟</option>
              </select>
            </div>
          </div>

          <div class="glass-card">
            <h3 class="glass-section-title mb-3">
              <iconify-icon icon="mdi:chart-pie"></iconify-icon>
              今日 / 总计
            </h3>
            <div class="space-y-3 text-sm">
              <div class="flex justify-between"><span>今日专注</span><span class="font-semibold text-brand">${todayMin} 分钟</span></div>
              <div class="flex justify-between"><span>累计专注</span><span class="font-semibold">${totalMin} 分钟</span></div>
              <div class="flex justify-between"><span>历史完成</span><span class="font-semibold">${history.length} 次</span></div>
            </div>
          </div>
        </div>

        <div class="glass-card">
          <h3 class="glass-section-title mb-3">
            <iconify-icon icon="mdi:history"></iconify-icon>
            历史记录
          </h3>
          ${history.length ? `
            <div class="space-y-2">
              ${history.slice(0, 20).map((h) => `
                <div class="task-item" data-id="${h.id}">
                  <iconify-icon icon="mdi:timer-sand-complete" class="text-brand"></iconify-icon>
                  <div class="flex-1">
                    <div class="text-sm">${escapeHtml(h.label || '专注')}</div>
                    <div class="text-[11px] text-slate-400">${formatDate(h.startAt, 'MM-DD HH:mm')} → ${formatDate(h.endAt, 'HH:mm')}</div>
                  </div>
                  <div class="text-sm font-semibold">${h.duration}min</div>
                  <button class="btn-danger" data-act="del">删除</button>
                </div>
              `).join('')}
            </div>
          ` : emptyState('暂无记录，开始你的第一个番茄吧 🍅', 'mdi:timer-outline')}
        </div>
      `;

      // 时长切换
      root.querySelector('[data-act="duration"]').addEventListener('change', (e) => {
        if (Pomodoro.running) return Toast({ type: 'warning', message: '请先暂停当前计时' });
        Pomodoro.total = parseInt(e.target.value, 10) * 60;
        Pomodoro.remaining = Pomodoro.total;
        root.querySelector('#pomo-clock').textContent = Pomodoro.fmt(Pomodoro.remaining);
      });

      // 开始/暂停
      root.querySelector('[data-act="start"]').addEventListener('click', () => Pomodoro.toggle(root));
      root.querySelector('[data-act="reset"]').addEventListener('click', () => Pomodoro.reset(root));
      root.querySelector('[data-act="finish"]').addEventListener('click', () => Pomodoro.finish(root));

      // 删除
      root.querySelectorAll('[data-act="del"]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.closest('.task-item').getAttribute('data-id');
          Api.deletePomodoro(id).then(() => Pomodoro.render(root));
        });
      });

      // 启动/恢复时刷新倒计时
      if (Pomodoro.running) {
        Pomodoro.startTick(root);
      }
    },

    fmt(sec) {
      const m = String(Math.floor(sec / 60)).padStart(2, '0');
      const s = String(sec % 60).padStart(2, '0');
      return `${m}:${s}`;
    },
    toggle(root) {
      if (Pomodoro.running) {
        Pomodoro.running = false;
        clearInterval(Pomodoro.timer);
        Pomodoro.timer = null;
      } else {
        Pomodoro.running = true;
        Pomodoro.startTick(root);
      }
      Pomodoro.render(root);
    },
    startTick(root) {
      clearInterval(Pomodoro.timer);
      Pomodoro.timer = setInterval(() => {
        if (!Pomodoro.running) return;
        Pomodoro.remaining -= 1;
        const el = root && root.querySelector('#pomo-clock');
        if (el) el.textContent = Pomodoro.fmt(Pomodoro.remaining);
        if (Pomodoro.remaining <= 0) {
          Pomodoro.finish(root);
        }
      }, 1000);
    },
    reset(root) {
      Pomodoro.remaining = Pomodoro.total;
      Pomodoro.running = false;
      clearInterval(Pomodoro.timer);
      Pomodoro.timer = null;
      Pomodoro.render(root);
    },
    async finish(root) {
      const duration = Math.round((Pomodoro.total - Pomodoro.remaining) / 60) || (Pomodoro.total / 60);
      Pomodoro.running = false;
      clearInterval(Pomodoro.timer);
      Pomodoro.timer = null;
      Pomodoro.remaining = Pomodoro.total;
      try {
        await Api.createPomodoro({
          duration,
          label: Pomodoro.label,
          startAt: Date.now() - duration * 60 * 1000,
          endAt: Date.now()
        });
        Toast({ type: 'success', message: '完成一个番茄 🍅' });
        // 系统通知
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('NexSpace 番茄完成', { body: `已完成 ${duration} 分钟专注` });
        }
      } catch {}
      Pomodoro.render(root);
    }
  };

  /* ============================================================
   * 6) Calendar / 日程
   * ========================================================== */
  const Calendar = {
    async render(root) {
      let events = [];
      try { const r = await Api.listCalendar(); events = (r.data && r.data.items) || []; } catch {}
      const today = new Date();
      const month = today.getMonth();
      const year = today.getFullYear();
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const todayDate = today.getDate();
      const todayKey = formatDate(today, 'YYYY-MM-DD');

      const cells = [];
      for (let i = 0; i < firstDay; i++) cells.push('');
      for (let d = 1; d <= daysInMonth; d++) cells.push(d);
      while (cells.length % 7 !== 0) cells.push('');

      const eventsByDay = {};
      events.forEach((e) => {
        const k = e.date || '';
        eventsByDay[k] = eventsByDay[k] || [];
        eventsByDay[k].push(e);
      });

      root.innerHTML = `
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-lg font-semibold">${year} 年 ${month + 1} 月</h3>
          <button class="btn-primary" data-act="add">
            <iconify-icon icon="mdi:plus"></iconify-icon>
            添加日程
          </button>
        </div>

        <div class="glass-card">
          <div class="grid grid-cols-7 gap-1 text-center text-xs text-slate-400 mb-2">
            ${['日','一','二','三','四','五','六'].map((d) => `<div>${d}</div>`).join('')}
          </div>
          <div class="grid grid-cols-7 gap-1">
            ${cells.map((d) => {
              if (!d) return '<div></div>';
              const k = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const isToday = k === todayKey;
              const evs = eventsByDay[k] || [];
              return `
                <div class="cal-cell ${isToday ? 'is-today' : ''}" data-day="${k}">
                  <div class="text-xs ${isToday ? 'font-bold text-brand' : ''}">${d}</div>
                  ${evs.length ? `<div class="text-[10px] mt-1 truncate text-brand-300">${escapeHtml(evs[0].title)}${evs.length > 1 ? ' ...' : ''}</div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="glass-card">
          <h3 class="glass-section-title mb-3">
            <iconify-icon icon="mdi:calendar-month-outline"></iconify-icon>
            本月全部日程
          </h3>
          ${events.length ? `<div class="space-y-2">${events.slice(0, 30).map(calendarItem).join('')}</div>` : emptyState('本月暂无日程', 'mdi:calendar-outline')}
        </div>
      `;

      // 添加日程
      root.querySelector('[data-act="add"]').addEventListener('click', () => Calendar.openEditor(null, () => Calendar.render(root)));
      // 日期点击查看当天日程
      root.querySelectorAll('.cal-cell').forEach((c) => {
        if (!c.getAttribute('data-day')) return;
        c.style.cssText = 'padding:8px 4px;border-radius:8px;cursor:pointer;min-height:50px;background:rgba(255,255,255,0.04);transition:all .2s;';
        c.addEventListener('mouseenter', () => c.style.background = 'rgba(255,255,255,0.08)');
        c.addEventListener('mouseleave', () => c.style.background = 'rgba(255,255,255,0.04)');
        c.addEventListener('click', () => {
          const day = c.getAttribute('data-day');
          const evs = eventsByDay[day] || [];
          const m = Modal({
            title: `${day} 的日程`,
            content: evs.length
              ? `<div class="space-y-2">${evs.map(calendarItem).join('')}</div>`
              : '<p class="text-sm text-slate-400 py-6 text-center">当天没有安排</p>',
            footer: `<button class="btn-primary" id="add-here">添加日程</button><button class="btn-ghost" id="close-m">关闭</button>`
          });
          m.root.querySelector('#close-m').addEventListener('click', m.close);
          m.root.querySelector('#add-here').addEventListener('click', () => {
            m.close();
            Calendar.openEditor({ date: day }, () => Calendar.render(root));
          });
        });
      });
      // 日程项操作
      root.querySelectorAll('[data-list="evs"] > div, .glass-card .space-y-2 > div').forEach((el) => {
        const id = el.getAttribute('data-id');
        if (!id) return;
        el.addEventListener('click', (e) => {
          const act = e.target.closest('[data-act]')?.getAttribute('data-act');
          if (act === 'del') {
            Confirm({ title: '删除日程', message: '将进入回收站', danger: true }).then((y) => {
              if (y) Api.deleteCalendar(id).then(() => Calendar.render(root));
            });
          } else {
            Calendar.openEditor(events.find((x) => x.id === id), () => Calendar.render(root));
          }
        });
      });
    },

    openEditor(ev, afterSave) {
      const isEdit = !!ev;
      const d = ev || { title: '', date: global.NS.todayKey(), time: '', color: '#4878E8', notes: '' };
      const m = Modal({
        title: isEdit ? '编辑日程' : '新建日程',
        size: 'md',
        content: `
          <div class="space-y-3">
            <div><label class="text-xs text-slate-500">标题</label><input class="input mt-1" id="ed-title" value="${escapeHtml(d.title)}" /></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="text-xs text-slate-500">日期</label><input type="date" class="input mt-1" id="ed-date" value="${escapeHtml(d.date)}" /></div>
              <div><label class="text-xs text-slate-500">时间 (可选)</label><input type="time" class="input mt-1" id="ed-time" value="${escapeHtml(d.time || '')}" /></div>
            </div>
            <div><label class="text-xs text-slate-500">颜色</label><input type="color" class="input mt-1" id="ed-color" value="${escapeHtml(d.color)}" style="height:42px" /></div>
            <div><label class="text-xs text-slate-500">备注</label><textarea class="textarea mt-1" id="ed-notes">${escapeHtml(d.notes || '')}</textarea></div>
          </div>
        `,
        footer: `<button class="btn-ghost" id="ed-cancel">取消</button><button class="btn-primary" id="ed-save">${isEdit ? '保存' : '创建'}</button>`
      });
      m.root.querySelector('#ed-cancel').addEventListener('click', m.close);
      m.root.querySelector('#ed-save').addEventListener('click', async () => {
        const payload = {
          title: m.root.querySelector('#ed-title').value.trim(),
          date: m.root.querySelector('#ed-date').value,
          time: m.root.querySelector('#ed-time').value,
          color: m.root.querySelector('#ed-color').value,
          notes: m.root.querySelector('#ed-notes').value
        };
        if (!payload.title || !payload.date) return Toast({ type: 'warning', message: '请填写标题和日期' });
        try {
          if (isEdit) await Api.updateCalendar(ev.id, payload);
          else await Api.createCalendar(payload);
          Toast({ type: 'success', message: '已保存' });
          m.close(); afterSave && afterSave();
        } catch (err) { Toast({ type: 'error', message: err.message }); }
      });
    }
  };

  function calendarItem(e) {
    return `
      <div class="calendar-item" data-id="${e.id}">
        <span class="priority-dot" style="background:${escapeHtml(e.color || '#4878E8')}"></span>
        <div class="flex-1 min-w-0">
          <div class="text-sm">${escapeHtml(e.title)}</div>
          <div class="text-[11px] text-slate-400">${formatDate(e.date, 'YYYY-MM-DD')}${e.time ? ' ' + escapeHtml(e.time) : ''}</div>
        </div>
        <button class="btn-danger" data-act="del">删除</button>
      </div>
    `;
  }

  /* ============================================================
   * 7) Clipboard / 临时剪贴板
   * ========================================================== */
  const Clipboard = {
    async render(root) {
      let list = [];
      try { const r = await Api.listClipboard(); list = (r.data && r.data.items) || []; } catch {}
      root.innerHTML = `
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-2">
            <textarea id="clip-input" class="textarea" rows="2" placeholder="粘贴或输入一段文本，临时保存..." style="min-width:300px"></textarea>
            <button class="btn-primary" data-act="add">
              <iconify-icon icon="mdi:content-save"></iconify-icon>
              保存
            </button>
          </div>
          <div class="text-xs text-slate-400">最多 100 条</div>
        </div>
        <div class="glass-card">
          <h3 class="glass-section-title mb-3">
            <iconify-icon icon="mdi:content-paste"></iconify-icon>
            我的剪贴板 (${list.length})
          </h3>
          <div class="space-y-2">
            ${list.length ? list.map(clipItem).join('') : emptyState('空空如也', 'mdi:content-copy')}
          </div>
        </div>
      `;
      root.querySelector('[data-act="add"]').addEventListener('click', async () => {
        const text = root.querySelector('#clip-input').value.trim();
        if (!text) return Toast({ type: 'warning', message: '请输入文本' });
        try {
          await Api.createClipboard({ text });
          Toast({ type: 'success', message: '已保存' });
          Clipboard.render(root);
        } catch {}
      });
      root.querySelectorAll('[data-act="copy"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.closest('.clip-item').getAttribute('data-id');
          const item = list.find((x) => x.id === id);
          try {
            await navigator.clipboard.writeText(item.text);
            Toast({ type: 'success', message: '已复制到剪贴板' });
          } catch {
            Toast({ type: 'warning', message: '复制失败' });
          }
        });
      });
      root.querySelectorAll('[data-act="del"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.closest('.clip-item').getAttribute('data-id');
          Api.deleteClipboard(id).then(() => Clipboard.render(root));
        });
      });
    }
  };

  function clipItem(c) {
    return `
      <div class="clip-item" data-id="${c.id}">
        <iconify-icon icon="mdi:content-paste" class="text-brand"></iconify-icon>
        <div class="flex-1 min-w-0">
          <div class="text-sm line-clamp-2">${escapeHtml(c.text)}</div>
          <div class="text-[11px] text-slate-400 mt-1">${relTime(c.createdAt)}</div>
        </div>
        <button class="btn-ghost text-xs" data-act="copy">复制</button>
        <button class="btn-danger" data-act="del">删除</button>
      </div>
    `;
  }

  /* ============================================================
   * 8) Stats / 数据统计看板
   * ========================================================== */
  const Stats = {
    async render(root) {
      let stats = { total: {}, month: [] };
      try { const r = await Api.getStats(); stats = r.data || stats; } catch {}
      const maxFocus = Math.max(...(stats.month || []).map((d) => d.focus || 0), 1);
      const maxTasks = Math.max(...(stats.month || []).map((d) => d.tasks || 0), 1);
      const maxNotes = Math.max(...(stats.month || []).map((d) => d.notes || 0), 1);

      root.innerHTML = `
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          ${statCard('mdi:check-all', '完成任务', stats.total.taskCompletions || 0, 'success')}
          ${statCard('mdi:clock-outline', '专注总时', (stats.total.focusMinutes || 0) + ' min', 'brand')}
          ${statCard('mdi:notebook', '笔记总数', stats.total.notes || 0, 'purple')}
          ${statCard('mdi:bookmark', '书签总数', stats.total.bookmarks || 0, 'mint')}
          ${statCard('mdi:format-list-checks', '任务总数', stats.total.tasks || 0, 'brand')}
        </div>

        <div class="glass-card">
          <h3 class="glass-section-title mb-4">
            <iconify-icon icon="mdi:chart-bar"></iconify-icon>
            本月详细数据
          </h3>
          ${stats.month.length ? `
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
              ${[['专注时长 (分钟)', stats.month, 'focus', maxFocus, '#4878E8'],
                 ['完成任务数', stats.month, 'tasks', maxTasks, '#54D3B4'],
                 ['新增笔记数', stats.month, 'notes', maxNotes, '#927DFF']].map(([title, data, key, max, color]) => `
                <div class="rounded-lg p-3 bg-white/5">
                  <div class="text-xs text-slate-400 mb-2">${title}</div>
                  <div class="widget-bar-chart" style="height:80px">
                    ${data.slice(-14).map((d) => `
                      <div class="bar" style="height:${((d[key] || 0) / max) * 70 + 8}px; background:${color}"></div>
                    `).join('')}
                  </div>
                </div>
              `).join('')}
            </div>
            <div class="text-[11px] text-slate-400 text-center mt-4">展示最近 14 天</div>
          ` : '<p class="text-sm text-slate-400 text-center py-8">本月暂无数据，开始使用来积累吧 ✨</p>'}
        </div>
      `;
    }
  };

  /* ============================================================
   * 9) Trash / 回收站
   * ========================================================== */
  const Trash = {
    async render(root) {
      let items = [];
      try { const r = await Api.listTrash(); items = (r.data && r.data.items) || []; } catch {}
      const groups = { task: [], note: [], bookmark: [], calendar: [] };
      items.forEach((it) => { (groups[it.type] = groups[it.type] || []).push(it); });

      root.innerHTML = `
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">回收站</h3>
          ${items.length ? `<button class="btn-danger" data-act="clear-all">清空回收站</button>` : ''}
        </div>

        ${items.length ? `
          <div class="glass-card">
            ${Object.entries(groups).filter(([, g]) => g.length).map(([type, list]) => `
              <div class="mb-4">
                <h4 class="glass-section-title mb-2">
                  <iconify-icon icon="${({task:'mdi:checkbox-marked-circle-outline',note:'mdi:notebook',bookmark:'mdi:bookmark',calendar:'mdi:calendar'}[type])}"></iconify-icon>
                  ${({task:'任务',note:'笔记',bookmark:'书签',calendar:'日程'}[type])} (${list.length})
                </h4>
                <div class="space-y-2">
                  ${list.slice(0, 30).map((it) => {
                    const item = it.item || {};
                    return `
                      <div class="task-item" data-id="${item.id}" data-trash-id="${it.id}">
                        <iconify-icon icon="mdi:trash-can-outline" class="text-accent-coral"></iconify-icon>
                        <div class="flex-1 min-w-0">
                          <div class="text-sm truncate">${escapeHtml(item.title || item.text || item.url || '已删除')}</div>
                          <div class="text-[11px] text-slate-400">${formatDate(it.deletedAt, 'YYYY-MM-DD HH:mm')}</div>
                        </div>
                        <button class="btn-ghost text-xs" data-act="restore">还原</button>
                        <button class="btn-danger" data-act="purge">彻底删除</button>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        ` : emptyState('回收站空空如也 ✨', 'mdi:broom')}
      `;

      root.querySelectorAll('[data-act="restore"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const row = btn.closest('[data-trash-id]');
          const id = row.getAttribute('data-trash-id');
          await Api.restoreTrash(id);
          Toast({ type: 'success', message: '已还原' });
          Trash.render(root);
        });
      });
      root.querySelectorAll('[data-act="purge"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const row = btn.closest('[data-trash-id]');
          const id = row.getAttribute('data-trash-id');
          const yes = await Confirm({ title: '彻底删除', message: '此操作不可恢复！', danger: true });
          if (!yes) return;
          await Api.purgeTrash(id);
          Toast({ type: 'success', message: '已彻底删除' });
          Trash.render(root);
        });
      });
      const clearBtn = root.querySelector('[data-act="clear-all"]');
      if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
          const yes = await Confirm({ title: '清空回收站', message: '所有记录将不可恢复。', danger: true });
          if (!yes) return;
          await Api.clearTrash();
          Toast({ type: 'success', message: '回收站已清空' });
          Trash.render(root);
        });
      }
    }
  };

  /* ============================================================
   * 10) Tags / 标签管理
   * ========================================================== */
  const Tags = {
    async render(root) {
      let tags = [];
      try { const r = await Api.listTags(); tags = (r.data && r.data.items) || []; } catch {}
      const colors = ['#4878E8', '#54D3B4', '#927DFF', '#FF6B6B', '#fbbf24', '#ec4899', '#10b981', '#f97316'];
      root.innerHTML = `
        <div class="flex items-center justify-between flex-wrap gap-3">
          <h3 class="text-lg font-semibold">我的标签 (${tags.length})</h3>
          <button class="btn-primary" data-act="add">
            <iconify-icon icon="mdi:plus"></iconify-icon>
            新建标签
          </button>
        </div>
        <div class="glass-card">
          ${tags.length ? `
            <div class="flex flex-wrap gap-2">
              ${tags.map((t) => `
                <div class="tag-chip group" style="background:${escapeHtml(t.color)}" data-id="${t.id}">
                  <iconify-icon icon="mdi:label"></iconify-icon>
                  ${escapeHtml(t.name)}
                  <button class="ml-2 opacity-60 hover:opacity-100" data-act="del">
                    <iconify-icon icon="mdi:close"></iconify-icon>
                  </button>
                </div>
              `).join('')}
            </div>
          ` : emptyState('创建专属分类标签', 'mdi:tag-outline')}
          <div class="mt-4 pt-4 border-t border-white/10">
            <div class="text-xs text-slate-400 mb-2">快速创建预设颜色</div>
            <div class="flex items-center gap-2">
              <input id="tag-name" class="input" placeholder="标签名" style="max-width:200px" />
              <select id="tag-color" class="select" style="width:90px">
                ${colors.map((c) => `<option value="${c}" style="background:${c};color:white">${c}</option>`).join('')}
              </select>
              <button class="btn-primary" data-act="quick">
                <iconify-icon icon="mdi:plus"></iconify-icon>
                创建
              </button>
            </div>
          </div>
        </div>
      `;
      const handlers = {
        add: () => Tags.openEditor(),
        quick: async () => {
          const name = root.querySelector('#tag-name').value.trim();
          const color = root.querySelector('#tag-color').value;
          if (!name) return Toast({ type: 'warning', message: '请填写标签名' });
          await Api.createTag({ name, color });
          Tags.render(root);
        },
        del: async (btn) => {
          const id = btn.closest('[data-id]').getAttribute('data-id');
          await Api.deleteTag(id);
          Tags.render(root);
        }
      };
      root.querySelector('[data-act="add"]').addEventListener('click', handlers.add);
      root.querySelector('[data-act="quick"]').addEventListener('click', handlers.quick);
      root.querySelectorAll('[data-act="del"]').forEach((btn) => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); handlers.del(btn); });
      });
    },
    openEditor(tag) {
      Prompt({ title: '创建标签', message: '输入标签名', placeholder: '如"工作"', confirmText: '创建' })
        .then((name) => {
          if (!name) return;
          Api.createTag({ name, color: '#4878E8' }).then(() => {
            Toast({ type: 'success', message: '标签已创建' });
            EventBus.emit('tags:updated');
          });
        });
    }
  };

  /* ============================================================
   * 11) Settings / 设置（同步、备份、个性化）
   * ========================================================== */
  const Settings = {
    async render(root) {
      let settings = {};
      try { const r = await Api.getSettings(); settings = (r.data) || {}; } catch {}
      root.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- 个人资料 -->
          <div class="glass-card">
            <h3 class="glass-section-title mb-3">
              <iconify-icon icon="mdi:account-circle-outline"></iconify-icon>
              个人资料
            </h3>
            <div class="space-y-3">
              <div>
                <label class="text-xs text-slate-500">账号</label>
                <input class="input mt-1" value="${escapeHtml(global.NS.Auth.getUser()?.username || '')}" disabled />
              </div>
              <div>
                <label class="text-xs text-slate-500">昵称</label>
                <input class="input mt-1" id="set-nickname" value="${escapeHtml(global.NS.Auth.getUser()?.nickname || '')}" maxlength="20" />
              </div>
              <button class="btn-primary" data-act="save-profile">
                <iconify-icon icon="mdi:content-save"></iconify-icon> 保存资料
              </button>
            </div>
            <div class="mt-4 pt-4 border-t border-white/10">
              <label class="text-xs text-slate-500">修改密码</label>
              <input class="input mt-1 mb-2" id="set-oldpwd" type="password" placeholder="原密码" />
              <input class="input mt-1 mb-2" id="set-newpwd" type="password" placeholder="新密码 (≥6位)" />
              <button class="btn-ghost" data-act="change-pwd">
                <iconify-icon icon="mdi:lock-reset"></iconify-icon> 修改密码
              </button>
            </div>
          </div>

          <!-- 个性化 -->
          <div class="glass-card">
            <h3 class="glass-section-title mb-3">
              <iconify-icon icon="mdi:palette-outline"></iconify-icon>
              个性化
            </h3>
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm">主题</span>
                <select class="select" style="width:140px" id="set-theme">
                  <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>深色</option>
                  <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>浅色</option>
                </select>
              </div>
              <div>
                <label class="text-xs text-slate-500">界面透明度 (${Math.round((settings.uiOpacity || 0.95) * 100)}%)</label>
                <input type="range" min="0.6" max="1" step="0.05" class="w-full mt-2" id="set-opacity" value="${settings.uiOpacity || 0.95}" />
              </div>
              <div>
                <label class="text-xs text-slate-500">自定义背景 URL (可选)</label>
                <input class="input mt-1" id="set-bg" value="${escapeHtml(settings.background || '')}" placeholder="https://..." />
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm">桌面通知</span>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" id="set-notif" ${settings.notificationEnabled ? 'checked' : ''} class="sr-only peer" />
                  <div class="w-11 h-6 bg-white/10 peer-checked:bg-brand rounded-full transition"></div>
                </label>
              </div>
              <button class="btn-primary" data-act="save-settings">
                <iconify-icon icon="mdi:content-save"></iconify-icon> 保存设置
              </button>
            </div>
          </div>

          <!-- 数据备份与恢复 -->
          <div class="glass-card lg:col-span-2">
            <h3 class="glass-section-title mb-3">
              <iconify-icon icon="mdi:database-outline"></iconify-icon>
              数据备份与恢复
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button class="btn-primary" data-act="export">
                <iconify-icon icon="mdi:download"></iconify-icon>
                导出我的全部数据 (JSON)
              </button>
              <div>
                <input type="file" id="import-file" accept=".json" class="hidden" />
                <button class="btn-ghost w-full" data-act="import">
                  <iconify-icon icon="mdi:upload"></iconify-icon>
                  导入 JSON 备份
                </button>
              </div>
            </div>
            <p class="text-xs text-slate-400 mt-3">
              <iconify-icon icon="mdi:alert" class="text-accent-coral"></iconify-icon>
              <b class="text-accent-coral">请勿存储</b>银行卡、私钥、密码等高敏感信息。
            </p>
          </div>

          <!-- 同步状态 -->
          <div class="glass-card lg:col-span-2">
            <h3 class="glass-section-title mb-3">
              <iconify-icon icon="mdi:sync"></iconify-icon>
              多端同步
            </h3>
            <div class="flex items-center justify-between flex-wrap gap-3">
              <div class="text-sm">
                <div class="flex items-center gap-2 mb-1">
                  <span class="dot-online"></span>
                  <span>已登录 - ${escapeHtml(global.NS.Auth.getUser()?.username || '')}</span>
                </div>
                <div class="text-xs text-slate-400">登录状态与个性化设置在所有设备实时同步</div>
              </div>
              <button class="btn-ghost" data-act="pull">
                <iconify-icon icon="mdi:cloud-sync"></iconify-icon> 立即拉取服务端数据
              </button>
            </div>
          </div>
        </div>
      `;

      root.querySelector('[data-act="save-profile"]').addEventListener('click', async () => {
        const nickname = root.querySelector('#set-nickname').value.trim();
        try {
          await global.NS.Auth.updateProfile({ nickname });
          Toast({ type: 'success', message: '资料已更新' });
        } catch (err) { Toast({ type: 'error', message: err.message }); }
      });

      root.querySelector('[data-act="change-pwd"]').addEventListener('click', async () => {
        const oldPassword = root.querySelector('#set-oldpwd').value;
        const newPassword = root.querySelector('#set-newpwd').value;
        if (!oldPassword || !newPassword) return Toast({ type: 'warning', message: '请填写完整' });
        try {
          await global.NS.Auth.updateProfile({ oldPassword, newPassword });
          Toast({ type: 'success', message: '密码已修改' });
          root.querySelector('#set-oldpwd').value = '';
          root.querySelector('#set-newpwd').value = '';
        } catch (err) { Toast({ type: 'error', message: err.message }); }
      });

      root.querySelector('[data-act="save-settings"]').addEventListener('click', async () => {
        const payload = {
          theme: root.querySelector('#set-theme').value,
          uiOpacity: parseFloat(root.querySelector('#set-opacity').value),
          background: root.querySelector('#set-bg').value.trim(),
          notificationEnabled: root.querySelector('#set-notif').checked
        };
        try {
          await Api.updateSettings(payload);
          Toast({ type: 'success', message: '设置已同步到所有设备' });
          applyTheme(payload.theme);
          applyBgAndOpacity(payload);
          // 申请通知权限
          if (payload.notificationEnabled && 'Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
          }
        } catch (err) { Toast({ type: 'error', message: err.message }); }
      });

      root.querySelector('[data-act="export"]').addEventListener('click', async () => {
        try {
          await Api.exportBackup();
          Toast({ type: 'success', message: '备份文件已生成' });
        } catch (err) { Toast({ type: 'error', message: err.message }); }
      });

      root.querySelector('[data-act="import"]').addEventListener('click', () => {
        root.querySelector('#import-file').click();
      });
      root.querySelector('#import-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const obj = JSON.parse(text);
          await Api.importBackup(obj);
          Toast({ type: 'success', message: '导入完成，刷新页面查看' });
          setTimeout(() => location.reload(), 1000);
        } catch (err) { Toast({ type: 'error', message: '导入失败: ' + err.message }); }
      });

      root.querySelector('[data-act="pull"]').addEventListener('click', () => {
        global.NS.Sync.pull();
        Toast({ type: 'info', message: '正在同步...' });
      });
    }
  };

  /* ============================================================
   * 11) MusicPlayer - 音乐播放器（带底部常驻条 + 模态播放列表）
   * ========================================================== */
  const MusicPlayer = {
    audio: null,
    playlist: [],     // 全量曲目（来自 /api/tracks）
    currentIdx: -1,
    isPlaying: false,
    shuffle: false,
    repeatMode: 'all', // off | all | one
    volume: 0.8,
    showList: false,

    async render(root) {
      // 仅渲染入口卡片 + 触发底部播放器装配
      let tracks = [];
      try {
        const r = await Api.listTracks();
        tracks = (r.data && r.data.items) || [];
      } catch (err) {
        Toast({ type: 'error', message: '加载音乐失败: ' + err.message });
      }
      this.playlist = tracks;

      root.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <!-- 左侧：上传与说明 -->
          <div class="lg:col-span-1 space-y-4">
            <div class="glass-card">
              <h3 class="glass-section-title mb-3">
                <iconify-icon icon="mdi:music-note-plus"></iconify-icon>
                上传音乐
              </h3>
              <p class="text-xs text-slate-400 mb-3">支持 mp3 / wav / ogg / aac / m4a / flac，单文件 ≤ 25MB</p>
              <div id="mp-drop" class="mp-drop-zone">
                <iconify-icon icon="mdi:cloud-upload-outline" class="text-3xl text-brand"></iconify-icon>
                <p class="text-sm mt-2">点击或拖拽音频文件到此处</p>
                <input type="file" id="mp-file" accept="audio/*" class="hidden" multiple />
              </div>
              <div id="mp-progress" class="hidden mt-3">
                <div class="text-xs text-slate-400 mb-1"><span id="mp-progress-text">准备上传...</span></div>
                <div class="mp-progress-bar"><div id="mp-progress-fill" class="mp-progress-fill"></div></div>
              </div>
            </div>

            <div class="glass-card">
              <h3 class="glass-section-title mb-3">
                <iconify-icon icon="mdi:play-circle-outline"></iconify-icon>
                全局快捷键
              </h3>
              <ul class="text-xs text-slate-400 space-y-1">
                <li><kbd class="kbd">Space</kbd> 播放 / 暂停</li>
                <li><kbd class="kbd">N</kbd> 下一首</li>
                <li><kbd class="kbd">P</kbd> 上一首</li>
                <li><kbd class="kbd">↑</kbd> / <kbd class="kbd">↓</kbd> 调节音量</li>
                <li><kbd class="kbd">←</kbd> / <kbd class="kbd">→</kbd> 跳转 ±5 秒</li>
              </ul>
            </div>
          </div>

          <!-- 右侧：曲目列表 -->
          <div class="lg:col-span-2">
            <div class="glass-card">
              <div class="flex items-center justify-between mb-3">
                <h3 class="glass-section-title">
                  <iconify-icon icon="mdi:playlist-music"></iconify-icon>
                  我的曲库 <span class="text-xs text-slate-400 ml-2">${tracks.length} 首</span>
                </h3>
                <div class="flex items-center gap-2">
                  <input id="mp-search" type="search" placeholder="搜索曲目..."
                         class="input w-44 py-1 text-sm" />
                </div>
              </div>
              <div id="mp-list" class="mp-list">
                ${this.renderListHTML(tracks)}
              </div>
            </div>
          </div>
        </div>
      `;

      this.bindModuleEvents(root);
      this.bindPlayerBar();
      this.bindGlobalKey();
    },

    renderListHTML(items) {
      if (!items.length) {
        return emptyState('还没有上传音乐，点左侧区域开始添加', 'mdi:music-off-outline');
      }
      return items.map((t, idx) => {
        const dur = t.duration ? this.fmtTime(t.duration) : '--:--';
        const isCurrent = idx === this.currentIdx;
        return `
          <div class="mp-row ${isCurrent ? 'is-current' : ''}" data-id="${t.id}">
            <button class="mp-row-play" data-act="play" data-id="${t.id}">
              <iconify-icon icon="${isCurrent && this.isPlaying ? 'mdi:pause' : 'mdi:play'}"></iconify-icon>
            </button>
            <div class="mp-row-meta">
              <div class="mp-row-title">${escapeHtml(t.name)}</div>
              <div class="mp-row-sub">${escapeHtml(t.artist || t.title || '')} · ${dur}</div>
            </div>
            <div class="mp-row-size">${(t.size / 1024 / 1024).toFixed(1)}MB</div>
            <div class="mp-row-actions">
              <button data-act="rename" data-id="${t.id}" title="重命名">
                <iconify-icon icon="mdi:pencil-outline"></iconify-icon>
              </button>
              <button data-act="download" data-id="${t.id}" title="下载">
                <iconify-icon icon="mdi:download"></iconify-icon>
              </button>
              <button data-act="delete" data-id="${t.id}" title="删除" class="text-accent-coral">
                <iconify-icon icon="mdi:trash-can-outline"></iconify-icon>
              </button>
            </div>
          </div>
        `;
      }).join('');
    },

    bindModuleEvents(root) {
      // 上传 / 拖拽
      const drop = root.querySelector('#mp-drop');
      const fileInput = root.querySelector('#mp-file');
      drop.onclick = () => fileInput.click();
      fileInput.onchange = (e) => this.uploadFiles(e.target.files);

      ['dragenter', 'dragover'].forEach((ev) => {
        drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-drag'); });
      });
      ['dragleave', 'drop'].forEach((ev) => {
        drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-drag'); });
      });
      drop.addEventListener('drop', (e) => this.uploadFiles(e.dataTransfer.files));

      // 列表事件
      root.querySelector('#mp-list').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const act = btn.getAttribute('data-act');
        if (act === 'play') this.play(id);
        else if (act === 'rename') this.renameTrack(id);
        else if (act === 'download') this.downloadTrack(id);
        else if (act === 'delete') this.deleteTrack(id);
      });

      // 搜索
      const search = root.querySelector('#mp-search');
      const applyFilter = debounce(() => {
        const q = search.value.trim().toLowerCase();
        const filtered = q
          ? this.playlist.filter((t) => (t.name || '').toLowerCase().includes(q) || (t.artist || '').toLowerCase().includes(q))
          : this.playlist;
        root.querySelector('#mp-list').innerHTML = this.renderListHTML(filtered);
      }, 200);
      search.addEventListener('input', applyFilter);
    },

    async uploadFiles(fileList) {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      const progWrap = document.getElementById('mp-progress');
      const progText = document.getElementById('mp-progress-text');
      const progFill = document.getElementById('mp-progress-fill');
      progWrap.classList.remove('hidden');

      let done = 0, fail = 0, lastErr = '';
      const total = files.length;
      for (const f of files) {
        try {
          // 先尝试拿到时长（用临时 objectURL 仅用于 metadata，不必再读 base64）
          let duration = 0;
          try {
            const tmpUrl = URL.createObjectURL(f);
            duration = await this.probeDurationFromUrl(tmpUrl).catch(() => 0);
            URL.revokeObjectURL(tmpUrl);
          } catch {}

          progText.textContent = `上传 ${f.name} (${done + 1}/${total})...`;
          // 使用 V4：multipart 表单提交到 /api/tracks/upload-local，由 multer 落盘
          await Api.uploadTrackLocal(f, {
            name: f.name,
            type: f.type || 'audio/mpeg',
            size: f.size,
            duration,
            artist: '',
            title: f.name.replace(/\.[^.]+$/, '')
          }, (p) => {
            if (progFill) progFill.style.width = Math.round(p * 100) + '%';
          });
          done++;
        } catch (err) {
          fail++;
          lastErr = err && err.message ? err.message : String(err);
          console.error(err);
        }
      }
      progText.textContent = fail
        ? `完成 ${done} 成功，${fail} 失败${lastErr ? ' (' + lastErr + ')' : ''}`
        : `全部上传成功 ✓`;
      if (progFill) progFill.style.width = '100%';
      setTimeout(() => progWrap.classList.add('hidden'), 1800);
      Toast({ type: fail ? 'warning' : 'success', message: `上传完成：${done}/${total}` });
      EventBus.emit('music:changed');
      // 重新拉取曲目并刷新视图
      try {
        const r = await Api.listTracks();
        this.playlist = (r.data && r.data.items) || [];
      } catch {}
      if (global.NS.App && global.NS.App.navigate) global.NS.App.navigate('#/music');
      else if (location.hash === '#/music') this.render(document.getElementById('view-container'));
    },

    fileToDataUrl(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
    },

    probeDurationFromUrl(url) {
      return new Promise((resolve) => {
        const a = new Audio();
        a.preload = 'metadata';
        a.onloadedmetadata = () => {
          const d = isFinite(a.duration) ? a.duration : 0;
          try { URL.revokeObjectURL(url); } catch {}
          resolve(d);
        };
        a.onerror = () => { try { URL.revokeObjectURL(url); } catch {} resolve(0); };
        a.src = url;
      });
    },

    async play(id) {
      // 找到曲目索引
      const idx = this.playlist.findIndex((t) => t.id === id);
      if (idx < 0) return;
      const track = this.playlist[idx];
      this.currentIdx = idx;
      if (!this.audio) this.audio = new Audio();

      // V4：先取一个流式 ObjectURL，避免把 dataUrl 塞进 <audio src>
      let playUrl = track.dataUrl;
      if (!playUrl || playUrl.startsWith('blob:') === false && !/^data:/.test(playUrl || '')) {
        // 没有 base64，则走 /api/tracks/:id/download（带 Authorization）
        try {
          const blob = await global.NS.fetchAuthedBlob(Api.streamTrackUrl(id));
          playUrl = URL.createObjectURL(blob);
        } catch (err) {
          // 回退到 dataUrl（老数据）
          if (track.dataUrl) playUrl = track.dataUrl;
          else { Toast({ type: 'error', message: '无法加载音源: ' + err.message }); return; }
        }
      }
      if (this.audio.src) {
        try { if (this.audio.src.startsWith('blob:')) URL.revokeObjectURL(this.audio.src); } catch {}
      }
      this.audio.src = playUrl;
      this.audio.volume = this.volume;
      try {
        await this.audio.play();
        this.isPlaying = true;
      } catch (err) {
        Toast({ type: 'error', message: '播放失败: ' + err.message });
        return;
      }
      this.updatePlayerBar();
    },

    pause() {
      if (!this.audio) return;
      this.audio.pause();
      this.isPlaying = false;
      this.updatePlayerBar();
    },

    toggle() {
      if (this.isPlaying) this.pause();
      else if (this.currentIdx >= 0) this.play(this.playlist[this.currentIdx].id);
      else if (this.playlist.length) this.play(this.playlist[0].id);
    },

    getNextIdx() {
      if (!this.playlist.length) return -1;
      if (this.repeatMode === 'one') return this.currentIdx;
      if (this.shuffle) {
        if (this.playlist.length === 1) return 0;
        let next;
        do { next = Math.floor(Math.random() * this.playlist.length); } while (next === this.currentIdx);
        return next;
      }
      const n = (this.currentIdx + 1) % this.playlist.length;
      return n;
    },

    getPrevIdx() {
      if (!this.playlist.length) return -1;
      if (this.audio && this.audio.currentTime > 3) {
        this.audio.currentTime = 0;
        return this.currentIdx;
      }
      if (this.shuffle) {
        let prev;
        do { prev = Math.floor(Math.random() * this.playlist.length); } while (prev === this.currentIdx);
        return prev;
      }
      const p = (this.currentIdx - 1 + this.playlist.length) % this.playlist.length;
      return p;
    },

    next() {
      const n = this.getNextIdx();
      if (n < 0) return;
      this.play(this.playlist[n].id);
    },

    prev() {
      const p = this.getPrevIdx();
      if (p < 0) return;
      this.play(this.playlist[p].id);
    },

    bindPlayerBar() {
      let bar = document.getElementById('mp-bar');
      if (bar) return;
      bar = document.createElement('div');
      bar.id = 'mp-bar';
      bar.className = 'mp-bar';
      bar.innerHTML = `
        <div class="mp-bar-inner">
          <div class="mp-bar-cover" id="mp-bar-cover">
            <iconify-icon icon="mdi:music-circle-outline"></iconify-icon>
          </div>
          <div class="mp-bar-info">
            <div class="mp-bar-title" id="mp-bar-title">未在播放</div>
            <div class="mp-bar-sub" id="mp-bar-sub">选一首开始聆听</div>
          </div>
          <div class="mp-bar-controls">
            <button id="mp-btn-shuffle" title="随机"><iconify-icon icon="mdi:shuffle"></iconify-icon></button>
            <button id="mp-btn-prev" title="上一首"><iconify-icon icon="mdi:skip-previous"></iconify-icon></button>
            <button id="mp-btn-play" title="播放/暂停" class="mp-bar-play"><iconify-icon icon="mdi:play"></iconify-icon></button>
            <button id="mp-btn-next" title="下一首"><iconify-icon icon="mdi:skip-next"></iconify-icon></button>
            <button id="mp-btn-repeat" title="循环模式"><iconify-icon icon="mdi:repeat"></iconify-icon></button>
            <button id="mp-btn-list" title="播放列表"><iconify-icon icon="mdi:playlist-music"></iconify-icon></button>
          </div>
          <div class="mp-bar-progress">
            <span id="mp-bar-curtime" class="mp-bar-time">0:00</span>
            <div class="mp-bar-track" id="mp-bar-track"><div class="mp-bar-track-fill" id="mp-bar-track-fill"></div></div>
            <span id="mp-bar-totaltime" class="mp-bar-time">0:00</span>
          </div>
          <div class="mp-bar-volume">
            <button id="mp-btn-mute" title="静音"><iconify-icon icon="mdi:volume-high"></iconify-icon></button>
            <div class="mp-bar-vol-track" id="mp-bar-vol-track"><div class="mp-bar-vol-fill" id="mp-bar-vol-fill"></div></div>
          </div>
        </div>
      `;
      document.body.appendChild(bar);

      // 事件
      bar.querySelector('#mp-btn-play').onclick = () => this.toggle();
      bar.querySelector('#mp-btn-prev').onclick = () => this.prev();
      bar.querySelector('#mp-btn-next').onclick = () => this.next();
      bar.querySelector('#mp-btn-shuffle').onclick = () => {
        this.shuffle = !this.shuffle;
        bar.querySelector('#mp-btn-shuffle').classList.toggle('is-on', this.shuffle);
        Toast({ type: 'info', message: this.shuffle ? '已开启随机播放' : '已关闭随机播放', duration: 1200 });
      };
      bar.querySelector('#mp-btn-repeat').onclick = () => {
        const modes = ['all', 'one', 'off'];
        const nxt = modes[(modes.indexOf(this.repeatMode) + 1) % modes.length];
        this.repeatMode = nxt;
        const icon = nxt === 'one' ? 'mdi:repeat-once' : nxt === 'off' ? 'mdi:repeat-off' : 'mdi:repeat';
        bar.querySelector('#mp-btn-repeat').querySelector('iconify-icon').setAttribute('icon', icon);
        bar.querySelector('#mp-btn-repeat').classList.toggle('is-on', nxt !== 'off');
        const label = nxt === 'one' ? '单曲循环' : nxt === 'off' ? '不循环' : '列表循环';
        Toast({ type: 'info', message: label, duration: 1200 });
      };
      bar.querySelector('#mp-btn-list').onclick = () => {
        if (!this.playlist.length) {
          Toast({ type: 'warning', message: '还没有曲目' });
          return;
        }
        location.hash = '#/music';
      };
      bar.querySelector('#mp-btn-mute').onclick = () => {
        this.volume = this.volume > 0 ? 0 : (storage.get('mp.volume', 0.8) || 0.8);
        if (this.audio) this.audio.volume = this.volume;
        storage.set('mp.volume', this.volume);
        this.updatePlayerBar();
      };

      // 进度条点击
      const track = bar.querySelector('#mp-bar-track');
      track.onclick = (e) => {
        if (!this.audio || !isFinite(this.audio.duration)) return;
        const rect = track.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, ratio * this.audio.duration));
      };

      // 音量条点击
      const volTrack = bar.querySelector('#mp-bar-vol-track');
      volTrack.onclick = (e) => {
        const rect = volTrack.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        this.volume = ratio;
        if (this.audio) this.audio.volume = ratio;
        storage.set('mp.volume', ratio);
        this.updatePlayerBar();
      };

      // 恢复持久化音量
      const saved = storage.get('mp.volume', 0.8);
      this.volume = saved;
      if (this.audio) this.audio.volume = saved;

      // 监听 audio 事件
      const audio = this.audio || (this.audio = new Audio());
      audio.addEventListener('timeupdate', () => this.updateProgress());
      audio.addEventListener('ended', () => {
        if (this.repeatMode === 'one') {
          audio.currentTime = 0;
          audio.play().catch(() => {});
          return;
        }
        const n = this.getNextIdx();
        if (n < 0) {
          this.isPlaying = false;
          this.updatePlayerBar();
          return;
        }
        this.play(this.playlist[n].id);
      });
      audio.addEventListener('play', () => { this.isPlaying = true; this.updatePlayerBar(); });
      audio.addEventListener('pause', () => { this.isPlaying = false; this.updatePlayerBar(); });
    },

    bindGlobalKey() {
      // 仅绑定一次
      if (this._keyBound) return;
      this._keyBound = true;
      document.addEventListener('keydown', (e) => {
        // 在输入框中不响应
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
        if (e.code === 'Space') {
          e.preventDefault();
          this.toggle();
        } else if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          this.next();
        } else if (e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          this.prev();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.volume = Math.min(1, this.volume + 0.05);
          if (this.audio) this.audio.volume = this.volume;
          storage.set('mp.volume', this.volume);
          this.updatePlayerBar();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.volume = Math.max(0, this.volume - 0.05);
          if (this.audio) this.audio.volume = this.volume;
          storage.set('mp.volume', this.volume);
          this.updatePlayerBar();
        } else if (e.key === 'ArrowLeft') {
          if (this.audio) this.audio.currentTime = Math.max(0, this.audio.currentTime - 5);
        } else if (e.key === 'ArrowRight') {
          if (this.audio) this.audio.currentTime = Math.min(this.audio.duration || 0, this.audio.currentTime + 5);
        }
      });
    },

    updatePlayerBar() {
      const bar = document.getElementById('mp-bar');
      if (!bar) return;
      const t = this.playlist[this.currentIdx];
      const titleEl = bar.querySelector('#mp-bar-title');
      const subEl = bar.querySelector('#mp-bar-sub');
      const coverEl = bar.querySelector('#mp-bar-cover');
      const playBtn = bar.querySelector('#mp-btn-play');
      if (t) {
        titleEl.textContent = t.name;
        subEl.textContent = (t.artist || t.title || '未知艺术家');
        if (t.cover) {
          coverEl.innerHTML = `<img src="${t.cover}" alt="" class="mp-bar-cover-img" />`;
        } else {
          coverEl.innerHTML = `<iconify-icon icon="mdi:music-circle-outline"></iconify-icon>`;
        }
      } else {
        titleEl.textContent = '未在播放';
        subEl.textContent = '选一首开始聆听';
        coverEl.innerHTML = `<iconify-icon icon="mdi:music-circle-outline"></iconify-icon>`;
      }
      const playIcon = playBtn.querySelector('iconify-icon');
      playIcon.setAttribute('icon', this.isPlaying ? 'mdi:pause' : 'mdi:play');
      // 音量
      const volFill = bar.querySelector('#mp-bar-vol-fill');
      volFill.style.width = (this.volume * 100) + '%';
      const muteBtn = bar.querySelector('#mp-btn-mute');
      muteBtn.querySelector('iconify-icon').setAttribute('icon',
        this.volume === 0 ? 'mdi:volume-off' : this.volume < 0.4 ? 'mdi:volume-low' : 'mdi:volume-high');
      // 状态
      bar.querySelector('#mp-btn-shuffle').classList.toggle('is-on', this.shuffle);
      const repeatIcon = this.repeatMode === 'one' ? 'mdi:repeat-once' : this.repeatMode === 'off' ? 'mdi:repeat-off' : 'mdi:repeat';
      bar.querySelector('#mp-btn-repeat').querySelector('iconify-icon').setAttribute('icon', repeatIcon);
      bar.querySelector('#mp-btn-repeat').classList.toggle('is-on', this.repeatMode !== 'off');
    },

    updateProgress() {
      const bar = document.getElementById('mp-bar');
      if (!bar || !this.audio) return;
      const cur = this.audio.currentTime || 0;
      const dur = isFinite(this.audio.duration) ? this.audio.duration : 0;
      bar.querySelector('#mp-bar-curtime').textContent = this.fmtTime(cur);
      bar.querySelector('#mp-bar-totaltime').textContent = this.fmtTime(dur);
      const fill = bar.querySelector('#mp-bar-track-fill');
      fill.style.width = dur ? (cur / dur * 100) + '%' : '0%';
    },

    fmtTime(sec) {
      sec = Math.max(0, Math.floor(sec || 0));
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return m + ':' + String(s).padStart(2, '0');
    },

    async renameTrack(id) {
      const t = this.playlist.find((x) => x.id === id);
      if (!t) return;
      const newName = await Prompt({ title: '重命名曲目', message: '请输入新名称', defaultValue: t.name });
      if (!newName) return;
      try {
        await Api.renameTrack(id, newName);
        Object.assign(t, { name: newName });
        Toast({ type: 'success', message: '已重命名' });
        this.updatePlayerBar();
        EventBus.emit('music:changed');
      } catch (err) {
        Toast({ type: 'error', message: err.message });
      }
    },

    async downloadTrack(id) {
      const t = this.playlist.find((x) => x.id === id);
      if (!t) return;
      try {
        const url = Api.downloadTrackUrl(id);
        const resp = await fetch(url, { headers: { Authorization: 'Bearer ' + Api.getToken() } });
        if (!resp.ok) throw new Error('下载失败');
        const blob = await resp.blob();
        const dlUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = t.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(dlUrl);
        Toast({ type: 'success', message: '下载已开始' });
      } catch (err) {
        Toast({ type: 'error', message: err.message });
      }
    },

    async deleteTrack(id) {
      const t = this.playlist.find((x) => x.id === id);
      if (!t) return;
      const yes = await Confirm({ title: '删除曲目', message: `确认删除「${t.name}」？此操作可从回收站恢复元数据。`, danger: true });
      if (!yes) return;
      try {
        await Api.deleteTrack(id);
        this.playlist = this.playlist.filter((x) => x.id !== id);
        if (this.currentIdx >= 0 && this.playlist[this.currentIdx] && this.playlist[this.currentIdx].id === id) {
          this.pause();
          this.currentIdx = -1;
          this.updatePlayerBar();
        }
        Toast({ type: 'success', message: '已移入回收站' });
        EventBus.emit('music:changed');
      } catch (err) {
        Toast({ type: 'error', message: err.message });
      }
    },

    async refresh() {
      try {
        const r = await Api.listTracks();
        this.playlist = (r.data && r.data.items) || [];
        this.updatePlayerBar();
      } catch {}
    }
  };

  /* ============================================================
   * 12) VideoLibrary - 视频库（上传 / 播放 / 下载）
   * ========================================================== */
  const VideoLibrary = {
    items: [],
    sort: 'newest', // newest | oldest | views | size | name
    keyword: '',
    currentVideo: null,
    modalRoot: null,

    async render(root) {
      let videos = [];
      try {
        const r = await Api.listVideos();
        videos = (r.data && r.data.items) || [];
      } catch (err) {
        Toast({ type: 'error', message: '加载视频失败: ' + err.message });
      }
      this.items = videos;

      root.innerHTML = `
        <!-- 顶部操作区 -->
        <div class="glass-card">
          <div class="flex items-center justify-between flex-wrap gap-3">
            <h3 class="glass-section-title">
              <iconify-icon icon="mdi:movie-open-play-outline"></iconify-icon>
              视频库 <span class="text-xs text-slate-400 ml-2">${videos.length} 个</span>
            </h3>
            <div class="flex items-center gap-2 flex-wrap">
              <input id="vl-search" type="search" placeholder="搜索视频名..."
                     class="input w-44 py-1 text-sm" value="${escapeHtml(this.keyword)}" />
              <select id="vl-sort" class="select py-1 text-sm">
                <option value="newest" ${this.sort === 'newest' ? 'selected' : ''}>最新上传</option>
                <option value="oldest" ${this.sort === 'oldest' ? 'selected' : ''}>最早上传</option>
                <option value="views"  ${this.sort === 'views'  ? 'selected' : ''}>播放次数</option>
                <option value="size"   ${this.sort === 'size'   ? 'selected' : ''}>文件大小</option>
                <option value="name"   ${this.sort === 'name'   ? 'selected' : ''}>按名称</option>
              </select>
              <button id="vl-upload-btn" class="btn-primary py-1.5 text-sm">
                <iconify-icon icon="mdi:upload"></iconify-icon> 上传视频
              </button>
              <input type="file" id="vl-file" accept="video/*" class="hidden" multiple />
            </div>
          </div>
          <!-- 拖拽区 -->
          <div id="vl-drop" class="vl-drop">
            <iconify-icon icon="mdi:cloud-upload-outline" class="text-2xl text-brand"></iconify-icon>
            <span class="text-sm text-slate-400">或将视频拖到这里（mp4 / webm / ogv / mov / mkv / avi，单文件 ≤ 80MB）</span>
          </div>
        </div>

        <!-- 视频网格 -->
        <div id="vl-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          ${this.renderGridHTML(videos)}
        </div>
      `;

      this.bindEvents(root);
    },

    renderGridHTML(items) {
      if (!items.length) {
        return `<div class="col-span-full">${emptyState('还没有视频，点右上角或拖拽上传', 'mdi:movie-off-outline')}</div>`;
      }
      const sorted = this.sortItems(items.slice());
      return sorted.map((v) => `
        <div class="video-card" data-id="${v.id}">
          <div class="video-card-thumb">
            ${v.poster
              ? `<img src="${v.poster}" alt="" loading="lazy" />`
              : `<div class="video-card-thumb-fallback">
                  <iconify-icon icon="mdi:movie-outline"></iconify-icon>
                </div>`}
            <div class="video-card-duration">${v.duration ? this.fmtTime(v.duration) : '--:--'}</div>
            <button class="video-card-play" data-act="play" data-id="${v.id}" title="播放">
              <iconify-icon icon="mdi:play"></iconify-icon>
            </button>
          </div>
          <div class="video-card-body">
            <div class="video-card-name" title="${escapeHtml(v.name)}">${escapeHtml(v.name)}</div>
            <div class="video-card-meta">
              <span>${(v.size / 1024 / 1024).toFixed(1)}MB</span>
              <span>·</span>
              <span>${v.views || 0} 次播放</span>
              <span>·</span>
              <span>${relTime(v.createdAt)}</span>
            </div>
            <div class="video-card-actions">
              <button data-act="play" data-id="${v.id}" title="播放"><iconify-icon icon="mdi:play-outline"></iconify-icon> 播放</button>
              <button data-act="download" data-id="${v.id}" title="下载"><iconify-icon icon="mdi:download"></iconify-icon></button>
              <button data-act="rename" data-id="${v.id}" title="重命名"><iconify-icon icon="mdi:pencil-outline"></iconify-icon></button>
              <button data-act="delete" data-id="${v.id}" title="删除" class="text-accent-coral"><iconify-icon icon="mdi:trash-can-outline"></iconify-icon></button>
            </div>
          </div>
        </div>
      `).join('');
    },

    sortItems(arr) {
      const cmp = {
        newest: (a, b) => b.createdAt - a.createdAt,
        oldest: (a, b) => a.createdAt - b.createdAt,
        views: (a, b) => (b.views || 0) - (a.views || 0),
        size: (a, b) => b.size - a.size,
        name: (a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN')
      };
      return arr.sort(cmp[this.sort] || cmp.newest);
    },

    filterItems() {
      if (!this.keyword) return this.items;
      const q = this.keyword.toLowerCase();
      return this.items.filter((v) => (v.name || '').toLowerCase().includes(q));
    },

    bindEvents(root) {
      const drop = root.querySelector('#vl-drop');
      const fileInput = root.querySelector('#vl-file');
      const uploadBtn = root.querySelector('#vl-upload-btn');
      uploadBtn.onclick = () => fileInput.click();
      fileInput.onchange = (e) => this.uploadFiles(e.target.files);
      ['dragenter', 'dragover'].forEach((ev) => {
        drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-drag'); });
      });
      ['dragleave', 'drop'].forEach((ev) => {
        drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-drag'); });
      });
      drop.addEventListener('drop', (e) => this.uploadFiles(e.dataTransfer.files));

      root.querySelector('#vl-search').addEventListener('input', (e) => {
        this.keyword = e.target.value.trim();
        const filtered = this.filterItems();
        root.querySelector('#vl-grid').innerHTML = this.renderGridHTML(filtered);
      });
      root.querySelector('#vl-sort').addEventListener('change', (e) => {
        this.sort = e.target.value;
        const filtered = this.filterItems();
        root.querySelector('#vl-grid').innerHTML = this.renderGridHTML(filtered);
      });

      root.querySelector('#vl-grid').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const act = btn.getAttribute('data-act');
        if (act === 'play') this.play(id);
        else if (act === 'download') this.download(id);
        else if (act === 'rename') this.rename(id);
        else if (act === 'delete') this.delete(id);
      });
    },

    async uploadFiles(fileList) {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      let done = 0, fail = 0, lastErr = '';
      for (const f of files) {
        try {
          Toast({ type: 'info', message: `处理 ${f.name}...`, duration: 1200 });
          // 探测元数据（用 objectURL）
          const tmpUrl = URL.createObjectURL(f);
          const meta = await this.probeVideo(tmpUrl).catch(() => ({}));
          try { URL.revokeObjectURL(tmpUrl); } catch {}
          // V4：multipart 上传 → /api/videos/upload-local
          await Api.uploadVideoLocal(f, {
            name: f.name,
            type: f.type || 'video/mp4',
            size: f.size,
            poster: meta.poster || '',
            duration: meta.duration || 0,
            width: meta.width || 0,
            height: meta.height || 0
          });
          done++;
        } catch (err) {
          fail++;
          lastErr = err && err.message ? err.message : String(err);
          Toast({ type: 'error', message: `${f.name}: ${lastErr}` });
        }
      }
      Toast({ type: fail ? 'warning' : 'success', message: `上传完成：${done} 成功，${fail} 失败` });
      EventBus.emit('videos:changed');
    },

    fileToDataUrl(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
    },

    probeVideo(url) {
      return new Promise((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.muted = true;
        v.playsInline = true;
        const cleanup = () => { try { URL.revokeObjectURL(url); } catch {} v.removeAttribute('src'); v.load(); };
        v.onloadedmetadata = () => {
          const duration = isFinite(v.duration) ? v.duration : 0;
          const width = v.videoWidth || 0;
          const height = v.videoHeight || 0;
          // 跳到 0.1s 抓首帧
          try { v.currentTime = Math.min(0.1, duration / 2 || 0.1); } catch { resolve({ duration, width, height, poster: '' }); cleanup(); return; }
        };
        v.onseeked = () => {
          try {
            const c = document.createElement('canvas');
            c.width = v.videoWidth || 320;
            c.height = v.videoHeight || 180;
            const ctx = c.getContext('2d');
            ctx.drawImage(v, 0, 0, c.width, c.height);
            const poster = c.toDataURL('image/jpeg', 0.6);
            resolve({ duration: isFinite(v.duration) ? v.duration : 0, width: v.videoWidth, height: v.videoHeight, poster });
          } catch {
            resolve({ duration: isFinite(v.duration) ? v.duration : 0, width: v.videoWidth, height: v.videoHeight, poster: '' });
          } finally {
            cleanup();
          }
        };
        v.onerror = () => {
          resolve({ duration: 0, width: 0, height: 0, poster: '' });
        };
        v.src = url;
      });
    },

    async play(id) {
      try {
        const r = await Api.getVideo(id);
        const v = r.data;
        if (!v) return;
        // 更新本地列表的 views
        const local = this.items.find((x) => x.id === id);
        if (local) local.views = (local.views || 0) + 1;
        // V4：若没有 base64 内嵌视频，预先用 fetchAuthedBlob 拿到可播放的 ObjectURL
        if (!v.dataUrl || /^data:/.test(v.dataUrl || '') === false) {
          try {
            const blob = await global.NS.fetchAuthedBlob(Api.streamVideoUrl(id));
            v.dataUrl = URL.createObjectURL(blob);
          } catch (err) {
            if (!v.dataUrl) { Toast({ type: 'error', message: '视频读取失败: ' + err.message }); return; }
          }
        }
        this.currentVideo = v;
        this.openPlayer(v);
      } catch (err) {
        Toast({ type: 'error', message: '播放失败: ' + err.message });
      }
    },

    openPlayer(v) {
      // 关闭旧的
      if (this.modalRoot) this.modalRoot.remove();
      const overlay = document.createElement('div');
      overlay.className = 'vid-player-overlay';
      overlay.innerHTML = `
        <div class="vid-player">
          <div class="vid-player-header">
            <div class="vid-title" title="${escapeHtml(v.name)}">${escapeHtml(v.name)}</div>
            <div class="vid-player-header-actions">
              <button data-act="download" class="vid-icon-btn" title="下载">
                <iconify-icon icon="mdi:download"></iconify-icon>
              </button>
              <button data-act="close" class="vid-icon-btn" title="关闭">
                <iconify-icon icon="mdi:close"></iconify-icon>
              </button>
            </div>
          </div>
          <div class="vid-stage">
            <video id="vid-el" src="${v.dataUrl}" controls autoplay playsinline></video>
          </div>
          <div class="vid-info">
            <span>${(v.size / 1024 / 1024).toFixed(1)} MB</span>
            <span>·</span>
            <span>${v.duration ? this.fmtTime(v.duration) : '未知时长'}</span>
            <span>·</span>
            <span>${v.width && v.height ? v.width + ' × ' + v.height : ''}</span>
            <span>·</span>
            <span>${v.views || 0} 次播放</span>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      this.modalRoot = overlay;

      // 事件
      overlay.querySelector('[data-act="close"]').onclick = () => this.closePlayer();
      overlay.querySelector('[data-act="download"]').onclick = () => this.download(v.id);
      overlay.onclick = (e) => {
        if (e.target === overlay) this.closePlayer();
      };
      // 快捷键
      this._playerKeyHandler = (e) => {
        if (!this.modalRoot) return;
        const video = this.modalRoot.querySelector('#vid-el');
        if (!video) return;
        if (e.key === 'Escape') this.closePlayer();
        else if (e.key === ' ') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 5); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); video.currentTime = Math.min(video.duration || 0, video.currentTime + 5); }
        else if (e.key === 'f' || e.key === 'F') {
          if (document.fullscreenElement) document.exitFullscreen();
          else overlay.querySelector('.vid-stage').requestFullscreen().catch(() => {});
        } else if (e.key === 'l' || e.key === 'L') {
          video.controls = !video.controls;
        }
      };
      document.addEventListener('keydown', this._playerKeyHandler);
    },

    closePlayer() {
      if (this.modalRoot) {
        const video = this.modalRoot.querySelector('#vid-el');
        if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
        this.modalRoot.remove();
        this.modalRoot = null;
      }
      if (this._playerKeyHandler) {
        document.removeEventListener('keydown', this._playerKeyHandler);
        this._playerKeyHandler = null;
      }
    },

    async download(id) {
      const v = this.items.find((x) => x.id === id);
      if (!v) return;
      try {
        Toast({ type: 'info', message: '准备下载...', duration: 1200 });
        const resp = await fetch(Api.downloadVideoUrl(id), {
          headers: { Authorization: 'Bearer ' + Api.getToken() }
        });
        if (!resp.ok) throw new Error('下载失败 (' + resp.status + ')');
        let filename = v.name;
        // 尝试从 Content-Disposition 解析
        const cd = resp.headers.get('content-disposition') || '';
        const m = /filename\*=UTF-8''([^;]+)/.exec(cd) || /filename="([^"]+)"/.exec(cd);
        if (m) {
          try { filename = decodeURIComponent(m[1]); } catch { filename = m[1]; }
        }
        const blob = await resp.blob();
        const dlUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(dlUrl);
        Toast({ type: 'success', message: '下载已开始' });
      } catch (err) {
        Toast({ type: 'error', message: err.message });
      }
    },

    async rename(id) {
      const v = this.items.find((x) => x.id === id);
      if (!v) return;
      const newName = await Prompt({ title: '重命名视频', message: '请输入新名称', defaultValue: v.name });
      if (!newName) return;
      try {
        await Api.renameVideo(id, newName);
        v.name = newName;
        Toast({ type: 'success', message: '已重命名' });
        EventBus.emit('videos:changed');
      } catch (err) {
        Toast({ type: 'error', message: err.message });
      }
    },

    async delete(id) {
      const v = this.items.find((x) => x.id === id);
      if (!v) return;
      const yes = await Confirm({ title: '删除视频', message: `确认删除「${v.name}」？此操作将移入回收站（仅保留元数据）。`, danger: true });
      if (!yes) return;
      try {
        await Api.deleteVideo(id);
        this.items = this.items.filter((x) => x.id !== id);
        if (this.currentVideo && this.currentVideo.id === id) this.closePlayer();
        Toast({ type: 'success', message: '已移入回收站' });
        EventBus.emit('videos:changed');
      } catch (err) {
        Toast({ type: 'error', message: err.message });
      }
    },

    fmtTime(sec) {
      sec = Math.max(0, Math.floor(sec || 0));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      return m + ':' + String(s).padStart(2, '0');
    }
  };

  /* ============================================================
   * 13) Trash 详情查看（回收站模块已在 render 中实现）
   * ========================================================== */

  /* ============================================================
   * 公共样式 / 函数
   * ========================================================== */
  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
    document.documentElement.setAttribute('data-theme', theme);
    storage.set('nexspace.theme', theme);
  }

  function applyBgAndOpacity(s) {
    const opacity = s.uiOpacity || 0.95;
    document.documentElement.style.setProperty('--bg-mask', (1 - opacity) * 0.5 + 0.1);
    if (s.background) {
      document.body.style.backgroundImage = `url(${s.background})`;
      document.body.classList.add('has-bg');
    } else {
      document.body.style.backgroundImage = '';
      document.body.classList.remove('has-bg');
    }
  }

  /* ============================================================
   * 暴露模块
   * ========================================================== */
  global.NS = global.NS || {};
  global.NS.Modules = {
    Dashboard, Tasks, Notes, Bookmarks, Pomodoro,
    Calendar, Clipboard, Stats, Trash, Tags, Settings,
    MusicPlayer, VideoLibrary,
    applyTheme, applyBgAndOpacity
  };
})(window);
