import { RequestHandler } from 'express';
import proxy from 'express-http-proxy';
import * as fs from 'fs';
import { markNetworkError, observeProxyRequest } from './metrics';
import { isXpEnv, proxyConfig, XP_ORIGINS } from './xpConfig';

const SECRET_PATH =
    process.env.NODE_ENV === 'development' ? '.' : '/var/secrets';

const readSecret = (env: string) => {
    try {
        return fs.readFileSync(`${SECRET_PATH}/${env}/SERVICE_SECRET`, {
            encoding: 'utf-8',
        });
    } catch (e) {
        return null;
    }
};

const XP_SECRETS: Record<string, string | null> = (() => ({
    dev1: readSecret('dev1'),
    dev2: readSecret('dev2'),
    prod: readSecret('prod'),
}))();

const forceAsString = (value: string | string[] | undefined): string => {
    if (Array.isArray(value)) {
        return value[0];
    }

    return value || '';
};

export const xpProxy: RequestHandler = async (req, res, next) => {
    // Express 5 types params as `string | string[]` to account for wildcard segments.
    const xpEnv = forceAsString(req.params.env);
    const xpOrigin = isXpEnv(xpEnv) ? XP_ORIGINS[xpEnv] : undefined;

    observeProxyRequest(xpEnv, res);

    if (!xpOrigin) {
        return res.status(400).send(`${xpEnv} is not a valid XP environment`);
    }

    return proxy(xpOrigin, {
        proxyReqPathResolver: (req) => {
            const path = req.url.replace(`/${xpEnv}`, '');

            console.log(`Proxying ${path} to ${xpOrigin}`);

            return path;
        },
        proxyReqOptDecorator: (proxyReq, srcReq) => {
            // Remove x-headers which XP will use to detect our proxy and fail to resolve
            // the called path. We probably don't need to remove all of them, but it doesn't hurt...
            if (proxyReq.headers) {
                Object.keys(proxyReq.headers).forEach((header) => {
                    if (header.startsWith('x-')) {
                        delete (proxyReq.headers as Record<string, any>)[
                            header
                        ];
                    }
                });
            }

            if (srcReq.headers.secret) {
                const secret = XP_SECRETS[xpEnv];
                if (secret) {
                    proxyReq.headers = { ...proxyReq.headers, secret };
                } else {
                    console.error(`No secret found for env ${xpEnv}!`);
                }
            }

            return proxyReq;
        },
        // Same as express-http-proxy's default handler, but marks the request for the metrics first
        proxyErrorHandler: (err, res, next) => {
            // The client went away (closing the browser tab, say), which isn't XP's fault and isn't counted
            if (res.destroyed) {
                return;
            }

            markNetworkError(res);
            console.error(
                `Could not reach ${xpOrigin}: ${err?.code ?? err?.message}`
            );

            if (err?.code === 'ECONNRESET') {
                res.setHeader(
                    'X-Timeout-Reason',
                    'express-http-proxy reset the request.'
                );
                return res.status(504).send();
            }

            return next(err);
        },
        limit: '10mb',
        timeout: proxyConfig.timeoutMs,
    })(req, res, next);
};
