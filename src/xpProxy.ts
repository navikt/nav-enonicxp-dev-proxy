import { RequestHandler } from 'express';
import proxy from 'express-http-proxy';

const XP_ORIGINS: Record<string, string> = {
    dev1: 'https://www.dev.nav.no',
    dev2: 'https://www-q6.nav.no',
};

const { SERVICE_SECRET } = process.env;

export const xpProxy: RequestHandler = (req, res, next) => {
    const devEnv = req.params.env;
    const xpOrigin = XP_ORIGINS[devEnv];

    if (!xpOrigin) {
        return res.status(400).send(`${devEnv} is not a valid XP dev environment`);
    }

    return proxy(xpOrigin, {
        proxyReqPathResolver: (req) => {
            const path = req.url.replace(`/${devEnv}`, '');

            console.log(`Proxying ${path} to ${xpOrigin}`)

            return path;
        },
        proxyReqOptDecorator: (proxyReq, srcReq) => {
            if (srcReq.headers.secret) {
                proxyReq.headers = { ...proxyReq.headers, secret: SERVICE_SECRET };
            }

            return proxyReq;
        },
    })(req, res, next);
};