import { Pool } from 'pg';

import { env } from '~/lib/env.server';
import { log } from '~/lib/logger.server';
import prisma from '~/lib/prisma';
import { onShutdown } from '~/lib/shutdown.server';

let voltagentPool: Pool | null = null;

function getVoltagentPool(): Pool {
    if (!voltagentPool) {
        const pool = new Pool({
            connectionString: env.VOLTAGENT_DATABASE_URL,
            max: 1,
            idleTimeoutMillis: 30_000,
        });
        onShutdown(() => pool.end());
        voltagentPool = pool;
    }

    return voltagentPool;
}

export async function loader() {
    const checks = await Promise.allSettled([
        prisma.$queryRaw`SELECT 1`,
        getVoltagentPool().query('SELECT 1'),
    ]);

    const [iridium, voltagent] = checks;
    const failures: Record<string, string> = {};

    if (iridium.status === 'rejected') {
        failures.iridium =
            iridium.reason instanceof Error
                ? iridium.reason.message
                : String(iridium.reason);
    }

    if (voltagent.status === 'rejected') {
        failures.voltagent =
            voltagent.reason instanceof Error
                ? voltagent.reason.message
                : String(voltagent.reason);
    }

    if (Object.keys(failures).length > 0) {
        log.error('healthcheck_failed', { failures });
        return Response.json(
            { status: 'unhealthy', failures },
            { status: 503 },
        );
    }

    return Response.json({ status: 'ok' }, { status: 200 });
}
