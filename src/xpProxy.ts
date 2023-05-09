import { RequestHandler } from 'express';
import proxy from 'express-http-proxy';
import * as fs from 'fs';

const XP_ORIGINS: Record<string, string> = {
    dev1: 'https://www.dev.nav.no',
    dev2: 'https://www-q6.nav.no',
};

const SECRET_PATH = process.env.NODE_ENV === 'development' ? '.' : '/var/secrets';

const XP_SECRETS: Record<string, string> = (() => ({
    dev1: fs.readFileSync(`${SECRET_PATH}/dev1/SERVICE_SECRET`, { encoding: 'utf-8' }),
    dev2: fs.readFileSync(`${SECRET_PATH}/dev2/SERVICE_SECRET`, { encoding: 'utf-8' }),
}))();

export const xpProxy: RequestHandler = async (req, res, next) => {
    const devEnv = req.params.env;
    const xpOrigin = XP_ORIGINS[devEnv];

    if (!xpOrigin) {
        return res.status(400).send(`${devEnv} is not a valid XP dev environment`);
    }

    return proxy(xpOrigin, {
        proxyReqPathResolver: (req) => {
            const path = req.url.replace(`/${devEnv}`, '');

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
                const secret = XP_SECRETS[devEnv];
                if (secret) {
                    proxyReq.headers = { ...proxyReq.headers, secret };
                } else {
                    console.error(`No secret found for env ${devEnv}!`);
                }
            }

            return proxyReq;
        },
        limit: '10mb',
    })(req, res, next);
};