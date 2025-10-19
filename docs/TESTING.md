# End-to-End Camera Testing

The Playwright scenario in `tests/e2e/camera.spec.ts` drives the web UI through the full
configuration workflow. It runs against a **mock Blackmagic camera** by default, and can target a
paired hardware camera when needed.

## Shared Setup

1. Install the Playwright browsers the first time you run the tests:

   ```bash
   npx playwright install --with-deps
   ```

2. (Optional) Point Playwright at an existing Chrome profile so previously granted Bluetooth
   permissions are reused:

   ```bash
   export CHROME_USER_DATA_DIR="$HOME/Library/Application Support/Google/Chrome/Profile 2"
   ```

3. If the web UI is hosted somewhere other than `http://localhost:3000`, export
   `WEB_CONTROL_URL` with the correct origin.

## Mock Camera (default)

No additional setup is required. The test injects a synthetic BLE implementation that mirrors the
behaviour of a camera and asserts that every UI control keeps the mock state in sync.

Run with:

```bash
npm run e2e
```

## Real Camera

Set `USE_REAL_CAMERA=true` to skip the mock injectors. The scenario still drives the UI but avoids
asserting on internal state that is only available with the mock.

Additional prerequisites:

1. Pair your Blackmagic camera with the host machine and grant Web Bluetooth access to the site
   (open the app in Chrome, click **Connect**, approve the chooser, and allow the device
   permanently).
2. Ensure the camera stays powered and within range for the duration of the test.

Run with:

```bash
USE_REAL_CAMERA=true npm run e2e
```

The test shims `navigator.bluetooth.requestDevice()` to return the first paired device reported by
`navigator.bluetooth.getDevices()`. If the call still fails, launch the web app manually, grant
Bluetooth access, then rerun the test.

> **Note**: Web Bluetooth automation is still evolving. You might need to run once in headful mode
> to accept transient dialogs or confirm permissions.
