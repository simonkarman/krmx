/**
 * The severity of a log message.
 */
export type LogSeverity = 'debug' | 'info' | 'warn' | 'error';

/**
 * An interface of a logger that can be used to output log messages.
 *
 * @param severity Indicates the severity of the log message.
 * @param args The arguments that describe the event that occurred.
 */
export type Logger = (severity: LogSeverity, ...args: unknown[]) => void;
