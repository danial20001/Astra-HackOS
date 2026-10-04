# Noor Coffee

Full source, browser models and report/weather server. See ARCHITECTURE.md.

## GitHub
Extract the ZIP and upload the contents of noor-github into a new repository.
package.json must be at the root. Include hidden .github, .devcontainer and
.openai folders. Using Git is the most reliable upload method:

```bash
git init
git add .
git commit -m "Add Noor Coffee app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

## Run in GitHub Codespaces
Code > Codespaces > Create codespace on main. Wait for setup then run:

```bash
pnpm dev
```

Open forwarded port 5173. Codespaces is a development demo, not permanent hosting.

## Local run
Requires Node 22.13 or later.

```bash
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm dev
```

Production build and local preview:

```bash
pnpm build
pnpm start
```

GitHub Actions builds on pushes. GitHub Pages alone cannot run /api/ucda,
which fetches/parses reports and requests weather.

## Complete hosting
Cloudflare Workers: add CLOUDFLARE_API_TOKEN (Workers deployment permissions)
and CLOUDFLARE_ACCOUNT_ID in GitHub Settings > Secrets and variables > Actions.
Then Actions > Deploy Noor to Cloudflare > Run workflow.
Worker name: noor-coffee. Export is detached from the original hosted demo.
https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/

## Offline
Open online once and wait for model downloads. Initial assets approximately
31 MB. Observations, offers and reports use browser-local storage; they do not
move automatically between domains. New reports require internet.

## Weather message
Prices saved · weather unavailable means prices updated but weather failed.
Previous weather is retained with its original date/location. Retry online.
The deployed failure has not been traced to a specific provider error.

## Model boundaries
Leaf models assess leaves, not bean grade. The tiny experimental price model
predicts a separate monthly estimate. Offers use the latest published range.
Weather supports collection planning and does not change the learned forecast.
Transport/fees come from entered costs. No traffic feed or causal weather-price
model is claimed. Missing AI models do not produce substitute predictions.
