export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Readonly<Record<LogLevel, number>> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

class Logger {
  private readonly level: LogLevel;
  private readonly levelPriority: number;

  constructor(level: LogLevel = "warn") {
    this.level = level;
    this.levelPriority = LOG_LEVELS[level];
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= this.levelPriority;
  }

  private formatMessage(level: LogLevel, message: string, args: readonly unknown[]): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (args.length === 0) {
      return `${prefix} ${message}\n`;
    }
    
    const formattedArgs = args.map(arg => 
      typeof arg === 'string' ? arg : JSON.stringify(arg)
    ).join(' ');
    
    return `${prefix} ${message} ${formattedArgs}\n`;
  }

  private writeLog(level: LogLevel, message: string, args: readonly unknown[]): void {
    if (!this.shouldLog(level)) return;
    
    const formattedMessage = this.formatMessage(level, message, args);
    process.stderr.write(formattedMessage);
  }

  debug(message: string, ...args: readonly unknown[]): void {
    this.writeLog("debug", message, args);
  }

  info(message: string, ...args: readonly unknown[]): void {
    this.writeLog("info", message, args);
  }

  warn(message: string, ...args: readonly unknown[]): void {
    this.writeLog("warn", message, args);
  }

  error(message: string, ...args: readonly unknown[]): void {
    this.writeLog("error", message, args);
  }
}

export const logger = new Logger(
   // biome-ignore lint/complexity/useLiteralKeys: TypeScriptのインデックスシグネチャ要件により必要
  (process.env["KUHI_LOG_LEVEL"] as LogLevel | undefined) ?? "warn",
);
