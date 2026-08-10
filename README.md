# NexSpace 邻境工作台

> **一处空间，统筹所有事务**

一个完整的、可部署上线的、支持多端访问和支持打包为 PWA（渐进式网页应用）的云端个人工作台。
设计风格采用低饱和现代简约 + 玻璃磨砂卡片，支持深色 / 浅色双模式。

---

## ✨ 功能特性一览

### 账号与同步
- ✅ 注册 / 登录 / 退出（Token 持久化，浏览器记住登录态）
- ✅ Token 自动鉴权，过期自动跳登录页
- ✅ 多端实时同步（同一账号可在多个设备登录）
- ✅ 离线操作队列（断网也能编辑，联网自动同步）

### 工作台模块
- 📋 **待办任务** - 优先级、截止日期、重复、归档、筛选
- 📝 **富文本笔记** - 多分类、标签、全文搜索
- 🔖 **书签管理** - 分类、备注、快速跳转
- ⏱️ **番茄专注** - 15/25/45/60 分钟，历史记录
- 📅 **日程日历** - 月视图、每日详情
- 📌 **临时剪贴板** - 快速粘贴，置顶保留
- 📊 **数据看板** - 月度活跃趋势，可视化图表
- 🗑️ **回收站** - 误删恢复，可彻底清除

### 拓展功能
- 🏷️ **自定义标签** - 8 套预设颜色，任意分类配色
- 📎 **文本附件** - 临时文本/图片存储
- 🎵 **音乐播放器** - 上传/播放/下载音乐，底部常驻条 + 全局快捷键
- 🎬 **视频库** - 上传/播放/下载视频，HTML5 播放器 + 自定义控件
- 🔔 **桌面通知** - 任务完成、番茄完成提醒
- 🔁 **重复任务** - 每日 / 每周自动复制任务

### 音乐 & 视频（v3 新增 / v4 修复播放）
- 🎵 **音乐播放器** - 支持 mp3 / wav / ogg / aac / m4a / flac（≤25MB）
  - 底部常驻控制条：播放/暂停、上一首/下一首、随机/循环、进度条、音量条
  - 模态播放列表：拖拽上传、重命名、下载、删除
  - 全局快捷键：`Space` 播放/暂停 · `N` 下一首 · `P` 上一首 · `↑↓` 音量 · `←→` 跳转
  - 三种循环模式：列表循环 / 单曲循环 / 不循环
  - 音量持久化到 localStorage
- 🎬 **视频库** - 支持 mp4 / webm / ogv / mov / mkv / avi（≤80MB）
  - 自动生成首帧海报（Canvas 截图）
  - 视频卡片网格：缩略图、时长、文件大小、播放次数
  - HTML5 播放器模态：原生控件 + 自定义下载按钮
  - 播放器快捷键：`Space` 播放/暂停 · `←→` 跳转 ±5s · `F` 全屏 · `L` 切换控件 · `Esc` 关闭
  - 6 种排序：最新/最早/播放次数/文件大小/按名称
  - 拖拽上传 + 进度反馈
- 🗑️ **回收站保护** - 音视频删除仅保留元数据（避免 JSON 体积膨胀）

### 个性化
- 🎨 深色 / 浅色主题切换，云端同步
- 🖼️ 自定义背景图片
- 💧 界面透明度调节
- 📱 完美响应式（PC / 平板 / 手机）

### 性能与体验
- 🔍 全局搜索（任务 / 笔记 / 书签 / 日程）
- ⌨️ 全局快捷键（Ctrl+K 搜索 / Esc 关闭弹窗 / 音乐 + 视频专属快捷键）
- 🚀 Service Worker 离线缓存
- 🔄 离线操作队列 + 自动重放
- ⚡ 防抖 / 节流 / 懒加载

---

## 🆕 更新日志

### v4 (2026-08-10) - 音视频播放修复 ⭐
- 🐛 **修复**：v3 上传的音乐 / 视频在浏览器（特别是手机）无法播放的根因
  - v3 旧实现把音频/视频塞进 `dataUrl`（base64）写入 JSON，会话卡顿、移动端解码失败、JSON 膨胀
- ✅ **重构**：multer 落本地磁盘，浏览器走流式播放
  - 音频存 `public/audio/`，视频存 `public/videos/`（首次启动自动创建 777 权限）
  - 新端点 `POST /api/tracks/upload-local`（multipart, 字段名 `audioFile`）
  - 新端点 `POST /api/videos/upload-local`（multipart, 字段名 `videoFile`）
  - `/api/tracks/:id/download` 与 `/api/videos/:id/download` 智能分发：
    - 新数据 → `Content-Disposition: inline; filename*=UTF-8''…` + `Accept-Ranges: bytes`
    - 老数据 → 兼容读取历史 base64
  - `DELETE /api/tracks/:id` / `/api/videos/:id` 会真正物理 `unlink` 文件
  - `statics` 静态中间件注册在所有业务路由之前
  - 全部统一响应经过 `Content-Disposition: inline;`，浏览器直接播放而不下载
- 🔁 **零迁移成本**：上一版上传的 base64 数据**完全兼容**，`POST /api/tracks` 与 `POST /api/videos` 保留
- 📱 **手机端浏览器可播放**：从「拉不上来 base64」改为「流式文件请求」，iOS Safari / Android Chrome 全部可用
- 🔒 **权限与边界保护**：路径遍历检查（`filename.indexOf('..')`），白名单 mime/扩展名，限制 ≤25MB / 80MB

### v3 (2026-08) - 音乐 & 视频
- ➕ 新增 `MusicPlayer` 模块（#音乐页 + 底部常驻控制条）
- ➕ 新增 `VideoLibrary` 模块（#视频库页 + 视频卡片网格 + 模态播放器）
- ➕ 仪表盘增加 9 格快速操作 + 2 张统计卡片（音乐数 / 视频数）
- ➕ 后端 7+7 个音视频 API（CRUD + 下载 + 软删除）
- ➕ Canvas 自动生成视频首帧海报
- ➕ 多种排序 & 拖拽上传 & 进度反馈
- ➕ 全局/播放器快捷键
- 🎨 优化整体 UI（毛玻璃 + 渐变 + 动画）

### v1/v2 - 基础
- 待办 / 笔记 / 书签 / 番茄钟 / 日历 / 剪贴板 / 标签 / 统计 / 回收站 / 设置
- 账号注册 / 登录 / Token 鉴权 / 多端同步
- PWA 离线 / Service Worker / 桌面通知
- 主题切换 / 自定义背景 / 透明度调节

---

## 🚀 快速开始

### 环境要求
- Node.js ≥ 18.0
- npm / pnpm / yarn 任意一种

### 一、本地运行（5 秒启动）

```bash
# 1. 进入项目目录
cd nexspace-workspace

# 2. 安装依赖
npm install

# 3. 启动服务
npm start
```

启动成功后访问：**<http://localhost:4878>**

注册一个新账号即可开始使用。数据保存在 `./data/` 目录，**完全离线运行、零数据库依赖**。

### 二、自定义配置

```bash
# 修改端口
PORT=8080 npm start

# 修改 JWT 密钥（生产环境必备！）
export JWT_SECRET="your-very-long-random-string"
npm start
```

---

## 🏗️ 项目结构

```
nexspace-workspace/
├── server.js           # Express 主服务（含所有 API 路由）
├── auth.js             # JWT 鉴权 + bcryptjs 密码哈希
├── db.js               # JSON 文件数据库（轻量化封装）
├── package.json        # 项目依赖
├── data/               # 运行时数据（自动生成）
│   ├── index.json      # 用户索引 + Token 黑名单
│   └── users/          # 每个用户独立的 JSON 文件
├── public/             # 前端静态资源
│   ├── index.html      # SPA 入口
│   ├── manifest.json   # PWA 配置
│   ├── service-worker.js  # PWA 离线脚本
│   ├── offline.html    # 离线兜底页
│   ├── audio/          # **v4** 音频本地存储目录（自动创建）
│   ├── videos/         # **v4** 视频本地存储目录（自动创建）
│   ├── css/styles.css  # 自定义样式（毛玻璃、动画、响应式）
│   ├── js/
│   │   ├── utils.js    # 防抖/节流/格式化工具
│   │   ├── api.js      # 接口客户端（含离线队列、**v4** multipart 上传）
│   │   ├── ui.js       # Modal/Toast/Confirm 组件
│   │   ├── auth.js     # 客户端登录态管理
│   │   ├── sync.js     # 多端同步引擎
│   │   ├── modules.js  # 所有业务模块（任务、笔记…，**v4** 音乐/视频改用流式 URL）
│   │   └── app.js      # 主入口（路由、主题、布局）
│   └── icons/          # PWA 多尺寸图标
└── docs/
    ├── local-setup.md
    ├── deployment.md
    └── pwa-installation.md
```

---

## 📚 接口一览

| 模块 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 认证 | POST | `/api/auth/register` | 注册 |
| 认证 | POST | `/api/auth/login` | 登录 |
| 认证 | POST | `/api/auth/logout` | 退出 |
| 认证 | GET  | `/api/auth/me` | 当前用户 |
| 任务 | CRUD | `/api/tasks` | 待办任务 |
| 笔记 | CRUD | `/api/notes` | 富文本笔记 |
| 书签 | CRUD | `/api/bookmarks` | 书签 |
| 番茄 | CRUD | `/api/pomodoro` | 番茄钟记录 |
| 日历 | CRUD | `/api/calendar` | 日程 |
| 剪贴板 | CRUD | `/api/clipboard` | 临时文本 |
| 标签 | CRUD | `/api/tags` | 自定义标签 |
| 回收站 | CRUD | `/api/trash` | 软删除恢复 |
| 附件 | CRUD | `/api/attachments` | 文本/图片附件 |
| 音乐 | CRUD + 下载 | `/api/tracks` `/api/tracks/:id/download` | 音乐曲目（**v4 推荐 `POST /api/tracks/upload-local` 流式上传**） |
| 视频 | CRUD + 下载 | `/api/videos` `/api/videos/:id/download` | 视频库（**v4 推荐 `POST /api/videos/upload-local` 流式上传**） |
| 统计 | GET | `/api/stats` | 总览数据 |
| 设置 | GET/PATCH | `/api/settings` | 偏好 |
| 同步 | GET/POST | `/api/sync/{pull,push}` | 多端同步 |
| 备份 | GET/POST | `/api/backup/{export,import}` | JSON 备份 |
| 搜索 | GET | `/api/search?q=...` | 全局搜索 |

> 音视频限制：单文件 ≤80MB（视频）/ 25MB（音乐），最多 60 个视频 / 200 首曲目。

---

## 📦 部署指南

详见 [docs/deployment.md](./docs/deployment.md)：包括
- PM2 守护进程
- Nginx 反向代理 + HTTPS
- Docker 容器化
- 跨域配置 + 安全建议

---

## 📱 PWA 安装

详见 [docs/pwa-installation.md](./docs/pwa-installation.md)
- Chrome / Edge：地址栏右侧"安装"按钮
- iOS Safari：分享 → 添加到主屏幕
- 安卓 Chrome：菜单 → 添加到主屏幕

安装后可独立窗口运行，**模拟原生 App 体验**。

---

## 🛠️ 二次开发

### 添加新的业务模块
1. 在 `server.js` 添加路由（参考 `/api/tasks` 等）
2. 在 `public/js/modules.js` 添加对应模块的 `render(root)` 方法
3. 在 `public/js/app.js` 的 `ROUTES` 中注册路由

### 替换 UI 库
默认使用 Tailwind CSS（CDN 版）。生产可换成本地构建版：
```bash
npm install -D tailwindcss
npx tailwindcss -i ./public/css/input.css -o ./public/css/tailwind.css --minify
```
然后在 `index.html` 中替换 CDN 链接。

### 切换数据库
`db.js` 已抽象数据访问层，可平滑替换为 SQLite / MySQL / MongoDB：
- `loadUser(userId)` / `saveUser(userId, data)` 接口保持不变
- 内部实现改为对应数据库驱动即可

---

## 🛡️ 安全建议

> ⚠️ **生产环境请务必完成以下配置：**

1. **修改 JWT 密钥**：`JWT_SECRET` 环境变量使用 32+ 位随机字符串
2. **启用 HTTPS**：PWA 必须 HTTPS 协议才能注册 Service Worker
3. **添加速率限制**：建议在反代层（Nginx）或中间件层加限流
4. **定期备份数据目录**：建议定期压缩 `data/` 目录到云存储
5. **不要存储高敏感数据**：本应用设计用于个人效率，**不适合存储银行卡、私钥、密码**

---

## 📝 协议

MIT License - 基于自由使用，欢迎二次开发。

---

## 致谢

- UI 设计参考豆包 Kimiai AI 生成风格
- 图标来自 Iconify
- 字体使用 Inter（OFL 协议）
