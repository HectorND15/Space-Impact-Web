# Leaderboard Worker

Quick deploy:

```bash
cd worker
npm i -g wrangler
wrangler login
wrangler kv namespace create LB
# paste the printed id into wrangler.toml (id = "<KV_ID>")
wrangler deploy
```

Then set the worker URL in `index.html`:

```js
window.LEADERBOARD_URL = "https://space-impact-lb.<your-subdomain>.workers.dev";
```
