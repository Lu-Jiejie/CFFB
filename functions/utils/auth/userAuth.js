/**
 * 用户端认证工具（单用户单角色版）
 * 统一走 authenticate：登录即放行
 */

import { authenticate } from './authCore.js';

/**
 * 认证检查
 * @param {Object} env - 环境变量
 * @param {Request} request - 请求对象
 * @param {string|null} requiredPermission - 如果提供，则进行 Token 权限验证
 * @return {Promise<boolean>} 返回是否认证通过
 */
export async function userAuthCheck(env, request, requiredPermission = null) {
    const result = await authenticate({ env, request, requiredPermission });
    return result.authorized;
}

export function UnauthorizedResponse(reason) {
    return new Response(reason, {
        status: 401,
        statusText: "Unauthorized",
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            "Content-Type": "text/plain;charset=UTF-8",
            "Cache-Control": "no-store",
            "Content-Length": reason.length,
        },
    });
}
