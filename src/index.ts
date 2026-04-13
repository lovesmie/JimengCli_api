import { pollingDaemon } from './services/pollingDaemon';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import openaiRoutes from './routes/openai';
import openaiMediaRoutes from './routes/openai_media';
import adminRoutes from './routes/admin';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 对外提供标准 OpenAI 协议生图和即梦的生视频
app.use('/v1', openaiRoutes);
app.use('/v1', openaiMediaRoutes);

// 对内提供管理 API
app.use('/admin', adminRoutes);

// 简单心跳路由
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

pollingDaemon.start();

app.listen(PORT, () => {
  console.log(`[🚀] Jimeng OpenAI Dispatcher Server running on http://localhost:${PORT}`);
  console.log(`[🔑] Admin Endpoints: http://localhost:${PORT}/admin/*`);
  console.log(`[🤖] OpenAI Endpoints: http://localhost:${PORT}/v1/*`);
});
