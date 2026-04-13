const fs = require('fs');
let content = fs.readFileSync('src/routes/admin.ts', 'utf-8');

const importStatement = `import { adminAuth } from '../middleware/adminAuth';\n`;

const loginLogic = `
router.post('/sys/login', (req, res) => {
  const { password } = req.body;
  const configPath = path.resolve(__dirname, '../../data/admin.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  if (password === config.password) {
    const token = 'admin_token_' + Date.now();
    config.token = token;
    fs.writeFileSync(configPath, JSON.stringify(config));
    return res.json({ token });
  }
  res.status(401).json({ error: '密码错误' });
});

router.post('/sys/password', adminAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const configPath = path.resolve(__dirname, '../../data/admin.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  if (oldPassword === config.password) {
    config.password = newPassword;
    config.token = 'admin_token_' + Date.now(); // force relogin
    fs.writeFileSync(configPath, JSON.stringify(config));
    return res.json({ success: true, message: '密码修改成功，请重新登录' });
  }
  res.status(401).json({ error: '旧密码错误' });
});

router.get('/sys/check', adminAuth, (req, res) => res.json({ ok: true }));

// Apply middleware to subsequent routes
router.use(adminAuth);

`;

if (!content.includes('adminAuth')) {
    content = content.replace(/(const router = Router\(\);)/, `$1\n${importStatement}${loginLogic}`);
    fs.writeFileSync('src/routes/admin.ts', content);
    console.log('adminAuth attached');
} else {
    console.log('adminAuth already applied');
}
