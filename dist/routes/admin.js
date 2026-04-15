"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const cliRunner_1 = require("../utils/cliRunner");
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const fs_1 = __importDefault(require("fs"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const adminAuth_1 = require("../middleware/adminAuth");
const router = (0, express_1.Router)();
router.post('/sys/login', async (req, res) => {
    const { password } = req.body;
    if (!password)
        return res.status(400).json({ error: '密码不能为空' });
    const configPath = path_1.default.resolve(__dirname, '../../data/admin.json');
    const config = JSON.parse(fs_1.default.readFileSync(configPath, 'utf8'));
    const match = await bcryptjs_1.default.compare(password, config.password);
    if (match) {
        const token = 'admin_token_' + Date.now();
        config.token = token;
        fs_1.default.writeFileSync(configPath, JSON.stringify(config));
        return res.json({ token });
    }
    res.status(401).json({ error: '密码错误' });
});
router.post('/sys/password', adminAuth_1.adminAuth, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword)
        return res.status(400).json({ error: '密码不能为空' });
    const configPath = path_1.default.resolve(__dirname, '../../data/admin.json');
    const config = JSON.parse(fs_1.default.readFileSync(configPath, 'utf8'));
    const match = await bcryptjs_1.default.compare(oldPassword, config.password);
    if (match) {
        config.password = await bcryptjs_1.default.hash(newPassword, 10);
        config.token = 'admin_token_' + Date.now(); // force relogin
        fs_1.default.writeFileSync(configPath, JSON.stringify(config));
        return res.json({ success: true, message: '密码修改成功，请重新登录' });
    }
    res.status(401).json({ error: '旧密码错误' });
});
router.get('/sys/check', adminAuth_1.adminAuth, (req, res) => res.json({ ok: true }));
// Apply middleware to subsequent routes
router.use(adminAuth_1.adminAuth);
const prisma = new client_1.PrismaClient();
// 添加新即梦账号并触发登录
router.post('/accounts/login', async (req, res) => {
    const { name } = req.body;
    if (!name)
        return res.status(400).json({ error: "Name is required" });
    try {
        // 1. 为新账号创建一个独立的本地文件夹存放其特定的 ~/.dreamina_cli
        const homeDir = path_1.default.resolve(__dirname, `../../data/accounts/${name}_${Date.now()}`);
        if (!fs_1.default.existsSync(homeDir)) {
            fs_1.default.mkdirSync(homeDir, { recursive: true });
        }
        // 2. 存入数据库
        const account = await prisma.jimengAccount.create({
            data: { name, homeDir, status: 'IDLE', creditBalance: 0 }
        });
        // 3. 执行 login --debug。由于是交互式，我们希望捕获 debug 输出用于让用户在前端扫码
        // 注意：如果 login 是完全阻塞的命令行 UI，我们需要在子进程 stdout 流上读出链接直接返回，而不是等待子进程结束
        // 但是这里简化假设用 `--debug` 它会把授权链接打印出来
        const { spawn } = require('child_process');
        const absoluteHome = path_1.default.resolve(account.homeDir);
        const env = { ...process.env, HOME: absoluteHome, USERPROFILE: absoluteHome, APPDATA: absoluteHome, LOCALAPPDATA: absoluteHome };
        // 优先使用项目 bin/ 内的可执行文件
        const child = spawn(cliRunner_1.DREAMINA_BIN, ['login', '--debug'], { env, shell: false, windowsHide: true });
        let responded = false;
        child.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`[Jimeng Login Stdout]:\n${output}`);
            // 只要捕获到链接，立刻给前端发送响应去弹窗，但！子进程不会被关掉，它会继续在后台等你扫码完成！
            if (!responded) {
                const linkMatch = output.match(/https:\/\/jimeng\.jianying\.com[^\s|<>"'\\]+/i);
                if (linkMatch) {
                    responded = true;
                    res.json({ account, authUrl: linkMatch[0], rawStdout: output });
                }
            }
        });
        child.stderr.on('data', (data) => {
            console.log(`[Jimeng Login Stderr]:\n${data.toString()}`);
        });
        child.on('close', (code) => {
            if (!responded) {
                responded = true;
                res.status(500).json({ error: `CLI 进程直接退出了 (状态码: ${code})。系统可能无法识别 'dreamina' 命令，请确保你已经**彻底关闭并重新启动了**运行后端的那个终端。` });
            }
        });
        // 10秒超时保护
        setTimeout(() => {
            if (!responded) {
                responded = true;
                res.status(500).json({ error: '等待 CLI 抛出登录链接超时了（10秒）。请查看 Node.js 后端终端获取详细情况。' });
            }
        }, 10000);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 重新登录或完成现有的即梦账号绑定
router.post('/accounts/:id/relogin', async (req, res) => {
    try {
        const account = await prisma.jimengAccount.findUnique({ where: { id: req.params.id } });
        if (!account)
            return res.status(404).json({ error: "账号不存在" });
        const { spawn } = require('child_process');
        const absoluteHome = path_1.default.resolve(account.homeDir);
        // 删除旧凭证，强制重新授权
        const credentialPath = path_1.default.join(absoluteHome, '.dreamina_cli', 'credential.json');
        if (fs_1.default.existsSync(credentialPath)) {
            fs_1.default.unlinkSync(credentialPath);
        }
        const env = { ...process.env, HOME: absoluteHome, USERPROFILE: absoluteHome, APPDATA: absoluteHome, LOCALAPPDATA: absoluteHome };
        // CLI 将 URL 写入日志文件而非 stdout，记下启动时间用于过滤旧日志
        const startTime = Date.now();
        const child = spawn(cliRunner_1.DREAMINA_BIN, ['login', '--headless'], { env, shell: false, windowsHide: true });
        let responded = false;
        child.stderr.on('data', (data) => {
            console.log(`[Relogin Stderr]: ${data.toString()}`);
        });
        child.on('close', (code) => {
            console.log(`[Relogin] CLI exited with code ${code}`);
        });
        child.on('error', (err) => {
            if (!responded) {
                responded = true;
                res.status(500).json({ error: `无法启动 CLI: ${err.message}` });
            }
        });
        // 轮询今天的日志目录，等待 CLI 写入授权链接
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const logDir = path_1.default.join(absoluteHome, '.dreamina_cli', 'logs', today);
        let knownSizes = {};
        const pollInterval = setInterval(() => {
            if (responded) {
                clearInterval(pollInterval);
                return;
            }
            if (!fs_1.default.existsSync(logDir))
                return;
            const files = fs_1.default.readdirSync(logDir).filter(f => f.endsWith('.log'));
            for (const file of files) {
                const filePath = path_1.default.join(logDir, file);
                const stat = fs_1.default.statSync(filePath);
                const prevSize = knownSizes[file] ?? 0;
                if (stat.size <= prevSize)
                    continue;
                // 只读新增内容
                const buf = Buffer.alloc(stat.size - prevSize);
                const fd = fs_1.default.openSync(filePath, 'r');
                fs_1.default.readSync(fd, buf, 0, buf.length, prevSize);
                fs_1.default.closeSync(fd);
                knownSizes[file] = stat.size;
                const chunk = buf.toString('utf8');
                const linkMatch = chunk.match(/https:\/\/jimeng\.jianying\.com[^\s|<>"'\\]+/i);
                if (linkMatch) {
                    clearInterval(pollInterval);
                    responded = true;
                    res.json({ authUrl: linkMatch[0] });
                    return;
                }
            }
        }, 500);
        // 30 秒超时
        setTimeout(() => {
            clearInterval(pollInterval);
            if (!responded) {
                responded = true;
                res.status(500).json({ error: '等待登录链接超时（30秒）。请检查 CLI 是否正常运行，或手动查看日志目录。' });
            }
        }, 30000);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// JSON 导入登录态
router.post('/accounts/:id/import-login', async (req, res) => {
    try {
        const account = await prisma.jimengAccount.findUnique({ where: { id: req.params.id } });
        if (!account)
            return res.status(404).json({ error: "账号不存在" });
        const { loginJson } = req.body;
        if (!loginJson)
            return res.status(400).json({ error: "loginJson 不能为空" });
        // 验证是合法 JSON
        try {
            JSON.parse(typeof loginJson === 'string' ? loginJson : JSON.stringify(loginJson));
        }
        catch {
            return res.status(400).json({ error: "loginJson 格式不合法" });
        }
        const absoluteHome = path_1.default.resolve(account.homeDir);
        const tmpFile = path_1.default.join(absoluteHome, 'dreamina-login-import.json');
        const jsonStr = typeof loginJson === 'string' ? loginJson : JSON.stringify(loginJson);
        fs_1.default.writeFileSync(tmpFile, jsonStr, 'utf8');
        try {
            const { stdout, stderr } = await (0, cliRunner_1.runJimengCommand)(`dreamina import_login_response --file "${tmpFile}"`, account.homeDir);
            fs_1.default.unlinkSync(tmpFile);
            const output = stdout + stderr;
            // 更新账号状态为 IDLE
            await prisma.jimengAccount.update({ where: { id: account.id }, data: { status: 'IDLE' } });
            res.json({ success: true, output });
        }
        catch (e) {
            if (fs_1.default.existsSync(tmpFile))
                fs_1.default.unlinkSync(tmpFile);
            res.status(500).json({ error: e.message });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 获取所有账号
router.get('/accounts', async (req, res) => {
    const accounts = await prisma.jimengAccount.findMany();
    res.json(accounts);
});
// 测试连通性并获取余额 (依赖手册中的 `dreamina user_credit` 命令)
router.post('/accounts/:id/check', async (req, res) => {
    try {
        const account = await prisma.jimengAccount.findUnique({ where: { id: req.params.id } });
        if (!account)
            return res.status(404).json({ error: "账号不存在" });
        // 运行验活及查余额命令
        const { stdout } = await (0, cliRunner_1.runJimengCommand)('dreamina user_credit', account.homeDir);
        // 解析具体的算力数值 (CLI 返回的其实是 JSON，包含多种点数如 total_credit/vip_credit 等)
        let newBalance = account.creditBalance;
        try {
            // 尝试截取并解析可能存在的 JSON 块
            const jsonStr = stdout.substring(stdout.indexOf('{'), stdout.lastIndexOf('}') + 1);
            const creditInfo = JSON.parse(jsonStr);
            if (creditInfo.total_credit !== undefined) {
                newBalance = creditInfo.total_credit; // 抓取真正的总点数
            }
        }
        catch (e) {
            // fallback 正则解析
            const match = stdout.match(/"total_credit"\s*:\s*(\d+)/);
            if (match)
                newBalance = parseInt(match[1], 10);
        }
        // 能成功运行说明登录态是有效的，更新余额；但 NO_VIP 状态不自动恢复（需人工升级会员）
        const updatedAccount = await prisma.jimengAccount.update({
            where: { id: account.id },
            data: { status: account.status === 'NO_VIP' ? 'NO_VIP' : 'IDLE', creditBalance: newBalance, lastChecked: new Date() }
        });
        res.json({ success: true, raw: stdout, account: updatedAccount });
    }
    catch (error) {
        // 只返回错误，不写 ERROR 状态到 DB，避免破坏上次成功的状态
        res.status(500).json({ error: `账号检测失败 (可能未授权或凭证已过期)，原样报错：\n${error.message}` });
    }
});
// 生成并分发一个新的 API KEY 用于客户端
router.post('/apikeys', async (req, res) => {
    const { owner, quota, boundAccountId } = req.body;
    const key = 'sk-jm-' + (0, crypto_1.randomBytes)(24).toString('hex');
    const apikey = await prisma.apiKey.create({
        data: {
            key,
            owner: owner || 'unknown',
            quota: quota ? parseInt(quota) : null,
            boundAccountId: boundAccountId || null
        },
        include: { boundAccount: { select: { id: true, name: true } } }
    });
    res.json(apikey);
});
// 获取所有已生成的 API KEY
router.get('/apikeys', async (req, res) => {
    try {
        const apikeys = await prisma.apiKey.findMany({
            orderBy: { createdAt: 'desc' },
            include: { boundAccount: { select: { id: true, name: true } } }
        });
        res.json(apikeys);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 修改绑定账号
router.put('/apikeys/:id/rebind', async (req, res) => {
    try {
        const { boundAccountId } = req.body;
        const updated = await prisma.apiKey.update({
            where: { id: req.params.id },
            data: { boundAccountId: boundAccountId || null },
            include: { boundAccount: { select: { id: true, name: true } } }
        });
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 停用/启用 API KEY
router.put('/apikeys/:id/toggle', async (req, res) => {
    try {
        const apikey = await prisma.apiKey.findUnique({ where: { id: req.params.id } });
        if (!apikey)
            return res.status(404).json({ error: "API Key 不存在" });
        const updated = await prisma.apiKey.update({
            where: { id: req.params.id },
            data: { isActive: !apikey.isActive }
        });
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 删除 API KEY
router.delete('/apikeys/:id', async (req, res) => {
    try {
        const apikey = await prisma.apiKey.delete({
            where: { id: req.params.id }
        });
        res.json(apikey);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=admin.js.map