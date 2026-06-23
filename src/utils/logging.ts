/**
 * Lightweight, dependency-free logging with levels and tag prefixes.
 *
 * Kept tiny on purpose (no logging library — see CLAUDE.md "avoid unnecessary dependencies").
 * Use {@link createLogger} to get a tagged logger per module.
 */

export const enum LogLevel {
  Silent = 0,
  Error = 1,
  Warn = 2,
  Info = 3,
  Debug = 4,
}

let currentLevel: LogLevel = LogLevel.Info;

/** Set the global minimum log level. Messages below this level are dropped. */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/** Get the current global log level. */
export function getLogLevel(): LogLevel {
  return currentLevel;
}

export interface Logger {
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

/**
 * Create a logger that prefixes every message with `[tag]`.
 *
 * @param tag - Short module/subsystem name, e.g. `"xr"`, `"capabilities"`.
 */
export function createLogger(tag: string): Logger {
  const prefix = `[bp-ar:${tag}]`;
  return {
    error(message: string, ...args: unknown[]): void {
      if (currentLevel >= LogLevel.Error) console.error(prefix, message, ...args);
    },
    warn(message: string, ...args: unknown[]): void {
      if (currentLevel >= LogLevel.Warn) console.warn(prefix, message, ...args);
    },
    info(message: string, ...args: unknown[]): void {
      if (currentLevel >= LogLevel.Info) console.info(prefix, message, ...args);
    },
    debug(message: string, ...args: unknown[]): void {
      if (currentLevel >= LogLevel.Debug) console.debug(prefix, message, ...args);
    },
  };
}
