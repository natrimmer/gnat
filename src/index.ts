import { FSWatcher, watch } from 'chokidar';
import * as liveServer from 'live-server';
import path from 'path';
import { build } from './build/build';
import { initLogger } from './utils/logger';
import { BuildOptions } from './utils/types';

const isDev = process.argv.includes('--watch');
const useFileLogging = process.argv.includes('--log-file');

const logger = initLogger(useFileLogging);

const serverConfig = {
  port: 8080,
  host: 'localhost',
  root: './public',
  open: true,
  file: 'index.html',
  wait: 100,
  logLevel: 0 as 0 | 1 | 2 | undefined,
  ignore: '^.*/\\.',
  mount: [],
  middleware: [],
};

async function runBuild(dev: boolean = false) {
  try {
    await build({
      includeDrafts: dev,
    } as BuildOptions);
  } catch (error) {
    logger.error('Build failed:', error);
    process.exit(1);
  }
}

let watcher: FSWatcher | null = null;

async function cleanup() {
  logger.info('Initiating shutdown sequence');

  if (watcher) {
    await watcher.close();
    logger.info('File watcher closed');
  }

  // Give time for any pending operations to complete
  await new Promise((resolve) => setTimeout(resolve, 100));

  logger.info('Shutdown complete');
  process.exit(0);
}

async function startDevServer() {
  await runBuild(true);

  liveServer.start(serverConfig);

  const srcDir = path.join(__dirname, '..', 'src');
  watcher = watch([srcDir], {
    ignored: [
      /(^|[\/\\])\../, 
      /\.log$/,
      '**/node_modules/**',
      '**/public/**',
      '**/*.git/**',
    ],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  watcher
    .on('add', async (filepath) => {
      const relativePath = path.relative(srcDir, filepath);
      logger.info(`File ${relativePath} has been added`);
      await runBuild();
    })
    .on('change', async (filepath) => {
      const relativePath = path.relative(srcDir, filepath);
      logger.info(`File ${relativePath} has been changed`);
      await runBuild();
    })
    .on('unlink', async (filepath) => {
      const relativePath = path.relative(srcDir, filepath);
      logger.info(`File ${relativePath} has been removed`);
      await runBuild();
    });

  logger.info('Development server started at http://localhost:8080');
}

// Set up signal handlers
process.on('SIGINT', cleanup); // Ctrl+C
process.on('SIGTERM', cleanup); // Kill signal
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  cleanup();
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
  cleanup();
});

if (isDev) {
  startDevServer();
} else {
  runBuild();
}
