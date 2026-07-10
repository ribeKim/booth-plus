const wildcardOriginPattern = /^(https?):\/\/\*\.([a-z0-9.-]+)(?::(\d{1,5}))?$/i;

const normalizeExactOrigin = (origin: string): string => origin.replace(/\/$/, "");

const matchesWildcardOrigin = (origin: string, pattern: string): boolean => {
  const match = wildcardOriginPattern.exec(pattern);
  if (!match) {
    return false;
  }

  try {
    const url = new URL(origin);
    const protocol = match[1];
    const hostname = match[2];
    const port = match[3] ?? "";

    if (!protocol || !hostname) {
      return false;
    }

    return (
      url.protocol === `${protocol.toLowerCase()}:` &&
      url.port === port &&
      url.hostname.toLowerCase().endsWith(`.${hostname.toLowerCase()}`)
    );
  } catch {
    return false;
  }
};

export const isOriginAllowed = (origin: string, allowedOrigins: readonly string[]): boolean => {
  const normalizedOrigin = normalizeExactOrigin(origin);

  return allowedOrigins.some((configuredOrigin) => {
    const pattern = configuredOrigin.trim();
    if (!pattern) {
      return false;
    }

    return (
      normalizeExactOrigin(pattern) === normalizedOrigin ||
      matchesWildcardOrigin(normalizedOrigin, pattern)
    );
  });
};
