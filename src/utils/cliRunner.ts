import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export interface CliRunResult {
  stdout: string;
  stderr: string;
}

/**
 * 解析 dreamina 可执行文件路径：
 * 优先使用项目内 bin/ 目录（便于部署），找不到再 fallback 到系统 PATH 中的全局命令。
 */
function resolveDreaminaBinPath(): string {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const localBin = path.resolve(__dirname, '../../bin/dreamina' + ext);
  if (fs.existsSync(localBin)) {
    return localBin; // 原始路径，不带引号
  }
  return 'dreamina'; // fallback 系统 PATH
}

// 用于 spawn() 的第一个参数（不需要引号，Node 自行处理路径）
export const DREAMINA_BIN = resolveDreaminaBinPath();

// 用于 exec() 字符串拼接（Windows 路径有空格时需要引号）
const DREAMINA_BIN_QUOTED = DREAMINA_BIN === 'dreamina' ? 'dreamina' : `"${DREAMINA_BIN}"`;

/**
 * 核心调度器：使用独立的环境变量 HOME/USERPROFILE 欺骗 CLI 去隔离文件夹中读取数据
 */
export const runJimengCommand = async (
  command: string,
  accountHomeDir?: string
): Promise<CliRunResult> => {
  // 把 command 里的 `dreamina ` 替换成实际路径，兼容所有调用点
  const resolvedCommand = command.replace(/^dreamina\b/, DREAMINA_BIN_QUOTED);

  const env: NodeJS.ProcessEnv = { ...process.env };
  
  if (accountHomeDir) {
    // 强制把账号独立目录转换成绝对路径
    const absoluteHome = path.resolve(accountHomeDir);
    // 拦截 Linux/Mac 主目录
    env.HOME = absoluteHome;
    // 拦截 Windows 主目录
    env.USERPROFILE = absoluteHome;
    // 某些系统特定的用户临时目录也强行隔离
    env.APPDATA = absoluteHome;
    env.LOCALAPPDATA = absoluteHome;
  }

  try {
    const { stdout, stderr } = await execAsync(resolvedCommand, { 
      env,
      timeout: 1000 * 60 * 5, // 最长运行 5 分钟
    });
    return { stdout, stderr };
  } catch (error: any) {
    throw new Error(`CLI 执行失败: ${error.message}\nStderr: ${error.stderr}\nStdout: ${error.stdout}`);
  }
};
