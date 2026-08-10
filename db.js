/**
 * NexSpace 数据库封装
 * ----------------------------------------------------------------
 * 轻量化 JSON 文件数据库
 * - 每个用户一个独立文件: data/users/<userId>.json
 * - 主索引文件:         data/index.json (用户列表、Token 黑名单)
 *
 * 说明:
 * 1. 写操作使用异步串行化队列，避免并发写入造成的文件冲突
 * 2. 读取采用缓存，首次加载后驻留内存，运行期修改立即同步写盘
 * 3. 适合单实例部署；如需多实例请切换 SQLite/MySQL
 */

const fs = require('fs');
const path = require('path');

// 数据根目录（绝对路径 = 项目根目录下 data/）
const DATA_ROOT = path.join(__dirname, 'data');
const USERS_DIR = path.join(DATA_ROOT, 'users');
const INDEX_FILE = path.join(DATA_ROOT, 'index.json');

// 确保数据目录存在
function ensureDataDirs() {
  if (!fs.existsSync(DATA_ROOT)) fs.mkdirSync(DATA_ROOT, { recursive: true });
  if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });
  if (!fs.existsSync(INDEX_FILE)) {
    fs.writeFileSync(
      INDEX_FILE,
      JSON.stringify({ users: [], tokenBlacklist: [] }, null, 2),
      'utf-8'
    );
  }
}

// 内存缓存：{ userId: dataObject }
const cache = new Map();

// 串行写入队列：避免多请求同时写文件造成内容丢失
const writeQueue = [];
let writing = false;
function enqueueWrite(filePath, content) {
  return new Promise((resolve, reject) => {
    writeQueue.push({ filePath, content, resolve, reject });
    flushQueue();
  });
}
function flushQueue() {
  if (writing) return;
  writing = true;
  (function next() {
    if (!writeQueue.length) {
      writing = false;
      return;
    }
    const { filePath, content, resolve, reject } = writeQueue.shift();
    fs.writeFile(filePath, content, 'utf-8', (err) => {
      if (err) reject(err);
      else resolve();
      next();
    });
  })();
}

/**
 * 用户数据文件操作
 */
function userFilePath(userId) {
  return path.join(USERS_DIR, `${userId}.json`);
}

/**
 * 加载某个用户完整数据；首次加载时使用默认骨架
 */
function loadUser(userId) {
  if (cache.has(userId)) return cache.get(userId);
  const fp = userFilePath(userId);
  let data;
  if (fs.existsSync(fp)) {
    try {
      data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    } catch (err) {
      console.error(`[db] 读取用户数据失败 ${userId}:`, err.message);
      data = defaultUserData(userId);
    }
  } else {
    data = defaultUserData(userId);
  }
  cache.set(userId, data);
  return data;
}

/**
 * 默认用户数据结构（注册时初始化）
 */
function defaultUserData(userId) {
  return {
    userId,
    profile: {
      username: '',
      nickname: '',
      avatar: '',
      createdAt: Date.now(),
      lastLoginAt: Date.now()
    },
    // 业务数据集合
    tasks: [],          // 待办
    notes: [],          // 笔记
    bookmarks: [],      // 书签
    pomodoro: [],       // 番茄钟历史
    calendar: [],       // 日程
    clipboard: [],      // 剪贴板备忘录
    widgets: {          // 桌面小组件
      clock: { enabled: true, format: '24h' },
      date: { enabled: true, showLunar: false },
      weather: { enabled: true, city: '北京' },
      quote: { enabled: true, category: 'all' }
    },
    stats: {            // 统计
      taskCompletions: 0,        // 任务完成累计
      focusMinutes: 0,           // 累计专注分钟
      dailyActivity: {}         // { 'YYYY-MM-DD': { tasks: n, focus: m, notes: k } }
    },
    tags: [],           // 自定义标签 { id, name, color }
    trash: [],          // 回收站
    settings: {         // 用户偏好
      theme: 'dark',                // dark / light
      layout: 'default',            // 模块顺序
      hiddenModules: [],            // 隐藏的模块
      sidebarCollapsed: false,
      background: '',               // 自定义背景图片
      uiOpacity: 0.95,              // 界面透明度
      lastView: 'dashboard',        // 上次访问视图
      notificationEnabled: true,
      reduceMotion: false
    },
    attachments: [],    // 文本/图片附件记录 { id, type, name, content, size, createdAt }
    tracks: [],         // 音乐曲目 { id, name, type, size, dataUrl, cover, duration, createdAt }
    videos: []          // 视频库 { id, name, type, size, dataUrl, poster, duration, views, createdAt }
  };
}

/**
 * 保存某个用户数据 (异步、串行)
 */
async function saveUser(userId, data) {
  cache.set(userId, data);
  return enqueueWrite(userFilePath(userId), JSON.stringify(data, null, 2));
}

/**
 * 索引文件操作
 */
function loadIndex() {
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
  } catch {
    return { users: [], tokenBlacklist: [] };
  }
}
async function saveIndex(idx) {
  return enqueueWrite(INDEX_FILE, JSON.stringify(idx, null, 2));
}

/**
 * 用户索引管理
 */
async function addUserIndex(userId, username) {
  const idx = loadIndex();
  if (!idx.users.find((u) => u.userId === userId)) {
    idx.users.push({ userId, username, createdAt: Date.now() });
    await saveIndex(idx);
  }
}
async function findUserByUsername(username) {
  const idx = loadIndex();
  return idx.users.find((u) => u.username === username);
}
async function userExists(username) {
  return !!(await findUserByUsername(username));
}

/**
 * Token 黑名单管理（退出登录 / Token 失效）
 */
async function blacklistToken(jti, exp) {
  const idx = loadIndex();
  idx.tokenBlacklist.push({ jti, exp });
  // 清理过期黑名单
  const now = Date.now();
  idx.tokenBlacklist = idx.tokenBlacklist.filter((t) => t.exp * 1000 > now);
  await saveIndex(idx);
}
function isTokenBlacklisted(jti) {
  const idx = loadIndex();
  return idx.tokenBlacklist.some((t) => t.jti === jti);
}

module.exports = {
  ensureDataDirs,
  loadUser,
  saveUser,
  defaultUserData,
  addUserIndex,
  findUserByUsername,
  userExists,
  blacklistToken,
  isTokenBlacklisted,
  DATA_ROOT
};
