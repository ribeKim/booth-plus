export type BackendConfig = {
  host: string;
  port: number;
  logLevel: string;
  corsOrigins: string[];
};

const parsePort = (value: string | undefined): number => {
  const port = Number(value ?? 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535, received: ${value}`);
  }

  return port;
};

const parseList = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): BackendConfig => ({
  host: env.HOST?.trim() || "0.0.0.0",
  port: parsePort(env.PORT),
  logLevel: env.LOG_LEVEL?.trim() || "info",
  corsOrigins: parseList(env.CORS_ORIGINS),
});
