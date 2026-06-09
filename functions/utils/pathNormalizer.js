/**
 * 规范化文件夹路径
 * @param {string} path - 用户输入的路径
 * @returns {string} 规范化后的路径
 *
 * 规则：
 * 1. 空/null/undefined → ""
 * 2. 去除前后空格
 * 3. 反斜杠转正斜杠
 * 4. 去除 .. 路径穿越
 * 5. 去除多个连续斜杠
 * 6. 去除前置斜杠
 * 7. 确保后置斜杠（非空时）
 *
 * 示例：
 * - "" → ""
 * - null/undefined → ""
 * - "/" → ""
 * - "photos" → "photos/"
 * - "photos/" → "photos/"
 * - "/photos" → "photos/"
 * - "photos//2024" → "photos/2024/"
 * - "photos/../hack" → "photos/_/hack/"
 * - "photos\2024" → "photos/2024/"
 */
export function normalizeFolderPath(path) {
    if (!path || path === null || path === undefined) return '';

    const normalized = String(path).trim()
        .replace(/\\/g, '/')           // 反斜杠 → 正斜杠
        .replace(/\.\./g, '_')         // 防止路径穿越
        .replace(/\/+/g, '/')          // 多个斜杠 → 单个
        .replace(/^\/+/, '')           // 去除前置斜杠
        .replace(/\/+$/, '');          // 去除后置斜杠

    return normalized ? normalized + '/' : '';
}
