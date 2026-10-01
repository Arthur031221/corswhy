# corswhy

Find the response header that rejects your browser's CORS preflight before changing server code.

![A real local preflight fails with OPTIONS 401, then passes after the fixture responds with CORS headers](assets/demo.gif)

Run from a checkout with `npm install -g .`, or run the published repository with `npx github:Arthur031221/corswhy`.

```sh
corswhy http://localhost:8000/api \
  --origin http://localhost:5173 \
  --method POST \
  --header authorization,content-type \
  --credentials include
```

The command sends OPTIONS with `Origin`, `Access-Control-Request-Method`, and the names you give in `--header`. It reports the status, allowed origin, credentials, method, and headers. It does not send POST, PUT, DELETE, or a request body.

```text
OPTIONS 401  http://localhost:8000/api
Origin http://localhost:5173  Method POST

FAIL  OPTIONS status     401
FAIL  Allow origin       (missing)
FAIL  Allow credentials  (missing)
PASS  Allow method       (safelisted method)
FAIL  Allow headers      (missing)

Fix: Let OPTIONS reach the CORS handler without authentication.
```

`--header` takes the names shown in a browser's `Access-Control-Request-Headers` request header. For a JSON POST, include `content-type`; for a bearer token, include `authorization`. Separate names with commas or repeat the option. A GET, HEAD, or POST without named unsafe headers does not need a preflight, so the command sends nothing in that case.

## Options

| Option | Meaning |
| --- | --- |
| `--origin ORIGIN` | Required browser origin, such as `http://localhost:5173` |
| `--method METHOD` | Actual request method, default `GET` |
| `--header NAMES` | Names from `Access-Control-Request-Headers` |
| `--credentials MODE` | `omit`, `same-origin`, or `include`, default `omit` |
| `--timeout MS` | OPTIONS timeout, default 5000 |
| `--json` | Structured report for an issue or script |
| `--no-color` | Plain terminal output |

For a cross-origin request, `same-origin` behaves like `omit` for the CORS response checks. The preflight request itself never includes cookies. Use `include` if the browser's request uses `credentials: 'include'`.

The verdict covers the supplied OPTIONS exchange. It does not test the actual response, browser cookie policy, private network access, service workers, browser extensions, preflight caching, or differences caused by browser-generated headers. A passing report means the supplied preflight checks passed, not that the full application request will succeed.

## Local demo and tests

Run `npm test` for the local HTTP fixtures. `bash demo/render.sh` records the GIF with VHS and stops its local server before exiting. The server exposes `/auth`, which returns OPTIONS 401, and `/ok`, which returns the required CORS response headers.

## References

The checks follow the [Fetch standard's CORS protocol](https://fetch.spec.whatwg.org/#http-cors-protocol). The [MDN preflight guide](https://developer.mozilla.org/en-US/docs/Glossary/Preflight_request) explains why the browser sends OPTIONS before certain cross-origin requests.

MIT licensed. See [CONTRIBUTING.md](CONTRIBUTING.md) for local development.
