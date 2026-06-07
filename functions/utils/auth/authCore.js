/**
 * 统一认证核心（单用户单角色版）
 * 登录即拥有最高权限：有有效会话或有效 API Token 即放行，否则拒绝。
 */

import { fetchSecurityConfig } from '../sysConfig.js';
import { validateApiToken } from './tokenValidator.js';
import { getDatabase } from '../databaseAdapter.js';
import { validateSession } from './sessionManager.js';

const AUTHORIZED = { authorized: true };
const UNAUTHORIZED = { authorized: false };

/**
 * 是否已配置登录凭据（用户名或密码任一已设置）
 * @param {Object} env - 环境变量
 * @returns {Promise<boolean>}
 */
export async function isAuthConfigured(env) {
    const securityConfig = await fetchSecurityConfig(env);
    const username = securityConfig.auth?.admin?.adminUsername;
    const password = securityConfig.auth?.admin?.adminPassword;
    return !!(username && username.trim()) || !!(password && password.trim());
}

/**
 * 统一认证函数
 *
 * 判定逻辑：API Token 有效 → 放行；有效会话 → 放行；否则拒绝。
 * 未配置任何凭据时，fail-closed：拒绝（需先完成初始化设置凭据）。
 *
 * @param {Object} options
 * @param {Object} options.env - 环境变量
 * @param {Request} options.request - 请求对象
 * @param {string|null} [options.requiredPermission] - API Token 所需权限
 * @returns {Promise<{authorized: boolean}>}
 */
export async function authenticate({ env, request, requiredPermission = null }) {
    const db = getDatabase(env);

    // API Token（程序化访问入口）
    const tokenResult = await validateApiToken(request, db, requiredPermission);
    if (tokenResult.valid) {
        return AUTHORIZED;
    }

    // 会话
    const session = await validateSession(env, request);
    if (session.valid) {
        return AUTHORIZED;
    }

    return UNAUTHORIZED;
}
