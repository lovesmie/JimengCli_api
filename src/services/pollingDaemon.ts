import { PrismaClient } from '@prisma/client';
import { runJimengCommand } from '../utils/cliRunner';

const prisma = new PrismaClient();

let isPolling = false;

export const pollingDaemon = {
  start() {
    console.log('[🔄] Polling Daemon started. Monitoring PROCESSING tasks every 10 seconds...');
    
    setInterval(async () => {
      if (isPolling) return;
      isPolling = true;
      
      try {
        const tasks = await prisma.task.findMany({
          where: {
            status: 'PROCESSING',
            jimengSubmitId: { not: null }
          },
          include: {
            account: true 
          }
        });
        
        for (const task of tasks) {
          if (!task.jimengSubmitId) continue;
          
          try {
            const homeDir = (task as any).account?.homeDir || process.cwd(); 
            const command = `dreamina query_result --submit_id=${task.jimengSubmitId}`;
            console.log(`[Daemon] Polling Task ${task.id} (Submit ID: ${task.jimengSubmitId})`);
            
            const { stdout } = await runJimengCommand(command, homeDir);
            
            const jsonMatch = stdout.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const state = JSON.parse(jsonMatch[0]);
              let finalUrl = null;
              
              if (task.type === 'image2image' || task.type === 'text2image' || task.type === 'image_upscale') {
                finalUrl = state.result_json?.images?.[0]?.image_url || state.image_url;
              } else {
                finalUrl = state.result_json?.videos?.[0]?.video_url || state.video_url || state.result?.video_url;
              }
              
              if (finalUrl) {
                console.log(`[Daemon] Task ${task.id} SUCCESS! URL: ${finalUrl}`);
                await prisma.task.update({
                  where: { id: task.id },
                  data: { status: 'SUCCESS', resultUrl: finalUrl }
                });
              } else if (state.status === 'failed' || state.gen_status === 'failed' || state.gen_status === 'fail' || state.status === 2 || stdout.toLowerCase().includes('fail')) {
                console.log(`[Daemon] Task ${task.id} FAILED.`);
                await prisma.task.update({
                  where: { id: task.id },
                  data: { status: 'FAILED', errorMsg: stdout.substring(0, 200) }
                });
              }
            }
          } catch (taskErr) {
            console.error(`[Daemon] Error checking task ${task.id}:`, taskErr);
          }
        }
      } catch (err) {
        console.error('[Daemon] Error in polling loop:', err);
      } finally {
        isPolling = false;
      }
    }, 10000); 
  }
};
