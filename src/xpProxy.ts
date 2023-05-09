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

    const url = `${xpOrigin}${req.url.replace(`/${devEnv}`, '')}`;

    return proxy(xpOrigin, {
        proxyReqPathResolver: (req) => {
            const path = req.url.replace(`/${devEnv}`, '');

            console.log(`Proxying ${path} to ${xpOrigin}`);

            return path;
        },
        proxyReqOptDecorator: (proxyReq, srcReq) => {
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

            console.log(proxyReq.headers)

            return proxyReq;
        },
        proxyErrorHandler: (err, res, next) => {
            console.log(err, err?.code);
            next(err);
        },
        userResDecorator: (proxyRes, proxyResData) => {
            console.log(`Res Status: ${proxyRes.statusCode} ${proxyRes.statusMessage}`)
            console.log(`Res Headers: ${JSON.stringify(proxyRes.headers)}`)
            console.log(`Res Data: ${proxyResData.toString().slice(0, 100)}`);
            return proxyResData;
        },
        limit: '10mb',
        memoizeHost: false,
    })(req, res, next);
};