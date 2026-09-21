const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const COLORS = {
  debug: '\x1b[90m', // grey
  info: '\x1b[36m', // cyan
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
};

const RESET = '\x1b[0m';

const threshold = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function write(level, args) {
  if ((LEVELS[level] ?? LEVELS.info) < threshold) return;
  const ts = new Date().toISOString();
  const prefix = `${COLORS[level] ?? ''}[ALTNEU] ${ts} ${level.toUpperCase()}${RESET}`;
  const method = level === 'error' ? 'error' : 'log';
  // eslint-disable-next-line no-console
  console[method](prefix, ...args);
}

/** Minimal leveled logger with ISO timestamps. Swap for pino/winston later. */
export const logger = {
  debug: (...args) => write('debug', args),
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args),
};