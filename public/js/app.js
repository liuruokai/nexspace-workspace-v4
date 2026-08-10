/**
 * NexSpace 应用主入口
 * ----------------------------------------------------------------
 * 职责：
 *  1. 启动 Splash 动画
 *  2. 登录状态检测
 *  3. 侧边栏导航 + Hash 路由
 *  4. 全局搜索
 *  5. 拖拽布局
 *  6. 模块按需渲染
 */
(function (global) {
  'use strict';
  const {
    Api, Auth, storage, debounce, throttle, EventBus,
    Toast, Modal, Confirm, formatDate, relTime, escapeHtml
  } = global.NS;
  const { Modules } = global.NS;

  /* ============================================================
   * 路由表
   * ========================================================== */
  const ROUTES = [
    { hash: '#/dashboard', name: '仪表盘', icon: 'mdi:view-dashboard-outline', subtitle: '总览今日工作', module: 'Dashboard' },
    { hash: '#/tasks',      name: '待办任务', icon: 'mdi:checkbox-marked-circle-outline', subtitle: '把要做的事列清楚', module: 'Tasks' },
    { hash: '#/notes',      name: '富文本笔记', icon: 'mdi:notebook-edit-outline', subtitle: '随时记录所思', module: 'Notes' },
    { hash: '#/bookmarks',  name: '书签', icon: 'mdi:bookmark-multiple-outline', subtitle: '把常用网址收起来', module: 'Bookmarks' },
    { hash: '#/pomodoro',   name: '番茄专注', icon: 'mdi:timer-outline', subtitle: '专注 25 分钟', module: 'Pomodoro' },
    { hash: '#/calendar',   name: '日程日历', icon: 'mdi:calendar-month-outline', subtitle: '规划每一天', module: 'Calendar' },
    { hash: '#/clipboard',  name: '剪贴板', icon: 'mdi:content-paste', subtitle: '临时文本收集', module: 'Clipboard' },
    { hash: '#/music',      name: '音乐', icon: 'mdi:music-circle-outline', subtitle: '上传 / 播放 / 下载音乐', module: 'MusicPlayer' },
    { hash: '#/videos',     name: '视频库', icon: 'mdi:movie-play-outline', subtitle: '上传 / 播放 / 下载视频', module: 'VideoLibrary' },
    { hash: '#/tags',       name: '标签管理', icon: 'mdi:tag-multiple-outline', subtitle: '自定义分类配色', module: 'Tags' },
    { hash: '#/stats',      name: '数据看板', icon: 'mdi:chart-bar', subtitle: '看你的效率曲线', module: 'Stats' },
    { hash: '#/trash',      name: '回收站', icon: 'mdi:trash-can-outline', subtitle: '可恢复删除项', module: 'Trash' },
    { hash: '#/settings',   name: '设置', icon: 'mdi:cog-outline', subtitle: '个性化与数据管理', module: 'Settings' }
  ];
  const ROUTE_MAP = Object.fromEntries(ROUTES.map((r) => [r.hash, r]));

  /* ============================================================
   * 应用初始化
   * ========================================================== */
  async function bootstrap() {
    // 1) 显示 Splash 至少 600ms（防止首次绘制闪烁）
    const splash = document.getElementById('splash-screen');
    setTimeout(() => splash.classList.add('hidden'), 700);

    // 2) 检查登录态
    const user = await Auth.tryRestore();
    if (user) {
      enterApp();
    } else {
      showLogin();
    }

    // 3) 注册 Service Worker (PWA)
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/service-worker.js');
      } catch {}
    }
  }

  /* ============================================================
   * 登录页
   * ========================================================== */
  function showLogin() {
    document.getElementById('view-login').classList.remove('hidden');
    document.getElementById('app-root').classList.add('hidden');
    bindLoginForm();
  }

  let isRegister = false;
  function bindLoginForm() {
    const form = document.getElementById('auth-form');
    const nicknameField = form.querySelector('.auth-field');
    const title = document.getElementById('auth-title');
    const submitText = document.getElementById('auth-submit-text');
    const toggleBtn = document.getElementById('auth-toggle');

    function renderMode() {
      title.textContent = isRegister ? '注册' : '登录';
      submitText.textContent = isRegister ? '注 册' : '登 录';
      toggleBtn.textContent = isRegister ? '已有账号，去登录' : '还没有账号？立即注册';
      nicknameField.classList.toggle('hidden', !isRegister);
    }
    renderMode();

    toggleBtn.onclick = () => {
      isRegister = !isRegister;
      renderMode();
    };

    document.getElementById('f-toggle-pwd').onclick = () => {
      const input = document.getElementById('f-password');
      input.type = input.type === 'password' ? 'text' : 'password';
    };

    form.onsubmit = async (e) => {
      e.preventDefault();
      const username = document.getElementById('f-username').value.trim();
      const password = document.getElementById('f-password').value;
      const nickname = document.getElementById('f-nickname').value.trim();
      if (!username || !password) return Toast({ type: 'warning', message: '请填写账号和密码' });
      const remember = document.getElementById('f-remember').checked;
      // 当前 token 不动，登录接口本身会更新
      try {
        if (isRegister) {
          await Auth.register(username, password, nickname);
          Toast({ type: 'success', message: '注册成功！欢迎加入' });
        } else {
          await Auth.login(username, password);
          Toast({ type: 'success', message: '登录成功' });
        }
        enterApp();
      } catch (err) {
        Toast({ type: 'error', message: err.message || '操作失败' });
      }
    };
  }

  /* ============================================================
   * 应用主流程
   * ========================================================== */
  function enterApp() {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('app-root').classList.remove('hidden');

    // 启动主题
    initThemeFromSettings();
    // 渲染导航
    renderNav();
    // 监听 hash 路由
    window.addEventListener('hashchange', handleRoute);
    if (!location.hash) {
      const lastView = storage.get('nexspace.lastView', '#/dashboard');
      location.hash = lastView;
    } else {
      handleRoute();
    }
    // 启动同步
    global.NS.Sync.start(30000);
    // 顶部栏 / 全局搜索
    bindGlobalUI();
    // 通知权限
    if ('Notification' in window && Notification.permission === 'default') {
      setTimeout(() => Notification.requestPermission(), 3000);
    }
  }

  async function initThemeFromSettings() {
    try {
      const r = await Api.getSettings();
      const s = r.data || {};
      Modules.applyTheme(s.theme || 'dark');
      Modules.applyBgAndOpacity(s);
    } catch {}
  }

  function renderNav() {
    const nav = document.getElementById('sidebar-nav');
    const miniNav = document.getElementById('sidebar-mini-nav');
    const user = Auth.getUser() || {};
    document.getElementById('user-nickname').textContent = user.nickname || user.username || '游客';
    document.getElementById('user-username').textContent = '@' + (user.username || 'guest');
    document.getElementById('user-avatar').textContent = (user.nickname || user.username || 'N').charAt(0).toUpperCase();

    nav.innerHTML = ROUTES.map((r) => `
      <div class="nav-item" data-hash="${r.hash}">
        <iconify-icon icon="${r.icon}"></iconify-icon>
        <span class="nav-label">${escapeHtml(r.name)}</span>
      </div>
    `).join('');

    miniNav.innerHTML = ROUTES.map((r) => `
      <div class="nav-item" data-hash="${r.hash}" title="${escapeHtml(r.name)}">
        <iconify-icon icon="${r.icon}"></iconify-icon>
      </div>
    `).join('');

    const allNavItems = document.querySelectorAll('[data-hash]');
    allNavItems.forEach((el) => {
      el.addEventListener('click', () => {
        location.hash = el.getAttribute('data-hash');
        // 移动端自动关闭
        if (window.innerWidth < 768) {
          document.getElementById('sidebar').classList.add('-translate-x-full');
          document.getElementById('sidebar-mask').classList.add('hidden');
        }
      });
    });

    // 主题切换
    document.getElementById('theme-toggle-btn').onclick = async () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      const nxt = cur === 'dark' ? 'light' : 'dark';
      Modules.applyTheme(nxt);
      try { await Api.updateSettings({ theme: nxt }); } catch {}
      Toast({ type: 'success', message: `已切换到${nxt === 'dark' ? '深色' : '浅色'}模式`, duration: 1200 });
    };
    // 退出登录
    document.getElementById('logout-btn').onclick = async () => {
      const yes = await Confirm({ title: '退出登录', message: '确认要退出吗？', danger: true });
      if (!yes) return;
      await Auth.logout();
      location.hash = '#/login';
      location.reload();
    };
  }

  /* ============================================================
   * 路由处理
   * ========================================================== */
  let currentModule = null;
  async function handleRoute() {
    const hash = location.hash || '#/dashboard';
    const route = ROUTE_MAP[hash] || ROUTE_MAP['#/dashboard'];
    if (!route) return;

    // 高亮
    document.querySelectorAll('[data-hash]').forEach((el) => {
      el.classList.toggle('active', el.getAttribute('data-hash') === hash);
    });

    // 标题
    document.getElementById('view-title').textContent = route.name;
    document.getElementById('view-subtitle').textContent = route.subtitle;

    // 上次访问视图（云端同步）
    storage.set('nexspace.lastView', hash);
    Api.updateSettings({ lastView: hash }).catch(() => {});

    // 渲染
    const container = document.getElementById('view-container');
    container.scrollTop = 0;
    container.classList.remove('fade-in'); void container.offsetWidth; container.classList.add('fade-in');

    // 离开上一个模块
    if (currentModule && EventBus._listeners['view:leave']) EventBus.emit('view:leave');

    const mod = Modules[route.module];
    if (mod) {
      try {
        await mod.render(container);
        currentModule = route.module;
      } catch (err) {
        console.error(err);
        container.innerHTML = emptyRoute(err.message);
      }
    }
  }

  function emptyRoute(msg) {
    return `
      <div class="glass-card text-center text-slate-400">
        <iconify-icon icon="mdi:alert-circle-outline" class="text-4xl"></iconify-icon>
        <p class="mt-3 text-sm">加载失败: ${escapeHtml(msg)}</p>
      </div>
    `;
  }

  /* ============================================================
   * 顶部全局 UI
   * ========================================================== */
  function bindGlobalUI() {
    // 移动端菜单
    document.getElementById('mobile-menu-btn').onclick = () => {
      document.getElementById('sidebar').classList.remove('-translate-x-full');
      document.getElementById('sidebar-mask').classList.remove('hidden');
    };
    document.getElementById('mobile-close-btn').onclick = () => {
      document.getElementById('sidebar').classList.add('-translate-x-full');
      document.getElementById('sidebar-mask').classList.add('hidden');
    };
    document.getElementById('sidebar-mask').onclick = () => {
      document.getElementById('sidebar').classList.add('-translate-x-full');
      document.getElementById('sidebar-mask').classList.add('hidden');
    };

    // 桌面端折叠
    document.getElementById('desktop-collapse-btn').onclick = collapseSidebar;
    document.getElementById('sidebar-expand-btn').onclick = expandSidebar;
    if (storage.get('nexspace.sidebarCollapsed', false)) collapseSidebar();

    // 移动端搜索
    document.getElementById('mobile-search-btn').onclick = () => {
      const input = document.getElementById('global-search');
      input && input.focus();
    };

    // 全局搜索（节流）
    const searchInput = document.getElementById('global-search');
    const searchDropdown = (() => {
      const div = document.createElement('div');
      div.className = 'absolute top-12 left-0 right-0 z-30 glass-card max-h-80 overflow-auto p-2';
      div.style.display = 'none';
      searchInput.parentElement.appendChild(div);
      return div;
    })();

    const runSearch = debounce(async (q) => {
      if (!q || q.length < 1) { searchDropdown.style.display = 'none'; return; }
      try {
        const r = await Api.search(q);
        const items = (r.data && r.data.items) || [];
        if (!items.length) {
          searchDropdown.innerHTML = '<p class="text-xs text-slate-400 p-4 text-center">没有匹配结果</p>';
        } else {
          searchDropdown.innerHTML = items.map((it) => `
            <div class="p-2 rounded-lg hover:bg-white/10 cursor-pointer flex items-center gap-2" data-type="${it.type}" data-id="${it.id}">
              <iconify-icon icon="${({task:'mdi:checkbox-marked-circle-outline',note:'mdi:notebook',bookmark:'mdi:bookmark',calendar:'mdi:calendar'}[it.type] || 'mdi:file')}" class="text-brand"></iconify-icon>
              <div class="flex-1 min-w-0">
                <div class="text-sm truncate">${escapeHtml(it.title)}</div>
                <div class="text-[11px] text-slate-400 truncate">${escapeHtml(it.excerpt || '')}</div>
              </div>
            </div>
          `).join('');
          searchDropdown.querySelectorAll('[data-type]').forEach((el) => {
            el.addEventListener('click', () => {
              const t = el.getAttribute('data-type');
              const map = { task: '#/tasks', note: '#/notes', bookmark: '#/bookmarks', calendar: '#/calendar' };
              location.hash = map[t] || '#/dashboard';
              searchDropdown.style.display = 'none';
              searchInput.value = '';
            });
          });
        }
        searchDropdown.style.display = '';
      } catch {
        searchDropdown.style.display = 'none';
      }
    }, 250);

    searchInput.addEventListener('input', (e) => runSearch(e.target.value));
    searchInput.addEventListener('blur', () => setTimeout(() => searchDropdown.style.display = 'none', 200));
    searchInput.addEventListener('focus', () => { if (searchInput.value) runSearch(searchInput.value); });

    // 全局快捷键: Ctrl+K 搜索
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
      }
      // Esc 关闭模态
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach((m) => m.remove());
      }
    });

    // 通知按钮
    document.getElementById('notifications-btn').onclick = () => {
      const dd = document.getElementById('notif-dropdown');
      dd.innerHTML = `
        <div class="p-4 border-b border-white/10">
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold">通知</span>
            <button id="mark-all" class="text-xs text-brand">全部已读</button>
          </div>
        </div>
        <div class="p-4 text-xs text-slate-400 text-center">暂无新通知</div>
      `;
      dd.classList.toggle('hidden');
    };
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#notif-dropdown') && !e.target.closest('#notifications-btn')) {
        document.getElementById('notif-dropdown').classList.add('hidden');
      }
    });
  }

  function collapseSidebar() {
    document.getElementById('sidebar').classList.add('hidden');
    document.getElementById('sidebar-mini').classList.remove('hidden');
    document.getElementById('sidebar-mini').classList.add('md:flex');
    storage.set('nexspace.sidebarCollapsed', true);
  }
  function expandSidebar() {
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('sidebar-mini').classList.add('hidden');
    storage.set('nexspace.sidebarCollapsed', false);
  }

  /* ============================================================
   * 暴露
   * ========================================================== */
  global.NS = global.NS || {};
  global.NS.App = { bootstrap, ROUTES };
})(window);

// 启动
window.addEventListener('DOMContentLoaded', () => window.NS.App.bootstrap());
