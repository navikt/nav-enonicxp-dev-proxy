import { RequestHandler } from 'express';
import proxy from 'express-http-proxy';
import * as fs from 'fs';
import escape from 'escape-html';

const XP_ORIGINS: Record<string, string> = {
    dev1: 'https://www.dev.nav.no',
    dev2: 'https://www-q6.nav.no',
    prod: 'https://www.nav.no'
};

const SECRET_PATH = process.env.NODE_ENV === 'development' ? '.' : '/var/secrets';

const readSecret = (env: string) => {
    try {
        return fs.readFileSync(`${SECRET_PATH}/${env}/SERVICE_SECRET`, { encoding: 'utf-8' })
    } catch(e) {
        return null
    }
}

const XP_SECRETS: Record<string, string | null> = (() => ({
    dev1: readSecret('dev1'),
    dev2: readSecret('dev2'),
    prod: readSecret('prod'),
}))();

export const xpProxy: RequestHandler = async (req, res, next) => {
    const xpEnv = req.params.env;
    const xpOrigin = XP_ORIGINS[xpEnv];

    if (!xpOrigin) {
        return res.status(400).send(`${escape(xpEnv)} is not a valid XP environment`);
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
                Object.keys(proxyReq.headers).forEach(header => {
                    if (header.startsWith('x-')) {
                        delete proxyReq.headers?.[header];
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
        limit: '10mb',
    })(req, res, next);
};