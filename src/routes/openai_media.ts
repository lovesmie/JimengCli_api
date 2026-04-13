import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { accountService } from '../services/accountService';
import { runJimengCommand } from '../utils/cliRunner';
import { saveTempFile, cleanupTempFile } from '../utils/fileHandler';
import multer from 'multer';
import fs from 'fs';

const router = Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const apiKeyAuth = async (req: Request, res: Response, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: { message: 'Missing Authorization header' } });
  const token = authHeader.split(' ')[1];
  const apiKey = await prisma.apiKey.findUnique({ where: { key: token, isActive: true as any } });
  if (!apiKey) return res.status(401).json({ error: { message: 'Invalid API Key' } });
  (req as any).apiUserId = apiKey.id;
  next();
};

const dispatchJimengTask = async (
  req: Request, 
  res: Response, 
  type: 'text2image' | 'text2video' | 'image2image' | 'image2video',
  commandBuilder: (tempFilePath: string | null) => string,
  tempFilePath: string | null = null
) => {
    const account = await accountService.getIdleAccount();
    if (!account) {
      if (tempFilePath) cleanupTempFile(tempFilePath);
      return res.status(503).json({ error: { message: 'All Dreamina accounts are busy or out of credits. Please try again later.' } });
    }

    const command = commandBuilder(tempFilePath);
    console.log(`[Jimeng Dispatcher] Account: ${account.name} -> Executing: ${command}`);
    
    const dbTask = await prisma.task.create({
      data: {
        apiKeyId: (req as any).apiUserId,
        accountId: account.id,
        type,
        prompt: req.body.prompt || req.body.messages?.[0]?.content || "Generating from image",
      }
    });

    let submitId = "";
    try {
      const { stdout } = await runJimengCommand(command, account.homeDir);
      
      try {
        const jsonStr = stdout.substring(stdout.indexOf('{'), stdout.lastIndexOf('}') + 1);
        const result = JSON.parse(jsonStr);
        if (result.submit_id) submitId = result.submit_id;
        else if (result.task_id) submitId = result.task_id;
        else if (result.data?.submit_id) submitId = result.data.submit_id;
      } catch (parseErr) {}

      if (!submitId) {
        const idMatch = stdout.match(/(?:submit_id|task_id|tid|id)["':\s=]+([a-zA-Z0-9_\-]+)/i);
        if (idMatch && idMatch[1]) submitId = idMatch[1];
        else {
           const plainMatch = stdout.match(/\b([a-fA-F0-9]{16})\b/);
           if (plainMatch && plainMatch[1]) submitId = plainMatch[1];
           else throw new Error("Cannot find submit_id in CLI output.\nRaw: " + stdout.substring(0, 500));
        }
      }

      await prisma.task.update({
        where: { id: dbTask.id },
        data: { status: 'PROCESSING', jimengSubmitId: submitId }
      });
      
    } catch (cmdErr: any) {
      await prisma.task.update({
         where: { id: dbTask.id },
         data: { status: 'FAILED', errorMsg: cmdErr.message }
      });
      await accountService.releaseAccount(account.id, 'ERROR');
      if (tempFilePath) cleanupTempFile(tempFilePath);
      return res.status(500).json({ error: { message: "Jimeng CLI failed: " + cmdErr.message } });
    }

    await accountService.releaseAccount(account.id, 'IDLE');
    if (tempFilePath) cleanupTempFile(tempFilePath);

    return res.json({ id: dbTask.id, status: "processing", submit_id: submitId });
};

router.post('/jimeng/image2video', apiKeyAuth, upload.single('image'), async (req: Request, res: Response) => {
  try {
    const prompt = req.body.prompt;
    if (!prompt) return res.status(400).json({ error: { message: "prompt is required" } });
    
    let tempFilePath: string | null = null;
    if (req.file) {
      tempFilePath = await saveTempFile(req.file.buffer, '.png');
    } 
    else if (req.body.image_url) {
      tempFilePath = await saveTempFile(req.body.image_url);
    }
    
    if (!tempFilePath) return res.status(400).json({ error: { message: "An input image is required for image2video" } });

    const cmdBuilder = (localPath: string | null) => 
        `dreamina image2video --image "${localPath}" --prompt="${prompt}" --duration=5 --poll=0`;

    return await dispatchJimengTask(req, res, 'image2video', cmdBuilder, tempFilePath);

  } catch (err: any) {
    return res.status(500).json({ error: { message: err.message } });
  }
});

export default router;
