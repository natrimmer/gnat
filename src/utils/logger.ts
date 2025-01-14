import winston = require('winston');
import fs from 'fs';
import path from 'path';

let loggerInstance: winston.Logger | null = null;

const setupFileLogging = () => {
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
};

const createLogger = (useFileTransport: boolean = false): winston.Logger => {
  const { format } = winston;

  const baseConfig: winston.LoggerOptions = {
    level: 'debug',
    format: format.combine(
      format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss',
      }),
      format.colorize(),
      format.printf(({ timestamp, level, message }) => {
        return `${timestamp} ${level}: ${message}`;
      }),
    ),
    transports: [new winston.transports.Console()],
  };

  if (useFileTransport) {
    setupFileLogging();
    (baseConfig.transports as winston.transport[]).push(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
      }),
    );
  }

  return winston.createLogger(baseConfig);
};

export const initLogger = (useFileTransport: boolean = false) => {
  if (!loggerInstance) {
    loggerInstance = createLogger(useFileTransport);
  }
  return loggerInstance;
};

export const getLogger = (): winston.Logger => {
  if (!loggerInstance) {
    throw new Error('Logger has not been initialized. Call initLogger first.');
  }
  return loggerInstance;
};
