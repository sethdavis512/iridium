import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LOCAL_DATABASE_NAME } from '~/config';
import { localDatabaseUrl } from './identity';
import {
    configuredDevPorts,
    DEFAULT_DEV_PORTS,
    findFreeDevPorts,
    isPortFree,
    parsePort,
    setEnvDevPorts,
    voltagentDatabaseUrl,
} from './ports';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('parsePort', () => {
    it.each([
        ['5442', 5442],
        [' 6000 ', 6000],
        ['65535', 65535],
        [undefined, undefined],
        ['', undefined],
        ['0', undefined],
        ['65536', undefined],
        ['54a2', undefined],
        ['-1', undefined],
    ])('%j -> %j', (value, port) => {
        expect(parsePort(value)).toBe(port);
    });
});

describe('configuredDevPorts', () => {
    it('defaults to 5432/5433', () => {
        expect(configuredDevPorts({})).toEqual({ app: 5432, voltagent: 5433 });
    });

    it('reads POSTGRES_PORT and VOLTAGENT_POSTGRES_PORT', () => {
        expect(
            configuredDevPorts({
                POSTGRES_PORT: '5442',
                VOLTAGENT_POSTGRES_PORT: '5443',
            }),
        ).toEqual({ app: 5442, voltagent: 5443 });
    });

    it('ignores an invalid value', () => {
        expect(configuredDevPorts({ POSTGRES_PORT: 'nope' }).app).toBe(5432);
    });
});

describe('findFreeDevPorts', () => {
    const freeExcept =
        (...taken: number[]) =>
        async (port: number) =>
            !taken.includes(port);

    it('shifts the defaults by 10 until both ports are free', async () => {
        expect(await findFreeDevPorts(freeExcept())).toEqual({
            app: 5442,
            voltagent: 5443,
        });
        expect(await findFreeDevPorts(freeExcept(5442, 5453))).toEqual({
            app: 5462,
            voltagent: 5463,
        });
    });

    it('never offers the defaults themselves', async () => {
        const pair = await findFreeDevPorts(freeExcept());
        expect(pair).not.toEqual(DEFAULT_DEV_PORTS);
    });

    it('gives up after the given number of attempts', async () => {
        const nothingFree = async () => false;
        expect(
            await findFreeDevPorts(nothingFree, { attempts: 3 }),
        ).toBeUndefined();
    });
});

describe('setEnvDevPorts', () => {
    const from = DEFAULT_DEV_PORTS;
    const to = { app: 5442, voltagent: 5443 };

    it('moves the port vars and the local URLs in .env.example', () => {
        const source = read('.env.example');
        const next = setEnvDevPorts(source, from, to);
        expect(next).toContain('POSTGRES_PORT="5442"');
        expect(next).toContain('VOLTAGENT_POSTGRES_PORT="5443"');
        expect(next).toContain(
            `DATABASE_URL="${localDatabaseUrl(LOCAL_DATABASE_NAME, 5442)}"`,
        );
        expect(next).toContain(
            `VOLTAGENT_DATABASE_URL="${voltagentDatabaseUrl(5443)}"`,
        );
        expect(next.split('\n').length).toBe(source.split('\n').length);
    });

    it('appends the port vars to a .env that predates them', () => {
        const next = setEnvDevPorts(
            'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/app"\n',
            from,
            to,
        );
        expect(next).toBe(
            [
                'DATABASE_URL="postgresql://postgres:postgres@localhost:5442/app"',
                'POSTGRES_PORT="5442"',
                'VOLTAGENT_POSTGRES_PORT="5443"',
                '',
            ].join('\n'),
        );
    });

    it('leaves URLs on other hosts or ports alone', () => {
        const source = [
            'DATABASE_URL="postgresql://u:p@db.example.com:5432/app"',
            'VOLTAGENT_DATABASE_URL="postgresql://u:p@localhost:6000/mem"',
            'OTHER_URL="postgresql://u:p@localhost:5432/app"',
        ].join('\n');
        const next = setEnvDevPorts(source, from, to);
        expect(next.startsWith(source + '\n')).toBe(true);
    });
});

describe('isPortFree', () => {
    let server: Server | undefined;

    afterEach(async () => {
        if (server) await new Promise((resolve) => server!.close(resolve));
        server = undefined;
    });

    async function listen(host?: string): Promise<number> {
        server = createServer();
        await new Promise<void>((resolve) =>
            server!.listen({ port: 0, host }, resolve),
        );
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('Expected a TCP address');
        }
        return address.port;
    }

    it('is false while something listens on every interface', async () => {
        expect(await isPortFree(await listen())).toBe(false);
    });

    it('is false while something listens on loopback only', async () => {
        expect(await isPortFree(await listen('127.0.0.1'))).toBe(false);
    });

    it('is true once the port is released', async () => {
        const port = await listen();
        await new Promise((resolve) => server!.close(resolve));
        server = undefined;
        expect(await isPortFree(port)).toBe(true);
    });
});

// docker-compose.dev.yml, prisma.config.ts, and .env.example can't import
// tools/ports.ts, so these checks catch a hand edit that moves one default
// without the others.
describe('files that mirror the default ports', () => {
    it('docker-compose.dev.yml publishes POSTGRES_PORT / VOLTAGENT_POSTGRES_PORT', () => {
        const compose = read('docker-compose.dev.yml');
        expect(compose).toContain(
            `'\${POSTGRES_PORT:-${DEFAULT_DEV_PORTS.app}}:5432'`,
        );
        expect(compose).toContain(
            `'\${VOLTAGENT_POSTGRES_PORT:-${DEFAULT_DEV_PORTS.voltagent}}:5432'`,
        );
    });

    it('prisma.config.ts falls back to POSTGRES_PORT, then the default', () => {
        expect(read('prisma.config.ts')).toContain(
            `@localhost:\${process.env.POSTGRES_PORT || ${DEFAULT_DEV_PORTS.app}}/${LOCAL_DATABASE_NAME}\``,
        );
    });

    it('.env.example sets the default ports and URLs that match them', () => {
        const example = read('.env.example');
        expect(example).toContain(`POSTGRES_PORT="${DEFAULT_DEV_PORTS.app}"`);
        expect(example).toContain(
            `VOLTAGENT_POSTGRES_PORT="${DEFAULT_DEV_PORTS.voltagent}"`,
        );
        expect(example).toContain(
            `VOLTAGENT_DATABASE_URL="${voltagentDatabaseUrl()}"`,
        );
    });
});
