import { PrismaClient, JimengAccount } from '@prisma/client';

const prisma = new PrismaClient();

export const accountService = {
  /**
   * 独占获取一个空闲账号 (类似数据库行锁/乐观锁分配，这里简单用 findFirst + update处理)
   */
  async getIdleAccount(): Promise<JimengAccount | null> {
    const account = await prisma.jimengAccount.findFirst({
      where: {
        status: 'IDLE',
        creditBalance: { gt: 0 } // 只获取有算力的
      }
    });

    if (!account) return null;

    // 原生并发情况下可以用比较严格的事务(Transaction) 来锁定
    return await prisma.jimengAccount.update({
      where: { id: account.id },
      data: { status: 'BUSY' }
    });
  },

  /**
   * 释放账号
   */
  async releaseAccount(accountId: string, newStatus: string = 'IDLE') {
    return await prisma.jimengAccount.update({
      where: { id: accountId },
      data: { status: newStatus }
    });
  }
};
