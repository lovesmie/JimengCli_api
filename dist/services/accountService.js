"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.accountService = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
exports.accountService = {
    /**
     * 独占获取一个空闲账号 (类似数据库行锁/乐观锁分配，这里简单用 findFirst + update处理)
     */
    async getIdleAccount(boundAccountId) {
        // 用事务保证 find + update 的原子性，避免并发时两个请求拿到同一个账号
        return await prisma.$transaction(async (tx) => {
            if (boundAccountId) {
                // 绑定模式：只使用指定账号，不走公共池
                const account = await tx.jimengAccount.findFirst({
                    where: { id: boundAccountId, status: 'IDLE' }
                });
                if (!account)
                    return null;
                return await tx.jimengAccount.update({
                    where: { id: account.id },
                    data: { status: 'BUSY' }
                });
            }
            // 公共池模式：从所有空闲账号中取一个（不过滤余额，超级会员生图0积分）
            const account = await tx.jimengAccount.findFirst({
                where: {
                    status: 'IDLE',
                }
            });
            if (!account)
                return null;
            return await tx.jimengAccount.update({
                where: { id: account.id },
                data: { status: 'BUSY' }
            });
        });
    },
    /**
     * 释放账号
     */
    async releaseAccount(accountId, newStatus = 'IDLE') {
        return await prisma.jimengAccount.update({
            where: { id: accountId },
            data: { status: newStatus }
        });
    }
};
//# sourceMappingURL=accountService.js.map