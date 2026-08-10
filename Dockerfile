FROM node:18-alpine

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && adduser -S nexspace -u 1001

WORKDIR /app

# 复制 package 文件并安装依赖（Docker 缓存优化）
COPY package*.json ./
RUN npm install --production && npm cache clean --force

# 复制应用代码
COPY server.js auth.js db.js ./
COPY public ./public

# 切换到非 root 用户
RUN chown -R nexspace:nodejs /app
USER nexspace

ENV NODE_ENV=production
ENV PORT=4878
ENV HOST=0.0.0.0

EXPOSE 4878

# 数据卷 - 持久化
VOLUME ["/app/data"]

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:4878/ || exit 1

CMD ["node", "server.js"]
