"use strict";
/**
 * @file index.ts
 * @description Jimeng CLI API Wrapper - 核心入口点 (HTTP Dispatcher)。
 *              同时负责托管前端 SPA 产物，和管理不同的业务路由层。
 * @author XiaoYue <43854695@qq.com>
 * @license MIT
 * @date 2026-04-17
 *
 * [! 防屎山规范 !]
 * - 坚持中间件单一职责。
 * - 错误处理在底部统一拦截，避免抛出给前端导致页面崩溃。
 * - 前后端分离原则，所有 API 开头必须为 /v1 或 /admin。
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pollingDaemon_1 = require("./services/pollingDaemon");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const openai_1 = __importDefault(require("./routes/openai"));
const openai_media_1 = __importDefault(require("./routes/openai_media"));
const admin_1 = __importDefault(require("./routes/admin"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // file:// 页面的 origin 是 undefined 或字符串 "null"，统一返回 * 放行
        if (!origin || origin === 'null') {
            callback(null, '*');
        }
        else {
            callback(null, origin);
        }
    },
}));
app.use(express_1.default.json());
// 托管根目录静态文件（test_client.html 等）
app.use(express_1.default.static(path_1.default.resolve(__dirname, '..')));
// 托管前端构建产物（frontend/dist）
const frontendDist = path_1.default.resolve(__dirname, '../frontend/dist');
if (fs_1.default.existsSync(frontendDist)) {
    app.use(express_1.default.static(frontendDist));
}
// 对外提供标准 OpenAI 协议生图和即梦的生视频
app.use('/v1', openai_1.default);
app.use('/v1', openai_media_1.default);
// 对内提供管理 API
app.use('/admin', admin_1.default);
// API 错误统一返回 JSON，避免前端解析到 HTML 错页
app.use((err, req, res, next) => {
    if (!err) {
        return next();
    }
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal server error';
    if (req.path.startsWith('/v1') || req.path.startsWith('/admin')) {
        return res.status(status).json({ error: { message } });
    }
    return res.status(status).send(message);
});
// 简单心跳路由
app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0' });
});
// 前端 SPA fallback：所有未匹配路由返回 index.html
if (fs_1.default.existsSync(frontendDist)) {
    app.get('/*splat', (req, res) => {
        res.sendFile(path_1.default.join(frontendDist, 'index.html'));
    });
}
pollingDaemon_1.pollingDaemon.start();
app.listen(PORT, () => {
    console.log(`[🚀] Jimeng OpenAI Dispatcher Server running on http://localhost:${PORT}`);
    console.log(`[�] Admin Dashboard: http://localhost:${PORT}`);
    console.log(`[🤖] OpenAI Base URL: http://localhost:${PORT}/v1`);
});
//# sourceMappingURL=index.js.map