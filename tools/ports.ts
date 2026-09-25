/**
 * Host ports for the two local databases in docker-compose.dev.yml. Every
 * copy of the template defaults to 5432/5433, so `bun run setup`
 * (tools/init.ts) checks them and, when another project already holds one,
 * picks a free pair and writes POSTGRES_PORT / VOLTAGENT_POSTGRES_PORT plus
 * the matching database URLs into .env. Compose, prisma.config.ts, and the
 * dev fallbacks in app/lib/env.server.ts read those two vars.
 *
 * Everything here is pure except isPortFree, which probes with node:net.
 */
import { createServer } from 'node:net';

export type DevPorts = { app: number; voltagent: number };

/** The template's defaults, mirrored by docker-compose.dev.yml. */
export const DEFAULT_DEV_PORTS: DevPorts = { app: 5432, voltagent: 5433 };

/** A TCP port from an env var, or undefined when unset or not a valid port. */
export function parsePort(value: string | undefined): number | undefined {
    if (!value || !/^\d+$/.test(value.trim())) return undefined;
    const port = Number(value);
    return port >= 1 && port <= 65535 ? port : undefined;
}

/** The ports this copy is configured for, falling back to the defaults. */
export function configuredDevPorts(
    env: Record<string, string | undefined>,
): DevPorts {
    return {
        app: parsePort(env.POSTGRES_PORT) ?? DEFAULT_DEV_PORTS.app,
        voltagent:
            parsePort(env.VOLTAGENT_POSTGRES_PORT) ??
            DEFAULT_DEV_PORTS.voltagent,
    };
}

/**
 * The first free pair after the defaults, shifted by 10 at a time
 * (5442/5443, 5452/5453, ...) so each copy's ports stay recognizable.
 */
export async function findFreeDevPorts(
    isFree: (port: number) => Promise<boolean>,
    { attempts = 50, step = 10 } = {},
): Promise<DevPorts | undefined> {
    for (let i = 1; i <= attempts; i++) {
        const candidate = {
            app: DEFAULT_DEV_PORTS.app + i * step,
            voltagent: DEFAULT_DEV_PORTS.voltagent + i * step,
        };
        if (
            (await isFree(candidate.app)) &&
            (await isFree(candidate.voltagent))
        ) {
            return candidate;
        }
    }
    return undefined;
}

/** The docker-compose.dev.yml VoltAgent database URL on a given port. */
export function voltagentDatabaseUrl(
    port: number = DEFAULT_DEV_PORTS.voltagent,
): string {
    return `postgresql://postgres:postgres@localhost:${port}/voltagent`;
}

/**
 * Move an existing .env to new host ports: set POSTGRES_PORT and
 * VOLTAGENT_POSTGRES_PORT (appending them when missing) and repoint the local
 * DATABASE_URL / VOLTAGENT_DATABASE_URL that were on the old ports. URLs on
 * other hosts or ports are left alone.
 */
export function setEnvDevPorts(
    source: string,
    from: DevPorts,
    to: DevPorts,
): string {
    const portKeys: Record<string, number> = {
        POSTGRES_PORT: to.app,
        VOLTAGENT_POSTGRES_PORT: to.voltagent,
    };
    const urlKeys: Record<string, [number, number]> = {
        DATABASE_URL: [from.app, to.app],
        VOLTAGENT_DATABASE_URL: [from.voltagent, to.voltagent],
    };

    const seen = new Set<string>();
    const lines = source.trimEnd().split('\n');
    const next = lines.map((line) => {
        const key = line.match(/^([A-Z0-9_]+)\s*=/)?.[1];
        if (key && key in portKeys) {
            seen.add(key);
            return `${key}="${portKeys[key]}"`;
        }
        if (key && key in urlKeys) {
            const [previous, port] = urlKeys[key];
            return line.replace(
                new RegExp(String.raw`(@localhost:)${previous}(?=/)`),
                `$1${port}`,
            );
        }
        return line;
    });

    for (const [key, port] of Object.entries(portKeys)) {
        if (!seen.has(key)) next.push(`${key}="${port}"`);
    }
    return next.join('\n') + '\n';
}

function canListen(port: number, host?: string): Promise<boolean> {
    return new Promise((resolve) => {
        const server = createServer();
        server.once('error', (error: NodeJS.ErrnoException) =>
            // No IPv6 (or no such address) here is not a conflict.
            resolve(
                error.code === 'EADDRNOTAVAIL' || error.code === 'EAFNOSUPPORT',
            ),
        );
        server.listen({ port, host }, () => server.close(() => resolve(true)));
    });
}

/**
 * Whether nothing listens on a TCP port, by trying to bind it. Probes the
 * wildcard and both loopbacks: on macOS a loopback bind can succeed next to
 * Docker's wildcard listener, and a native Postgres usually holds only the
 * loopbacks, so a single probe misses one or the other.
 */
export async function isPortFree(port: number): Promise<boolean> {
    for (const host of [undefined, '0.0.0.0', '127.0.0.1', '::1']) {
        if (!(await canListen(port, host))) return false;
    }
    return true;
}
