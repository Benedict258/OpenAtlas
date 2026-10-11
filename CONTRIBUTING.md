# Contributing to OpenAtlas

OpenAtlas is developer infrastructure for N-ATLaS: a TypeScript SDK, a hosted gateway, starter apps, and scripts to run the whole stack yourself.

## Layout

| Folder | What's in it |
|---|---|
| `sdk/` | `@openatlas/sdk`: source, tests, and `examples/quickstart.mjs` |
| `gateway/` | The public API: a Cloudflare Worker with a D1 database |
| `site/` | The website: static pages plus the Worker behind the live demos |
| `starter-kits/` | Citizen Services, Education, Customer Service |
| `deploy/` | The GPU backend server and the scripts that deploy it |
| `docs/` | Integration notes, technical documentation, API reference, deploy guide, verification record |

## Set up locally

Node 22.9+ is needed for the starter kits. From the repo root:

```bash
npm install
npm run build        # build the SDK
npm test             # build and run the SDK tests
```

Run the gateway locally against the mock backend (no GPU needed; every mock output is marked `[MOCK — not N-ATLaS output]`):

```bash
npm run dev:mock-backend                                  # mock backend on :8788
cp gateway/.dev.vars.example gateway/.dev.vars
npm run db:init:local -w openatlas-gateway
npm run dev:gateway                                       # gateway on :8787
```

Run a starter kit (after `npm run build` in the root):

```bash
cd starter-kits/citizen-services                          # or education, customer-service
cp .env.example .env                                      # set OPENATLAS_API_KEY, and OPENATLAS_BASE_URL for a local gateway
npm install && npm start
```

To run the full stack on a GPU, follow [`docs/deploy-your-own.md`](docs/deploy-your-own.md).

## How to contribute

- **Larger changes:** open an issue first, so the approach can be agreed before you write code.
- **Workflow:** fork the repository, create a branch, and open a pull request.
- **Keep pull requests small and focused:** one change per pull request.
- **Keep the tests passing:** run `npm test` before you open the pull request.
- **No secrets:** never commit API keys, tokens, `.env` or `.dev.vars` files.

## Good first contributions

- **Hausa, Yoruba and Igbo:** better examples and starter-kit content in these languages.
- **Docs:** fixes and clarifications.
- **Wrong model outputs:** report them with `reportIssue()` in the SDK, with the correction. Each report is stored by the gateway as a correction.

## Licence

OpenAtlas is MIT-licensed (see [`LICENSE`](LICENSE)), and contributions are accepted under the same licence.

N-ATLaS itself isn't part of this repository. Its use is subject to the [N-ATLaS Terms of Use](https://huggingface.co/NCAIR1/N-ATLaS), including non-commercial use and a cap of 1,000 active end users per 30 days.
