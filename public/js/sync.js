/**
 * NexSpace 多端同步引擎
 * ----------------------------------------------------------------
 * 核心职责：
 *  1. 网络恢复时重放离线队列
 *  2. 周期性 pull 同步最新版本（防跨设备冲突）
 *  3. 监听 settings.lastView 等做界面状态同步
 */
(function (global) {
  'use strict';
  const { Api, EventBus, storage, debounce } = global.NS;

  let syncing = false;
  let syncTimer = null;

  /** 重放离线队列 */
  async function flushQueue() {
    const queue = Api.getOfflineQueue();
    if (!queue.length || !navigator.onLine) return;
    Api.clearOfflineQueue(); // 先清，避免重试堆积
    global.NS.toast({ type: 'info', message: `正在同步 ${queue.length} 条离线操作...` });

    for (const item of queue) {
      try {
        await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body ? item.body : undefined
        });
      } catch (err) {
        console.warn('[sync] 离线队列重放失败:', err);
        // 失败重新入队
        const q = Api.getOfflineQueue();
        q.push(item);
        // 重新持久化
        try {
          localStorage.setItem('nexspace.offlineQueue', JSON.stringify(q));
        } catch {}
      }
    }
    global.NS.toast({ type: 'success', message: '数据同步完成' });
    EventBus.emit('sync:complete');
  }

  /** 主动拉取远端 */
  async function pullAll() {
    if (syncing) return;
    syncing = true;
    try {
      const r = await Api.syncPull();
      if (r && r.data) {
        EventBus.emit('sync:pulled', r.data);
      }
    } catch (e) {
      console.warn('[sync] pull failed', e);
    } finally {
      syncing = false;
    }
  }

  // 防抖拉取
  const debouncedPull = debounce(pullAll, 1500);

  /** 全自动同步管理 */
  function startAutoSync(intervalMs = 30000) {
    stopAutoSync();
    // 网络恢复时拉一次
    EventBus.on('net:online', flushQueue);
    EventBus.on('auth:login', pullAll);
    // 周期性拉取（防多端冲突）
    syncTimer = setInterval(pullAll, intervalMs);
    // 窗口聚焦时拉一次
    window.addEventListener('focus', debouncedPull);
    // 初次启动也拉一次
    if (navigator.onLine) {
      setTimeout(pullAll, 2000);
    }
  }
  function stopAutoSync() {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = null;
  }

  global.NS = global.NS || {};
  Object.assign(global.NS, {
    Sync: { start: startAutoSync, stop: stopAutoSync, pull: pullAll, flush: flushQueue }
  });
})(window);
