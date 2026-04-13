const fs = require('fs');
const file = 'src/index.ts';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('pollingDaemon')) {
  // Insert import at the top
  const importStatement = "import { pollingDaemon } from './services/pollingDaemon';\n";
  code = importStatement + code;
  
  // Insert daemon start before app.listen
  code = code.replace('app.listen(PORT', "pollingDaemon.start();\n\napp.listen(PORT");
  
  fs.writeFileSync(file, code);
  console.log("Patched index.ts successfully to boot daemon.");
} else {
  console.log("Daemon already included in index.ts.");
}
