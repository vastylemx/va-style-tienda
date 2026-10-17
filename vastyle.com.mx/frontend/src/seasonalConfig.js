export const SEASONAL_CONFIG = {
  christmas: {
    enabled: true,
    showSantaHat: true,
    showSnowflakeCursor: true,
  },
};

export function getChristmasDecorations(config = SEASONAL_CONFIG) {
  const christmas = config.christmas;
  return {
    santaHat: Boolean(christmas?.enabled && christmas.showSantaHat),
    snowflakeCursor: Boolean(christmas?.enabled && christmas.showSnowflakeCursor),
  };
}
