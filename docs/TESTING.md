# End-to-End Camera Testing

This repository now includes a Playwright-based scenario that exercises the web UI against a **paired Blackmagic camera** over Web Bluetooth.

## Prerequisites

1. The camera must already be paired with the host machine and granted Web Bluetooth access for the site (open the web app in Chrome, click **Connect**, approve the chooser, then remember/allow the device).
2. Install Playwright browsers the first time:

   ```bash
   npx playwright install --with-deps
   ```

3. Optional but recommended: point Playwright at an existing Chrome profile that already contains the Bluetooth permission. Export the profile path as `CHROME_USER_DATA_DIR`.

4. If the web UI is not running on `http://localhost:3000`, export `WEB_CONTROL_URL` with the correct origin.

Example:

```bash
export CHROME_USER_DATA_DIR="$HOME/Library/Application Support/Google/Chrome/Profile 2"
export WEB_CONTROL_URL="http://localhost:3000"
```

## Running the Scenario

```bash
npm run e2e
```

Playwright launches Chromium with `--enable-experimental-web-platform-features` and loads
`tests/e2e/camera.spec.ts`. The scenario:

1. Injects a shim so `navigator.bluetooth.requestDevice()` returns the first device reported by `navigator.bluetooth.getDevices()` (i.e., the first paired camera).
2. Clicks **Connect** and waits for the UI to report `Connected`.
3. Switches the codec to Blackmagic RAW → Constant Bitrate → 12:1 and enables sensor windowing.
4. Captures the relevant UI state to `ui-state` in the Playwright report.

If `navigator.bluetooth.getDevices()` still cannot see the paired camera the test will fail;
launch the web app manually, grant Bluetooth access, then rerun `npm run e2e`.

> **Note**: Web Bluetooth support from automation is still evolving. You might need to run once interactively (headful Chromium) to accept any transient dialogs.
