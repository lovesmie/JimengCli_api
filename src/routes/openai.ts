import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { accountService } from '../services/accountService';
import { runJimengCommand } from '../utils/cliRunner';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import fs from 'fs';

const router = Router();
const prisma = new PrismaClient();
const upload = multer({ dest: 'temp_uploads/' });

const apiKeyAuth = async (req: Request, res: Response, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: { message: 'Missing Authorization header' } });
  const token = authHeader.split(' ')[1];
  const apiKey = await prisma.apiKey.findUnique({ where: { key: token, isActive: true as any } });
  if (!apiKey) return res.status(401).json({ error: { message: 'Invalid API Key' } });
  (req as any).apiUserId = apiKey.id;
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

    const account = await accountService.getIdleAccount();
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
    
    const dbTask = await prisma.task.create({
      data: { apiKeyId: (req as any).apiUserId, accountId: account.id, type: dbTaskType, prompt: prompt || '' }
    });

    let submitId = "";
    try {
      const { stdout } = await runJimengCommand(command, account.homeDir);
      submitId = extractSubmitId(stdout);
      await prisma.task.update({ where: { id: dbTask.id }, data: { status: 'PROCESSING', jimengSubmitId: submitId } });
    } catch (cmdErr: any) {
      await prisma.task.update({ where: { id: dbTask.id }, data: { status: 'FAILED', errorMsg: cmdErr.message } });
      await accountService.releaseAccount(account.id, 'ERROR');
      if (files) files.forEach(f => fs.unlinkSync(f.path));
      return res.status(500).json({ error: { message: "Jimeng CLI failed: " + cmdErr.message } });
    }

    await accountService.releaseAccount(account.id, 'IDLE');
    if (files) files.forEach(f => fs.unlinkSync(f.path));

    return res.json({ id: dbTask.id, status: "processing", submit_id: submitId });

  } catch (err: any) {
    if (req.files) (req.files as Express.Multer.File[]).forEach(f => fs.unlinkSync(f.path));
    res.status(500).json({ error: { message: err.message }});
  }
});

router.post('/videos/generations', apiKeyAuth, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), async (req: Request, res: Response) => {
  const allFiles: any[] = [];
  if (req.files) {
    const fMap = req.files as { [fieldname: string]: Express.Multer.File[] };
    if (fMap['image']) allFiles.push(...fMap['image']);
    if (fMap['audio']) allFiles.push(...fMap['audio']);
  }

  try {
    const prompt = req.body.prompt;
    const model = req.body.model || 'seedance2.0fast';
    const video_resolution = req.body.video_resolution;
    const d = (req.body.duration as string) || '5';
    const r = req.body.ratio || '16:9';

    const pParam = prompt ? `--prompt="${prompt}"` : '';
    const mParam = `--model_version=${model}`;
    const vrParam = video_resolution ? `--video_resolution=${video_resolution}` : '';

    const imageFiles = req.files && (req.files as any)['image'];
    const audioFiles = req.files && (req.files as any)['audio'];
    const hasImages = imageFiles && imageFiles.length > 0;
    const hasAudio = audioFiles && audioFiles.length > 0;

    const account = await accountService.getIdleAccount();
    if (!account) {
      allFiles.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
      return res.status(503).json({ error: { message: 'All Dreamina accounts busy' } });
    }

    let command = "";
    let dbTaskType = "";

    if (hasImages && hasAudio) {
      const imgPath = `"${process.cwd()}/${imageFiles[0].path}"`;
      const audPath = `"${process.cwd()}/${audioFiles[0].path}"`;
      const mediaArgs = `--image=${imgPath} --audio=${audPath}`;
      command = `dreamina multimodal2video ${mediaArgs} ${pParam} ${mParam} --duration=${d} --ratio=${r} ${vrParam} --poll=0`;
      dbTaskType = 'multimodal2video';
    } else if (hasImages) {
      const imagePath = `"${process.cwd()}/${imageFiles[0].path}"`;
      command = `dreamina image2video --image=${imagePath} --prompt="${prompt || ''}" ${mParam} --duration=${d} ${vrParam} --poll=0`;
      dbTaskType = 'image2video';
    } else {
      command = `dreamina text2video --prompt="${prompt}" --ratio=${r} ${mParam} --duration=${d} ${vrParam} --poll=0`;
      dbTaskType = 'text2video';
    }
    
    console.log(`[Jimeng Dispatcher] Executing: ${command}`);
    
    const dbTask = await prisma.task.create({
      data: { apiKeyId: (req as any).apiUserId, accountId: account.id, type: dbTaskType, prompt: prompt || '' }
    });

    let submitId = "";
    try {
      const { stdout } = await runJimengCommand(command, account.homeDir);
      submitId = extractSubmitId(stdout);
      await prisma.task.update({ where: { id: dbTask.id }, data: { status: 'PROCESSING', jimengSubmitId: submitId } });
    } catch (cmdErr: any) {
      await prisma.task.update({ where: { id: dbTask.id }, data: { status: 'FAILED', errorMsg: cmdErr.message } });
      await accountService.releaseAccount(account.id, 'ERROR');
      allFiles.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
      return res.status(500).json({ error: { message: "Jimeng CLI failed: " + cmdErr.message } });
    }

    await accountService.releaseAccount(account.id, 'IDLE');
    allFiles.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });

    return res.json({ id: dbTask.id, status: "processing", submit_id: submitId });

  } catch (err: any) {
    allFiles.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
    res.status(500).json({ error: { message: err.message }});
  }
});

router.get('/tasks/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
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
    return res.json({ id: task.id, status: "processing" });
  } catch (err: any) {
    console.error("Error checking task ID:", req.params.id, err);
    res.status(500).json({ error: { message: "Internal server error" } });
  }
});

export default router;
