import { JimengAccount } from '@prisma/client';
export declare const accountService: {
    /**
     * 独占获取一个空闲账号 (类似数据库行锁/乐观锁分配，这里简单用 findFirst + update处理)
     */
    getIdleAccount(boundAccountId?: string | null): Promise<JimengAccount | null>;
    /**
     * 释放账号
     */
    releaseAccount(accountId: string, newStatus?: string): Promise<{
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        homeDir: string;
        creditBalance: number;
        lastChecked: Date;
    }>;
};
//# sourceMappingURL=accountService.d.ts.map