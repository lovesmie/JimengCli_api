import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const configDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

const configPath = path.resolve(configDir, 'admin.json');

// Initialize admin config if not exists — store bcrypt hash of default password "admin"
if (!fs.existsSync(configPath)) {
  const hash = bcrypt.hashSync('admin', 10);
  fs.writeFileSync(configPath, JSON.stringify({ password: hash, token: 'admin_token_' + Date.now() }));
} else {
  // Migrate plaintext password to bcrypt hash on first run after upgrade
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (config.password && !config.password.startsWith('$2')) {
    config.password = bcrypt.hashSync(config.password, 10);
    fs.writeFileSync(configPath, JSON.stringify(config));
  }
}

export const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }
  const token = authHeader.split(' ')[1];
  
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (token !== config.token) {
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }
  
  next();
};
