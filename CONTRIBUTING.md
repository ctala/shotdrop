# Contributing

Thanks for helping. A few rules keep shotdrop small and reliable.

1. **Test first.** New behavior starts as a failing test: unit tests in `tests/unit/` for the Worker and for pure extension logic, end-to-end tests in `tests/e2e/` for anything a user clicks. Then make it pass.
2. **Run everything before a pull request:**
   ```bash
   npm install
   npx playwright install chromium
   npm test && npm run test:e2e
   ```
   The e2e suite runs the real extension against `wrangler dev`, with no Cloudflare account needed.
3. **Every UI string lives in both `_locales/en` and `_locales/es`.** A test fails if a key is missing in either one.
4. **No new permissions, no third-party requests, no dependencies in the extension** without a very good reason, discussed in an issue first.
5. **Keep it small.** shotdrop does one thing. Features that turn it into a general file host will probably be declined.

Bugs and ideas: [open an issue](https://github.com/ctala/shotdrop/issues).
