import { auth } from './auth.server';
import { Role } from '~/generated/prisma/client';

type UserWithRole = {
    id: string;
    role: Role;
    email: string;
    name: string;
    emailVerified: boolean;
    image?: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export async function getUserFromSession(request: Request) {
    try {
        const session = await auth.api.getSession({
            headers: request.headers,
        });

        return session?.user ?? null;
    } catch (error) {
        console.error('Session error:', error);
        return null;
    }
}

export async function requireUser(request: Request) {
    const user = await getUserFromSession(request);

    if (!user) {
        throw new Response('Unauthorized', { status: 401 });
    }

    return user;
}

export async function requireAnonymous(request: Request) {
    const user = await getUserFromSession(request);

    if (user) {
        throw new Response('Already authenticated', {
            status: 302,
            headers: { Location: '/dashboard' },
        });
    }
}

export function hasRole(user: { role: Role }, role: Role): boolean {
    const roleHierarchy = {
        [Role.USER]: 1,
        [Role.EDITOR]: 2,
        [Role.ADMIN]: 3,
    };

    return roleHierarchy[user.role] >= roleHierarchy[role];
}

export async function requireRole(
    request: Request,
    allowedRoles: Role[],
): Promise<UserWithRole> {
    const user = await requireUser(request);

    // The user object from the database includes the role field
    // even if TypeScript doesn't know about it from BetterAuth types
    const userWithRole = user as unknown as UserWithRole;

    if (!allowedRoles.includes(userWithRole.role)) {
        throw new Response('Forbidden', { status: 403 });
    }

    return userWithRole;
}

export async function requireEditor(request: Request) {
    return requireRole(request, [Role.EDITOR, Role.ADMIN]);
}

export async function requireAdmin(request: Request) {
    return requireRole(request, [Role.ADMIN]);
}
