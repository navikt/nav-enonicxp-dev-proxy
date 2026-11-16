import {
    collectDefaultMetrics,
    Counter,
    Histogram,
    Registry,
} from '@prometheus-io/client';
import { RequestHandler, Response } from 'express';
import { isXpEnv, XP_ENVS } from './xpConfig';

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

const prefix = 'nav_enonicxp_dev_proxy_';

// Unknown environments are counted as "invalid", which keeps the env label to a fixed set
const INVALID_ENV = 'invalid';

// The proxy couldn't get a response from XP at all (connection refused, reset, DNS, timeout...)
const NETWORK_ERROR = 'network_error';

const statuses = ['2xx', '3xx', '4xx', '5xx', NETWORK_ERROR];

export const proxyRequests = new Counter({
    name: `${prefix}requests_total`,
    help: 'Proxied requests by XP environment and the status class sent back to the client, or network_error when XP could not be reached. env is invalid for unknown environments',
    labelNames: ['env', 'status'] as const,
    registers: [registry],
});

export const proxyDuration = new Histogram({
    name: `${prefix}request_duration_seconds`,
    help: 'Time from the request reaching the proxy until the response is sent, by XP environment',
    labelNames: ['env'] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    registers: [registry],
});

// Every series exists from startup, so rates and alerts work before the first request
for (const env of [...XP_ENVS, INVALID_ENV]) {
    for (const status of statuses) {
        proxyRequests.inc({ env, status }, 0);
    }
}

const envLabel = (env: string) => (isXpEnv(env) ? env : INVALID_ENV);

// Set by the proxy's error handler, so the metric can tell XP's own errors from not reaching XP
export const markNetworkError = (res: Response) => {
    res.locals.proxyNetworkError = true;
};

const statusLabel = (res: Response) =>
    res.locals.proxyNetworkError
        ? NETWORK_ERROR
        : `${Math.floor(res.statusCode / 100)}xx`;

// Records the request when the response is sent. Requests the client aborts before that aren't counted
export const observeProxyRequest = (env: string, res: Response) => {
    const label = envLabel(env);
    const stopTimer = proxyDuration.startTimer({ env: label });

    res.once('finish', () => {
        stopTimer();
        proxyRequests.inc({ env: label, status: statusLabel(res) });
    });
};

export const metricsHandler: RequestHandler = async (req, res) => {
    res.type(registry.contentType).send(await registry.metrics());
};
