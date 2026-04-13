const fs = require('fs');

const file = 'src/routes/openai.ts';
let code = fs.readFileSync(file, 'utf8');

const regex = /router\.get\('\/tasks\/:id', apiKeyAuth, async \(req: Request, res: Response\) => \{[\s\S]*?\}\);\n\nexport default router;/;

const replacement = `router.get('/tasks/:id', apiKeyAuth, async (req: Request, res: Response) => {
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

export default router;`;

if (regex.test(code)) {
  code = code.replace(regex, replacement);
  fs.writeFileSync(file, code);
  console.log("Patched openai.ts GET /tasks/:id successfully.");
} else {
  console.log("Could not find the get route block to replace.");
}
