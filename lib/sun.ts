/**
 * Compute the (lat, lon) of the subsolar point — i.e. where the sun is directly
 * overhead — at a given UTC time. Uses Cooper's solar declination approximation
 * and the simple `15° per hour` hour-angle relationship.
 *
 * Accurate to about 1° which is plenty for visual lighting on the globe.
 */
export function solarPosition(date: Date = new Date()): {
  lat: number;
  lon: number;
} {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = Math.floor((date.getTime() - start) / 86_400_000);

  const declination =
    23.44 * Math.sin(((360 / 365) * (doy - 81) * Math.PI) / 180);

  const hours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  const sunLon = -15 * (hours - 12);

  return { lat: declination, lon: sunLon };
}
