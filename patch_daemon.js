const fs = require('fs');
let code = fs.readFileSync('src/services/pollingDaemon.ts', 'utf8');

code = code.replace(
  "if (task.type.includes('image')) {",
  "if (task.type === 'image2image' || task.type === 'text2image' || task.type === 'image_upscale') {"
);

code = code.replace(
  "} else if (state.status === 'failed' || state.status === 2 || stdout.toLowerCase().includes('fail')) {",
  "} else if (state.status === 'failed' || state.gen_status === 'failed' || state.gen_status === 'fail' || state.status === 2 || stdout.toLowerCase().includes('fail')) {"
);

fs.writeFileSync('src/services/pollingDaemon.ts', code);
console.log("Patched daemon!");
