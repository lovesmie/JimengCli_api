/**
 * @file openai.ts
 * @description 处理 OpenAI 标准的生图、生视频路由接口。包含复杂的视频流和多媒体帧校验逻辑，以及 ffmpeg 探测。
 * @author XiaoYue <43854695@qq.com>
 * @license MIT
 * @date 2026-04-17
 * 
 * [! 防屎山规范 !]
 * - 绝对不要在此文件写死任何 API KEY 或硬编码文件路径！
 * - 所有的多媒体时长、帧率校验规则集中在此文件的顶部常量中管理。
 * - 使用 ffprobe 进行实际的多媒体探测，不依赖文件后缀做武断判断。
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { accountService } from '../services/accountService';
import { runJimengCommand } from '../utils/cliRunner';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const router = Router();
const prisma = new PrismaClient();
const upload = multer({ dest: 'temp_uploads/' });
const execFileAsync = promisify(execFile);

const MB = 1024 * 1024;
const IMAGE_MAX_BYTES = 30 * MB;
const VIDEO_MAX_BYTES = 50 * MB;
const AUDIO_MAX_BYTES = 15 * MB;
const REQUEST_MAX_BYTES = 64 * MB;
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif', '.gif']);
const VIDEO_EXTS = new Set(['.mp4', '.mov']);
const AUDIO_EXTS = new Set(['.wav', '.mp3']);

type ValidationDetail = {
  field: string;
  file?: string;
  message: string;
};

const normalizeVideoModelVersion = (raw: string): string => {
  const model = (raw || '').trim();
  const map: Record<string, string> = {
    '3.0_fast': '3.0fast',
    '3.0_pro': '3.0pro',
    '3.5_pro': '3.5pro',
  };
  return map[model] || model;
};

const TEXT2VIDEO_MODELS = new Set([
  'seedance2.0',
  'seedance2.0fast',
  'seedance2.0_vip',
  'seedance2.0fast_vip',
]);

const IMAGE2VIDEO_MODELS = new Set([
  '3.0',
  '3.0fast',
  '3.0pro',
  '3.5pro',
  'seedance2.0',
  'seedance2.0fast',
  'seedance2.0_vip',
  'seedance2.0fast_vip',
]);

const FRAMES2VIDEO_MODELS = new Set([
  '3.0',
  '3.5pro',
  'seedance2.0',
  'seedance2.0fast',
  'seedance2.0_vip',
  'seedance2.0fast_vip',
]);

const MULTIMODAL_MODELS = new Set([
  'seedance2.0',
  'seedance2.0fast',
  'seedance2.0_vip',
  'seedance2.0fast_vip',
]);

type RefType = 'image' | 'video' | 'audio';

type RefOrderItem = {
  index: number;
  type: RefType;
  name?: string;
  size?: number;
  lastModified?: number;
};

type ProbeResult = {
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
};

const getExt = (fileName: string): string => {
  const idx = fileName.lastIndexOf('.');
  if (idx < 0) return '';
  return fileName.slice(idx).toLowerCase();
};

const parseFps = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  if (!value.includes('/')) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  const [a, b] = value.split('/').map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return undefined;
  return a / b;
};

let ffprobeAvailabilityChecked = false;
let ffprobeAvailable = false;

const ensureFfprobeAvailable = async (): Promise<boolean> => {
  if (ffprobeAvailabilityChecked) return ffprobeAvailable;
  ffprobeAvailabilityChecked = true;
  try {
    await execFileAsync('ffprobe', ['-version'], { windowsHide: true, timeout: 5000 });
    ffprobeAvailable = true;
  } catch {
    ffprobeAvailable = false;
  }
  return ffprobeAvailable;
};

const probeMedia = async (filePath: string): Promise<ProbeResult | null> => {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', filePath],
      { windowsHide: true, maxBuffer: 4 * MB, timeout: 10000 }
    );

    const parsed = JSON.parse(stdout || '{}');
    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    const videoStream = streams.find((s: any) => s.codec_type === 'video');
    const audioStream = streams.find((s: any) => s.codec_type === 'audio');

    const duration = Number(parsed.format?.duration);
    const streamDuration = Number(videoStream?.duration ?? audioStream?.duration);

    return {
      duration: Number.isFinite(duration) ? duration : (Number.isFinite(streamDuration) ? streamDuration : undefined),
      width: Number.isFinite(Number(videoStream?.width)) ? Number(videoStream.width) : undefined,
      height: Number.isFinite(Number(videoStream?.height)) ? Number(videoStream.height) : undefined,
      fps: parseFps(videoStream?.r_frame_rate),
    };
  } catch {
    return null;
  }
};

const validateSeedance2Inputs = async (
  orderedMedia: Array<{ type: RefType; file: Express.Multer.File; index: number }>
): Promise<ValidationDetail[]> => {
  const details: ValidationDetail[] = [];

  const totalBytes = orderedMedia.reduce((sum, item) => sum + item.file.size, 0);
  if (totalBytes > REQUEST_MAX_BYTES) {
    details.push({
      field: 'request',
      message: `请求体文件总大小超限：${(totalBytes / MB).toFixed(2)}MB，最大允许 64MB`,
    });
  }

  let videoDurationTotal = 0;
  let audioDurationTotal = 0;
  const hasVideoOrAudio = orderedMedia.some(item => item.type === 'video' || item.type === 'audio');
  const canProbe = hasVideoOrAudio ? await ensureFfprobeAvailable() : true;

  if (hasVideoOrAudio && !canProbe) {
    details.push({
      field: 'server',
      message: '服务器缺少 ffprobe，无法校验视频/音频时长、分辨率与帧率。请安装 ffmpeg/ffprobe 后重试。',
    });
    return details;
  }

  for (const item of orderedMedia) {
    const f = item.file;
    const ext = getExt(f.originalname);

    if (item.type === 'image') {
      if (!IMAGE_EXTS.has(ext)) {
        details.push({ field: 'image', file: f.originalname, message: '图片格式不支持，仅支持 jpeg/png/webp/bmp/tiff/gif' });
      }
      if (f.size > IMAGE_MAX_BYTES) {
        details.push({ field: 'image', file: f.originalname, message: `图片大小超限：${(f.size / MB).toFixed(2)}MB，最大 30MB` });
      }
      continue;
    }

    if (item.type === 'video') {
      if (!VIDEO_EXTS.has(ext)) {
        details.push({ field: 'video', file: f.originalname, message: '视频格式不支持，仅支持 mp4/mov' });
      }
      if (f.size > VIDEO_MAX_BYTES) {
        details.push({ field: 'video', file: f.originalname, message: `视频大小超限：${(f.size / MB).toFixed(2)}MB，最大 50MB` });
      }

      const probe = await probeMedia(f.path);
      if (!probe || !Number.isFinite(probe.duration as number) || !Number.isFinite(probe.width as number) || !Number.isFinite(probe.height as number)) {
        details.push({ field: 'video', file: f.originalname, message: '无法读取视频元信息（时长/分辨率），请检查文件是否损坏。' });
        continue;
      }

      const d = probe.duration as number;
      const w = probe.width as number;
      const h = probe.height as number;
      const ratio = w / h;
      const pixels = w * h;

      videoDurationTotal += d;

      if (d < 2 || d > 15) {
        details.push({ field: 'video', file: f.originalname, message: `视频时长需在 [2, 15] 秒，当前 ${d.toFixed(2)} 秒` });
      }
      if (ratio < 0.4 || ratio > 2.5) {
        details.push({ field: 'video', file: f.originalname, message: `视频宽高比需在 [0.4, 2.5]，当前 ${ratio.toFixed(3)}` });
      }
      if (w < 300 || w > 6000 || h < 300 || h > 6000) {
        details.push({ field: 'video', file: f.originalname, message: `视频宽高像素需在 [300, 6000]，当前 ${w}x${h}` });
      }
      if (pixels < 409600 || pixels > 2086876) {
        details.push({ field: 'video', file: f.originalname, message: `视频像素总量需在 [409600, 2086876]，当前 ${pixels}` });
      }
      if (Number.isFinite(probe.fps as number)) {
        const fps = probe.fps as number;
        if (fps < 24 || fps > 60) {
          details.push({ field: 'video', file: f.originalname, message: `视频帧率需在 [24, 60] FPS，当前 ${fps.toFixed(2)} FPS` });
        }
      }
      continue;
    }

    if (!AUDIO_EXTS.has(ext)) {
      details.push({ field: 'audio', file: f.originalname, message: '音频格式不支持，仅支持 wav/mp3' });
    }
    if (f.size > AUDIO_MAX_BYTES) {
      details.push({ field: 'audio', file: f.originalname, message: `音频大小超限：${(f.size / MB).toFixed(2)}MB，最大 15MB` });
    }

    const probe = await probeMedia(f.path);
    if (!probe || !Number.isFinite(probe.duration as number)) {
      details.push({ field: 'audio', file: f.originalname, message: '无法读取音频时长，请检查文件是否损坏。' });
      continue;
    }
    const d = probe.duration as number;
    audioDurationTotal += d;
    if (d < 2 || d > 15) {
      details.push({ field: 'audio', file: f.originalname, message: `音频时长需在 [2, 15] 秒，当前 ${d.toFixed(2)} 秒` });
    }
  }

  if (videoDurationTotal > 15) {
    details.push({ field: 'video', message: `所有视频总时长超限：${videoDurationTotal.toFixed(2)} 秒，最大 15 秒` });
  }
  if (audioDurationTotal > 15) {
    details.push({ field: 'audio', message: `所有音频总时长超限：${audioDurationTotal.toFixed(2)} 秒，最大 15 秒` });
  }

  return details;
};

const normalizeReferenceOrder = (raw: any): RefOrderItem[] => {
  if (!raw) return [];

  let parsed: any = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  const out: RefOrderItem[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    if (!['image', 'video', 'audio'].includes(item.type)) continue;

    const index = Number(item.index);
    if (!Number.isFinite(index)) continue;

    out.push({
      index,
      type: item.type as RefType,
      name: typeof item.name === 'string' ? item.name : undefined,
      size: Number.isFinite(Number(item.size)) ? Number(item.size) : undefined,
      lastModified: Number.isFinite(Number(item.lastModified)) ? Number(item.lastModified) : undefined,
    });
  }

  return out.sort((a, b) => a.index - b.index);
};

const buildOrderedMedia = (
  filesMap: { [fieldname: string]: Express.Multer.File[] },
  referenceOrder: RefOrderItem[]
): Array<{ type: RefType; file: Express.Multer.File; index: number }> => {
  const pools: Record<RefType, Express.Multer.File[]> = {
    image: [...(filesMap['image'] || [])],
    video: [...(filesMap['video'] || [])],
    audio: [...(filesMap['audio'] || [])],
  };

  const ordered: Array<{ type: RefType; file: Express.Multer.File; index: number }> = [];

  const consume = (ref: RefOrderItem): Express.Multer.File | null => {
    const pool = pools[ref.type];
    if (!pool.length) return null;

    let idx = -1;

    if (ref.name && ref.size !== undefined) {
      idx = pool.findIndex(f => f.originalname === ref.name && f.size === ref.size);
    }
    if (idx < 0 && ref.name) {
      idx = pool.findIndex(f => f.originalname === ref.name);
    }
    if (idx < 0) {
      idx = 0;
    }

    return pool.splice(idx, 1)[0] || null;
  };

  for (const ref of referenceOrder) {
    const file = consume(ref);
    if (file) {
      ordered.push({ type: ref.type, file, index: ref.index });
    }
  }

  for (const type of ['image', 'video', 'audio'] as RefType[]) {
    for (const file of pools[type]) {
      ordered.push({ type, file, index: Number.MAX_SAFE_INTEGER });
    }
  }

  return ordered;
};

const apiKeyAuth = async (req: Request, res: Response, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: { message: 'Missing Authorization header' } });
  const token = authHeader.split(' ')[1];
  const apiKey = await prisma.apiKey.findUnique({ where: { key: token, isActive: true as any } });
  if (!apiKey) return res.status(401).json({ error: { message: 'Invalid API Key' } });
  (req as any).apiUserId = apiKey.id;
  (req as any).apiBoundAccountId = apiKey.boundAccountId ?? null;
  next();
};

function extractSubmitId(stdout: string): string {
  try {
    const jsonStr = stdout.substring(stdout.indexOf('{'), stdout.lastIndexOf('}') + 1);
    const result = JSON.parse(jsonStr);
    if (result.submit_id) return result.submit_id;
    if (result.task_id) return result.task_id;
    if (result.data?.submit_id) return result.data.submit_id;
  } catch (e) {}

  const idMatch = stdout.match(/(?:submit_id|task_id|tid|id)["':\s=]+([a-zA-Z0-9_\-]+)/i);
  if (idMatch && idMatch[1]) return idMatch[1];

  const plainMatch = stdout.match(/\b([a-fA-F0-9]{16})\b/);
  if (plainMatch && plainMatch[1]) return plainMatch[1];

  throw new Error("Cannot find submit_id in CLI output.\nRaw Output: " + stdout.substring(0, 500));
}

router.post('/images/generations', apiKeyAuth, upload.array('images', 10), async (req: Request, res: Response) => {
  let account: any = null;
  try {
    const prompt = req.body.prompt;
    const model = req.body.model || '5.0'; // Default
    const resolution_type = req.body.resolution_type;
    const ratio = req.body.ratio; 

    const files = req.files as Express.Multer.File[];
    const hasImages = files && files.length > 0;

    let modelParam = `--model_version=${model}`;
    let resParam = resolution_type ? `--resolution_type=${resolution_type}` : '';
    let cliRatio = ratio ? ratio : '1:1';

    if (!prompt && !hasImages) {
      if (files) files.forEach(f => fs.unlinkSync(f.path));
      return res.status(400).json({ error: { message: "Either 'prompt' or an 'image' file is required." } });
    }

    account = await accountService.getIdleAccount((req as any).apiBoundAccountId);
    if (!account) {
      if (files) files.forEach(f => fs.unlinkSync(f.path));
      return res.status(503).json({ error: { message: 'All Dreamina accounts are busy or out of credits. Please try again later.' } });
    }

    let command = "";
    let dbTaskType = "";
    if (hasImages) {
      const imagePathsStr = files.map(f => `"${process.cwd()}/${f.path}"`).join(',');
      command = `dreamina image2image --images ${imagePathsStr} --prompt="${prompt || ''}" --ratio=${cliRatio} ${modelParam} ${resParam} --poll=0`;
      dbTaskType = 'image2image';
    } else {
      command = `dreamina text2image --prompt="${prompt}" --ratio=${cliRatio} ${modelParam} ${resParam} --poll=0`;
      dbTaskType = 'text2image';
    }
    
    console.log(`[Jimeng Dispatcher] Executing: ${command}`);

    let dbTask: any;
    try {
      dbTask = await prisma.task.create({
        data: { apiKeyId: (req as any).apiUserId, accountId: account.id, type: dbTaskType, model: model, prompt: prompt || '' }
      });
    } catch (dbErr: any) {
      await accountService.releaseAccount(account.id, 'IDLE');
      if (files) files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
      return res.status(500).json({ error: { message: 'DB error: ' + dbErr.message } });
    }

    let submitId = "";
    try {
      const { stdout } = await runJimengCommand(command, account.homeDir);
      submitId = extractSubmitId(stdout);
      await prisma.task.update({ where: { id: dbTask.id }, data: { status: 'PROCESSING', jimengSubmitId: submitId } });
    } catch (cmdErr: any) {
      await prisma.task.update({ where: { id: dbTask.id }, data: { status: 'FAILED', errorMsg: cmdErr.message } });
      const isNoVip = cmdErr.message.includes('高级会员') || cmdErr.message.includes('vip') || cmdErr.message.includes('VIP') || cmdErr.message.includes('member');
      await accountService.releaseAccount(account.id, isNoVip ? 'NO_VIP' : 'ERROR');
      if (files) files.forEach(f => fs.unlinkSync(f.path));
      return res.status(500).json({ error: { message: "Jimeng CLI failed: " + cmdErr.message } });
    }

    await accountService.releaseAccount(account.id, 'IDLE');
    if (files) files.forEach(f => fs.unlinkSync(f.path));

    return res.json({ id: dbTask.id, status: "processing", submit_id: submitId });

  } catch (err: any) {
    if (account) {
      try { await accountService.releaseAccount(account.id, 'IDLE'); } catch {}
    }
    if (req.files) (req.files as Express.Multer.File[]).forEach(f => fs.unlinkSync(f.path));
    res.status(500).json({ error: { message: err.message }});
  }
});

router.post('/videos/generations', apiKeyAuth, upload.fields([{ name: 'image', maxCount: 20 }, { name: 'audio', maxCount: 3 }, { name: 'video', maxCount: 3 }]), async (req: Request, res: Response) => {
  const allFiles: any[] = [];
  if (req.files) {
    const fMap = req.files as { [fieldname: string]: Express.Multer.File[] };
    if (fMap['image']) allFiles.push(...fMap['image']);
    if (fMap['audio']) allFiles.push(...fMap['audio']);
    if (fMap['video']) allFiles.push(...fMap['video']);
  }

  let account: any = null;
  try {
    const prompt = req.body.prompt;
    const model = normalizeVideoModelVersion(req.body.model || 'seedance2.0fast');
    const video_resolution = req.body.video_resolution;
    const d = (req.body.duration as string) || '5';
    const r = req.body.ratio || '16:9';

    const pParam = prompt ? `--prompt="${prompt}"` : '';
    const mParam = `--model_version=${model}`;
    const vrParam = video_resolution ? `--video_resolution=${video_resolution}` : '';

    const filesMap = (req.files as { [fieldname: string]: Express.Multer.File[] }) || {};
    const referenceOrder = normalizeReferenceOrder(req.body.reference_order);
    const orderedMedia = buildOrderedMedia(filesMap, referenceOrder);
    const imageMedia = orderedMedia.filter(item => item.type === 'image');
    const hasImages = imageMedia.length > 0;
    const hasAudio = orderedMedia.some(item => item.type === 'audio');
    const hasVideos = orderedMedia.some(item => item.type === 'video');
    const hasMedia = orderedMedia.length > 0;
    const imageCount = imageMedia.length;
    const useMultiModal = MULTIMODAL_MODELS.has(model) ? hasMedia : (hasVideos || hasAudio);
    const useFrames2Video = !useMultiModal && imageCount === 2 && FRAMES2VIDEO_MODELS.has(model);
    const useMultiFrame2Video = !useMultiModal && imageCount >= 2 && !useFrames2Video;
    const useImage2Video = !useMultiModal && imageCount === 1;
    const useText2Video = !hasMedia;

    if (useMultiModal && !MULTIMODAL_MODELS.has(model)) {
      allFiles.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
      return res.status(400).json({
        error: {
          message: `模型 ${model} 不支持 multimodal2video。多模态仅支持 seedance2.0 系列。`,
        }
      });
    }

    if (useImage2Video && !IMAGE2VIDEO_MODELS.has(model)) {
      allFiles.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
      return res.status(400).json({
        error: {
          message: `模型 ${model} 不在 image2video 支持列表中。`,
        }
      });
    }

    if (useFrames2Video && !FRAMES2VIDEO_MODELS.has(model)) {
      allFiles.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
      return res.status(400).json({
        error: {
          message: `模型 ${model} 不在 frames2video 支持列表中。`,
        }
      });
    }

    if (useText2Video && !TEXT2VIDEO_MODELS.has(model)) {
      return res.status(400).json({
        error: {
          message: `模型 ${model} 不支持 text2video。text2video 仅支持 seedance2.0 系列。`,
        }
      });
    }

    if (referenceOrder.length > 0) {
      console.log(`[Jimeng Dispatcher] reference_order received: ${JSON.stringify(referenceOrder)}`);
    }

    if (useMultiModal && model.includes('seedance2.0')) {
      const validationDetails = await validateSeedance2Inputs(orderedMedia);
      if (validationDetails.length > 0) {
        allFiles.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
        return res.status(400).json({
          error: {
            message: 'Seedance 2.0 输入校验失败',
            details: validationDetails,
          }
        });
      }
    }

    if (hasAudio && !hasImages && !hasVideos) {
      allFiles.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
      return res.status(400).json({
        error: {
          message: "Audio-only reference is not supported. Please upload at least one image or one video when using audio reference."
        }
      });
    }

    account = await accountService.getIdleAccount((req as any).apiBoundAccountId);
    if (!account) {
      allFiles.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
      return res.status(503).json({ error: { message: 'All Dreamina accounts busy' } });
    }

    let command = "";
    let dbTaskType = "";

    if (useMultiModal) {
      const mediaArgs = orderedMedia
        .map(item => {
          const mediaPath = `"${process.cwd()}/${item.file.path}"`;
          if (item.type === 'image') return `--image=${mediaPath}`;
          if (item.type === 'video') return `--video=${mediaPath}`;
          return `--audio=${mediaPath}`;
        })
        .join(' ');

      command = `dreamina multimodal2video ${mediaArgs} ${pParam} ${mParam} --duration=${d} --ratio=${r} ${vrParam} --poll=0`;
      dbTaskType = 'multimodal2video';
    } else if (useFrames2Video) {
      const firstImage = imageMedia[0].file;
      const lastImage = imageMedia[1].file;
      const firstPath = `"${process.cwd()}/${firstImage.path}"`;
      const lastPath = `"${process.cwd()}/${lastImage.path}"`;
      command = `dreamina frames2video --first=${firstPath} --last=${lastPath} ${pParam} ${mParam} --duration=${d} ${vrParam} --poll=0`;
      dbTaskType = 'frames2video';
    } else if (useMultiFrame2Video) {
      const imagePathCsv = imageMedia
        .map(item => `${process.cwd()}/${item.file.path}`)
        .join(',');
      if (imageCount === 2) {
        command = `dreamina multiframe2video --images ${imagePathCsv} ${pParam} --duration=${d} --poll=0`;
      } else {
        const transitionCount = imageCount - 1;
        const totalDuration = Number(d);
        const segment = Number.isFinite(totalDuration) && totalDuration > 0
          ? Math.max(0.5, Math.min(8, totalDuration / transitionCount))
          : 3;
        const transitionPromptArgs = prompt
          ? Array.from({ length: transitionCount }, () => `--transition-prompt="${prompt}"`).join(' ')
          : '';
        const transitionDurationArgs = Array.from({ length: transitionCount }, () => `--transition-duration=${segment.toFixed(2)}`).join(' ');
        command = `dreamina multiframe2video --images ${imagePathCsv} ${transitionPromptArgs} ${transitionDurationArgs} --poll=0`;
      }
      dbTaskType = 'multiframe2video';
    } else if (useImage2Video) {
      const firstImage = imageMedia[0].file;
      const imagePath = `"${process.cwd()}/${firstImage.path}"`;
      command = `dreamina image2video --image=${imagePath} --prompt="${prompt || ''}" ${mParam} --duration=${d} ${vrParam} --poll=0`;
      dbTaskType = 'image2video';
    } else {
      command = `dreamina text2video --prompt="${prompt}" --ratio=${r} ${mParam} --duration=${d} ${vrParam} --poll=0`;
      dbTaskType = 'text2video';
    }
    
    console.log(`[Jimeng Dispatcher] Executing: ${command}`);

    let dbTask: any;
    try {
      dbTask = await prisma.task.create({
        data: { apiKeyId: (req as any).apiUserId, accountId: account.id, type: dbTaskType, model: model, prompt: prompt || '' }
      });
    } catch (dbErr: any) {
      await accountService.releaseAccount(account.id, 'IDLE');
      allFiles.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
      return res.status(500).json({ error: { message: 'DB error: ' + dbErr.message } });
    }

    let submitId = "";
    try {
      const { stdout } = await runJimengCommand(command, account.homeDir);
      submitId = extractSubmitId(stdout);
      await prisma.task.update({ where: { id: dbTask.id }, data: { status: 'PROCESSING', jimengSubmitId: submitId } });
    } catch (cmdErr: any) {
      await prisma.task.update({ where: { id: dbTask.id }, data: { status: 'FAILED', errorMsg: cmdErr.message } });
      const isNoVip = cmdErr.message.includes('高级会员') || cmdErr.message.includes('vip') || cmdErr.message.includes('VIP') || cmdErr.message.includes('member');
      await accountService.releaseAccount(account.id, isNoVip ? 'NO_VIP' : 'ERROR');
      allFiles.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
      return res.status(500).json({ error: { message: "Jimeng CLI failed: " + cmdErr.message } });
    }

    await accountService.releaseAccount(account.id, 'IDLE');
    allFiles.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });

    return res.json({ id: dbTask.id, status: "processing", submit_id: submitId });

  } catch (err: any) {
    if (account) {
      try { await accountService.releaseAccount(account.id, 'IDLE'); } catch {}
    }
    allFiles.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
    res.status(500).json({ error: { message: err.message }});
  }
});

router.get('/tasks/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { account: true, apiKey: true }
    });

    if (!task) return res.status(404).json({ error: { message: "Task not found" } });
    if (task.apiKeyId !== (req as any).apiUserId) return res.status(404).json({ error: { message: "Task not found" } });

    // Database polling mode - purely return what's in DB
    if (task.status === "SUCCESS") {
      return res.json({ id: task.id, status: "success", data: [{ url: task.resultUrl }] });
    }
    if (task.status === "FAILED") {
      return res.json({ id: task.id, status: "failed", error: task.errorMsg || "Generation failed" });
    }
    
    // If it's PENDING or PROCESSING, just return processing. The daemon handles the CLI.
    // 如果有 pollErrorMsg，告知调用者我方网络异常（任务仍在火山排队，不代表失败）
    const response: any = { id: task.id, status: "processing" };
    if ((task as any).pollErrorMsg) {
      response.poll_warning = (task as any).pollErrorMsg;
    }
    return res.json(response);
  } catch (err: any) {
    console.error("Error checking task ID:", req.params.id, err);
    res.status(500).json({ error: { message: "Internal server error" } });
  }
});

export default router;
