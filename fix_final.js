const fs = require('fs');

function applyTo(file) {
  let content = fs.readFileSync(file, 'utf-8');

  // Replace poll=300 -> poll=0
  content = content.replace(/--poll=300/g, '--poll=0');

  // Extract Submit ID injection (only needed in openai.ts but safe)
  if (file.includes('openai.ts')) {
    content = content.replace(
      /function extractResultUrl[\s\S]*?\n\}/,
      \`function extractSubmitId(stdout: string): string {
  try {
    const jsonStr = stdout.substring(stdout.indexOf('{'), stdout.lastIndexOf('}') + 1);
    const result = JSON.parse(jsonStr);
    if (result.submit_id) return result.submit_id;
    if (result.task_id) return result.task_id;
    if (result.data?.submit_id) return result.data.submit_id;
  } catch (e) {}

  const idMatch = stdout.match(/(?:submit_id|task_id|tid|id)["':\\s=]+([a-zA-Z0-9_\\-]+)/i);
  if (idMatch && idMatch[1]) return idMatch[1];

  const plainMatch = stdout.match(/\\b([a-fA-F0-9]{16})\\b/);
  if (plainMatch && plainMatch[1]) return plainMatch[1];

  throw new Error("Cannot find submit_id in CLI output.\\nRaw Output: " + stdout.substring(0, 500));
}\`
    );

    // Replace dispatch block for images
    content = content.replace(
      /let resultUrl = "";[\s\S]*?return res\.json\(\{ created: Math\.floor\(Date\.now\(\) \/ 1000\), data: \[\{ url: resultUrl \}\] \}\);/,
      \`let submitId = "";
    try {
      const { stdout } = await runJimengCommand(command, account.homeDir);
      submitId = extractSubmitId(stdout);
      await prisma.task.update({ where: { id: dbTask.id }, data: { status: 'PROCESSING', jimengSubmitId: submitId } });
    } catch (cmdErr: any) {
      await prisma.task.update({ where: { id: dbTask.id }, data: { status: 'FAILED', errorMsg: cmdErr.message } });
      await accountService.releaseAccount(account.id, 'ERROR');
      if (typeof files !== 'undefined') files.forEach(f => { if(fs.existsSync(f.path)) fs.unlinkSync(f.path); });
      return res.status(500).json({ error: { message: "Jimeng CLI failed: " + cmdErr.message } });
    }

    await accountService.releaseAccount(account.id, 'IDLE');
    if (typeof files !== 'undefined') files.forEach(f => { if(fs.existsSync(f.path)) fs.unlinkSync(f.path); });

    return res.json({ id: dbTask.id, status: "processing", submit_id: submitId });\`
    );

    // Replace dispatch block for videos
    content = content.replace(
      /let resultUrl = "";[\s\S]*?return res\.json\(\{ created: Math\.floor\(Date\.now\(\) \/ 1000\), data: \[\{ url: resultUrl \}\] \}\);/,
      \`let submitId = "";
    try {
      const { stdout } = await runJimengCommand(command, account.homeDir);
      submitId = extractSubmitId(stdout);
      await prisma.task.update({ where: { id: dbTask.id }, data: { status: 'PROCESSING', jimengSubmitId: submitId } });
    } catch (cmdErr: any) {
      await prisma.task.update({ where: { id: dbTask.id }, data: { status: 'FAILED', errorMsg: cmdErr.message } });
      await accountService.releaseAccount(account.id, 'ERROR');
      if (typeof allFiles !== 'undefined') allFiles.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
      return res.status(500).json({ error: { message: "Jimeng CLI failed: " + cmdErr.message } });
    }

    await accountService.releaseAccount(account.id, 'IDLE');
    if (typeof allFiles !== 'undefined') allFiles.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });

    return res.json({ id: dbTask.id, status: "processing", submit_id: submitId });\`
    );
  }

  if (file.includes('openai_media.ts')) {
    const mediaDispatchRegex = /let resultUrl = "";[\s\S]*?return res\.json\(\{[\s\S]*?created:[\s\S]*?data: \[\{ url: resultUrl \}\][\s\S]*?\}\);\s*\};/;
    const nextDispatchBlock = \`let submitId = "";
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
        const idMatch = stdout.match(/(?:submit_id|task_id|tid|id)["':\\\\s=]+([a-zA-Z0-9_\\\\-]+)/i);
        if (idMatch && idMatch[1]) submitId = idMatch[1];
        else {
          const plainMatch = stdout.match(/\\\\b([a-fA-F0-9]{16})\\\\b/);
          if (plainMatch && plainMatch[1]) submitId = plainMatch[1];
          else throw new Error("Cannot find submit_id in CLI output.\\\\nRaw: " + stdout.substring(0, 500));
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
};\`;
    content = content.replace(mediaDispatchRegex, nextDispatchBlock);
  }

  // Inject GET endpoint only ONCE, using apiKeyAuth instead of authenticate
  if (!content.includes("/tasks/:id") && file.includes('openai.ts')) {
     const getEndpoint = \`
// --- 异步查询任务进度 ---
router.get('/tasks/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { account: true, apiKey: true }
    });

    if (!task) return res.status(404).json({ error: { message: "Task not found" } });
    if (task.apiKeyId !== (req as any).apiUserId) return res.status(404).json({ error: { message: "Task not found" } });

    if (task.status === "SUCCESS") {
      return res.json({ id: task.id, status: "success", data: [{ url: task.resultUrl }] });
    }
    if (task.status === "FAILED") {
      return res.json({ id: task.id, status: "failed", error: task.errorMsg });
    }
    if (!task.jimengSubmitId || !task.account) {
      return res.json({ id: task.id, status: "processing" });
    }

    // Call query_result
    try {
      const command = \\\`dreamina query_result --submit_id=\\\${task.jimengSubmitId}\\\`;
      const { stdout } = await runJimengCommand(command, task.account.homeDir);

      let finalUrl = null;

      // Extract JSON state
      const jsonMatch = stdout.match(/\\{[\\s\\S]*\\}/);
      if (jsonMatch) {
         const state = JSON.parse(jsonMatch[0]);
         if (task.type.includes('image')) {
            finalUrl = state.result_json?.images?.[0]?.image_url || state.image_url;
         } else {
            finalUrl = state.result_json?.videos?.[0]?.video_url || state.video_url || state.result?.video_url;
         }
         // Detect explicit fail
         if (state.status === 'failed' || state.status === 2 || stdout.toLowerCase().includes('fail')) {
             await prisma.task.update({ where: { id: task.id }, data: { status: 'FAILED', errorMsg: stdout } });
             return res.json({ id: task.id, status: "failed", error: "Generation failed remotely: " + stdout.substring(0,100) });
         }
      }

      if (!finalUrl) {
         const rx = /https:\\/\\/[^\\s"'<>]+\\.(mp4|png|jpg|jpeg|webp)(?:\\?[^\\s"'<>]+)?/i;
         const match = stdout.match(rx);
         if (match) finalUrl = match[0];
      }

      if (finalUrl) {
         await prisma.task.update({ where: { id: task.id }, data: { status: 'SUCCESS', resultUrl: finalUrl } });
         return res.json({ id: task.id, status: "success", data: [{ url: finalUrl }] });
      } else {
         return res.json({ id: task.id, status: "processing" });
      }
    } catch (cmdErr: any) {
      // CLI might fail or rate limit, doesn't mean generation failed, just return processing
      return res.json({ id: task.id, status: "processing", message: "Polling..." });
    }

  } catch (err: any) {
    res.status(500).json({ error: { message: err.message } });
  }
});

export default router;
\`;
     content = content.replace(/export default router;/, getEndpoint);
  }

  fs.writeFileSync(file, content);
}

applyTo('src/routes/openai.ts');
applyTo('src/routes/openai_media.ts');
