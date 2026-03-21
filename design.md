# Design System Strategy: ZOC9 Digital Performance Interface

## 1. Overview & Creative North Star: "Kinetic Precision"
This design system moves away from the static, boxy layouts of traditional sports management tools. Our Creative North Star is **Kinetic Precision**. Much like a Zokgu (Jokgu) ball in mid-flight, the UI should feel aerodynamic, weighted, and intentional.

We break the "template" look by utilizing **intentional asymmetry**—aligning text to rigid grids while allowing action elements to float and overlap. We move beyond standard grids to an "Editorial Athletic" style, where high-contrast typography scales and layered surfaces create a sense of depth that feels like a premium sports broadcast overlay.

---

## 2. Color & Surface Philosophy
The palette is engineered for high-intensity outdoor environments. We prioritize visibility under direct sunlight while maintaining a sophisticated "Dark Mode" depth for evening club management.

### The Palette
* **Primary (Sporty Lime):** `#516200` (Core Brand) / `#d1fc00` (High-Visibility Action).
* **Secondary (Charcoal Depth):** `#5a5c5e` / `#0c0f10` (Inverse Surface).
* **Tertiary (Electric Velocity):** `#0059b6` (Data and specialized accents).

### The "No-Line" Rule
**Standard 1px borders are strictly prohibited.** To define sections, use background shifts. For example, a `surface-container-low` (`#eff1f2`) card should sit on a `surface` (`#f5f6f7`) background. Boundaries are felt through tonal contrast, not drawn with lines.

### Glass & Gradient Rule
To achieve a signature look, use **Glassmorphism** for floating match-day controllers.
* **Token Application:** Use `surface_container_lowest` at 80% opacity with a `20px` backdrop blur.
* **Signature Textures:** Main CTAs (like "Start Match") should use a linear gradient from `primary` (`#516200`) to `primary_container` (`#d1fc00`) at a 135-degree angle to simulate motion.

---

## 3. Typography: The Editorial Engine
We use a dual-font strategy to balance athletic aggression with administrative clarity.

* **Display & Headlines (Lexend):** Used for scores, player names, and high-impact headers. Lexend's geometric clarity provides an "Olympic" feel.
    * *Headline-LG:* `2rem` — For match titles and major stats.
* **Titles & Body (Plus Jakarta Sans):** Used for navigation and data entry. It offers high legibility for Korean characters (Hangul) in small sizes.
    * *Body-MD:* `0.875rem` — For player rosters and setting descriptions.

**Brand Intent:** Large typographic scales (Display-LG: `3.5rem`) should be used for scores to ensure they are readable from 5 meters away on a court.

---

## 4. Elevation & Depth
In this system, depth is a functional tool for hierarchy, not just decoration.

* **The Layering Principle:** Stack surfaces to create focus.
    * Base: `surface` (#f5f6f7)
    * Section: `surface-container-low` (#eff1f2)
    * Interactive Card: `surface-container-lowest` (#ffffff)
* **Ambient Shadows:** For "floating" match-day actions, use an extra-diffused shadow: `0px 20px 40px rgba(44, 47, 48, 0.06)`. The tint is derived from the `on-surface` token to keep the shadow "warm" and natural.
* **The "Ghost Border" Fallback:** If accessibility requires a border, use `outline-variant` (`#abadae`) at **15% opacity**. Never use 100% solid outlines.

---

## 5. Components

### Buttons (The High-Impact Touch)
* **Primary:** Solid `primary_fixed` (`#d1fc00`) with `on_primary_fixed` (`#3c4a00`) text. Roundedness: `md` (`0.75rem`). Minimum height: `56px` for one-handed thumb use.
* **Secondary:** `surface_container_high` background. No border.

### Cards & Lists (The Editorial Feed)
* **Constraint:** Forbid divider lines.
* **Implementation:** Separate match entries using `spacing-4` (`1.4rem`) vertical gaps. Use a subtle background shift to `surface_container_low` for even-numbered rows in a list to maintain rhythm.

### Match-Day Controller (Signature Component)
* A floating bottom sheet using **Glassmorphism**.
* Large `+` and `-` score buttons (min size `64x64px`) to accommodate sweaty or moving hands.

### Input Fields
* Use `surface_container_highest` for the input track.
* Label should be `label-md` in `on_surface_variant`.
* Focus state: A `2px` glow using `primary_dim` at 30% opacity.

---

## 6. Do's and Don'ts

### Do
* **Do** use `primary` for "Winning" states and `error` (`#b02500`) for "Losing" or "Foul" states.
* **Do** favor asymmetric padding. For example, give a header more padding on the left than the right to create a "starting line" visual.
* **Do** utilize the full `xl` (`1.5rem`) roundedness for chips to mimic the shape of a Zokgu ball.

### Don't
* **Don't** use pure black `#000000`. Use `inverse_surface` (`#0c0f10`) for maximum depth without "killing" the vibrant lime accents.
* **Don't** use standard `0.5rem` spacing for everything. Follow the spacing scale strictly—use `10` (`3.5rem`) for section breathing room to maintain a "Premium Sport" feel.
* **Don't** use "Drop Shadows" on flat buttons. Only use elevation for elements that physically overlap others in the z-axis.

---

## 7. Language Support (Korean)
* **Line Height:** For Korean text, increase `line-height` by 10% over standard Latin defaults to prevent Hangul characters from looking cramped.
* **Weight:** Use `Medium` (500) as the base weight for body text to ensure high-contrast visibility against the Sporty Lime background.
