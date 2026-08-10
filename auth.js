/**
 * NexSpace 鉴权模块
 * ----------------------------------------------------------------
 * - 基于 JWT (jsonwebtoken) 的无状态登录
 * - bcryptjs 做密码哈希
 * - 提供 requireAuth 中间件做接口保护
 *
 * Token 设计:
 *  - Payload: { sub: userId, username, jti, iat, exp }
 *  - 默认 7 天有效期
 *  - 退出登录时把 jti 加入黑名单（index.json 中持久化）
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./db');

// 强烈建议通过环境变量配置；此处给一个开发期默认值
const JWT_SECRET =
  process.env.JWT_SECRET ||
  'nexspace-secret-key-change-me-in-production-2026';
const JWT_EXPIRES_IN = '7d';

/**
 * 密码哈希
 */
function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function comparePassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

/**
 * 签发登录 Token
 */
function signToken(userId, username) {
  const jti = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign(
    { sub: userId, username, jti },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  return { token, jti, expiresIn: 7 * 24 * 3600 };
}

/**
 * 校验 Token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * 鉴权中间件：解析 Authorization 头，校验并挂载 req.user
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return res.status(401).json({ code: 401, message: '未登录或登录已过期' });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return res
      .status(401)
      .json({ code: 401, message: '登录凭证无效或已过期' });
  }
  // 黑名单检查
  if (db.isTokenBlacklisted(payload.jti)) {
    return res.status(401).json({ code: 401, message: '登录已失效，请重新登录' });
  }
  // 用户是否存在
  const userData = db.loadUser(payload.sub);
  if (!userData) {
    return res.status(401).json({ code: 401, message: '账号不存在' });
  }
  req.user = { id: payload.sub, username: payload.username, jti: payload.jti };
  req.userData = userData;
  next();
}

module.exports = {
  hashPassword,
  comparePassword,
  signToken,
  verifyToken,
  requireAuth,
  JWT_SECRET,
  JWT_EXPIRES_IN
};
