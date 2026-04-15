"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminAuth = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const configDir = path_1.default.resolve(__dirname, '../../data');
if (!fs_1.default.existsSync(configDir))
    fs_1.default.mkdirSync(configDir, { recursive: true });
const configPath = path_1.default.resolve(configDir, 'admin.json');
// Initialize admin config if not exists — store bcrypt hash of default password "admin"
if (!fs_1.default.existsSync(configPath)) {
    const hash = bcryptjs_1.default.hashSync('admin', 10);
    fs_1.default.writeFileSync(configPath, JSON.stringify({ password: hash, token: 'admin_token_' + Date.now() }));
}
else {
    // Migrate plaintext password to bcrypt hash on first run after upgrade
    const config = JSON.parse(fs_1.default.readFileSync(configPath, 'utf8'));
    if (config.password && !config.password.startsWith('$2')) {
        config.password = bcryptjs_1.default.hashSync(config.password, 10);
        fs_1.default.writeFileSync(configPath, JSON.stringify(config));
    }
}
const adminAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }
    const token = authHeader.split(' ')[1];
    const config = JSON.parse(fs_1.default.readFileSync(configPath, 'utf8'));
    if (token !== config.token) {
        return res.status(403).json({ error: 'Forbidden: Invalid token' });
    }
    next();
};
exports.adminAuth = adminAuth;
//# sourceMappingURL=adminAuth.js.map