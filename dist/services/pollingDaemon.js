"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollingDaemon = void 0;
const client_1 = require("@prisma/client");
const cliRunner_1 = require("../utils/cliRunner");
const prisma = new client_1.PrismaClient();
let isPolling = false;
// 记录每个任务的连续失败次数（内存级，重启清零）
const taskErrorCount = new Map();
const MAX_POLL_ERRORS = 10; // 连续失败 10 次（约 100 秒）后自动标记 FAILED
exports.pollingDaemon = {
    start() {
        console.log('[🔄] Polling Daemon started. Monitoring PROCESSING tasks every 10 seconds...');
        setInterval(async () => {
            if (isPolling)
                return;
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
                    if (!task.jimengSubmitId)
                        continue;
                    try {
                        const homeDir = task.account?.homeDir || process.cwd();
                        const command = `dreamina query_result --submit_id=${task.jimengSubmitId}`;
                        console.log(`[Daemon] Polling Task ${task.id} (Submit ID: ${task.jimengSubmitId})`);
                        const { stdout } = await (0, cliRunner_1.runJimengCommand)(command, homeDir);
                        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            const state = JSON.parse(jsonMatch[0]);
                            let finalUrl = null;
                            if (task.type === 'image2image' || task.type === 'text2image' || task.type === 'image_upscale') {
                                finalUrl = state.result_json?.images?.[0]?.image_url || state.image_url;
                            }
                            else {
                                finalUrl = state.result_json?.videos?.[0]?.video_url || state.video_url || state.result?.video_url;
                            }
                            if (finalUrl) {
                                console.log(`[Daemon] Task ${task.id} SUCCESS! URL: ${finalUrl}`);
                                await prisma.task.update({
                                    where: { id: task.id },
                                    data: { status: 'SUCCESS', resultUrl: finalUrl }
                                });
                                taskErrorCount.delete(task.id);
                            }
                            else if (state.status === 'failed' || state.gen_status === 'failed' || state.gen_status === 'fail' || state.status === 2 || stdout.toLowerCase().includes('fail')) {
                                console.log(`[Daemon] Task ${task.id} FAILED.`);
                                await prisma.task.update({
                                    where: { id: task.id },
                                    data: { status: 'FAILED', errorMsg: stdout.substring(0, 200) }
                                });
                                taskErrorCount.delete(task.id);
                            }
                        }
                    }
                    catch (taskErr) {
                        const errMsg = taskErr?.message || String(taskErr);
                        const count = (taskErrorCount.get(task.id) || 0) + 1;
                        taskErrorCount.set(task.id, count);
                        console.error(`[Daemon] Error checking task ${task.id} (${count}/${MAX_POLL_ERRORS}):`, errMsg);
                        if (count >= MAX_POLL_ERRORS) {
                            console.error(`[Daemon] Task ${task.id} exceeded max retries. Marking as FAILED.`);
                            await prisma.task.update({
                                where: { id: task.id },
                                data: { status: 'FAILED', errorMsg: `轮询连续失败 ${MAX_POLL_ERRORS} 次，最后错误: ${errMsg.substring(0, 300)}` }
                            });
                            taskErrorCount.delete(task.id);
                        }
                    }
                }
            }
            catch (err) {
                console.error('[Daemon] Error in polling loop:', err);
            }
            finally {
                isPolling = false;
            }
        }, 10000);
    }
};
//# sourceMappingURL=pollingDaemon.js.map