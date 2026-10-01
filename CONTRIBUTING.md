# Contributing

Please open an issue with the URL shape, the intended browser request, and a redacted OPTIONS response. Do not post credentials, cookies, or private URLs.

To work locally, use Node 20 or newer and run `npm test`. The test server listens on an ephemeral loopback port. Add a fixture for a new CORS case and check both the reported verdict and which HTTP method the CLI sent.

Keep the command read only. It must not send the application request or follow a preflight redirect.
