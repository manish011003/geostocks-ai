/**
 * Convert a (lat, lon) pair on a unit sphere of given radius to a 3D vector
 * compatible with the Three.js scene used by Globe.tsx.
 *
 *   x = -sin(phi)*cos(theta)
 *   y =  cos(phi)
 *   z =  sin(phi)*sin(theta)
 *
 * where phi   = (90 - lat) * π/180
 *       theta = (lon + 180) * π/180
 */
export function latLonToVec3(
  lat: number,
  lon: number,
  radius = 1
): { x: number; y: number; z: number } {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return { x, y, z };
}

/** Approximate lat/lon centroids for fallback region tagging. */
export const REGION_COORDS: Record<string, { lat: number; lon: number }> = {
  "Middle East": { lat: 29.0, lon: 45.0 },
  "East Asia": { lat: 35.0, lon: 115.0 },
  "Eastern Europe": { lat: 50.5, lon: 30.5 },
  "South Asia": { lat: 22.0, lon: 78.0 },
  Africa: { lat: 1.6, lon: 20.0 },
  Americas: { lat: 14.6, lon: -90.0 },
  // More specific Americas variants — emitted by the Gemini tagger.
  "North America": { lat: 38.0, lon: -97.0 },
  "South America": { lat: -15.0, lon: -55.0 },
  "Central America": { lat: 14.6, lon: -90.0 },
  "Western Europe": { lat: 48.0, lon: 10.0 },
  "Northern Europe": { lat: 60.0, lon: 18.0 },
  "Southern Europe": { lat: 40.0, lon: 14.0 },
  "Southeast Asia": { lat: 1.35, lon: 110.0 },
  "Central Asia": { lat: 45.0, lon: 65.0 },
  Oceania: { lat: -25.0, lon: 134.0 },
  Global: { lat: 20.0, lon: -40.0 },
};

export function regionToCoords(region: string): { lat: number; lon: number } {
  return REGION_COORDS[region] ?? REGION_COORDS["Global"];
}
