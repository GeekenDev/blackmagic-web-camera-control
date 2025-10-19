import { chromium, expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import path from "node:path";

const CAMERA_SERVICE_UUID = "291d567a-6d75-11e6-8b77-86f30ca893d3";
const OPTIONAL_SERVICE_UUIDS = [
  CAMERA_SERVICE_UUID,
  "0000180a-0000-1000-8000-00805f9b34fb",
];

const withCameraOverride = async (
  context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>
) => {
  await context.addInitScript(() => {
    const originalRequestDevice = navigator.bluetooth.requestDevice.bind(
      navigator.bluetooth
    );
    navigator.bluetooth.requestDevice = async (options: unknown) => {
      const devices = await navigator.bluetooth.getDevices();
      if (devices.length > 0) {
        return devices[0];
      }
      return originalRequestDevice(options as RequestDeviceOptions);
    };
  });
};

const ensureCameraAvailable = async (page: Page) => {
  const hasDevice = await page.evaluate(async () => {
    const devices = await navigator.bluetooth.getDevices();
    return devices.length > 0;
  });

  if (hasDevice) {
    return;
  }

  console.info(
    "[e2e] No paired camera detected. A Bluetooth chooser will open—please select your camera to continue."
  );

  await page.evaluate(
    async ({ serviceUuid, optionalServices }) => {
      try {
        await navigator.bluetooth.requestDevice({
          filters: [{ services: [serviceUuid] }],
          optionalServices,
        });
      } catch (error) {
        console.warn("Bluetooth chooser closed without pairing.", error);
      }
    },
    {
      serviceUuid: CAMERA_SERVICE_UUID,
      optionalServices: OPTIONAL_SERVICE_UUIDS,
    }
  );

  try {
    await page.waitForFunction(
      async () => {
        const devices = await navigator.bluetooth.getDevices();
        return devices.length > 0;
      },
      { timeout: 60_000 }
    );
  } catch {
    throw new Error(
      "Timed out waiting for a paired camera. Ensure the chooser stays open and select your camera before the timeout."
    );
  }
};

test.describe("Camera integration", () => {
  test("connects and applies codec + windowed settings", async ({}, testInfo) => {
    const userDataRoot = process.env.CHROME_USER_DATA_DIR;
    const userDataDir = userDataRoot
      ? path.resolve(userDataRoot)
      : path.join(testInfo.outputDir, "chromium-profile");

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: process.env.HEADLESS === "false",
      args: [
        "--enable-experimental-web-platform-features",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
    });

    await withCameraOverride(context);

    const page = context.pages()[0] ?? (await context.newPage());
    const baseURL = process.env.WEB_CONTROL_URL ?? "http://localhost:3000";

    try {
      await page.goto(baseURL, { waitUntil: "domcontentloaded" });

      await ensureCameraAvailable(page);

      const hasCameraPermission = await page.evaluate(async () => {
        const devices = await navigator.bluetooth.getDevices();

        console.log("Found Bluetooth devices:", devices);

        return devices.length > 0;
      });

      expect(hasCameraPermission).toBeTruthy();

      await page.locator("[data-testid=connect-toggle]").click();
      await expect(page.locator("[data-testid=connection-status]")).toHaveText(
        /connected/i,
        {
          timeout: 15_000,
        }
      );

      if (await page.locator("[data-testid=codec-select]").isVisible()) {
        await page.locator("[data-testid=codec-select]").selectOption("3");
        const bitrateToggle = page.locator("[data-testid=codec-mode-1]");
        if (await bitrateToggle.isVisible()) {
          await bitrateToggle.check();
        }
        await page
          .locator("[data-testid=codec-variant-select]")
          .selectOption("5");
        await expect(
          page.locator("[data-testid=codec-variant-select]")
        ).toHaveValue("5");
      }

      const windowedCheckbox = page.locator("[data-testid=sensor-windowed]");
      if (!(await windowedCheckbox.isChecked())) {
        await windowedCheckbox.check();
      }
      await expect(windowedCheckbox).toBeChecked();

      const summary = await page.evaluate(() => ({
        codec: (
          document.querySelector(
            "[data-testid=codec-select]"
          ) as HTMLSelectElement | null
        )?.value,
        codecVariant: (
          document.querySelector(
            "[data-testid=codec-variant-select]"
          ) as HTMLSelectElement | null
        )?.value,
        sensorWindowed: (
          document.querySelector(
            "[data-testid=sensor-windowed]"
          ) as HTMLInputElement | null
        )?.checked,
      }));

      testInfo.attach("ui-state", {
        body: JSON.stringify(summary, null, 2),
        contentType: "application/json",
      });

      expect(summary.codec).toBe("3");
      expect(summary.codecVariant).toBe("5");
      expect(summary.sensorWindowed).toBe(true);
    } finally {
      await context.close();
    }
  });
});
