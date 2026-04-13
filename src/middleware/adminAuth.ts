import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';

const configDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

const configPath = path.resolve(configDir, 'admin.json');

// Initialize admin password if not exists
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, JSON.stringify({ password: 'admin', token: 'admin_token_' + Date.now() }));
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
