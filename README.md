# Needle App — Transparent Presidential Election Forecast Simulator

*A passion project combining math, data visualization, and political forecasting.*

---

## About This Project

**Created in October 2024, published October 2025**  
See [BACKGROUND.md](./BACKGROUND.md) for the full project history, technical write-up, and reflections.

**Live App:** [electoral-college-exact-probabiliti.vercel.app](https://electoral-college-exact-probabiliti.vercel.app)

Frustrated by the lack of transparency in major 2024 US presidential election models (FiveThirtyEight, Economist, Betting Markets, etc.), I built this web app to provide an exact, transparent probability distribution for Electoral College outcomes based on state-by-state inputs and to illustrate how much state-to-state correlation affects every forecast.

---

## Features
- User-driven forecasts for 19 critical states
- "Needle" and EV distribution charts
- Correlation slider and per-state override
- Scenario probability visualizer
- Save/load custom forecast scenarios
- Real-time probability/EV stats

## Example Screenshots
<!-- Add screenshots here (main UI, needle visualization, etc.) -->

---

## Methodology Overview
- You supply state-by-state presidential forecasts (with probabilities or margins)
- Probabilities are derived using a custom [link function](https://en.wikipedia.org/wiki/Generalized_linear_model#Link_function):
  
  \[
    P = \sin^2(45^\circ - 3 \times \text{margin})
  \]
  with mathematical motivation explained fully in [BACKGROUND.md](./BACKGROUND.md).
- You set the "global" or per-state correlation (from fully independent to fully linked swings)
- This drives an exact, non-simulated calculation of EV distributions using mixture of convolutions and [beta distribution](https://en.wikipedia.org/wiki/Beta_distribution) approaches, as detailed in [BACKGROUND.md](./BACKGROUND.md)

---

## Installation & Running Locally

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Start the development server**
   ```bash
   npm start
   ```
   Open http://localhost:3000 in your browser.

---

## Usage
1. Enter your forecasts for swing states
2. Adjust correlation for realism
3. Explore outcome visualizations
4. Save/load scenarios

---

## License, Contributing, and More
- License: [Add your license information here]
- Contributions welcome (see [CONTRIBUTING.md](./CONTRIBUTING.md) if present)
- For more technical and reflective notes, see [BACKGROUND.md](./BACKGROUND.md).

---

Best,
Chinmay Krishna
