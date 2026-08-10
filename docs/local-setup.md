# 本地启动教程（Local Setup）

> 5 分钟内把 NexSpace 跑起来。

## 1. 环境检查

```bash
node --version    # ≥ 18.0
npm --version     # ≥ 9.0
```

如果没有安装 Node.js，请访问 <https://nodejs.org/> 下载 LTS 版本。

## 2. 解压 / 进入项目

```bash
cd nexspace-workspace
```

## 3. 安装依赖（首次）

```bash
npm install
```

依赖只有 5 个：
- `express` - Web 服务器
- `jsonwebtoken` - JWT 鉴权
- `bcryptjs` - 密码哈希
- `multer` - 文件上传（备用）
- `cors` / `compression` / `morgan` - 中间件

## 4. 启动服务

### 方式一：直接启动（开发期）

```bash
npm start
```

输出：
```
  NexSpace 邻境工作台 已启动
  - 访问:    http://localhost:4878
  - 数据目录: .../nexspace-workspace/data
```

### 方式二：Node.js Watch 模式（修改代码自动重启）

```bash
npm run dev
```

### 方式三：自定义端口

```bash
PORT=8080 npm start
```

然后访问 <http://localhost:8080>

## 5. 首次使用

1. 打开浏览器访问 <http://localhost:4878>
2. 点击右下角"还没有账号？立即注册"
3. 输入账号（3-20 位字母/数字/下划线）和密码（至少 6 位）
4. 注册成功后自动跳转到工作台
5. 开始添加任务、笔记、书签！

## 6. 多端访问（局域网）

如果要让同一 WiFi 下的手机也能访问：
1. 让服务监听 0.0.0.0（默认就是）
2. 查看电脑 IP：`ifconfig` 或 `ipconfig`
3. 手机浏览器访问 `http://<电脑IP>:4878`
4. 注册新账号或者使用同一账号登录（数据互通）

## 7. 常见问题

### Q1: 注册时提示"该账号已被注册"
已经注册过这个账号了。换一个用户名，或者用之前的账号登录。

### Q2: 数据存在哪里？
在项目根目录下的 `data/` 文件夹：
- `data/index.json` - 用户索引
- `data/users/<userId>.json` - 每个用户的完整数据
- `data/users/<userId>.json.bak` - 自动备份（如果存在）

**删除整个 `data/` 目录即可重置全部数据**，但要谨慎！

### Q3: 想换个端口但忘了在哪里改？
两种方法：
```bash
# 临时
PORT=8888 npm start

# 永久（写到 .env 文件）
echo "PORT=8888" > .env
```

### Q4: 修改了文件没生效？
- 模式一：用 `npm run dev` 启动，自动热重启
- 模式二：手动 Ctrl+C 后重新 `npm start`
- 前端文件直接刷新浏览器即可

### Q5: 能不能在 Windows 上跑？
完全可以。所有代码都是跨平台的，唯一区别：
- 数据目录在 Windows 上是 `C:\...\nexspace-workspace\data\`
- 启动命令是 `npm start`，没有区别

### Q6: 浏览器一直转圈？
打开浏览器控制台（F12）查看错误。常见原因：
- 端口被占用 → 换端口
- Tailwind CDN 加载慢 → 等待或替换为本地版
- 缓存问题 → 强制刷新 Ctrl+Shift+R

## 8. 升级到生产模式

详见 [deployment.md](./deployment.md)。

## 9. 开发技巧

### 实时调试后端
```bash
npm run dev  # node 18+ 自带 watch
```

### 重置某个用户的数据
```bash
rm data/users/<userId>.json
# 注意：此操作不可恢复！
```

### 备份所有数据
```bash
tar czf nexspace-backup-$(date +%Y%m%d).tar.gz data/
```

### 恢复数据
```bash
tar xzf nexspace-backup-20260810.tar.gz
```
