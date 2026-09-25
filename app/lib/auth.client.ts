import { createAuthClient } from 'better-auth/client';
import { adminClient } from 'better-auth/client/plugins';

// No baseURL: the client calls /api/auth on the page's own origin, which is
// where the server mounts Better Auth. A build-time URL would only be needed
// if the auth API moved to a different origin.
export const authClient = createAuthClient({
    plugins: [adminClient()],
});
