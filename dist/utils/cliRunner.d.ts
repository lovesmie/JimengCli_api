export interface CliRunResult {
    stdout: string;
    stderr: string;
}
export declare const DREAMINA_BIN: string;
/**
 * 核心调度器：使用独立的环境变量 HOME/USERPROFILE 欺骗 CLI 去隔离文件夹中读取数据
 */
export declare const runJimengCommand: (command: string, accountHomeDir?: string) => Promise<CliRunResult>;
//# sourceMappingURL=cliRunner.d.ts.map