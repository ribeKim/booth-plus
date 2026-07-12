const ITEM_PATH_PATTERN = /\/items\/(\d+)(?:\/|$)/;

export const getCurrentItemId = (): string | null => {
  const match = window.location.pathname.match(ITEM_PATH_PATTERN);
  return match?.[1] ?? null;
};
