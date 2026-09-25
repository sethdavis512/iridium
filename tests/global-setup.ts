import type { FullConfig } from '@playwright/test';
import { DEMO_EMAIL_DOMAIN } from '~/config';

const TEST_USERS = [
    {
        name: 'Alice',
        email: `alice@${DEMO_EMAIL_DOMAIN}`,
        password: 'password123',
    },
    { name: 'Bob', email: `bob@${DEMO_EMAIL_DOMAIN}`, password: 'password123' },
];

export default async function globalSetup(config: FullConfig) {
    const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:7778';

    for (const user of TEST_USERS) {
        const res = await fetch(`${baseURL}/api/auth/sign-up/email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Better Auth validates the request Origin against its trusted
                // origins; a server-to-server fetch sends none, so set it.
                Origin: baseURL,
            },
            body: JSON.stringify(user),
        });

        if (res.ok) {
            console.log(`  Created test user ${user.email}`);
        } else {
            const body = await res.json().catch(() => ({}));
            // "User already exists" is fine. Better Auth answers a duplicate
            // sign-up with 422 and USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL.
            if (
                typeof body?.code === 'string' &&
                body.code.startsWith('USER_ALREADY_EXISTS')
            ) {
                console.log(`  Test user ${user.email} already exists`);
            } else {
                console.log(
                    `  Note: ${user.email} setup returned ${res.status}`,
                );
            }
        }
    }
}
