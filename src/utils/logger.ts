import winston = require("winston");
import * as fs from "fs";
import * as path from "path";

let loggerInstance: winston.Logger | null = null;
const { format } = winston;

// Setup directory for file logging
const setupFileLogging = () => {
  const logsDir = path.join(process.cwd(), "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
};

// Define a type for winston info object with our custom properties
interface LogInfo extends winston.Logform.TransformableInfo {
  prettyMeta?: string;
}

// Custom formatter for pretty printing metadata
const createPrettyMetadata = () => format((info: LogInfo) => {
  const { level, message, timestamp, splat, ...metadata } = info;
  
  if (Object.keys(metadata).length > 0) {
    info.prettyMeta = JSON.stringify(metadata, null, 2);
  } else {
    info.prettyMeta = '';
  }
  
  return info;
})();

// Base formatter that formats log messages with indented metadata
const createBaseFormatter = () => format.printf((info: LogInfo) => {
  const { timestamp, level, message, prettyMeta } = info;
  let msg = `${timestamp} ${level}: ${message}`;
  
  if (prettyMeta) {
    msg += `\n${prettyMeta
      .split('\n')
      .map(line => `  ${line}`) // Indent each line
      .join('\n')
    }`;
  }
  
  return msg;
});

// Create a console format with colors
const createConsoleFormat = () => format.combine(
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  createPrettyMetadata(),
  format.colorize(),
  createBaseFormatter()
);

// Create a file format without colors
const createFileFormat = () => format.combine(
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  createPrettyMetadata(),
  createBaseFormatter()
);

// Main logger creation function
const createLogger = (useFileTransport: boolean = false): winston.Logger => {
  const baseConfig: winston.LoggerOptions = {
    level: process.env.LOG_LEVEL || "info",
    transports: [
      new winston.transports.Console({
        format: createConsoleFormat()
      })
    ],
  };

  if (useFileTransport) {
    setupFileLogging();
    const fileFormat = createFileFormat();
    
    (baseConfig.transports as winston.transport[]).push(
      new winston.transports.File({
        filename: "logs/error.log",
        level: "error",
        format: fileFormat
      }),
      new winston.transports.File({
        filename: "logs/combined.log",
        format: fileFormat
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
    source: process.env.LOG_LEVEL ? "environment" : "default",
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
  const source = process.env.LOG_LEVEL ? "environment" : "default";
  logger.debug("Changing log level", { from: logger.level, source, to: level });
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
  
  const fileFormat = createFileFormat();

  logger.add(
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      format: fileFormat
    }),
  );

  logger.add(
    new winston.transports.File({
      filename: "logs/combined.log",
      format: fileFormat
    }),
  );

  logger.info("File transport added successfully");
};
