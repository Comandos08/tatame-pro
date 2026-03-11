# Load Tests — Tatame Pro

Load testing scripts using [k6](https://k6.io/).

## Prerequisites

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

## Usage

```bash
# Run specific scenario
k6 run load-tests/health-check.js

# Run with custom options
k6 run --vus 50 --duration 60s load-tests/health-check.js

# Run all scenarios via npm
npm run test:load
```

## Scenarios

| Script | Target | Description |
|---|---|---|
| `health-check.js` | `/functions/v1/health-check` | Baseline endpoint health |
| `public-pages.js` | Landing, About, Login pages | Frontend static load |
| `membership-flow.js` | Membership checkout flow | Critical business path |
| `athlete-search.js` | Athlete listing/search | Data-heavy query |

## Environment Variables

Set before running:
```bash
export K6_SUPABASE_URL=https://your-project.supabase.co
export K6_SUPABASE_ANON_KEY=your-anon-key
export K6_APP_URL=https://your-app-domain.com
```
