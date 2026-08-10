/**
 * NexSpace 客户端鉴权
 * ----------------------------------------------------------------
 * - 启动时检查 token: 有效 → 进入主页; 无效 → 跳登录
 * - 登录 / 注册 / 退出 / 自动续期
 */
(function (global) {
  'use strict';
  const { Api, storage, EventBus } = global.NS;
  const USER_KEY = 'nexspace.user';

  let currentUser = storage.get(USER_KEY, null);

  const Auth = {
    /** 当前用户 */
    getUser() { return currentUser; },
    isLoggedIn() { return !!Api.getToken(); },

    async tryRestore() {
      const token = Api.getToken();
      if (!token) return null;
      try {
        const r = await Api.me();
        currentUser = r.data;
        storage.set(USER_KEY, currentUser);
        return currentUser;
      } catch (e) {
        Api.clearToken();
        storage.del(USER_KEY);
        return null;
      }
    },

    async login(username, password) {
      const r = await Api.login({ username, password });
      Api.setToken(r.data.token);
      currentUser = r.data.user;
      storage.set(USER_KEY, currentUser);
      return currentUser;
    },

    async register(username, password, nickname) {
      const r = await Api.register({ username, password, nickname });
      Api.setToken(r.data.token);
      currentUser = r.data.user;
      storage.set(USER_KEY, currentUser);
      return currentUser;
    },

    async logout() {
      try { await Api.logout(); } catch {}
      Api.clearToken();
      currentUser = null;
      storage.del(USER_KEY);
      EventBus.emit('auth:logout');
    },

    async updateProfile({ nickname, avatar, oldPassword, newPassword }) {
      const r = await Api.updateProfile({ nickname, avatar, oldPassword, newPassword });
      Object.assign(currentUser, r.data);
      storage.set(USER_KEY, currentUser);
      return currentUser;
    }
  };

  /* 自动监听 401 → 广播登录失效 */
  EventBus.on('auth:expired', () => {
    Api.clearToken();
    storage.del(USER_KEY);
    currentUser = null;
    if (!location.pathname.startsWith('/login')) {
      location.hash = '#/login';
    }
  });

  global.NS.Auth = Auth;
})(window);
