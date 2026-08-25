# Element Browser

A webview-based browser for previewing your app inside VS Code.

- Open any URL (e.g. `http://localhost:3000`) in a browser panel tab
- Login sessions survive reloads and VS Code restarts (proxy-side cookie jars + stable proxy ports)
- Cross-origin logins (OAuth/SSO) hand off to your system browser automatically
- Address bar with back/forward/reload, copy-URL and page loading indicators

## Commands

- `Element Browser: Open App URL`
- `Element Browser: Stop Preview`
- `Element Browser: Clear Saved Login Session`

## Development

```
npm run compile                      # type-check & build to out/
node scripts/selfcheck-webviews.js   # generated webview scripts compile check
node test-smoke.js                   # activation smoke test (mocked vscode API)
```

Press F5 in VS Code to launch the Extension Development Host.
