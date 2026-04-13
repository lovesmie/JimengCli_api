const fs = require('fs');
let code = fs.readFileSync('src/routes/openai.ts', 'utf8');

code = code.replace(
  "if (task.type.includes('image')) {",
  "if (task.type === 'image2image' || task.type === 'text2image' || task.type === 'image_upscale') {"
);

fs.writeFileSync('src/routes/openai.ts', code);
console.log("Patched openai.ts image logic too just in case.");
