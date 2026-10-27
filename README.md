# ⚽ GoalMatrix Pro - Worldwide Over 2.5 & BTTS Football Predictions

[![GitHub Pages](https://img.shields.io/badge/Live-GitHub%20Pages-brightgreen)](https://kingpee263.github.io/)
[![Zero API Key](https://img.shields.io/badge/API-100%25%20Free%20%2F%20No%20Key-blue)](#)
[![Model](https://img.shields.io/badge/Model-Bivariate%20Poisson-purple)](#)

A high-probability football prediction web application built for worldwide matches, focusing specifically on **Over 2.5 Goals** and **Both Teams To Score (BTTS)** markets.

Live Web Application: **[https://kingpee263.github.io/](https://kingpee263.github.io/)**

---

## 🚀 Key Features

- **Worldwide Coverage (No API Keys Needed)**:
  - Pulls upcoming and live matches across the world (UEFA Champions League, Premier League, La Liga, Serie A, Bundesliga, Eredivisie, MLS, Saudi Pro League, South American and Scandinavian leagues).
  - Connects directly to open public sports endpoints with built-in CORS fallbacks.
- **Mathematical Prediction Engine**:
  - **Bivariate Poisson Distribution**: Generates full goal expectancy matrices ($0-0$ up to $7-7$).
  - **Over 2.5 Goals Probability**: Exact mathematical sum of scoreline chances with 3+ goals.
  - **BTTS Probability**: Calculation of both teams having $\ge 1$ expected goals.
  - **Combo (Over 2.5 & BTTS)**: Joint probability where both teams score and match total exceeds 2.5 goals.
- **Confidence Badges**:
  - 🔥 **Prime Pick (Ultra Confidence $\ge 78\%$)**: Exceptional goal expectancy.
  - ⭐ **High Confidence ($70\% - 77\%$)**: Solid mathematical backing.
- **Interactive Accumulator (Acca) Slip**:
  - Click any prediction to add it to a floating bet slip.
  - Automatically calculates cumulative decimal multiplier and joint win probability.
  - One-click copy for sharing or placing bets.
- **Dynamic Filters**:
  - Filter by market: `Top High-Confidence`, `Over 2.5`, `BTTS`, `Combo`, and `All Fixtures`.
  - Filter by Country / League.
  - Real-time confidence percentage slider.
  - Date switcher (`Today`, `Tomorrow`, `+2 Days`).

---

## 🛠️ Architecture

- **Frontend**: HTML5, Tailwind CSS, JavaScript (ES6+), FontAwesome Icons.
- **Math Engine**: Bivariate Poisson score matrix simulation + Empirical Recent Form weightings.
- **Hosting**: GitHub Pages compatible (`https://kingpee263.github.io/`).

---

## 📦 Local Testing

Simply open `index.html` in any web browser, or run a local server:

```bash
# Python
python -m http.server 8000

# or Node / npx
npx serve .
```

---

## ⚠️ Disclaimer
All predictions are based on statistical algorithms, historical goal frequencies, and mathematical probabilities. Please gamble responsibly.
