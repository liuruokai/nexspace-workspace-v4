/**
 * NexSpace 通用工具
 * ----------------------------------------------------------------
 * 防抖、节流、ID 生成、日期格式化、深拷贝、本地存储等
 */
(function (global) {
  'use strict';

  /** 防抖：连续触发只执行最后一次 */
  function debounce(fn, wait = 300) {
    let timer;
    function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    }
    debounced.cancel = () => clearTimeout(timer);
    return debounced;
  }

  /** 节流：固定间隔内最多执行一次 */
  function throttle(fn, wait = 300) {
    let last = 0;
    let timer = null;
    function throttled(...args) {
      const now = Date.now();
      const remain = wait - (now - last);
      if (remain <= 0) {
        last = now;
        fn.apply(this, args);
      } else if (!timer) {
        timer = setTimeout(() => {
          last = Date.now();
          timer = null;
          fn.apply(this, args);
        }, remain);
      }
    }
    throttled.cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    return throttled;
  }

  /** 简易 ID 生成 */
  const newId = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  /** 安全 localStorage 包装（隐私模式可能抛错） */
  const storage = {
    get(key, def = null) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? def : JSON.parse(v);
      } catch {
        return def;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {}
    },
    del(key) {
      try { localStorage.removeItem(key); } catch {}
    }
  };

  /** 日期格式化 */
  function formatDate(ts, fmt = 'YYYY-MM-DD HH:mm') {
    if (!ts) return '';
    const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return fmt
      .replace('YYYY', d.getFullYear())
      .replace('MM', pad(d.getMonth() + 1))
      .replace('DD', pad(d.getDate()))
      .replace('HH', pad(d.getHours()))
      .replace('mm', pad(d.getMinutes()))
      .replace('ss', pad(d.getSeconds()));
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function relTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - (typeof ts === 'number' ? ts : new Date(ts).getTime());
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)} 天前`;
    return formatDate(ts, 'YYYY-MM-DD');
  }

  /** 深拷贝（结构化克隆） */
  function clone(obj) {
    if (obj == null || typeof obj !== 'object') return obj;
    return JSON.parse(JSON.stringify(obj));
  }

  /** HTML 转义 */
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 随机励志语录 */
  const QUOTES = [
    '专注是最高形式的礼貌。',
    '慢慢来，比较快。',
    '今天比昨天更进一步，就是最好的状态。',
    '把每一件小事做得精彩，胜过把大事做得潦草。',
    '行动是治愈焦虑的良药。',
    '代码即文档，专注即效率。',
    'Stay hungry, stay foolish.',
    'Stay focused, stay humble.',
    'Do small things with great love.',
    'Where focus goes, energy flows.'
  ];
  function randomQuote() {
    return QUOTES[Math.floor(Math.random() * QUOTES.length)];
  }

  /** 简易事件总线 */
  const EventBus = {
    _listeners: {},
    on(event, fn) {
      (this._listeners[event] = this._listeners[event] || []).push(fn);
      return () => this.off(event, fn);
    },
    off(event, fn) {
      const list = this._listeners[event];
      if (!list) return;
      const idx = list.indexOf(fn);
      if (idx >= 0) list.splice(idx, 1);
    },
    emit(event, ...args) {
      (this._listeners[event] || []).forEach((fn) => {
        try { fn(...args); } catch (e) { console.error(e); }
      });
    }
  };

  /** 文件下载（用于导出 JSON） */
  function download(filename, content, mime = 'application/json') {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /** URL 校验 */
  function isValidUrl(s) {
    try { new URL(s); return true; } catch { return false; }
  }

  /** 简易 QueryString 解析（用于路由 hash） */
  function parseQS(qs = '') {
    const out = {};
    qs.replace(/^\?/, '').split('&').forEach((kv) => {
      if (!kv) return;
      const [k, v = ''] = kv.split('=');
      out[decodeURIComponent(k)] = decodeURIComponent(v);
    });
    return out;
  }

  /** 暴露 */
  global.NS = global.NS || {};
  Object.assign(global.NS, {
    debounce,
    throttle,
    newId,
    storage,
    formatDate,
    todayKey,
    relTime,
    clone,
    escapeHtml,
    randomQuote,
    download,
    isValidUrl,
    parseQS,
    EventBus
  });
})(window);
