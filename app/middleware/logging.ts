import { requestIdContext } from './context';

export const loggingMiddleware = async (
    { request, context }: { request: Request; context: any },
    next: () => Promise<Response>,
) => {
    const requestId = crypto.randomUUID();
    context.set(requestIdContext, requestId);

    return next();
};
