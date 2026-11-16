// Runs against the build (dist), so run `pnpm build` first. CI builds before it tests.
// XP is replaced by a local server, so nothing here leaves the machine.
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

const require = createRequire(import.meta.url);
const dist = path.resolve(import.meta.dirname, '../dist');

const { app } = require(`${dist}/app.js`);
const { XP_ORIGINS, proxyConfig } = require(`${dist}/xpConfig.js`);

const listen = (server: http.Server) =>
    new Promise<string>((resolve) =>
        server.listen(0, '127.0.0.1', () =>
            resolve(
                `http://127.0.0.1:${(server.address() as AddressInfo).port}`
            )
        )
    );

// Stands in for XP: /_/ok gives 200, /_/broken 502, /_/reset drops the connection and /_/hang never answers
const xp = http.createServer((req, res) => {
    if (req.url?.startsWith('/_/hang')) {
        return;
    }
    if (req.url?.startsWith('/_/reset')) {
        req.socket.destroy();
        return;
    }
    res.writeHead(req.url?.startsWith('/_/broken') ? 502 : 200).end('xp');
});

const proxy = http.createServer(app);
let proxyUrl: string;

const metrics = async () => {
    const res = await fetch(`${proxyUrl}/internal/metrics`);
    assert.equal(res.status, 200);
    return res.text();
};

// The value of one series, or undefined if it isn't there
const valueOf = (text: string, name: string, labels: string) =>
    text
        .split('\n')
        .find((line) => line.startsWith(`${name}{${labels}} `))
        ?.split(' ')[1];

const requestsTotal = async (env: string, status: string) =>
    Number(
        valueOf(
            await metrics(),
            'nav_enonicxp_dev_proxy_requests_total',
            `env="${env}",status="${status}"`
        )
    );

// Counts are read before and after, since the tests share one registry
const countDuring = async (
    env: string,
    status: string,
    request: () => Promise<Response>
) => {
    const before = await requestsTotal(env, status);
    const res = await request();
    await res.text();
    return { res, counted: (await requestsTotal(env, status)) - before };
};

describe('metrics', () => {
    before(async () => {
        const xpUrl = await listen(xp);
        XP_ORIGINS.dev1 = xpUrl;
        XP_ORIGINS.dev2 = 'http://127.0.0.1:1'; // Nothing listens there
        proxyConfig.timeoutMs = 300;
        proxyUrl = await listen(proxy);
    });

    after(() => {
        proxy.close();
        xp.closeAllConnections();
        xp.close();
    });

    test('are served in the Prometheus text format', async () => {
        const res = await fetch(`${proxyUrl}/internal/metrics`);
        assert.equal(res.status, 200);
        assert.match(
            res.headers.get('content-type') ?? '',
            /^text\/plain.*version=0\.0\.4/
        );
        assert.match(await res.text(), /^process_cpu_seconds_total /m);
    });

    test('every request series exists from startup', async () => {
        const text = await metrics();
        for (const env of ['dev1', 'dev2', 'prod', 'invalid']) {
            for (const status of [
                '2xx',
                '3xx',
                '4xx',
                '5xx',
                'network_error',
            ]) {
                assert.notEqual(
                    valueOf(
                        text,
                        'nav_enonicxp_dev_proxy_requests_total',
                        `env="${env}",status="${status}"`
                    ),
                    undefined,
                    `${env} ${status}`
                );
            }
        }
    });

    test('counts successful requests and their duration', async () => {
        const durationCount = async () =>
            Number(
                valueOf(
                    await metrics(),
                    'nav_enonicxp_dev_proxy_request_duration_seconds_count',
                    'env="dev1"'
                ) ?? 0
            );
        const durationsBefore = await durationCount();

        const { res, counted } = await countDuring('dev1', '2xx', () =>
            fetch(`${proxyUrl}/dev1/_/ok`)
        );
        assert.equal(res.status, 200);
        assert.equal(counted, 1);
        assert.equal((await durationCount()) - durationsBefore, 1);
    });

    test('counts errors from XP as 5xx, not network_error', async () => {
        const networkErrorsBefore = await requestsTotal(
            'dev1',
            'network_error'
        );
        const { res, counted } = await countDuring('dev1', '5xx', () =>
            fetch(`${proxyUrl}/dev1/_/broken`)
        );
        assert.equal(res.status, 502);
        assert.equal(counted, 1);
        assert.equal(
            await requestsTotal('dev1', 'network_error'),
            networkErrorsBefore
        );
    });

    test('counts unknown environments as invalid', async () => {
        for (const env of ['nope', 'constructor', '__proto__']) {
            const { res, counted } = await countDuring('invalid', '4xx', () =>
                fetch(`${proxyUrl}/${env}/_/ok`)
            );
            assert.equal(res.status, 400, env);
            assert.equal(counted, 1, env);
        }
    });

    test('counts an unreachable XP as network_error', async () => {
        const { res, counted } = await countDuring(
            'dev2',
            'network_error',
            () => fetch(`${proxyUrl}/dev2/_/ok`)
        );
        assert.equal(res.status, 500);
        assert.equal(counted, 1);
    });

    test('counts a connection reset by XP as network_error, and answers 504', async () => {
        const { res, counted } = await countDuring(
            'dev1',
            'network_error',
            () => fetch(`${proxyUrl}/dev1/_/reset`)
        );
        assert.equal(res.status, 504);
        assert.equal(counted, 1);
    });

    test('counts XP not answering as network_error, and answers 504 at the timeout', async () => {
        const { res, counted } = await countDuring(
            'dev1',
            'network_error',
            () => fetch(`${proxyUrl}/dev1/_/hang`)
        );
        assert.equal(res.status, 504);
        assert.equal(counted, 1);
    });

    test('neither counts nor logs requests the client aborts', async (t) => {
        const consoleError = t.mock.method(console, 'error', () => {});
        const before = await metrics();

        const controller = new AbortController();
        const request = fetch(`${proxyUrl}/dev1/_/hang`, {
            signal: controller.signal,
        });
        setTimeout(() => controller.abort(), 50);
        await assert.rejects(request);
        // Past the proxy's timeout, so the upstream request is surely gone too
        await new Promise((resolve) =>
            setTimeout(resolve, proxyConfig.timeoutMs + 100)
        );

        assert.equal(consoleError.mock.callCount(), 0);
        const requests = (text: string) =>
            text
                .split('\n')
                .filter((line) =>
                    line.startsWith(
                        'nav_enonicxp_dev_proxy_requests_total{env="dev1"'
                    )
                );
        assert.deepEqual(requests(await metrics()), requests(before));
    });
});
