import { tool } from 'ai';
import { differenceInDays, subDays } from 'date-fns';
import z from 'zod';

import type { UserAnalyticsOutput } from '~/lib/chat-tools.types';
import { getUserAnalytics } from '~/models/analytics.server';
import { Role } from '~/generated/prisma/client';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function toISODate(date: Date): string {
    return date.toISOString().split('T')[0]!;
}

/**
 * AI Chat Tools - Demo implementations for user analytics.
 *
 * Add more tools following the getUserAnalytics pattern as needed.
 * For external API integrations (billing, CRM, etc.), follow the same
 * tool() pattern with an execute function that calls your API.
 */
export const chatTools = {
    // ========================================================================
    // Database Analytics Demo
    // ========================================================================
    getUserAnalytics: tool({
        description:
            'Retrieves comprehensive user analytics including growth trends, role distribution, and account health metrics. Use this when the user asks about user counts, user growth, active users, role breakdowns, or overall user statistics.',
        inputSchema: z.object({
            startDate: z
                .string()
                .regex(ISO_DATE_REGEX, 'Expected YYYY-MM-DD')
                .optional()
                .describe(
                    'Start date in YYYY-MM-DD format. Defaults to 30 days ago.',
                ),
            endDate: z
                .string()
                .regex(ISO_DATE_REGEX, 'Expected YYYY-MM-DD')
                .optional()
                .describe('End date in YYYY-MM-DD format. Defaults to today.'),
            includeInactive: z
                .boolean()
                .optional()
                .describe(
                    'Whether to include banned users in counts. Defaults to false.',
                ),
        }),
        execute: async ({ startDate, endDate, includeInactive }) => {
            // Resolve date range (30 days default)
            const defaultEndDate = new Date();
            const defaultStartDate = new Date();
            defaultStartDate.setDate(defaultStartDate.getDate() - 30);

            const startISO = startDate ?? toISODate(defaultStartDate);
            const endISO = endDate ?? toISODate(defaultEndDate);

            const start = new Date(startISO);
            const end = new Date(endISO);

            // Calculate previous period for growth comparison
            const periodLength = differenceInDays(end, start);
            const previousStart = subDays(start, periodLength);

            // Call model layer function
            const analyticsData = await getUserAnalytics({
                startDate: start,
                endDate: end,
                includeInactive: includeInactive ?? false,
            });

            // Calculate previous period data for growth rate
            const previousPeriodData = await getUserAnalytics({
                startDate: previousStart,
                endDate: start,
                includeInactive: includeInactive ?? false,
            });

            // Calculate growth rate
            const growthRate = calculateGrowthRate(
                analyticsData.newUsersInRange,
                previousPeriodData.newUsersInRange,
            );

            // Calculate role percentages
            const rolePercentages = calculateRolePercentages(
                analyticsData.roleDistribution,
                analyticsData.totalUsers,
            );

            // Calculate account health percentages
            const activePercentage =
                analyticsData.totalUsers > 0
                    ? (analyticsData.activeUserIds.length /
                          analyticsData.totalUsers) *
                      100
                    : 0;
            const bannedPercentage =
                analyticsData.totalUsers > 0
                    ? (analyticsData.bannedUsers / analyticsData.totalUsers) *
                      100
                    : 0;

            // Format trend data
            const trend = formatUserTrendData(
                analyticsData.dailyNewUsers,
                analyticsData.totalUsersBeforeRange,
            );

            const output: UserAnalyticsOutput = {
                dateRange: {
                    startDate: startISO,
                    endDate: endISO,
                },
                overview: {
                    totalUsers: analyticsData.totalUsers,
                    newUsersInRange: analyticsData.newUsersInRange,
                    activeUsers: analyticsData.activeUserIds.length,
                    bannedUsers: analyticsData.bannedUsers,
                },
                growth: {
                    newUsersCount: analyticsData.newUsersInRange,
                    growthRate,
                    growthRateFormatted: formatPercentage(growthRate, {
                        includeSign: true,
                    }),
                },
                roleDistribution: {
                    userCount: rolePercentages.USER.count,
                    editorCount: rolePercentages.EDITOR.count,
                    adminCount: rolePercentages.ADMIN.count,
                    userPercentage: rolePercentages.USER.percentage,
                    editorPercentage: rolePercentages.EDITOR.percentage,
                    adminPercentage: rolePercentages.ADMIN.percentage,
                },
                accountHealth: {
                    activePercentage,
                    bannedPercentage,
                    activePercentageFormatted:
                        formatPercentage(activePercentage),
                    bannedPercentageFormatted:
                        formatPercentage(bannedPercentage),
                },
                trend,
            };

            return output;
        },
    }),
};

// ============================================================================
// Helper Functions
// ============================================================================

function calculateGrowthRate(current: number, previous: number): number {
    if (previous === 0) {
        return current > 0 ? 100 : 0;
    }
    return ((current - previous) / previous) * 100;
}

function calculateRolePercentages(
    distribution: Array<{ role: Role; _count: { role: number } }>,
    total: number,
): Record<Role, { count: number; percentage: number }> {
    const result = {
        USER: { count: 0, percentage: 0 },
        EDITOR: { count: 0, percentage: 0 },
        ADMIN: { count: 0, percentage: 0 },
    };

    distribution.forEach((item) => {
        const count = item._count.role;
        const percentage = total > 0 ? (count / total) * 100 : 0;
        result[item.role] = { count, percentage };
    });

    return result;
}

function formatUserTrendData(
    dailyNewUsers: Array<{ date: Date; count: number }>,
    startingTotal: number,
): Array<{ date: string; newUsers: number; cumulativeUsers: number }> {
    let cumulative = startingTotal;

    return dailyNewUsers.map((day) => {
        cumulative += day.count;
        return {
            date: toISODate(day.date),
            newUsers: day.count,
            cumulativeUsers: cumulative,
        };
    });
}

function formatPercentage(
    value: number,
    options?: { includeSign?: boolean },
): string {
    const formatted = value.toFixed(1) + '%';
    if (options?.includeSign && value > 0) {
        return '+' + formatted;
    }
    return formatted;
}
