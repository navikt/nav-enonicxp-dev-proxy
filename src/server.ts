import { app } from './app';

const port = 1337;

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
