/**
 * 会话管理工具（单用户单角色版）
 * 使用数据库存储会话，通过单一 HttpOnly Cookie 传递会话 Token
 */

import { generateSessionToken } from './passwordHash.js';
import { getDatabase } from '../databaseAdapter.js';
import { fetchSecurityConfig } from '../sysConfig.js';

const SESSION_PREFIX = 'manage@session@';

// 会话 Cookie 名称
const COOKIE_NAME = 'cffb_session';

/**
 * 创建新会话
 * @param {Object} env - 环境变量
 * @param {string} [username] - 用户名
 * @returns {Promise<{token: string, cookie: string}>}
 */
export async function createSession(env, username = '') {
    // 读取安全策略配置
    const securityConfig = await fetchSecurityConfig(env);
    const accessConfig = securityConfig.access || {};
    const secure = accessConfig.sessionSecure ?? false;
    const maxAgeDays = accessConfig.sessionMaxAge ?? 14;
    const maxAge = maxAgeDays * 86400;

    const db = getDatabase(env);
    const token = generateSessionToken();
    const sessionData = {
        username,
        createdAt: Date.now(),
        expiresAt: Date.now() + maxAge * 1000,
    };

    await db.put(`${SESSION_PREFIX}${token}`, JSON.stringify(sessionData), {
        expirationTtl: maxAge,
    });

    const cookie = buildSessionCookie(COOKIE_NAME, token, maxAge, secure);
    return { token, cookie };
}

/**
 * 验证会话（读取 cffb_session Cookie）
 * @param {Object} env - 环境变量
 * @param {Request} request - 请求对象
 * @returns {Promise<{valid: boolean, session?: Object}>}
 */
export async function validateSession(env, request) {
    const token = getSessionToken(request);
    if (!token) {
        return { valid: false };
    }

    const db = getDatabase(env);
    const sessionStr = await db.get(`${SESSION_PREFIX}${token}`);
    if (!sessionStr) {
        return { valid: false };
    }

    try {
        const session = JSON.parse(sessionStr);
        if (Date.now() > session.expiresAt) {
            await db.delete(`${SESSION_PREFIX}${token}`);
            return { valid: false };
        }
        return { valid: true, session };
    } catch {
        return { valid: false };
    }
}

/**
 * 销毁当前会话并清除 Cookie
 * @param {Object} env - 环境变量
 * @param {Request} request - 请求对象
 * @returns {Promise<string[]>} 清除 Cookie 的 Set-Cookie 头数组
 */
export async function destroySession(env, request) {
    const securityConfig = await fetchSecurityConfig(env);
    const secure = securityConfig.access?.sessionSecure ?? false;

    const db = getDatabase(env);

    const token = getCookieValue(request, COOKIE_NAME);
    if (token) {
        await db.delete(`${SESSION_PREFIX}${token}`);
    }
    return [buildSessionCookie(COOKIE_NAME, '', 0, secure)];
}

/**
 * 清除所有会话（用于重置认证 / 修改凭据后强制重新登录）
 * @param {Object} env - 环境变量
 * @returns {Promise<number>} 清除的会话数量
 */
export async function destroyAllSessions(env) {
    const db = getDatabase(env);
    let destroyed = 0;

    let cursor = undefined;
    let hasMore = true;

    while (hasMore) {
        const listOptions = { prefix: SESSION_PREFIX };
        if (cursor) {
            listOptions.cursor = cursor;
        }

        const result = await db.list(listOptions);
        const keys = result.keys || [];

        for (const key of keys) {
            await db.delete(key.name);
            destroyed++;
        }

        cursor = result.cursor;
        hasMore = !result.list_complete && cursor;
    }

    return destroyed;
}

/**
 * 从请求中提取会话 Token
 * @param {Request} request - 请求对象
 * @returns {string|null}
 */
function getSessionToken(request) {
    return getCookieValue(request, COOKIE_NAME);
}

/**
 * 从请求中提取指定 Cookie 的值
 * @param {Request} request - 请求对象
 * @param {string} name - Cookie 名称
 * @returns {string|null}
 */
function getCookieValue(request, name) {
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) return null;

    const regex = new RegExp('(^|;\\s*)' + name + '=([^;]+)');
    const match = cookieHeader.match(regex);
    return match ? match[2] : null;
}

/**
 * 构建 Set-Cookie 头的值
 * @param {string} name - Cookie 名称
 * @param {string} token - 会话 Token
 * @param {number} maxAge - 最大存活时间（秒）
 * @param {boolean} secure - 是否添加 Secure 属性
 * @returns {string}
 */
function buildSessionCookie(name, token, maxAge, secure = false) {
    const parts = [
        `${name}=${token}`,
        `Path=/`,
        `HttpOnly`,
        `SameSite=Strict`,
        `Max-Age=${maxAge}`,
    ];
    if (secure) {
        parts.push('Secure');
    }
    return parts.join('; ');
}
