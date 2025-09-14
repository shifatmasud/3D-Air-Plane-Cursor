# 3D Interactive Paper Plane

A stunning, interactive 3D paper plane animation built with React and Three.js. The plane gracefully follows your cursor through a mesmerizing, cinematic starfield, leaving a sparkling particle trail in its wake.

**Demo Link:** [**https://conclusive-form-676715.framer.app/home-5**](https://conclusive-form-676715.framer.app/home-5)

---

### TL;DR (Explain Like I'm 5)

This is a cool 3D paper airplane that you can fly around your screen with your mouse. It leaves a sparkly trail behind it as it zooms through a field of twinkling stars.

---

### Context Map

This project is a single-page web application that uses `React` for its component structure and `Three.js` for rendering a dynamic 3D scene. The core of the application is the `PaperPlane.tsx` component, which encapsulates all the logic for the animation.

-   **Rendering:** A `WebGLRenderer` draws the scene inside an HTML `<canvas>` element.
-   **Interactivity:** Mouse movement events are captured to control the target destination of the paper plane.
-   **Physics:** A simple physics model (steering behavior) is implemented to give the plane realistic motion, including velocity, acceleration, and banking turns.
-   **Visuals:**
    -   The plane itself has a custom `ShaderMaterial` to create a glowing fresnel effect.
    -   The background is composed of two layers of particle systems (`Points`) to create a starfield with a parallax effect.
    -   The plane's trail is another particle system, emitting particles from the plane's tail.
    -   A soft, particle-based cursor follows the mouse to provide a visual target.
-   **Performance:** The animation is driven by `requestAnimationFrame` for smooth updates. Resources like geometries and materials are properly disposed of on component unmount to prevent memory leaks.

---

### Directory Tree

```
.
├── index.html         # Main HTML file, sets up the React app and script imports.
├── index.css          # Global styles for the application.
├── index.tsx          # The entry point that renders the React application.
├── metadata.json      # Project metadata for the Framer environment.
└── PaperPlane.tsx     # The main React component with all the Three.js logic for the animation.
```
