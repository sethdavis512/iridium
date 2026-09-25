import { createContext, useContext, type PropsWithChildren } from 'react';

/**
 * The per-request CSP nonce, provided by entry.server.tsx around the whole
 * server render. Undefined in the browser: browsers hide nonce attributes
 * after parsing, so client renders never have (or need) the value.
 */
const NonceContext = createContext<string | undefined>(undefined);

type Props = PropsWithChildren<{ nonce: string }>;

export function NonceProvider({ nonce, children }: Props) {
    return <NonceContext value={nonce}>{children}</NonceContext>;
}

/** Nonce for app-authored inline scripts; pair with suppressHydrationWarning. */
export function useNonce() {
    return useContext(NonceContext);
}
