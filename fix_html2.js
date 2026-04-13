const fs = require('fs');
let html = fs.readFileSync('test_client.html', 'utf8');

const targetStr = `const url = resJson.data?.[0]?.url;
          if (!url) throw new Error("No payload URL received");`;

const replacement = `let url = null;
          if (resJson.status === 'processing' && resJson.id) {
             const taskId = resJson.id;
             logDebug(\`[INFO] 任务已挂起后台。每 5 秒自动轮询系统缓存... (ID: \${taskId})\`);
             
             let pollAttempts = 0;
             while (true) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                pollAttempts++;
                logDebug(\`[POLL \${pollAttempts}] \${base}/tasks/\${taskId}\`);
                
                const pollRes = await fetch(\`\${base}/tasks/\${taskId}\`, {
                   headers: { 'Authorization': \`Bearer \${config.value.apiKey}\` }
                });
                const pollData = await pollRes.json();
                
                if (pollData.status === 'success' && pollData.data) {
                   url = pollData.data[0].url;
                   break;
                } else if (pollData.status === 'failed') {
                   throw new Error(pollData.error || '云端或后台生成失败');
                } else if (pollData.status === 'processing') {
                   // Continue polling
                   continue;
                } else {
                   throw new Error('未知的轮询状态');
                }
             }
          } else {
             url = resJson.data?.[0]?.url;
          }

          if (!url) throw new Error("No payload URL received");`;

if (html.includes(targetStr)) {
  html = html.replace(targetStr, replacement);
  fs.writeFileSync('test_client.html', html);
  console.log("Patched test_client.html with frontend polling!");
} else {
  console.log("Target string not found in test_client.html");
}
