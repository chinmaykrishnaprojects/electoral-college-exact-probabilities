# Project Background & Technical Notes — Needle App

## Motivation

This was a personal project of mine from October 2024, where I was interested in forecasts for the 2024 Presidential Election but the most prominent models (Nate Silver, 538, Economist, JHK, DDHQ, Prediction/Betting Markets, Split Ticket etc.) lacked full transparency in their methodologies making their predictions counterintuitive at times (e.g. when the favorite was not favored in the tipping point state, or was expected to win less than 269 EVs on average) creating confusion and allegations of bias in order to influence the result of the election. 

To resolve this, I created this web app in order to translate state by state projections into an overall projection and exact (not simulated like most other models) probability distribution for EVs. The key concept demonstrated in this web app was the idea of correlation where even though the election was expected to be close, there was a ~30% chance one candidate would sweep all 7 swing states

## Reflection & Purpose

This was a passion project combining my interests in Math, Data Visualization, Web Development, and U.S. Political Forecasting.

## Background / Methodology / Writeup

- The user can enter their forecasts for 19 of the states/districts (6 likely D, 7 tossup (swing), 6 likely R)  that were considered in play prior to the election 
- These probabilities are visualized using a "needle" component which is sectioned into 5 subcategories (Safe D, Lean D, Tossup, Lean R, Safe R) on the semicircle which roughly corresponds to Margins from -15 to +15
- These "margins" are converted into probabilities from 0% to 100% using the following link function ([reference](https://en.wikipedia.org/wiki/Generalized_linear_model#Link_function)):
  
  \[
    P = \sin^2(45^\circ - 3 \times \text{margin})
  \]
  which I liked for its property that the derivative is proportional to the standard deviation of the probability ([arcsine distribution](https://en.wikipedia.org/wiki/Arcsine_distribution)), with a bounded domain unlike probit (normal distribution) or logit (logistic) models.

  It also allows the probabilities to be visualized via the pythagorean identity: $\sin^2 \theta + \cos^2 \theta = 1$.

- These probabilities are combined with "safe" EVs to determine the average outcome.

- The win probability calculation is a tad more sophisticated in order to incorporate correlation across states.
- When correlation is set to 0, all states are assumed to be independent, leading to a smaller variance in the EV distribution. This assumption is clearly false and led to overconfident models most notably in 2016. The calculation of the EV distribution is then straightforward using [convolution](https://en.wikipedia.org/wiki/Convolution). 
- On the other hand, when correlation is 1, it assumes the relative margins across states are predetermined and there is a consistent national shift across states. This again allows for straightforward EV distribution via integration across all scenarios.
- For correlation between 0 and 1, the solution involves the [beta distribution](https://en.wikipedia.org/wiki/Beta_distribution), a natural fit for "probabilities of probabilities" (distinguishing random/aleatoric from correlated/epistemic components of uncertainty).

  The mean for Beta($\alpha = np$, $\beta = n(1-p)$) is $p$ with variance $V = p(1-p)\,*$EV$^2$, of which $n/(n+1)*V$ is intrinsic (aleatoric) variance and $1/(n+1)*V$ is correlated (epistemic) variance.

  \[
  n = \frac{1}{\text{correlation}} - 1
  \]
  The CDF for correlation is given by:

  \[
    \text{CDF}(x) = \text{BetaCDF}(x; \alpha = np, \beta = n(1-p))
  \]

  - For Correlation 0, $\text{CDF}(x) = p$ (pure independence).
  - For Correlation 1, CDF is a step function (fully correlated national scenario).
  - For $0 < \text{Correlation} < 1$, we interpolate between the two, combining convolution and beta-distribution integration.

  This can be visualized in the Scenario Probability chart: select outcomes for a state (or multiple states), and the chart shows the probability as a function of percentile and integrated totals.

- The user may assign correlation by state (e.g., AK being more independent), or set a global correlation value (I found 0.8–0.85 aligns with expert models).

## Closing Thoughts

Have fun with this tool and feel free to fork or contribute. All technical/methodological feedback is welcome.

Best,

Chinmay Krishna
