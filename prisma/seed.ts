import 'dotenv/config';
import { DEMO_EMAIL_DOMAIN } from '../app/config';
// Importing the Better Auth instance triggers env validation and reuses the
// app's own Prisma client, so seeding works without a running dev server.
import { auth } from '../app/lib/auth.server';
import prisma from '../app/lib/prisma';

const seedUsers = [
    {
        name: 'Alice',
        email: `alice@${DEMO_EMAIL_DOMAIN}`,
        password: 'password123',
    },
    { name: 'Bob', email: `bob@${DEMO_EMAIL_DOMAIN}`, password: 'password123' },
    {
        name: 'Admin',
        email: `admin@${DEMO_EMAIL_DOMAIN}`,
        password: 'password123',
        role: 'ADMIN' as const,
    },
];

async function main() {
    console.log('Seeding database...');

    for (const user of seedUsers) {
        const existing = await prisma.user.findUnique({
            where: { email: user.email },
        });

        if (existing) {
            console.log(`  Skipping ${user.email} (already exists)`);
            continue;
        }

        // Use the Better Auth server API so passwords are hashed and Account
        // records are created correctly. No HTTP round-trip needed.
        await auth.api.signUpEmail({
            body: {
                name: user.name,
                email: user.email,
                password: user.password,
            },
        });

        if (user.role) {
            await prisma.user.update({
                where: { email: user.email },
                data: { role: user.role },
            });
        }

        console.log(
            `  Created ${user.email}${user.role ? ` (${user.role})` : ''}`,
        );
    }

    console.log('Seeding complete.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
