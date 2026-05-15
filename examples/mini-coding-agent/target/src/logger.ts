export type LogLevel = "info" | "warn" | "error";

export function log(level: LogLevel, msg: string): void {
  const stamp = new Date().toISOString();
  const line = `[${stamp}] ${level.toUpperCase()} ${msg}`;
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}
