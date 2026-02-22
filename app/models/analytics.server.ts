import { prisma } from '~/db.server';

// ============================================================================
// User Analytics
// ============================================================================

interface UserAnalyticsParams {
    startDate: Date;
    endDate: Date;
    includeInactive: boolean;
}

interface DailyCount {
    date: Date;
    count: bigint;
}

export async function getUserAnalytics(params: UserAnalyticsParams) {
    const { startDate, endDate, includeInactive } = params;

    const whereClause = includeInactive ? {} : { banned: false };

    // 1. Total users count
    const totalUsers = await prisma.user.count({
        where: whereClause,
    });

    // 2. New users in date range
    const newUsersInRange = await prisma.user.count({
        where: {
            createdAt: { gte: startDate, lte: endDate },
            ...whereClause,
        },
    });

    // 3. Active users (users with sessions in range)
    const activeUserSessions = await prisma.session.findMany({
        where: {
            createdAt: { gte: startDate, lte: endDate },
        },
        select: { userId: true },
        distinct: ['userId'],
    });
    const activeUserIds = activeUserSessions.map((s) => s.userId);

    // 4. Banned users count
    const bannedUsers = await prisma.user.count({
        where: { banned: true },
    });

    // 5. Role distribution
    const roleDistribution = await prisma.user.groupBy({
        by: ['role'],
        where: whereClause,
        _count: { role: true },
    });

    // 6. Daily new users for trend (using raw SQL)
    const dailyNewUsers = includeInactive
        ? ((await prisma.$queryRaw`
              SELECT DATE("createdAt") as date, COUNT(*)::int as count
              FROM "user"
              WHERE "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
              GROUP BY DATE("createdAt")
              ORDER BY date ASC
          `) as DailyCount[])
        : ((await prisma.$queryRaw`
              SELECT DATE("createdAt") as date, COUNT(*)::int as count
              FROM "user"
              WHERE "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
                AND "banned" = false
              GROUP BY DATE("createdAt")
              ORDER BY date ASC
          `) as DailyCount[]);

    // 7. Total users before range (for cumulative calculation)
    const totalUsersBeforeRange = await prisma.user.count({
        where: {
            createdAt: { lt: startDate },
            ...whereClause,
        },
    });

    return {
        totalUsers,
        newUsersInRange,
        activeUserIds,
        bannedUsers,
        roleDistribution,
        dailyNewUsers: dailyNewUsers.map((d) => ({
            date: d.date,
            count: Number(d.count),
        })),
        totalUsersBeforeRange,
    };
}

// ============================================================================
// Engagement Metrics
// ============================================================================

interface EngagementMetricsParams {
    startDate: Date;
    endDate: Date;
    topUsersLimit: number;
}

export async function getEngagementMetrics(params: EngagementMetricsParams) {
    const { startDate, endDate, topUsersLimit } = params;

    // 1. Total threads in range
    const totalThreads = await prisma.thread.count({
        where: {
            createdAt: { gte: startDate, lte: endDate },
        },
    });

    // 2. Total messages in range
    const totalMessages = await prisma.message.count({
        where: {
            createdAt: { gte: startDate, lte: endDate },
        },
    });

    // 3. Messages by role
    const messagesByRole = await prisma.message.groupBy({
        by: ['role'],
        where: {
            createdAt: { gte: startDate, lte: endDate },
        },
        _count: { role: true },
    });

    // 4. Unique active users (users who sent messages)
    const uniqueActiveUserMessages = await prisma.message.findMany({
        where: {
            createdAt: { gte: startDate, lte: endDate },
            role: 'USER',
            userId: { not: null },
        },
        select: { userId: true },
        distinct: ['userId'],
    });
    const uniqueActiveUsers = uniqueActiveUserMessages.filter(
        (m) => m.userId !== null,
    ).length;

    // 5. Top users by message count
    const topUserGroups = await prisma.message.groupBy({
        by: ['userId'],
        where: {
            createdAt: { gte: startDate, lte: endDate },
            userId: { not: null },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: topUsersLimit,
    });

    // Enrich with user details and thread counts in a single batch query
    const topUserIds = topUserGroups.map((g) => g.userId!);
    const usersWithData = await prisma.user.findMany({
        where: { id: { in: topUserIds } },
        select: {
            id: true,
            name: true,
            email: true,
            _count: {
                select: {
                    threads: {
                        where: {
                            createdAt: { gte: startDate, lte: endDate },
                        },
                    },
                },
            },
        },
    });
    const userMap = new Map(usersWithData.map((u) => [u.id, u]));

    const topUsers = topUserGroups.map((group) => {
        const user = userMap.get(group.userId!);
        return {
            userId: group.userId!,
            userName: user?.name ?? null,
            userEmail: user?.email ?? 'unknown',
            messageCount: group._count.id,
            threadCount: user?._count.threads ?? 0,
        };
    });

    // 6. Daily threads for trend
    const dailyThreads = (await prisma.$queryRaw`
        SELECT DATE("createdAt") as date, COUNT(*)::int as count
        FROM "thread"
        WHERE "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
    `) as DailyCount[];

    // 7. Daily messages for trend
    const dailyMessages = (await prisma.$queryRaw`
        SELECT DATE("createdAt") as date, COUNT(*)::int as count
        FROM "message"
        WHERE "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
    `) as DailyCount[];

    return {
        totalThreads,
        totalMessages,
        messagesByRole,
        uniqueActiveUsers,
        topUsers,
        dailyThreads: dailyThreads.map((d) => ({
            date: d.date,
            count: Number(d.count),
        })),
        dailyMessages: dailyMessages.map((d) => ({
            date: d.date,
            count: Number(d.count),
        })),
    };
}
