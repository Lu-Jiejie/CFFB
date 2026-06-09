import { getDatabase } from '../../utils/databaseAdapter.js';
import { normalizeFolderPath } from '../../utils/pathNormalizer.js';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    const db = getDatabase(env);

    if (request.method === 'POST') {
        return await createFolder(db, request, corsHeaders);
    }

    if (request.method === 'DELETE') {
        return await deleteFolder(db, request, corsHeaders);
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

async function createFolder(db, request, corsHeaders) {
    try {
        const body = await request.json();
        let { path, createParents } = body;

        if (!path) {
            return new Response(JSON.stringify({
                success: false,
                code: 'MISSING_PATH',
                error: 'Missing required field: path'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 路径规范化
        path = normalizeFolderPath(path);

        if (!path) {
            return new Response(JSON.stringify({
                success: false,
                code: 'INVALID_PATH',
                error: 'Invalid folder path'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 检查是否已存在
        const folderKey = `folder:${path}`;
        const existing = await db.get(folderKey);
        if (existing !== null) {
            return new Response(JSON.stringify({
                success: false,
                code: 'FOLDER_EXISTS',
                error: 'Folder already exists',
                folder: { path }
            }), {
                status: 409,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 检查父文件夹是否存在
        const parentFolder = getParentFolder(path);
        if (parentFolder) {
            const parentKey = `folder:${parentFolder}`;
            const parentExists = await db.get(parentKey);

            if (!parentExists) {
                if (createParents) {
                    // 递归创建父文件夹
                    await createFolderRecursive(db, parentFolder);
                } else {
                    return new Response(JSON.stringify({
                        success: false,
                        code: 'PARENT_NOT_FOUND',
                        error: 'Parent folder does not exist',
                        parentFolder,
                        hint: 'Set createParents: true to create parent folders automatically'
                    }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            }
        }

        // 创建文件夹
        const folderName = path.split('/').filter(Boolean).pop();
        const metadata = {
            Type: 'folder',
            Name: folderName,
            Folder: parentFolder,
            TimeStamp: Date.now()
        };

        await db.put(folderKey, '', { metadata });

        return new Response(JSON.stringify({
            success: true,
            folder: {
                path,
                name: folderName,
                parentFolder,
                timeStamp: metadata.TimeStamp
            }
        }), {
            status: 201,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Create folder error:', error);
        return new Response(JSON.stringify({
            success: false,
            code: 'CREATE_FAILED',
            error: 'Failed to create folder',
            message: error.message
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

async function deleteFolder(db, request, corsHeaders) {
    try {
        const body = await request.json();
        let { path, recursive } = body;

        if (!path) {
            return new Response(JSON.stringify({
                success: false,
                code: 'MISSING_PATH',
                error: 'Missing required field: path'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        path = normalizeFolderPath(path);
        const folderKey = `folder:${path}`;

        // 检查文件夹是否存在
        const folderRecord = await db.get(folderKey, { type: 'json' });
        if (!folderRecord) {
            return new Response(JSON.stringify({
                success: false,
                code: 'FOLDER_NOT_FOUND',
                error: 'Folder not found'
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 检查是否为空
        if (!recursive) {
            // 检查子文件夹
            const subfolders = await db.list({ prefix: `folder:${path}` });
            const hasSubfolders = subfolders.keys.some(key => key.name !== folderKey);

            // 检查文件
            const files = await db.list({ prefix: path });
            const hasFiles = files.keys.some(key => !key.name.startsWith('folder:'));

            if (hasSubfolders || hasFiles) {
                return new Response(JSON.stringify({
                    success: false,
                    code: 'FOLDER_NOT_EMPTY',
                    error: 'Folder is not empty',
                    hint: 'Set recursive: true to delete non-empty folders'
                }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
        }

        // 删除文件夹标记
        await db.delete(folderKey);

        // 递归删除
        if (recursive) {
            // 删除所有子文件夹
            const subfolders = await db.list({ prefix: `folder:${path}` });
            for (const key of subfolders.keys) {
                await db.delete(key.name);
            }

            // 删除所有文件
            const files = await db.list({ prefix: path });
            for (const key of files.keys) {
                if (!key.name.startsWith('folder:')) {
                    await db.delete(key.name);
                }
            }
        }

        return new Response(JSON.stringify({
            success: true,
            message: 'Folder deleted successfully',
            deletedPath: path
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Delete folder error:', error);
        return new Response(JSON.stringify({
            success: false,
            code: 'DELETE_FAILED',
            error: 'Failed to delete folder',
            message: error.message
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

// 辅助函数
function getParentFolder(path) {
    if (!path || path === '/') return '';

    const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
    const lastSlash = normalized.lastIndexOf('/');

    if (lastSlash === -1) return '';
    return normalized.substring(0, lastSlash + 1);
}

async function createFolderRecursive(db, path) {
    if (!path) return;

    const folderKey = `folder:${path}`;
    const existing = await db.get(folderKey);
    if (existing !== null) return;

    // 递归创建父文件夹
    const parentFolder = getParentFolder(path);
    if (parentFolder) {
        await createFolderRecursive(db, parentFolder);
    }

    // 创建当前文件夹
    const folderName = path.split('/').filter(Boolean).pop();
    const metadata = {
        Type: 'folder',
        Name: folderName,
        Folder: parentFolder,
        TimeStamp: Date.now()
    };

    await db.put(folderKey, '', { metadata });
}
