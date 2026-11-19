'use strict';

/** Entry point: start the HTTP server. */
const config = require('./config');
const { createApp } = require('./app');
const { closeDb } = require('./db');

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  // eslint-disable-next-line no-console
  console.log(`Udhaar Tracker running at http://${config.host}:${config.port}`);
});

function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`Received ${signal}, shutting down...`);
  server.close(() => {
    closeDb();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
