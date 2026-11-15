// Ember Yard look plan, in one place: dusk amber + teal over warm dark concrete.
// The same names are the CSS custom properties in index.html, so the page and the
// scene share one palette. No other colour appears in the game.
export const PALETTE = {
  canvas: '#211a13', // sky / fog
  surface: '#352b1e', // concrete ground
  hairline: '#4a3f2e', // dark steel / crates
  ink: '#f2e8d5', // warm off-white
  muted: '#9a9082', // greyed warm
  accent: '#f5a623', // amber — lamps, site A, the player's team
  teal: '#2ec4b6', // teal — site B, the defenders
  rust: '#b4552d', // rusted containers
  danger: '#e5484d', // damage, bomb, enemy fire
};

// One hex string per name, for code that needs a plain colour value.
export function hex(name) {
  return PALETTE[name];
}
