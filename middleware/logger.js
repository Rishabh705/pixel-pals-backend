const winston = require('winston');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('winston-daily-rotate-file'); // For log rotation

// Get log directory from environment or set default
const logDirectory = process.env.LOG_DIR || path.join(__dirname, '../logs');

// Custom log levels with 'critical'
const customLevels = {
  levels: {
    critical: 0,
    error: 1,
    warn: 2,
    info: 3,
    http: 4,
    debug: 5,
  },
  colors: {
    critical: 'red bold',
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'cyan',
    debug: 'blue',
  },
};

// Apply colors to custom levels
winston.addColors(customLevels.colors);

// Create the logger
const logger = winston.createLogger({
  levels: customLevels.levels,
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'api-service' },
  transports: [
    // Log rotation for combined logs
    new winston.transports.DailyRotateFile({
      filename: path.join(logDirectory, '%DATE%-combined.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
    }),
    // Log rotation for error logs
    new winston.transports.DailyRotateFile({
      filename: path.join(logDirectory, '%DATE%-error.log'),
      level: 'error',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
    }),
  ],
});

// Console logging for non-production environments
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

// Middleware for HTTP request logging
const httpLogger = (req, res, next) => {
  const startTime = Date.now();
  const correlationId = req.correlationId || uuidv4(); // Attach correlation ID if not present

  // Log request completion
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.http('HTTP Request', {
      correlationId,
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  });

  req.correlationId = correlationId; // Attach correlation ID to the request object
  next();
};

module.exports = { logger, httpLogger };
