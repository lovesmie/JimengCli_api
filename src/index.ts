import { pollingDaemon } from './services/pollingDaemon';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import openaiRoutes from './routes/openai';
import openaiMediaRoutes from './routes/openai_media';
import adminRoutes from './routes/admin';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: (origin, callback) => {
    // file:// 页面的 origin 是 undefined 或字符串 "null"，统一返回 * 放行
    if (!origin || origin === 'null') {
      callback(null, '*');
    } else {
      callback(null, origin);
    }
  },
}));
app.use(express.json());

// 托管根目录静态文件（test_client.html 等）
app.use(express.static(path.resolve(__dirname, '..')));

// 托管前端构建产物（frontend/dist）
const frontendDist = path.resolve(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
}

// 对外提供标准 OpenAI 协议生图和即梦的生视频
app.use('/v1', openaiRoutes);
app.use('/v1', openaiMediaRoutes);

// 对内提供管理 API
app.use('/admin', adminRoutes);

// 简单心跳路由
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// 前端 SPA fallback：所有未匹配路由返回 index.html
if (fs.existsSync(frontendDist)) {
  app.get('/*splat', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

pollingDaemon.start();

app.listen(PORT, () => {
  console.log(`[🚀] Jimeng OpenAI Dispatcher Server running on http://localhost:${PORT}`);
  console.log(`[🔑] Admin Endpoints: http://localhost:${PORT}/admin/*`);
  console.log(`[🤖] OpenAI Endpoints: http://localhost:${PORT}/v1/*`);
});
