import express, { ErrorRequestHandler } from 'express';
import { xpProxy } from "./xpProxy";

const app = express();
const port = 1337;

app.get('/internal/isAlive', (req, res) => {
    return res.status(200).send('I am alive!');
});

app.get('/internal/isReady', (req, res) => {
    return res.status(200).send('I am ready!');
});

app.get('/:env(dev1|dev2)/_/*', xpProxy);

app.use(((err, req, res, _) => {
    const {path} = req;
    const {status, stack} = err;
    const msg = stack?.split('\n')[0];

    console.log(`Express error on path ${path}: ${status} ${msg}`);

    const statusCode = status || 500;

    return res.status(statusCode).send(msg);
}) as ErrorRequestHandler);

const server = app.listen(port, () => {
    console.log(`Server starting on port ${port}`);
});

const shutdown = () => {
    console.log('Server shutting down');

    server.close(() => {
        console.log('Shutdown complete!');
        process.exit(0);
    });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
