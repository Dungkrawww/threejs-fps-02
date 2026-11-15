// The look plan, in one place. Six values and one accent hue; the lighting makes every
// shade the game needs, so no other colour appears in the code. The same six names are
// the CSS custom properties in index.html.
// Dustline: a dusk raid. Warm sand and rusted metal under a cold dusk sky, one ember
// accent for everything that matters: the enemy, the bomb, the money.
export const PALETTE = {
  canvas: '#221b15',
  surface: '#33291d',
  hairline: '#4d3b28',
  ink: '#f2e8d5',
  muted: '#a89a80',
  accent: '#ff7a1a',
};

export function shade(name) {
  return PALETTE[name];
}
