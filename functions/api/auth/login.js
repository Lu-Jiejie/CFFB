import { fetchSecurityConfig } from "../../utils/sysConfig.js";
import { verifyPassword, rehashIfNeeded } from "../../utils/auth/passwordHash.js";
import { createSession } from "../../utils/auth/sessionManager.js";
import { getDatabase } from "../../utils/databaseAdapter.js";

/**
 * 统一登录入口（单用户单角色）
 * 接收 { username?, password }，校验通过即创建会话，登录后拥有最高权限。
 */
export async function onRequestPost(context) {
    const { request, env } = context;

    const body = await request.json();
    const username = body.username ?? '';
    const password = body.password ?? '';

    // 读取安全设置
    const securityConfig = await fetchSecurityConfig(env);
    const rightUsername = securityConfig.auth.admin.adminUsername;
    const rightPassword = securityConfig.auth.admin.adminPassword;

    const usernameConfigured = !!(rightUsername && rightUsername.trim());
    const passwordConfigured = !!(rightPassword && rightPassword.trim());

    // Fail-closed：未配置任何凭据时拒绝登录，需先完成初始化
    if (!usernameConfigured && !passwordConfigured) {
        return new Response(JSON.stringify({ error: 'Not initialized' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 校验用户名（若已配置）
    if (usernameConfigured && username !== rightUsername) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 校验密码（若已配置）
    if (passwordConfigured) {
        const passwordMatch = await verifyPassword(password, rightPassword);
        if (!passwordMatch) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // 登录成功后，自动升级旧版哈希为 PBKDF2
        await rehashIfNeeded(getDatabase(env), password, rightPassword, 'auth.admin.adminPassword');
    }

    // 创建会话并通过 HttpOnly Cookie 返回
    const { cookie } = await createSession(env, rightUsername || '');

    return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': cookie,
        },
    });
}
