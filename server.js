/**
 * NexSpace 邻境工作台 - 主服务  [V4]
 * ----------------------------------------------------------------
 * 启动方式: npm start / node server.js
 * 监听端口: process.env.PORT || 4878,  监听地址: 0.0.0.0 (局域网可访问)
 *
 * 目录结构:
 *   /server.js    - 主入口（本文件）
 *   /db.js        - JSON 文件数据库
 *   /auth.js      - JWT 鉴权
 *   /data/        - 运行时数据
 *   /public/      - 前端静态资源（托管）
 *   /public/audio/   ★ V4 新增：本地音频文件存储
 *   /public/videos/  ★ V4 新增：本地视频文件存储
 *
 * V4 关键变更:
 *   1. 音乐 + 视频由 base64 改为 multer 本地文件存储（解决大文件卡顿 / 手机无法播放）
 *   2. 新增 multipart 上传端点，写在 express.json/urlencoded 之前（避免被 JSON 解析拦截）
 *   3. 启动时自动建 public/audio、public/videos 并 chmod 777
 *   4. 下载端点智能兼容：本地文件流式 / 老 base64 数据兼容
 *   5. 删除记录时同步清理磁盘文件
 *   6. 静态目录托管 public/audio, public/videos 在所有业务路由之前（保证手机 / 跨设备访问）
 *
 * 接口规范:
 *   所有响应: { code: 0, message: 'ok', data: any }
 *   失败响应: { code: 非0, message, data: null }
 */

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');                       // ★ V4: 用于目录创建 / chmod / 文件流
const crypto = require('crypto');
const multer = require('multer');              // ★ V4: 新增 - 本地文件上传

const db = require('./db');
const {
  hashPassword,
  comparePassword,
  signToken,
  requireAuth
} = require('./auth');

// ============================================================
// ★ V4: 启动时自动创建音视频目录 + 授权 777（解决 Mac 权限不足 / 目录缺失导致上传失败）
// ============================================================
const PUBLIC_DIR = path.join(__dirname, 'public');
const AUDIO_DIR  = path.join(PUBLIC_DIR, 'audio');
const VIDEO_DIR  = path.join(PUBLIC_DIR, 'videos');

function ensureMediaDir(dir, label) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`  [V4] 已自动创建 ${label} 目录: ${dir}`);
    }
    try { fs.chmodSync(dir, 0o777); } catch (_) { /* 权限设置失败不影响主流程 */ }
  } catch (err) {
    console.error(`  [V4] 创建 ${label} 目录失败:`, err.message);
  }
}
ensureMediaDir(AUDIO_DIR, 'audio');
ensureMediaDir(VIDEO_DIR, 'videos');

// 启动时确保数据目录就绪
db.ensureDataDirs();

const app = express();
const PORT = parseInt(process.env.PORT || '4878', 10);
const HOST = process.env.HOST || '0.0.0.0';

// ============================================================
// ★ V4: Multer 配置 - 音频本地文件上传
// ============================================================
const TRACK_MIME = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg',
                    'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/flac'];
const TRACK_MAX_SIZE = 25 * 1024 * 1024;       // 25MB

const trackStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AUDIO_DIR),
  filename: (req, file, cb) => {
    // 时间戳 + 随机串 + 原后缀，避免同名覆盖
    const ext = path.extname(file.originalname || '.mp3').toLowerCase();
    const safeExt = /^\.(mp3|wav|m4a|flac|aac|ogg)$/i.test(ext) ? ext : '.mp3';
    const rand = crypto.randomBytes(6).toString('hex');
    cb(null, `${Date.now()}_${rand}${safeExt}`);
  }
});

const trackUpload = multer({
  storage: trackStorage,
  limits: { fileSize: TRACK_MAX_SIZE, files: 20 },
  fileFilter: (req, file, cb) => {
    // 双重过滤：mime + 后缀，避免浏览器发送的 mime 不准
    const ext = path.extname(file.originalname || '').toLowerCase().replace('.', '');
    const okExt = ['mp3','wav','m4a','flac','aac','ogg'].includes(ext);
    const okMime = TRACK_MIME.includes(file.mimetype) || file.mimetype.startsWith('audio/');
    if (!okExt && !okMime) {
      const err = new Error('仅支持 mp3 / wav / m4a / flac / aac / ogg 格式');
      err.code = 'UNSUPPORTED_AUDIO_FORMAT';
      return cb(err);
    }
    cb(null, true);
  }
});

// ============================================================
// ★ V4: Multer 配置 - 视频本地文件上传
// ============================================================
const VIDEO_MIME = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
                    'video/x-matroska', 'video/x-msvideo'];
const VIDEO_MAX_SIZE = 80 * 1024 * 1024;       // 80MB

const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, VIDEO_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '.mp4').toLowerCase();
    const safeExt = /^\.(mp4|webm|ogv|mov|mkv|avi)$/i.test(ext) ? ext : '.mp4';
    const rand = crypto.randomBytes(6).toString('hex');
    cb(null, `${Date.now()}_${rand}${safeExt}`);
  }
});

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: VIDEO_MAX_SIZE, files: 10 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().replace('.', '');
    const okExt = ['mp4','webm','ogv','mov','mkv','avi'].includes(ext);
    const okMime = VIDEO_MIME.includes(file.mimetype) || file.mimetype.startsWith('video/');
    if (!okExt && !okMime) {
      const err = new Error('仅支持 mp4 / webm / ogv / mov / mkv / avi 格式');
      err.code = 'UNSUPPORTED_VIDEO_FORMAT';
      return cb(err);
    }
    cb(null, true);
  }
});

// ============================================================
// 中间件装载顺序（V4 关键）
//   1) compression  2) cors  3) morgan
//   4) 静态资源  ★ 必须先于业务路由，保证 /audio/* 直接由 express.static 返回
//   5) multipart 上传路由 ★ 必须先于 json 解析（否则会被当成普通表单拦截）
//   6) express.json / urlencoded（对其他业务路由使用）
// ============================================================
app.use(compression());
app.use(cors());
app.use(morgan('dev'));

// ★ V4: 静态资源优先，保证手机 / 跨设备访问时 /audio/xxx.mp3 能直接加载
app.use(express.static(PUBLIC_DIR));

// ★ V4: multipart 上传路由必须在 json/urlencoded 之前（解决上传失败头号 bug）
// POST /api/tracks/upload-local - 本地音频文件上传 (multipart/form-data, field=audioFile)
app.post('/api/tracks/upload-local', requireAuth, (req, res) => {
  trackUpload.single('audioFile')(req, res, (err) => {
    if (err) return handleMulterError(err, res, '音频');
    try {
      if (!req.file) return fail(res, 4001, '请选择音频文件');
      const metaRaw = req.body && req.body.meta ? req.body.meta : '{}';
      let meta = {};
      try { meta = JSON.parse(metaRaw); } catch (_) { meta = {}; }
      const item = {
        id: newId(),
        name: String(meta.name || req.file.originalname).slice(0, 200),
        type: req.file.mimetype || 'audio/mpeg',
        size: req.file.size,
        // ★ V4 新增字段：以 /audio/ 开头的本地路径，便于下载/播放
        dataUrl: '/audio/' + req.file.filename,
        cover: meta.cover || '',
        duration: Math.max(0, Math.min(3600 * 6, Number(meta.duration) || 0)),
        artist: String(meta.artist || '').slice(0, 100),
        title: String(meta.title || (meta.name || req.file.originalname)).slice(0, 200),
        // 标记存储类型，便于下载逻辑判断
        storage: 'local',
        filename: req.file.filename,
        createdAt: Date.now()
      };
      const list = req.userData.tracks = req.userData.tracks || [];
      if (list.length >= 200) {
        // 删除刚刚写入的文件（防超限）
        try { fs.unlinkSync(path.join(AUDIO_DIR, req.file.filename)); } catch (_) {}
        return fail(res, 4004, '最多存储 200 首曲目');
      }
      list.unshift(item);
      db.saveUser(req.user.id, req.userData).catch((e) => console.error('[tracks.save]', e));
      return ok(res, sanitizeTrack(item));
    } catch (e) {
      console.error('[tracks.upload-local]', e);
      // 出错时清理文件
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
      return fail(res, 500, '上传失败');
    }
  });
});

// ★ V4: multipart 视频上传 (field=videoFile)
app.post('/api/videos/upload-local', requireAuth, (req, res) => {
  videoUpload.single('videoFile')(req, res, (err) => {
    if (err) return handleMulterError(err, res, '视频');
    try {
      if (!req.file) return fail(res, 4001, '请选择视频文件');
      const metaRaw = req.body && req.body.meta ? req.body.meta : '{}';
      let meta = {};
      try { meta = JSON.parse(metaRaw); } catch (_) { meta = {}; }
      const item = {
        id: newId(),
        name: String(meta.name || req.file.originalname).slice(0, 200),
        type: req.file.mimetype || 'video/mp4',
        size: req.file.size,
        dataUrl: '/videos/' + req.file.filename,
        poster: meta.poster || '',
        duration: Math.max(0, Math.min(3600 * 8, Number(meta.duration) || 0)),
        width: Number(meta.width) || 0,
        height: Number(meta.height) || 0,
        views: 0,
        storage: 'local',
        filename: req.file.filename,
        createdAt: Date.now()
      };
      const list = req.userData.videos = req.userData.videos || [];
      if (list.length >= 60) {
        try { fs.unlinkSync(path.join(VIDEO_DIR, req.file.filename)); } catch (_) {}
        return fail(res, 4004, '最多存储 60 个视频');
      }
      list.unshift(item);
      db.saveUser(req.user.id, req.userData).catch((e) => console.error('[videos.save]', e));
      return ok(res, sanitizeVideo(item));
    } catch (e) {
      console.error('[videos.upload-local]', e);
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
      return fail(res, 500, '上传失败');
    }
  });
});

// 业务中间件（json/urlencoded）放在 multipart 之后
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 统一响应包装
function ok(res, data = null) {
  return res.json({ code: 0, message: 'ok', data });
}
function fail(res, code, message, status = 200) {
  return res.status(status).json({ code, message, data: null });
}

// ID 生成
const newId = () =>
  Date.now().toString(36) + crypto.randomBytes(4).toString('hex');

// ★ V4: Multer 错误统一处理（文件过大 / 不支持格式 / 无文件）
function handleMulterError(err, res, label) {
  console.error(`[${label} upload error]`, err.code || err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return fail(res, 4003, `${label}文件超过大小上限（音频 25MB / 视频 80MB）`);
  }
  if (err.code === 'UNSUPPORTED_AUDIO_FORMAT' || err.code === 'UNSUPPORTED_VIDEO_FORMAT') {
    return fail(res, 4002, err.message);
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return fail(res, 4001, `上传字段名错误，请使用 audioFile / videoFile`);
  }
  return fail(res, 500, err.message || `${label}上传失败`);
}

// ============================================================
// 1) 用户与认证
// ============================================================

/** POST /api/auth/register - 注册 */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, nickname } = req.body || {};
    if (!username || !password)
      return fail(res, 1001, '账号和密码不能为空');

    if (!/^[a-zA-Z0-9_\-]{3,20}$/.test(username))
      return fail(res, 1002, '账号须为 3-20 位字母/数字/下划线/短横线');

    if (String(password).length < 6)
      return fail(res, 1003, '密码至少 6 位');

    if (await db.userExists(username))
      return fail(res, 1004, '该账号已被注册');

    const userId = newId();
    const userData = db.defaultUserData(userId);
    userData.profile.username = username;
    userData.profile.nickname = nickname || username;
    userData.profile.passwordHash = hashPassword(password);

    await db.saveUser(userId, userData);
    await db.addUserIndex(userId, username);

    const tok = signToken(userId, username);
    return ok(res, {
      token: tok.token,
      expiresIn: tok.expiresIn,
      user: { id: userId, username, nickname: userData.profile.nickname }
    });
  } catch (err) {
    console.error('[register]', err);
    return fail(res, 500, '服务器错误');
  }
});

/** POST /api/auth/login - 登录 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return fail(res, 1001, '请输入账号和密码');

    const userIdx = await db.findUserByUsername(username);
    if (!userIdx) return fail(res, 2001, '账号或密码错误');

    const userData = db.loadUser(userIdx.userId);
    if (!userData || !comparePassword(password, userData.profile.passwordHash || '')) {
      return fail(res, 2001, '账号或密码错误');
    }

    userData.profile.lastLoginAt = Date.now();
    await db.saveUser(userIdx.userId, userData);

    const tok = signToken(userIdx.userId, username);
    return ok(res, {
      token: tok.token,
      expiresIn: tok.expiresIn,
      user: {
        id: userIdx.userId,
        username,
        nickname: userData.profile.nickname
      }
    });
  } catch (err) {
    console.error('[login]', err);
    return fail(res, 500, '服务器错误');
  }
});

/** POST /api/auth/logout - 退出登录（拉黑 Token） */
app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const payload = require('./auth').verifyToken(token);
    if (payload) await db.blacklistToken(payload.jti, payload.exp);
    return ok(res, { message: '已退出登录' });
  } catch (err) {
    return fail(res, 500, '退出失败');
  }
});

/** GET /api/auth/me - 当前用户信息 */
app.get('/api/auth/me', requireAuth, (req, res) => {
  const u = req.userData;
  return ok(res, {
    id: req.user.id,
    username: u.profile.username,
    nickname: u.profile.nickname,
    avatar: u.profile.avatar,
    createdAt: u.profile.createdAt,
    lastLoginAt: u.profile.lastLoginAt
  });
});

/** PATCH /api/auth/profile - 修改资料 */
app.patch('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const { nickname, avatar, oldPassword, newPassword } = req.body || {};
    const u = req.userData;
    if (newPassword) {
      if (!oldPassword || !comparePassword(oldPassword, u.profile.passwordHash || ''))
        return fail(res, 3001, '原密码错误');
      if (String(newPassword).length < 6)
        return fail(res, 3002, '新密码至少 6 位');
      u.profile.passwordHash = hashPassword(newPassword);
    }
    if (nickname) u.profile.nickname = String(nickname).slice(0, 20);
    if (avatar !== undefined) u.profile.avatar = String(avatar).slice(0, 500);
    await db.saveUser(req.user.id, u);
    return ok(res, {
      nickname: u.profile.nickname,
      avatar: u.profile.avatar
    });
  } catch (err) {
    return fail(res, 500, '修改失败');
  }
});

// ============================================================
// 2) 待办任务
// ============================================================

function getOrInit(arr, id) {
  return arr.find((x) => x.id === id);
}

/** GET /api/tasks - 列表（支持筛选 ?archive=true&priority=high） */
app.get('/api/tasks', requireAuth, (req, res) => {
  const { archive, priority, status } = req.query;
  let list = req.userData.tasks;
  if (archive === 'true') list = list.filter((t) => t.archived);
  else list = list.filter((t) => !t.archived);
  if (priority) list = list.filter((t) => t.priority === priority);
  if (status) list = list.filter((t) => t.status === status);
  return ok(res, { items: list, total: list.length });
});

/** POST /api/tasks - 新建 */
app.post('/api/tasks', requireAuth, async (req, res) => {
  try {
    const {
      title,
      priority = 'medium',
      dueDate = null,
      category = 'default',
      tags = [],
      repeat = null,
      notes = ''
    } = req.body || {};
    if (!title) return fail(res, 4001, '请输入任务标题');
    const task = {
      id: newId(),
      title: String(title).slice(0, 200),
      priority,
      dueDate,
      category,
      tags,
      repeat, // 'daily' / 'weekly' / null
      notes,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      archived: false
    };
    req.userData.tasks.unshift(task);
    await db.saveUser(req.user.id, req.userData);
    return ok(res, task);
  } catch (err) {
    return fail(res, 500, '创建失败');
  }
});

/** PATCH /api/tasks/:id - 更新 */
app.patch('/api/tasks/:id', requireAuth, async (req, res) => {
  try {
    const t = getOrInit(req.userData.tasks, req.params.id);
    if (!t) return fail(res, 4040, '任务不存在');
    const allowed = ['title', 'priority', 'dueDate', 'category', 'tags', 'repeat', 'notes', 'status', 'archived'];
    for (const k of allowed) {
      if (k in req.body) t[k] = req.body[k];
    }
    t.updatedAt = Date.now();
    if (req.body.status === 'done' && !t.completedAt) {
      t.completedAt = Date.now();
      // 记录每日活跃
      const today = new Date().toISOString().slice(0, 10);
      req.userData.stats.taskCompletions += 1;
      req.userData.stats.dailyActivity[today] = req.userData.stats.dailyActivity[today] || { tasks: 0, focus: 0, notes: 0 };
      req.userData.stats.dailyActivity[today].tasks += 1;
      // 重复任务自动生成下一周期
      if (t.repeat === 'daily') {
        const next = { ...t, id: newId(), status: 'pending', createdAt: Date.now(), updatedAt: Date.now(), completedAt: null };
        next.dueDate = t.dueDate ? new Date(new Date(t.dueDate).getTime() + 86400000).toISOString() : null;
        req.userData.tasks.unshift(next);
      } else if (t.repeat === 'weekly' && t.dueDate) {
        const next = { ...t, id: newId(), status: 'pending', createdAt: Date.now(), updatedAt: Date.now(), completedAt: null };
        next.dueDate = new Date(new Date(t.dueDate).getTime() + 7 * 86400000).toISOString();
        req.userData.tasks.unshift(next);
      }
    }
    await db.saveUser(req.user.id, req.userData);
    return ok(res, t);
  } catch (err) {
    return fail(res, 500, '更新失败');
  }
});

/** DELETE /api/tasks/:id - 删除（进回收站） */
app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  try {
    const list = req.userData.tasks;
    const idx = list.findIndex((t) => t.id === req.params.id);
    if (idx < 0) return fail(res, 4040, '任务不存在');
    const [removed] = list.splice(idx, 1);
    req.userData.trash.unshift({ type: 'task', item: removed, deletedAt: Date.now() });
    await db.saveUser(req.user.id, req.userData);
    return ok(res, { id: removed.id, recycled: true });
  } catch (err) {
    return fail(res, 500, '删除失败');
  }
});

// ============================================================
// 3) 富文本笔记
// ============================================================

app.get('/api/notes', requireAuth, (req, res) => {
  const { folder, tag } = req.query;
  let list = req.userData.notes;
  if (folder) list = list.filter((n) => n.folder === folder);
  if (tag) list = list.filter((n) => (n.tags || []).includes(tag));
  return ok(res, { items: list.map(stripNoteContentHeavy), total: list.length });
});

app.post('/api/notes', requireAuth, async (req, res) => {
  try {
    const { title = '未命名笔记', content = '', folder = '默认', tags = [] } = req.body || {};
    const note = {
      id: newId(),
      title: String(title).slice(0, 200),
      content: String(content),
      folder,
      tags,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      attachments: []
    };
    req.userData.notes.unshift(note);
    const today = new Date().toISOString().slice(0, 10);
    req.userData.stats.dailyActivity[today] = req.userData.stats.dailyActivity[today] || { tasks: 0, focus: 0, notes: 0 };
    req.userData.stats.dailyActivity[today].notes += 1;
    await db.saveUser(req.user.id, req.userData);
    return ok(res, note);
  } catch (err) {
    return fail(res, 500, '创建失败');
  }
});

app.patch('/api/notes/:id', requireAuth, async (req, res) => {
  try {
    const n = getOrInit(req.userData.notes, req.params.id);
    if (!n) return fail(res, 4040, '笔记不存在');
    const allowed = ['title', 'content', 'folder', 'tags'];
    for (const k of allowed) if (k in req.body) n[k] = req.body[k];
    n.updatedAt = Date.now();
    await db.saveUser(req.user.id, req.userData);
    return ok(res, n);
  } catch (err) {
    return fail(res, 500, '更新失败');
  }
});

app.delete('/api/notes/:id', requireAuth, async (req, res) => {
  try {
    const list = req.userData.notes;
    const idx = list.findIndex((n) => n.id === req.params.id);
    if (idx < 0) return fail(res, 4040, '笔记不存在');
    const [removed] = list.splice(idx, 1);
    req.userData.trash.unshift({ type: 'note', item: removed, deletedAt: Date.now() });
    await db.saveUser(req.user.id, req.userData);
    return ok(res, { id: removed.id, recycled: true });
  } catch (err) {
    return fail(res, 500, '删除失败');
  }
});

/** GET /api/notes/:id/full - 拉取完整笔记（编辑时） */
app.get('/api/notes/:id/full', requireAuth, (req, res) => {
  const n = getOrInit(req.userData.notes, req.params.id);
  if (!n) return fail(res, 4040, '笔记不存在');
  return ok(res, n);
});

// 大字段裁剪（用于列表）
function stripNoteContentHeavy(n) {
  return {
    id: n.id,
    title: n.title,
    folder: n.folder,
    tags: n.tags,
    excerpt: String(n.content || '').replace(/<[^>]+>/g, '').slice(0, 120),
    createdAt: n.createdAt,
    updatedAt: n.updatedAt
  };
}

// ============================================================
// 4) 书签
// ============================================================

app.get('/api/bookmarks', requireAuth, (req, res) => {
  return ok(res, { items: req.userData.bookmarks });
});
app.post('/api/bookmarks', requireAuth, async (req, res) => {
  try {
    const { title, url, description = '', folder = '默认', tags = [] } = req.body || {};
    if (!url) return fail(res, 4001, '请输入网址');
    const bm = {
      id: newId(),
      title: (title || url).slice(0, 200),
      url,
      description,
      folder,
      tags,
      createdAt: Date.now()
    };
    req.userData.bookmarks.unshift(bm);
    await db.saveUser(req.user.id, req.userData);
    return ok(res, bm);
  } catch (err) {
    return fail(res, 500, '创建失败');
  }
});
app.patch('/api/bookmarks/:id', requireAuth, async (req, res) => {
  const bm = getOrInit(req.userData.bookmarks, req.params.id);
  if (!bm) return fail(res, 4040, '书签不存在');
  ['title', 'url', 'description', 'folder', 'tags'].forEach((k) => {
    if (k in req.body) bm[k] = req.body[k];
  });
  await db.saveUser(req.user.id, req.userData);
  return ok(res, bm);
});
app.delete('/api/bookmarks/:id', requireAuth, async (req, res) => {
  const list = req.userData.bookmarks;
  const idx = list.findIndex((b) => b.id === req.params.id);
  if (idx < 0) return fail(res, 4040, '书签不存在');
  const [removed] = list.splice(idx, 1);
  req.userData.trash.unshift({ type: 'bookmark', item: removed, deletedAt: Date.now() });
  await db.saveUser(req.user.id, req.userData);
  return ok(res, { id: removed.id, recycled: true });
});

// ============================================================
// 5) 番茄钟
// ============================================================

app.get('/api/pomodoro', requireAuth, (req, res) => {
  return ok(res, { items: req.userData.pomodoro });
});
app.post('/api/pomodoro', requireAuth, async (req, res) => {
  try {
    const { duration = 25, label = '专注', startAt = Date.now(), endAt = null } = req.body || {};
    const rec = {
      id: newId(),
      duration: Number(duration),
      label,
      startAt,
      endAt: endAt || Date.now() + duration * 60 * 1000
    };
    req.userData.pomodoro.unshift(rec);
    // 累计专注
    const today = new Date().toISOString().slice(0, 10);
    req.userData.stats.dailyActivity[today] = req.userData.stats.dailyActivity[today] || { tasks: 0, focus: 0, notes: 0 };
    req.userData.stats.dailyActivity[today].focus += Number(duration);
    req.userData.stats.focusMinutes += Number(duration);
    await db.saveUser(req.user.id, req.userData);
    return ok(res, rec);
  } catch (err) {
    return fail(res, 500, '保存失败');
  }
});
app.delete('/api/pomodoro/:id', requireAuth, async (req, res) => {
  const list = req.userData.pomodoro;
  const idx = list.findIndex((p) => p.id === req.params.id);
  if (idx < 0) return fail(res, 4040, '记录不存在');
  list.splice(idx, 1);
  await db.saveUser(req.user.id, req.userData);
  return ok(res, { id: req.params.id });
});

// ============================================================
// 6) 日程日历
// ============================================================

app.get('/api/calendar', requireAuth, (req, res) => {
  return ok(res, { items: req.userData.calendar });
});
app.post('/api/calendar', requireAuth, async (req, res) => {
  try {
    const { title, date, time = null, color = '#4878E8', notes = '', allDay = false } = req.body || {};
    if (!title || !date) return fail(res, 4001, '请填写标题和日期');
    const ev = {
      id: newId(),
      title,
      date,
      time,
      color,
      notes,
      allDay,
      createdAt: Date.now()
    };
    req.userData.calendar.unshift(ev);
    await db.saveUser(req.user.id, req.userData);
    return ok(res, ev);
  } catch (err) {
    return fail(res, 500, '创建失败');
  }
});
app.patch('/api/calendar/:id', requireAuth, async (req, res) => {
  const e = getOrInit(req.userData.calendar, req.params.id);
  if (!e) return fail(res, 4040, '日程不存在');
  ['title', 'date', 'time', 'color', 'notes', 'allDay'].forEach((k) => {
    if (k in req.body) e[k] = req.body[k];
  });
  await db.saveUser(req.user.id, req.userData);
  return ok(res, e);
});
app.delete('/api/calendar/:id', requireAuth, async (req, res) => {
  const list = req.userData.calendar;
  const idx = list.findIndex((x) => x.id === req.params.id);
  if (idx < 0) return fail(res, 4040, '日程不存在');
  const [removed] = list.splice(idx, 1);
  req.userData.trash.unshift({ type: 'calendar', item: removed, deletedAt: Date.now() });
  await db.saveUser(req.user.id, req.userData);
  return ok(res, { id: removed.id });
});

// ============================================================
// 7) 临时剪贴备忘录
// ============================================================

app.get('/api/clipboard', requireAuth, (req, res) => ok(res, { items: req.userData.clipboard }));
app.post('/api/clipboard', requireAuth, async (req, res) => {
  try {
    const { text, pin = false } = req.body || {};
    if (!text) return fail(res, 4001, '请输入文本');
    const item = { id: newId(), text: String(text).slice(0, 5000), pin: !!pin, createdAt: Date.now() };
    req.userData.clipboard.unshift(item);
    // 只保留最多 100 条（防膨胀）
    if (req.userData.clipboard.length > 100) req.userData.clipboard = req.userData.clipboard.slice(0, 100);
    await db.saveUser(req.user.id, req.userData);
    return ok(res, item);
  } catch (err) {
    return fail(res, 500, '保存失败');
  }
});
app.delete('/api/clipboard/:id', requireAuth, async (req, res) => {
  const list = req.userData.clipboard;
  const idx = list.findIndex((c) => c.id === req.params.id);
  if (idx < 0) return fail(res, 4040, '记录不存在');
  list.splice(idx, 1);
  await db.saveUser(req.user.id, req.userData);
  return ok(res, { id: req.params.id });
});

// ============================================================
// 8) 桌面小组件配置
// ============================================================

app.get('/api/widgets', requireAuth, (req, res) => ok(res, req.userData.widgets));
app.patch('/api/widgets', requireAuth, async (req, res) => {
  try {
    const w = req.userData.widgets;
    for (const k of Object.keys(w)) {
      if (k in req.body && typeof req.body[k] === 'object')
        Object.assign(w[k], req.body[k]);
    }
    await db.saveUser(req.user.id, req.userData);
    return ok(res, w);
  } catch (err) {
    return fail(res, 500, '更新失败');
  }
});

// ============================================================
// 9) 自定义标签
// ============================================================

app.get('/api/tags', requireAuth, (req, res) => ok(res, { items: req.userData.tags }));
app.post('/api/tags', requireAuth, async (req, res) => {
  try {
    const { name, color = '#4878E8' } = req.body || {};
    if (!name) return fail(res, 4001, '请输入标签名');
    if (req.userData.tags.find((t) => t.name === name))
      return fail(res, 4002, '标签已存在');
    const tag = { id: newId(), name: String(name).slice(0, 20), color };
    req.userData.tags.push(tag);
    await db.saveUser(req.user.id, req.userData);
    return ok(res, tag);
  } catch (err) {
    return fail(res, 500, '创建失败');
  }
});
app.patch('/api/tags/:id', requireAuth, async (req, res) => {
  const t = getOrInit(req.userData.tags, req.params.id);
  if (!t) return fail(res, 4040, '标签不存在');
  if ('name' in req.body) t.name = String(req.body.name).slice(0, 20);
  if ('color' in req.body) t.color = req.body.color;
  await db.saveUser(req.user.id, req.userData);
  return ok(res, t);
});
app.delete('/api/tags/:id', requireAuth, async (req, res) => {
  const list = req.userData.tags;
  const idx = list.findIndex((t) => t.id === req.params.id);
  if (idx < 0) return fail(res, 4040, '标签不存在');
  list.splice(idx, 1);
  await db.saveUser(req.user.id, req.userData);
  return ok(res, { id: req.params.id });
});

// ============================================================
// 10) 回收站
// ============================================================

app.get('/api/trash', requireAuth, (req, res) => ok(res, { items: req.userData.trash }));

/** POST /api/trash/:id/restore - 还原 */
app.post('/api/trash/:id/restore', requireAuth, async (req, res) => {
  try {
    const list = req.userData.trash;
    const idx = list.findIndex((t) => t.id === req.params.id || t.item.id === req.params.id);
    if (idx < 0) return fail(res, 4040, '记录不存在');
    const [obj] = list.splice(idx, 1);
    const { type, item } = obj;
    if (type === 'task') req.userData.tasks.unshift(item);
    else if (type === 'note') req.userData.notes.unshift(item);
    else if (type === 'bookmark') req.userData.bookmarks.unshift(item);
    else if (type === 'calendar') req.userData.calendar.unshift(item);
    else if (type === 'track' || type === 'video') {
      // 音视频在回收站只保留元数据，无法完整还原，直接移除即可
      return ok(res, { restored: false, reason: `${type === 'track' ? '音轨' : '视频'}在回收站仅保留元数据，无法完整还原` });
    }
    await db.saveUser(req.user.id, req.userData);
    return ok(res, { restored: true });
  } catch (err) {
    return fail(res, 500, '还原失败');
  }
});

/** DELETE /api/trash/:id - 彻底删除 */
app.delete('/api/trash/:id', requireAuth, async (req, res) => {
  const list = req.userData.trash;
  const idx = list.findIndex((t) => t.id === req.params.id || t.item.id === req.params.id);
  if (idx < 0) return fail(res, 4040, '记录不存在');
  list.splice(idx, 1);
  await db.saveUser(req.user.id, req.userData);
  return ok(res, { id: req.params.id });
});

/** POST /api/trash/clear - 清空回收站 */
app.post('/api/trash/clear', requireAuth, async (req, res) => {
  req.userData.trash = [];
  await db.saveUser(req.user.id, req.userData);
  return ok(res, { cleared: true });
});

// ============================================================
// 11) 文本附件
// ============================================================

app.get('/api/attachments', requireAuth, (req, res) => ok(res, { items: req.userData.attachments }));
app.post('/api/attachments', requireAuth, async (req, res) => {
  try {
    const { name, content, type = 'text' } = req.body || {};
    if (!name || content == null) return fail(res, 4001, '请提供附件名和内容');
    const att = {
      id: newId(),
      name: String(name).slice(0, 200),
      content: typeof content === 'string' ? content.slice(0, 200000) : String(content).slice(0, 200000),
      type, // text / data-url-image
      size: String(content).length,
      createdAt: Date.now()
    };
    req.userData.attachments.unshift(att);
    if (req.userData.attachments.length > 200) {
      req.userData.attachments = req.userData.attachments.slice(0, 200);
    }
    await db.saveUser(req.user.id, req.userData);
    return ok(res, att);
  } catch (err) {
    return fail(res, 500, '保存失败');
  }
});
app.delete('/api/attachments/:id', requireAuth, async (req, res) => {
  const list = req.userData.attachments;
  const idx = list.findIndex((a) => a.id === req.params.id);
  if (idx < 0) return fail(res, 4040, '附件不存在');
  list.splice(idx, 1);
  await db.saveUser(req.user.id, req.userData);
  return ok(res, { id: req.params.id });
});

// ============================================================
// 12) 统计看板
// ============================================================

app.get('/api/stats', requireAuth, (req, res) => {
  const s = req.userData.stats;
  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);
  const monthItems = Object.entries(s.dailyActivity || {})
    .filter(([k]) => k.startsWith(monthKey))
    .flatMap(([k, v]) => [
      { date: k, tasks: v.tasks || 0, focus: v.focus || 0, notes: v.notes || 0 }
    ]);
  return ok(res, {
    total: {
      taskCompletions: s.taskCompletions,
      focusMinutes: s.focusMinutes,
      notes: req.userData.notes.length,
      bookmarks: req.userData.bookmarks.length,
      tasks: req.userData.tasks.length
    },
    month: monthItems
  });
});

// ============================================================
// 13) 个人偏好 / 同步
// ============================================================

app.get('/api/settings', requireAuth, (req, res) => ok(res, req.userData.settings));

/** PATCH /api/settings - 增量修改偏好（用于多端同步） */
app.patch('/api/settings', requireAuth, async (req, res) => {
  try {
    const s = req.userData.settings;
    for (const k of Object.keys(req.body || {})) {
      s[k] = req.body[k];
    }
    await db.saveUser(req.user.id, req.userData);
    return ok(res, s);
  } catch (err) {
    return fail(res, 500, '保存失败');
  }
});

/** GET /api/sync/pull - 拉取全量数据（多端同步用） */
app.get('/api/sync/pull', requireAuth, (req, res) => {
  const u = req.userData;
  return ok(res, {
    version: nowVersion(),
    tasks: u.tasks,
    notes: u.notes,
    bookmarks: u.bookmarks,
    pomodoro: u.pomodoro,
    calendar: u.calendar,
    clipboard: u.clipboard,
    widgets: u.widgets,
    stats: u.stats,
    tags: u.tags,
    trash: u.trash,
    settings: u.settings,
    attachments: u.attachments,
    tracks: u.tracks || [],
    videos: u.videos || []
  });
});

/** POST /api/sync/push - 推送全量（仅在版本落后时全量替换；通常使用各模块 PATCH 更稳） */
app.post('/api/sync/push', requireAuth, async (req, res) => {
  try {
    const u = req.userData;
    const body = req.body || {};
    // 仅允许覆盖同名字段
    ['tasks', 'notes', 'bookmarks', 'pomodoro', 'calendar', 'clipboard',
      'widgets', 'stats', 'tags', 'trash', 'settings', 'attachments',
      'tracks', 'videos'].forEach((k) => {
      if (Array.isArray(body[k]) || typeof body[k] === 'object') u[k] = body[k];
    });
    await db.saveUser(req.user.id, u);
    return ok(res, { synced: true });
  } catch (err) {
    return fail(res, 500, '同步失败');
  }
});

function nowVersion() {
  return Date.now();
}

// ============================================================
// 14) 备份与恢复
// ============================================================

/** GET /api/backup/export - 导出全部个人数据 */
app.get('/api/backup/export', requireAuth, (req, res) => {
  const u = req.userData;
  const payload = {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    user: { username: u.profile.username, nickname: u.profile.nickname },
    data: {
      tasks: u.tasks,
      notes: u.notes,
      bookmarks: u.bookmarks,
      pomodoro: u.pomodoro,
      calendar: u.calendar,
      clipboard: u.clipboard,
      widgets: u.widgets,
      stats: u.stats,
      tags: u.tags,
      trash: u.trash,
      settings: u.settings,
      attachments: u.attachments,
      tracks: u.tracks || [],
      videos: u.videos || []
    }
  };
  res.setHeader('Content-Disposition', `attachment; filename="nexspace-backup-${u.profile.username || req.user.id}.json"`);
  return ok(res, payload);
});

/** POST /api/backup/import - 导入恢复（合并模式） */
app.post('/api/backup/import', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const incoming = body.data || {};
    const u = req.userData;
    // 简单合并策略: push 到列表末尾，同 id 跳过
    const merge = (dst, src) => {
      if (!Array.isArray(src)) return;
      src.forEach((it) => {
        if (!it || !it.id) return;
        if (!dst.find((x) => x.id === it.id)) dst.push(it);
      });
    };
    merge(u.tasks, incoming.tasks);
    merge(u.notes, incoming.notes);
    merge(u.bookmarks, incoming.bookmarks);
    merge(u.pomodoro, incoming.pomodoro);
    merge(u.calendar, incoming.calendar);
    merge(u.clipboard, incoming.clipboard);
    merge(u.tags, incoming.tags);
    merge(u.attachments, incoming.attachments);
    merge(u.tracks, incoming.tracks);
    merge(u.videos, incoming.videos);
    // 单对象覆盖
    if (incoming.settings) Object.assign(u.settings, incoming.settings);
    if (incoming.widgets) Object.assign(u.widgets, incoming.widgets);
    if (incoming.stats) Object.assign(u.stats, incoming.stats);
    await db.saveUser(req.user.id, u);
    return ok(res, { imported: true });
  } catch (err) {
    return fail(res, 500, '导入失败');
  }
});

// ============================================================
// 15) 全局搜索
// ============================================================

app.get('/api/search', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return ok(res, { items: [] });
  const u = req.userData;
  const hits = [];
  u.tasks.forEach((t) => {
    if ((t.title || '').toLowerCase().includes(q)) hits.push({ type: 'task', id: t.id, title: t.title, excerpt: t.title });
  });
  u.notes.forEach((n) => {
    if (
      (n.title || '').toLowerCase().includes(q) ||
      (n.content || '').toLowerCase().includes(q)
    ) {
      hits.push({ type: 'note', id: n.id, title: n.title, excerpt: (n.content || '').replace(/<[^>]+>/g, '').slice(0, 100) });
    }
  });
  u.bookmarks.forEach((b) => {
    if (
      (b.title || '').toLowerCase().includes(q) ||
      (b.url || '').toLowerCase().includes(q) ||
      (b.description || '').toLowerCase().includes(q)
    ) {
      hits.push({ type: 'bookmark', id: b.id, title: b.title, excerpt: b.url });
    }
  });
  u.calendar.forEach((c) => {
    if (
      (c.title || '').toLowerCase().includes(q) ||
      (c.notes || '').toLowerCase().includes(q)
    ) {
      hits.push({ type: 'calendar', id: c.id, title: c.title, excerpt: c.date });
    }
  });
  return ok(res, { items: hits.slice(0, 80) });
});

// ============================================================
// 16) 音乐曲目  ★ V4: 文件存储 + 智能下载兼容
// ============================================================

const TRACK_MAX_COUNT = 200;

function sanitizeTrack(t) {
  return {
    id: t.id,
    name: t.name,
    type: t.type,
    size: t.size,
    cover: t.cover || '',
    duration: t.duration || 0,
    artist: t.artist || '',
    title: t.title || '',
    storage: t.storage || (t.dataUrl && t.dataUrl.startsWith('/audio/') ? 'local' : 'base64'),
    createdAt: t.createdAt
  };
}

/** GET /api/tracks - 列表（不返回 dataUrl，节省流量） */
app.get('/api/tracks', requireAuth, (req, res) => {
  const items = (req.userData.tracks || []).map(sanitizeTrack);
  return ok(res, { items });
});

/** GET /api/tracks/:id - 单曲（含完整 dataUrl/stream 路径） */
app.get('/api/tracks/:id', requireAuth, (req, res) => {
  const t = (req.userData.tracks || []).find((x) => x.id === req.params.id);
  if (!t) return fail(res, 4040, '曲目不存在');
  return ok(res, t);
});

/** ★ V4: 智能下载/播放路由
 *  - dataUrl 以 /audio/ 开头：读取本地真实文件，fs.createReadStream 流式返回（解决手机无法播放）
 *  - dataUrl 以 data: 开头：兼容老 base64 数据
 *  - 静态资源路由已由 express.static 处理 /audio/* 直接访问，但这里我们走带鉴权的版本更安全
 */
app.get('/api/tracks/:id/download', requireAuth, (req, res) => {
  const t = (req.userData.tracks || []).find((x) => x.id === req.params.id);
  if (!t) return fail(res, 4040, '曲目不存在');

  const safeName = encodeURIComponent(t.name);

  // ★ V4 新分支 1: 本地文件 - 直接流式输出（解决手机播放、bad gateway）
  if (t.dataUrl && t.dataUrl.startsWith('/audio/')) {
    const filename = t.dataUrl.replace(/^\/audio\//, '');
    // 防御路径穿越
    if (filename.indexOf('..') !== -1 || filename.indexOf('/') !== -1) {
      return fail(res, 4001, '非法文件名');
    }
    const filePath = path.join(AUDIO_DIR, filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`[tracks.download] 本地文件缺失: ${filePath}`);
      return fail(res, 4040, '本地音频文件已丢失，请重新上传');
    }
    const stat = fs.statSync(filePath);
    const mime = t.type || mimeFromExt(filename) || 'audio/mpeg';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"; filename*=UTF-8''${safeName}`);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const stream = fs.createReadStream(filePath);
    stream.on('error', (e) => {
      console.error('[tracks.stream]', e);
      if (!res.headersSent) res.status(500).end();
      else res.end();
    });
    return stream.pipe(res);
  }

  // ★ V4 新分支 2: 兼容老 base64 数据
  try {
    const m = /^data:([^;]+);base64,(.*)$/.exec(t.dataUrl || '');
    if (!m) return fail(res, 500, '曲目数据格式异常');
    const buf = Buffer.from(m[2], 'base64');
    res.setHeader('Content-Type', t.type || m[1] || 'audio/mpeg');
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"; filename*=UTF-8''${safeName}`);
    res.end(buf);
  } catch (err) {
    console.error('[tracks.download base64]', err);
    return fail(res, 500, '下载失败');
  }
});

/** ★ V4: 保留旧 base64 接口（兼容历史数据 / 老前端） */
app.post('/api/tracks', requireAuth, async (req, res) => {
  try {
    const { name, type, size, dataUrl, cover, duration, artist, title } = req.body || {};
    if (!name || !dataUrl) return fail(res, 4001, '请提供曲目名和音频数据');
    if (!TRACK_MIME.includes(type) && !type.startsWith('audio/')) {
      return fail(res, 4002, '仅支持 mp3 / wav / ogg / aac / m4a / flac');
    }
    if (size > TRACK_MAX_SIZE) return fail(res, 4003, `音频文件不能超过 ${(TRACK_MAX_SIZE / 1024 / 1024).toFixed(0)}MB`);
    const list = req.userData.tracks = req.userData.tracks || [];
    if (list.length >= TRACK_MAX_COUNT) return fail(res, 4004, `最多存储 ${TRACK_MAX_COUNT} 首曲目`);
    const item = {
      id: newId(),
      name: String(name).slice(0, 200),
      type,
      size,
      dataUrl: String(dataUrl),
      cover: cover || '',
      duration: Math.max(0, Math.min(3600 * 6, Number(duration) || 0)),
      artist: String(artist || '').slice(0, 100),
      title: String(title || name).slice(0, 200),
      storage: 'base64',
      createdAt: Date.now()
    };
    list.unshift(item);
    await db.saveUser(req.user.id, req.userData);
    return ok(res, sanitizeTrack(item));
  } catch (err) {
    console.error('[tracks.create base64]', err);
    return fail(res, 500, '保存失败');
  }
});

/** PATCH /api/tracks/:id - 改名 */
app.patch('/api/tracks/:id', requireAuth, async (req, res) => {
  try {
    const list = req.userData.tracks = req.userData.tracks || [];
    const t = list.find((x) => x.id === req.params.id);
    if (!t) return fail(res, 4040, '曲目不存在');
    const { name, artist, title } = req.body || {};
    if (name !== undefined) t.name = String(name).slice(0, 200);
    if (artist !== undefined) t.artist = String(artist).slice(0, 100);
    if (title !== undefined) t.title = String(title).slice(0, 200);
    await db.saveUser(req.user.id, req.userData);
    return ok(res, sanitizeTrack(t));
  } catch (err) {
    return fail(res, 500, '更新失败');
  }
});

/** ★ V4: DELETE 同时清理磁盘文件 */
app.delete('/api/tracks/:id', requireAuth, async (req, res) => {
  const list = req.userData.tracks = req.userData.tracks || [];
  const idx = list.findIndex((x) => x.id === req.params.id);
  if (idx < 0) return fail(res, 4040, '曲目不存在');
  const [t] = list.splice(idx, 1);

  // ★ V4: 删除本地磁盘文件（防止垃圾残留）
  if (t.dataUrl && t.dataUrl.startsWith('/audio/')) {
    const filename = t.dataUrl.replace(/^\/audio\//, '');
    if (filename && filename.indexOf('..') === -1 && filename.indexOf('/') === -1) {
      const filePath = path.join(AUDIO_DIR, filename);
      fs.unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT') console.warn(`[tracks.delete] 删除文件失败 ${filePath}:`, err.message);
        else if (!err) console.log(`[tracks.delete] 已删除磁盘文件: ${filename}`);
      });
    }
  }

  req.userData.trash = req.userData.trash || [];
  req.userData.trash.unshift({
    id: 'trk_' + t.id,
    type: 'track',
    item: { id: t.id, name: t.name, size: t.size, duration: t.duration, createdAt: t.createdAt },
    deletedAt: Date.now()
  });
  await db.saveUser(req.user.id, req.userData);
  return ok(res, { id: t.id });
});

// ============================================================
// 17) 视频库  ★ V4: 文件存储 + 智能下载兼容
// ============================================================

const VIDEO_MAX_COUNT = 60;

function sanitizeVideo(v) {
  return {
    id: v.id,
    name: v.name,
    type: v.type,
    size: v.size,
    poster: v.poster || '',
    duration: v.duration || 0,
    width: v.width || 0,
    height: v.height || 0,
    views: v.views || 0,
    storage: v.storage || (v.dataUrl && v.dataUrl.startsWith('/videos/') ? 'local' : 'base64'),
    createdAt: v.createdAt
  };
}

/** GET /api/videos - 列表（不返回 dataUrl） */
app.get('/api/videos', requireAuth, (req, res) => {
  const items = (req.userData.videos || []).map(sanitizeVideo);
  return ok(res, { items });
});

/** GET /api/videos/:id - 单个视频（含 dataUrl，访问一次增加 views） */
app.get('/api/videos/:id', requireAuth, (req, res) => {
  const list = req.userData.videos = req.userData.videos || [];
  const v = list.find((x) => x.id === req.params.id);
  if (!v) return fail(res, 4040, '视频不存在');
  v.views = (v.views || 0) + 1;
  db.saveUser(req.user.id, req.userData).catch(() => {});
  return ok(res, v);
});

/** ★ V4: 视频下载/播放 - 本地文件优先，base64 兼容 */
app.get('/api/videos/:id/download', requireAuth, (req, res) => {
  const v = (req.userData.videos || []).find((x) => x.id === req.params.id);
  if (!v) return fail(res, 4040, '视频不存在');

  const safeName = encodeURIComponent(v.name);

  // ★ V4 分支 1: 本地文件
  if (v.dataUrl && v.dataUrl.startsWith('/videos/')) {
    const filename = v.dataUrl.replace(/^\/videos\//, '');
    if (filename.indexOf('..') !== -1 || filename.indexOf('/') !== -1) {
      return fail(res, 4001, '非法文件名');
    }
    const filePath = path.join(VIDEO_DIR, filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`[videos.download] 本地文件缺失: ${filePath}`);
      return fail(res, 4040, '本地视频文件已丢失，请重新上传');
    }
    const stat = fs.statSync(filePath);
    const mime = v.type || mimeFromExt(filename) || 'video/mp4';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"; filename*=UTF-8''${safeName}`);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const stream = fs.createReadStream(filePath);
    stream.on('error', (e) => {
      console.error('[videos.stream]', e);
      if (!res.headersSent) res.status(500).end();
      else res.end();
    });
    return stream.pipe(res);
  }

  // ★ V4 分支 2: 兼容老 base64
  try {
    const m = /^data:([^;]+);base64,(.*)$/.exec(v.dataUrl || '');
    if (!m) return fail(res, 500, '视频数据格式异常');
    const buf = Buffer.from(m[2], 'base64');
    res.setHeader('Content-Type', v.type || m[1] || 'video/mp4');
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"; filename*=UTF-8''${safeName}`);
    res.end(buf);
  } catch (err) {
    console.error('[videos.download base64]', err);
    return fail(res, 500, '下载失败');
  }
});

/** ★ V4: 保留旧 base64 视频接口 */
app.post('/api/videos', requireAuth, async (req, res) => {
  try {
    const { name, type, size, dataUrl, poster, duration, width, height } = req.body || {};
    if (!name || !dataUrl) return fail(res, 4001, '请提供视频名和数据');
    if (!VIDEO_MIME.includes(type) && !type.startsWith('video/')) {
      return fail(res, 4002, '仅支持 mp4 / webm / ogv / mov / mkv / avi');
    }
    if (size > VIDEO_MAX_SIZE) return fail(res, 4003, `视频文件不能超过 ${(VIDEO_MAX_SIZE / 1024 / 1024).toFixed(0)}MB`);
    const list = req.userData.videos = req.userData.videos || [];
    if (list.length >= VIDEO_MAX_COUNT) return fail(res, 4004, `最多存储 ${VIDEO_MAX_COUNT} 个视频`);
    const item = {
      id: newId(),
      name: String(name).slice(0, 200),
      type,
      size,
      dataUrl: String(dataUrl),
      poster: poster || '',
      duration: Math.max(0, Math.min(3600 * 8, Number(duration) || 0)),
      width: Number(width) || 0,
      height: Number(height) || 0,
      views: 0,
      storage: 'base64',
      createdAt: Date.now()
    };
    list.unshift(item);
    await db.saveUser(req.user.id, req.userData);
    return ok(res, sanitizeVideo(item));
  } catch (err) {
    console.error('[videos.create base64]', err);
    return fail(res, 500, '保存失败');
  }
});

/** PATCH /api/videos/:id - 改名 */
app.patch('/api/videos/:id', requireAuth, async (req, res) => {
  try {
    const list = req.userData.videos = req.userData.videos || [];
    const v = list.find((x) => x.id === req.params.id);
    if (!v) return fail(res, 4040, '视频不存在');
    const { name } = req.body || {};
    if (name !== undefined) v.name = String(name).slice(0, 200);
    await db.saveUser(req.user.id, req.userData);
    return ok(res, sanitizeVideo(v));
  } catch (err) {
    return fail(res, 500, '更新失败');
  }
});

/** ★ V4: DELETE 视频同时清理磁盘文件 */
app.delete('/api/videos/:id', requireAuth, async (req, res) => {
  const list = req.userData.videos = req.userData.videos || [];
  const idx = list.findIndex((x) => x.id === req.params.id);
  if (idx < 0) return fail(res, 4040, '视频不存在');
  const [v] = list.splice(idx, 1);

  // ★ V4: 删除本地磁盘文件
  if (v.dataUrl && v.dataUrl.startsWith('/videos/')) {
    const filename = v.dataUrl.replace(/^\/videos\//, '');
    if (filename && filename.indexOf('..') === -1 && filename.indexOf('/') === -1) {
      const filePath = path.join(VIDEO_DIR, filename);
      fs.unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT') console.warn(`[videos.delete] 删除文件失败 ${filePath}:`, err.message);
        else if (!err) console.log(`[videos.delete] 已删除磁盘文件: ${filename}`);
      });
    }
  }

  req.userData.trash = req.userData.trash || [];
  req.userData.trash.unshift({
    id: 'vid_' + v.id,
    type: 'video',
    item: { id: v.id, name: v.name, size: v.size, duration: v.duration, createdAt: v.createdAt },
    deletedAt: Date.now()
  });
  await db.saveUser(req.user.id, req.userData);
  return ok(res, { id: v.id });
});

// ============================================================
// 工具：按扩展名推断 mime
// ============================================================
function mimeFromExt(filename) {
  const ext = (path.extname(filename) || '').toLowerCase();
  const map = {
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
    '.flac': 'audio/flac', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg',
    '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo'
  };
  return map[ext] || '';
}

// ============================================================
// 18) 静态前端兜底 - SPA History 模式必须
// ============================================================

app.get(/^\/(?!api).*/, (req, res, next) => {
  const indexFile = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  next();
});

// ============================================================
// 错误处理
// ============================================================

app.use((err, req, res, next) => {
  console.error('[server error]', err);
  if (res.headersSent) return next(err);
  return fail(res, 500, err.message || '服务器错误');
});

// ============================================================
// 启动
// ============================================================

app.listen(PORT, HOST, () => {
  console.log(`\n  NexSpace 邻境工作台 已启动 [V4]`);
  console.log(`  - 访问:        http://localhost:${PORT}`);
  console.log(`  - 局域网:      http://${getLocalIP()}:${PORT}`);
  console.log(`  - 数据目录:    ${path.join(__dirname, 'data')}`);
  console.log(`  - 音频存储:    ${AUDIO_DIR}`);
  console.log(`  - 视频存储:    ${VIDEO_DIR}\n`);
});

function getLocalIP() {
  try {
    const os = require('os');
    const ifs = os.networkInterfaces();
    for (const name of Object.keys(ifs)) {
      for (const i of ifs[name] || []) {
        if (i.family === 'IPv4' && !i.internal) return i.address;
      }
    }
  } catch (_) {}
  return HOST;
}