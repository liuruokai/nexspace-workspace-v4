# PWA 安装教程（PWA Installation）

> 在桌面与移动端把 NexSpace 安装为"伪原生 App"，获得原生应用般的体验。

## 什么是 PWA？

PWA（Progressive Web App，渐进式网页应用）是 Google 主导的"网页变应用"技术。
通过将网页添加到主屏幕，**可获得**：

- ✅ 独立窗口运行（无浏览器界面）
- ✅ 桌面 / Dock 图标
- ✅ 离线基础浏览
- ✅ 启动闪屏 + 主题色
- ✅ 后台通知（可选）

---

## 前置条件

### 服务端
- ✅ 已部署 HTTPS（**PWA 必须 HTTPS**，localhost 例外）
- ✅ manifest.json 可访问
- ✅ service-worker.js 可访问

### 客户端
- ✅ Chrome / Edge 88+
- ✅ Firefox 130+
- ✅ iOS Safari 16.4+ (iPhone / iPad)
- ✅ 安卓 Chrome / Samsung Internet

---

## Chrome / Edge 安装（桌面）

### 桌面（Windows / Mac / Linux）

1. 在浏览器打开你的 NexSpace 地址，例如 `https://workspace.example.com`
2. 地址栏右侧会出现一个"安装"图标（电脑 + 向下箭头）
   ![install icon](https://developer.chrome.com/static/docs/devtools/progressive-web-apps/image/install-pwa-button-53e254dd5fed1_1920.png)
3. 点击安装按钮 → 确认
4. 应用会作为一个独立窗口打开，并出现在：
   - **Windows**：开始菜单
   - **Mac**：启动台 / Dock
   - **Linux**：应用菜单

### 验证安装成功

1. 在独立窗口打开应用（没有浏览器 UI）
2. 关闭浏览器后再启动 NexSpace → 仍然能用
3. 卸载时通过系统的"添加或删除程序" / 启动台长按删除

---

## Android Chrome 安装

### 步骤

1. 用 Chrome 打开 NexSpace
2. Chrome 右上角菜单（⋮） → **安装应用** / 添加到主屏幕
3. 或等待弹出提示："添加到主屏幕"
4. 确认 → 应用图标出现在桌面
5. 点击图标 → 以全屏模式打开（无浏览器地址栏）

### 三星 Internet 浏览器

设置 → 高级 → 启用"启用 PWA 安装"

---

## iOS Safari 安装（iPhone / iPad）

> ⚠️ iOS 对 PWA 支持有限，但基本的"添加到主屏幕 + 离线"可用。

### 步骤

1. 用 Safari 打开 NexSpace（必须 Safari，Chrome 不行）
2. 点击底部的"分享"按钮（方框 + 向上箭头）
3. 选择"添加到主屏幕"
4. 修改名称（默认"NexSpace"）
5. 点击右上角"添加"
6. 主屏幕出现 NexSpace 图标
7. 点击图标启动 → 顶部无 Safari 工具栏

### iOS PWA 限制

- ❌ 不支持后台同步 API
- ❌ 不支持 Web Push（仅本地通知可用）
- ❌ 缓存清理后需要重新联网
- ✅ 支持添加到主屏幕、离线缓存、自定义主题色

---

## 安装后体验

### 桌面图标
点击图标打开应用，看到启动闪屏 → 进入主界面，与浏览器一致但更简洁。

### 离线模式
1. 打开一次 NexSpace（让 Service Worker 预缓存）
2. 关闭网络 → 重新打开应用
3. 可正常浏览已缓存的页面
4. 数据修改会进入离线队列
5. 网络恢复后自动同步到服务器

### 后台通知
在 Chrome 浏览器中需要用户主动授权"通知"权限。
- macOS：系统会弹窗询问
- Windows：地址栏出现"允许/阻止"图标 → 选择"允许"
- Android：随 PWA 安装自动授权

授权后，番茄钟完成、任务截止等会推送系统通知。

---

## 调试 PWA

### Chrome DevTools
1. F12 打开开发者工具
2. **Application** 标签页：
   - **Manifest**：检查 manifest.json 是否正确解析
     - 必填项：name, short_name, start_url, display, icons (至少 192, 512)
   - **Service Workers**：检查 SW 状态
     - 应显示 `activated and is running`
   - **Storage**：检查离线缓存

### 模拟离线
1. DevTools → Network → "Offline" 复选框
2. 或者 Application → Service Workers → 勾选 "Offline"

### 常见错误

#### ❌ `Manifest: ... property 'start_url' ignored`
说明 `start_url` 路径错误，应该是 `/` 或带 hash 的路径。

#### ❌ 注册 Service Worker 失败
检查浏览器地址栏是否 `https://` 或 `localhost`，HTTP 服务无法注册 SW。

#### ❌ 离线时无法登录
- 数据未预缓存 → 多访问几次
- 登录接口需要联网 → 联网后再试

#### ❌ iOS 添加到主屏幕按钮不显示
- 必须在 Safari 中
- meta 标签需包含 `apple-mobile-web-app-capable`
- 需要 192x192 图标

---

## 自定义图标 / 启动屏

### 替换图标

把你的 Logo PNG 替换 `public/icons/icon-192.png` 与 `icon-512.png` 即可。
**推荐尺寸**：

| 用途 | 尺寸 |
|------|------|
| Android Chrome | 192×192（必备）+ 512×512 |
| Windows | 256×256 / 512×512 |
| iOS | 180×180 |
| macOS | 512×512 @2x |

### 设计要点
- 中心安全区在 80% 内（避开边缘被裁剪）
- 主体清晰、单色系更易识别
- 使用品牌主色（默认 #4878E8）

### 在线生成
- <https://realfavicongenerator.net/> - 一站式生成
- <https://www.pwabuilder.com/> - PWA 工具 + 图标生成

---

## 上线自检清单

部署到生产环境后，建议逐项验证：

- [ ] ✅ HTTPS 启用且有效
- [ ] ✅ `https://your-domain.com/manifest.json` 返回 200
- [ ] ✅ `https://your-domain.com/service-worker.js` 返回 200
- [ ] ✅ `https://your-domain.com/icons/icon-192.png` 返回 200
- [ ] ✅ Chrome DevTools → Application → Manifest 无错误
- [ ] ✅ Service Worker 状态：`activated and is running`
- [ ] ✅ "添加到主屏幕"按钮出现
- [ ] ✅ 离线模式可打开已缓存页面
- [ ] ✅ iOS Safari 可添加到主屏幕
- [ ] ✅ 通知权限正常弹出

完成上述检查后，PWA 就完全可用了 🎉
