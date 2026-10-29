# Original Date Atlas animations

All JSON, SVG, and dotLottie assets in this directory are original vector illustrations authored for this project. No third-party animation URLs, artwork, or licenses are required. The editable generation source is scripts/build-animations.mjs. Palette: existing Date Atlas brand tokens.

`reaction-hearts/` contains the two hand-drawn hearts shown below the planner's typewritten responses. `scripts/build-reaction-hearts.mjs` generates the original vectors and still fallbacks for the white, red and dark themes.

## Atlas companion

The Atlas pin-shaped companion is adapted from the expressive shape animation construction in the user-owned Sexlife project. Its red palette, pin silhouette, contextual props and Date Atlas compositions are maintained by scripts/build-atlas-character.mjs. Still fallbacks are rendered from those same vector shapes by scripts/animation-stills.mjs. Sexlife source files remain unchanged.

Run `npm run build:animations` to regenerate the Atlas JSON, SVG fallbacks and compressed dotLottie archives. Packaging uses Python 3's standard library. The self-hosted player runtime is distributed under the adjacent PLAYER-LICENSE.

## Lively planner loops

`atlas/lively/` contains nine continuous planner variants derived from the same editable vector character by `scripts/build-atlas-lively.mjs`. They add springy body movement, expressive brows and blinks, hand gestures, and moving contextual props. Loop endpoints return the character to its starting pose. The planner questions and plan-generation screen opt into these variants; other screens retain their original animation behavior. Reduced-motion preferences use static SVG fallbacks, and the existing player pauses when the page or character is hidden.
