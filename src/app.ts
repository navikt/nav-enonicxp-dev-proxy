import express, { ErrorRequestHandler } from 'express';
import { metricsHandler } from './metrics';
import { xpProxy } from './xpProxy';

export const app = express();

app.get('/internal/isAlive', (req, res) => {
    return res.status(200).send('I am alive!');
});

app.get('/internal/isReady', (req, res) => {
    return res.status(200).send('I am ready!');
});

app.get('/internal/metrics', metricsHandler);

app.get('/:env/_/*splat', xpProxy);

app.use(((err, req, res, _) => {
    const { path } = req;
    const { status, stack } = err;
    const msg = stack?.split('\n')[0];

    console.log(`Express error on path ${path}: ${status} ${msg}`);

    const statusCode = status || 500;

    return res.status(statusCode).send(msg);
}) as ErrorRequestHandler);
