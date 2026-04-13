const fs = require('fs');
let html = fs.readFileSync('test_client.html', 'utf8');

const regex = /const response = await fetch\(\`\$\{base\}\$\{endpoint\}\`.*?const url = resJson\.data\?\.\[0\]\?\.url;/s;

const replacement = `const response = await fetch(\`\${base}\${endpoint}\`, {
             method: 'POST',
             headers: { 'Authorization': \`Bearer \${config.value.apiKey}\` },
             body: formData
          });
          const resJson = await response.json();
          logDebug(\`<= RESPONSE HTTP \${response.status}\\n\${JSON.stringify(resJson, null, 2)}\`);
          
          if (!response.ok || resJson.error) {
             throw new Error(resJson.error?.message || resJson.error || 'Unknown Server Error');
          }

          let url = null;

          // 核心轮询逻辑 (Polling Logic)
          if (resJson.status === 'processing' && resJson.id) {
             logDebug(\`[INFO] 任务已挂起后台。开始轮询获取状态... (ID: \${resJson.id})\`);
             
             let pollAttempts = 0;
             while (true) {
                await new Promise(resolve => setTimeout(resolve, 5000)); // poll every 5s
                pollAttempts++;
                logDebug(\`[POLL \${pollAttempts}] \${base}/tasks/\${resJson.id}\`);
                
                const pollRes = await fetch(\`\${base}/tasks/\${resJson.id}\`, {
                   headers: { 'Authorization': \`Bearer \${config.value.apiKey}\` }
                });
                const pollData = await pollRes.json();
                logDebug(\`<= RESPONSE HTTP \${pollRes.status}\\n\${JSON.stringify(pollData, null, 2)}\`);
                
                if (pollData.status === 'success' && pollData.data && pollData.data[0].url) {
                   url = pollData.data[0].url;
                   break;
                } else if (pollData.status === 'failed') {
                   throw new Error(pollData.error || '云端生成失败，可能涉及风控');
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

          if (!url) throw new Error("No payload URL received after polling.");`;

if (regex.test(html)) {
  html = html.replace(regex, replacement);
  fs.writeFileSync('test_client.html', html);
  console.log("Patched test_client.html successfully with front-end polling.");
} else {
  console.log("Could not find regex to patch test_client.html.");
}
