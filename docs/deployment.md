# 服务器部署教程（Deployment）

> 把 NexSpace 部署到云服务器，让多端设备都能访问。

## 部署方案概览

| 方案 | 适用 | 难度 | 备注 |
|------|------|------|------|
| **PM2 + Nginx** | 已有 Linux 服务器 | ⭐⭐ | **推荐方案** |
| **Docker** | 跨平台、易迁移 | ⭐⭐ | 适合容器化环境 |
| **直接运行** | 内网 / 临时 | ⭐ | 不推荐生产 |

---

## 方案一：PM2 + Nginx（推荐）

### 1. 准备 Linux 服务器

- 系统：Ubuntu 20.04+ / CentOS 8+ / Debian 11+
- 已安装 Node.js 18+ 和 Nginx

### 2. 上传项目

```bash
# 本地 scp 上传
scp -r nexspace-workspace user@your-server:/opt/

# 服务器上进入
ssh user@your-server
cd /opt/nexspace-workspace
npm install --production
```

### 3. 安装 PM2 并启动

```bash
# 安装 pm2 全局
sudo npm install -g pm2

# 启动服务
pm2 start server.js --name nexspace -i max
# -i max 表示使用所有 CPU 核心（Node.js JSON 文件数据库单实例即可）

# 设置开机自启
pm2 startup
pm2 save
```

### 4. 配置 Nginx 反代

新建 `/etc/nginx/sites-available/nexspace`：

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 换成你的域名
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:4878;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用：

```bash
sudo ln -s /etc/nginx/sites-available/nexspace /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. 配置 HTTPS（Let's Encrypt）

PWA 必须 HTTPS 才支持离线安装。

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Certbot 会自动修改 Nginx 配置启用 HTTPS。

### 6. 配置环境变量（关键安全）

```bash
sudo nano /etc/environment
# 添加：
JWT_SECRET="your-very-long-random-string-min-32-chars"
PORT=4878
HOST=127.0.0.1
```

或者在项目目录创建 `.env` 文件：
```bash
cd /opt/nexspace-workspace
cat > .env <<EOF
JWT_SECRET=$(openssl rand -hex 32)
PORT=4878
HOST=127.0.0.1
EOF
```

⚠️ **JWT_SECRET 是登录 Token 的签发密钥**。生产环境务必修改。

### 7. 重启服务

```bash
pm2 restart nexspace
pm2 logs nexspace
```

浏览器访问 `https://your-domain.com` 即可。

---

## 方案二：Docker 部署

### 1. 创建 Dockerfile

项目根目录 `Dockerfile`：

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

ENV NODE_ENV=production
ENV PORT=4878
EXPOSE 4878

# 数据卷
VOLUME ["/app/data"]
CMD ["node", "server.js"]
```

### 2. 创建 docker-compose.yml

```yaml
version: '3.8'

services:
  nexspace:
    build: .
    container_name: nexspace
    restart: unless-stopped
    ports:
      - "4878:4878"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=please-change-this-secret-in-production
    volumes:
      - nexspace-data:/app/data

volumes:
  nexspace-data:
```

### 3. 启动

```bash
docker-compose up -d
docker-compose logs -f
```

---

## 方案三：直接 systemd 管理（简单）

适合小型部署。

### /etc/systemd/system/nexspace.service

```ini
[Unit]
Description=NexSpace Workspace
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/nexspace-workspace
Environment=JWT_SECRET=your-secret-here
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/nexspace.log
StandardError=append:/var/log/nexspace.log

[Install]
WantedBy=multi-user.target
```

启用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nexspace
sudo systemctl status nexspace
```

---

## 数据备份策略

### 1. 定时备份 data/ 目录

```bash
# /opt/nexspace-workspace/backup.sh
#!/bin/bash
BACKUP_DIR=/var/backups/nexspace
mkdir -p $BACKUP_DIR
tar czf $BACKUP_DIR/data-$(date +%Y%m%d-%H%M).tar.gz -C /opt/nexspace-workspace data/
# 保留最近 30 天
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
```

加 cron 定时（每天凌晨 3 点）：

```bash
chmod +x /opt/nexspace-workspace/backup.sh
crontab -e
# 添加：
0 3 * * * /opt/nexspace-workspace/backup.sh
```

### 2. 上传到云存储

可对接阿里云 OSS / 腾讯云 COS / AWS S3：

```bash
# 安装 aws-cli 或 ossutil
ossutil cp /var/backups/nexspace/data-*.tar.gz oss://your-bucket/nexspace/
```

或使用 [Rclone](https://rclone.org/) 同步到 Google Drive / Dropbox 等。

---

## 安全加固清单

部署完成后，逐项确认：

- [ ] ✅ 修改 `JWT_SECRET`（32+ 位随机）
- [ ] ✅ 启用 HTTPS（Let's Encrypt）
- [ ] ✅ 配置防火墙（仅 80/443 开放）
- [ ] ✅ 数据库目录禁止外网访问
  ```bash
  sudo chmod 700 /opt/nexspace-workspace/data
  sudo chown -R www-data:www-data /opt/nexspace-workspace/data
  ```
- [ ] ✅ 配置 Nginx 限流（防爆破）
  ```nginx
  limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
  location /api/auth/login {
      limit_req zone=login burst=10 nodelay;
      proxy_pass http://127.0.0.1:4878;
  }
  ```
- [ ] ✅ 配置日志轮转（避免日志膨胀）
  ```bash
  sudo nano /etc/logrotate.d/nexspace
  ```
  ```
  /var/log/nexspace.log {
      daily
      rotate 7
      compress
      missingok
      notifempty
  }
  ```
- [ ] ✅ 关闭公网数据库目录访问
- [ ] ✅ 定期检查 PM2 / systemd 状态

---

## 监控与维护

### PM2 监控

```bash
pm2 monit                  # 实时监控
pm2 logs nexspace --lines 100
pm2 restart nexspace       # 重启
pm2 stop nexspace          # 停止
```

### 添加健康检查

可以在 Nginx 加健康检查端点（需要后端新增 `/healthz`，可选）。

### 升级版本

```bash
cd /opt/nexspace-workspace
git pull  # 或重新上传
npm install --production
pm2 restart nexspace
```

---

## 故障排查

### 服务无法启动
```bash
pm2 logs nexspace --lines 50
```
常见原因：端口被占用 / 目录无写权限 / 数据格式损坏。

### 用户数据损坏
用户数据在 `data/users/<userId>.json`。可手工编辑修复或：
```bash
# 删除该用户（会丢数据，让用户重新注册）
rm data/users/<userId>.json
```

### 内存泄漏
Node.js JSON 内存数据库长期运行可能堆积。可以每周定时重启：
```bash
crontab -e
# 每周日凌晨 4 点重启
0 4 * * 1 pm2 restart nexspace
```
