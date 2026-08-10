/**
 * NexSpace 接口客户端
 * ----------------------------------------------------------------
 * - 自动附带 Authorization: Bearer <token>
 * - 网络异常/离线时自动写入"操作队列"，联网后由 sync.js 重放
 * - 401 自动触发统一"登录失效"事件
 */
(function (global) {
  'use strict';

  const TOKEN_KEY = 'nexspace.token';
  const QUEUE_KEY = 'nexspace.offlineQueue';
  const { EventBus, storage } = global.NS;

  let token = storage.get(TOKEN_KEY, null);
  function getToken() { return token; }
  function setToken(t) {
    token = t;
    storage.set(TOKEN_KEY, t);
  }
  function clearToken() {
    token = null;
    storage.del(TOKEN_KEY);
  }

  /**
   * 主动 GET/POST 请求
   * @param {string} path
   * @param {object} options
   * @param {boolean} options.body  - 请求体
   * @param {string} options.method
   * @param {boolean} options.queueOffline - 离线时入队，默认 true (只对 mutation)
   */
  /**
   * 上传文件（multipart/form-data）
   * 用于音乐/视频等大文件上传（V4 起音频与视频走本地磁盘存储，不走 base64）
   * @param {string} path
   * @param {File|Blob} file
   * @param {object|string} extraFields - 额外的 form 字段（若为对象，会按 key 写入）
   * @param {function(progress:number)} onProgress - 上传进度 0..1
   * @param {string} fileFieldName - 文件字段名（音乐=audioFile，视频=videoFile）
   */
  async function uploadFile(path, file, extraFields = {}, onProgress, fileFieldName = 'file') {
    const fd = new FormData();
    if (file) fd.append(fileFieldName, file, file.name || 'upload.bin');
    if (extraFields && typeof extraFields === 'object') {
      for (const k of Object.keys(extraFields)) {
        const v = extraFields[k];
        if (v !== undefined && v !== null) fd.append(k, String(v));
      }
    } else if (extraFields !== undefined && extraFields !== null) {
      fd.append('meta', String(extraFields));
    }
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    try {
      const xhr = new XMLHttpRequest();
      const p = new Promise((resolve, reject) => {
        xhr.open('POST', path, true);
        if (onProgress && xhr.upload) {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(e.loaded / e.total);
          };
        }
        xhr.onload = () => {
          let data = {};
          try { data = JSON.parse(xhr.responseText || '{}'); } catch {}
          if (xhr.status === 401) {
            clearToken();
            EventBus.emit('auth:expired');
            return reject(new ApiError(data.message || '登录已失效', 401, data));
          }
          if (xhr.status >= 200 && xhr.status < 300 && data && data.code === 0) {
            resolve(data);
          } else {
            reject(new ApiError((data && data.message) || ('HTTP ' + xhr.status), data && data.code || xhr.status, data));
          }
        };
        xhr.onerror = () => reject(new ApiError('网络错误', 0, null));
        xhr.onabort = () => reject(new ApiError('已取消', -1, null));
      });
      Object.keys(headers).forEach((k) => xhr.setRequestHeader(k, headers[k]));
      xhr.send(fd);
      return await p;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      EventBus.emit('net:error', err);
      throw err;
    }
  }

  /**
   * 带 Authorization 头的 GET 请求（用于把受保护的资源下载为 Blob）
   * @returns {Blob}
   */
  async function fetchAuthedBlob(path) {
    const url = path.startsWith('http') ? path : (path.startsWith('/') ? path : '/' + path);
    const resp = await fetch(url, {
      method: 'GET',
      headers: token ? { Authorization: 'Bearer ' + token } : {}
    });
    if (resp.status === 401) {
      clearToken();
      EventBus.emit('auth:expired');
      throw new ApiError('登录已失效', 401, null);
    }
    if (!resp.ok) {
      let msg = 'HTTP ' + resp.status;
      try { const d = await resp.json(); if (d && d.message) msg = d.message; } catch {}
      throw new ApiError(msg, resp.status, null);
    }
    return resp.blob();
  }

  async function request(path, options = {}) {
    const {
      method = 'GET',
      body = null,
      headers = {},
      skipAuth = false,
      queueOffline = false
    } = options;

    const url = path.startsWith('http') ? path : (path.startsWith('/') ? path : '/' + path);
    const finalHeaders = { 'Content-Type': 'application/json', ...headers };
    if (!skipAuth && token) finalHeaders['Authorization'] = 'Bearer ' + token;

    // 离线队列（仅对 mutation 且显式开启）
    const isMutation = method !== 'GET' && method !== 'HEAD';
    if (queueOffline && isMutation && !navigator.onLine) {
      enqueueRequest({ url, method, body, headers: finalHeaders });
      return { code: 0, message: '已加入离线队列，恢复网络后同步', data: null, queued: true };
    }

    try {
      const resp = await fetch(url, {
        method,
        headers: finalHeaders,
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await resp.json();

      if (resp.status === 401) {
        clearToken();
        EventBus.emit('auth:expired');
        throw new ApiError(data.message || '登录已失效', 401, data);
      }

      if (!resp.ok || (data && data.code !== 0)) {
        throw new ApiError(data && data.message || '请求失败', data && data.code || resp.status, data);
      }
      return data;
    } catch (err) {
      // 真正的网络错误
      if (err instanceof ApiError) throw err;
      if (queueOffline && isMutation) {
        enqueueRequest({ url, method, body, headers: finalHeaders });
        return { code: 0, message: '已加入离线队列', data: null, queued: true };
      }
      EventBus.emit('net:error', err);
      throw err;
    }
  }

  class ApiError extends Error {
    constructor(message, code, payload) {
      super(message);
      this.code = code;
      this.payload = payload;
    }
  }

  /** 离线请求队列 */
  function enqueueRequest(item) {
    const q = storage.get(QUEUE_KEY, []);
    q.push({ ...item, queuedAt: Date.now() });
    storage.set(QUEUE_KEY, q);
    EventBus.emit('offline:queue-changed', q.length);
  }

  /** 拉取离线队列（供 sync.js 调用） */
  function getOfflineQueue() {
    return storage.get(QUEUE_KEY, []);
  }
  function clearOfflineQueue() {
    storage.set(QUEUE_KEY, []);
    EventBus.emit('offline:queue-changed', 0);
  }

  /** 网络状态事件 */
  window.addEventListener('online', () => EventBus.emit('net:online'));
  window.addEventListener('offline', () => EventBus.emit('net:offline'));

  /* ==========================================================
   * 业务方法
   * ========================================================== */
  const Api = {
    getToken,
    setToken,
    clearToken,

    // 鉴权
    register: (payload) => request('/api/auth/register', { method: 'POST', body: payload }),
    login: (payload) => request('/api/auth/login', { method: 'POST', body: payload, skipAuth: true }),
    logout: () => request('/api/auth/logout', { method: 'POST', queueOffline: true }),
    me: () => request('/api/auth/me'),
    updateProfile: (payload) => request('/api/auth/profile', { method: 'PATCH', body: payload, queueOffline: true }),

    // 任务
    listTasks: (params = '') => request('/api/tasks' + (params ? '?' + params : '')),
    createTask: (payload) => request('/api/tasks', { method: 'POST', body: payload, queueOffline: true }),
    updateTask: (id, payload) => request(`/api/tasks/${id}`, { method: 'PATCH', body: payload, queueOffline: true }),
    deleteTask: (id) => request(`/api/tasks/${id}`, { method: 'DELETE', queueOffline: true }),

    // 笔记
    listNotes: (params = '') => request('/api/notes' + (params ? '?' + params : '')),
    getNote: (id) => request(`/api/notes/${id}/full`),
    createNote: (payload) => request('/api/notes', { method: 'POST', body: payload, queueOffline: true }),
    updateNote: (id, payload) => request(`/api/notes/${id}`, { method: 'PATCH', body: payload, queueOffline: true }),
    deleteNote: (id) => request(`/api/notes/${id}`, { method: 'DELETE', queueOffline: true }),

    // 书签
    listBookmarks: () => request('/api/bookmarks'),
    createBookmark: (payload) => request('/api/bookmarks', { method: 'POST', body: payload, queueOffline: true }),
    updateBookmark: (id, payload) => request(`/api/bookmarks/${id}`, { method: 'PATCH', body: payload, queueOffline: true }),
    deleteBookmark: (id) => request(`/api/bookmarks/${id}`, { method: 'DELETE', queueOffline: true }),

    // 番茄钟
    listPomodoro: () => request('/api/pomodoro'),
    createPomodoro: (payload) => request('/api/pomodoro', { method: 'POST', body: payload, queueOffline: true }),
    deletePomodoro: (id) => request(`/api/pomodoro/${id}`, { method: 'DELETE', queueOffline: true }),

    // 日程
    listCalendar: () => request('/api/calendar'),
    createCalendar: (payload) => request('/api/calendar', { method: 'POST', body: payload, queueOffline: true }),
    updateCalendar: (id, payload) => request(`/api/calendar/${id}`, { method: 'PATCH', body: payload, queueOffline: true }),
    deleteCalendar: (id) => request(`/api/calendar/${id}`, { method: 'DELETE', queueOffline: true }),

    // 剪贴板
    listClipboard: () => request('/api/clipboard'),
    createClipboard: (payload) => request('/api/clipboard', { method: 'POST', body: payload, queueOffline: true }),
    deleteClipboard: (id) => request(`/api/clipboard/${id}`, { method: 'DELETE', queueOffline: true }),

    // 小组件配置
    getWidgets: () => request('/api/widgets'),
    updateWidgets: (payload) => request('/api/widgets', { method: 'PATCH', body: payload, queueOffline: true }),

    // 标签
    listTags: () => request('/api/tags'),
    createTag: (payload) => request('/api/tags', { method: 'POST', body: payload, queueOffline: true }),
    updateTag: (id, payload) => request(`/api/tags/${id}`, { method: 'PATCH', body: payload, queueOffline: true }),
    deleteTag: (id) => request(`/api/tags/${id}`, { method: 'DELETE', queueOffline: true }),

    // 回收站
    listTrash: () => request('/api/trash'),
    restoreTrash: (id) => request(`/api/trash/${id}/restore`, { method: 'POST', queueOffline: true }),
    purgeTrash: (id) => request(`/api/trash/${id}`, { method: 'DELETE', queueOffline: true }),
    clearTrash: () => request('/api/trash/clear', { method: 'POST', queueOffline: true }),

    // 附件
    listAttachments: () => request('/api/attachments'),
    createAttachment: (payload) => request('/api/attachments', { method: 'POST', body: payload, queueOffline: true }),
    deleteAttachment: (id) => request(`/api/attachments/${id}`, { method: 'DELETE', queueOffline: true }),

    // 音乐
    listTracks: () => request('/api/tracks'),
    getTrack: (id) => request(`/api/tracks/${id}`),
    createTrack: (payload) => request('/api/tracks', { method: 'POST', body: payload, queueOffline: true }),
    /**
     * V4：上传音乐（multipart/form-data，本地磁盘存储）
     * 协议：字段名 audioFile，meta 作为 JSON 字符串放在另一个 form 字段
     */
    uploadTrackLocal: (file, meta = {}, onProgress) =>
      uploadFile('/api/tracks/upload-local', file, { meta: JSON.stringify(meta || {}) }, onProgress, 'audioFile'),
    renameTrack: (id, name) => request(`/api/tracks/${id}`, { method: 'PATCH', body: { name }, queueOffline: true }),
    deleteTrack: (id) => request(`/api/tracks/${id}`, { method: 'DELETE', queueOffline: true }),
    /** V4：可流式访问的 URL（需带 Authorization 头） */
    streamTrackUrl: (id) => `/api/tracks/${id}/download`,
    downloadTrackUrl: (id) => `/api/tracks/${id}/download`,
    /** V4：把流式资源转为带 token 的 Blob URL（用于 <audio src=...>） */
    fetchTrackBlob: () => fetchAuthedBlob, // 工具

    // 视频
    listVideos: () => request('/api/videos'),
    getVideo: (id) => request(`/api/videos/${id}`),
    createVideo: (payload) => request('/api/videos', { method: 'POST', body: payload, queueOffline: true }),
    /**
     * V4：上传视频（multipart/form-data，本地磁盘存储）
     * 协议：字段名 videoFile，meta 作为 JSON 字符串放在另一个 form 字段
     */
    uploadVideoLocal: (file, meta = {}, onProgress) =>
      uploadFile('/api/videos/upload-local', file, { meta: JSON.stringify(meta || {}) }, onProgress, 'videoFile'),
    renameVideo: (id, name) => request(`/api/videos/${id}`, { method: 'PATCH', body: { name }, queueOffline: true }),
    deleteVideo: (id) => request(`/api/videos/${id}`, { method: 'DELETE', queueOffline: true }),
    /** V4：可流式访问的 URL（需带 Authorization 头） */
    streamVideoUrl: (id) => `/api/videos/${id}/download`,
    downloadVideoUrl: (id) => `/api/videos/${id}/download`,

    // 统计
    getStats: () => request('/api/stats'),

    // 设置 / 同步
    getSettings: () => request('/api/settings'),
    updateSettings: (payload) => request('/api/settings', { method: 'PATCH', body: payload, queueOffline: true }),
    syncPull: () => request('/api/sync/pull'),
    syncPush: (payload) => request('/api/sync/push', { method: 'POST', body: payload, queueOffline: true }),

    // 备份
    exportBackup: async () => {
      const url = '/api/backup/export';
      const r = await fetch(url, {
        headers: token ? { Authorization: 'Bearer ' + token } : {}
      });
      const data = await r.json();
      if (data.code !== 0) throw new Error(data.message);
      global.NS.download(
        `nexspace-backup-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(data.data, null, 2)
      );
      return data.data;
    },
    importBackup: (payload) => request('/api/backup/import', { method: 'POST', body: payload, queueOffline: true }),

    // 全局搜索
    search: (q) => request('/api/search?q=' + encodeURIComponent(q)),

    // 离线队列管理
    getOfflineQueue,
    clearOfflineQueue
  };

  global.NS = global.NS || {};
  global.NS.Api = Api;
  global.NS.apiRequest = request;
  global.NS.ApiError = ApiError;
  global.NS.fetchAuthedBlob = fetchAuthedBlob;
  global.NS.uploadFile = uploadFile;
})(window);
