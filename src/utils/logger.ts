import winston = require("winston");
import fs from "fs";
import path from "path";

let loggerInstance: winston.Logger | null = null;

const setupFileLogging = () => {
  const logsDir = path.join(process.cwd(), "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
};

const createLogger = (useFileTransport: boolean = false): winston.Logger => {
  const { format } = winston;

  const baseConfig: winston.LoggerOptions = {
    level: "debug",
    format: format.combine(
      format.timestamp({
        format: "YYYY-MM-DD HH:mm:ss",
      }),
      format.colorize(),
      format.printf(({ timestamp, level, message, ...metadata }) => {
        let msg = `${timestamp} ${level}: ${message}`;

        // Add metadata if present
        if (Object.keys(metadata).length > 0) {
          msg += ` ${JSON.stringify(metadata)}`;
        }

        return msg;
      }),
    ),
    transports: [new winston.transports.Console()],
  };

  if (useFileTransport) {
    setupFileLogging();
    (baseConfig.transports as winston.transport[]).push(
      new winston.transports.File({
        filename: "logs/error.log",
        level: "error",
      }),
      new winston.transports.File({
        filename: "logs/combined.log",
      }),
    );
  }

  return winston.createLogger(baseConfig);
};

// Create a default logger instance
const defaultLogger = createLogger();

export const initLogger = (
  useFileTransport: boolean = false,
): winston.Logger => {
  // If logger is already initialized, return it
  if (loggerInstance) {
    loggerInstance.debug("Logger already initialized");
    return loggerInstance;
  }

  // Create new logger instance
  loggerInstance = createLogger(useFileTransport);
  loggerInstance.info("Logger initialized", {
    useFileTransport,
    level: loggerInstance.level,
    transports: loggerInstance.transports.map((t) => t.constructor.name),
  });

  return loggerInstance;
};

export const getLogger = (): winston.Logger => {
  // If logger isn't initialized, return the default logger
  // This ensures we always have a working logger
  if (!loggerInstance) {
    defaultLogger.debug("Using default logger - logger not yet initialized");
    return defaultLogger;
  }

  return loggerInstance;
};

// Export a function to change log level dynamically
export const setLogLevel = (level: string): void => {
  const logger = getLogger();
  logger.debug("Changing log level", { from: logger.level, to: level });
  logger.level = level;
};

// Export a function to add file transport to existing logger
export const addFileTransport = (): void => {
  const logger = getLogger();

  if (logger.transports.some((t) => t instanceof winston.transports.File)) {
    logger.debug("File transport already exists");
    return;
  }

  logger.debug("Adding file transport");
  setupFileLogging();

  logger.add(
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
    }),
  );

  logger.add(
    new winston.transports.File({
      filename: "logs/combined.log",
    }),
  );

  logger.info("File transport added successfully");
};
