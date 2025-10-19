import { chromium, expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import path from "node:path";

import { mockCameraInitScript } from "./mockCamera";

const CAMERA_SERVICE_UUID = "291d567a-6d75-11e6-8b77-86f30ca893d3";
const OPTIONAL_SERVICE_UUIDS = [
  CAMERA_SERVICE_UUID,
  "0000180a-0000-1000-8000-00805f9b34fb",
];
const VIDEO_FLAGS_EXPECTED = 0x01 | 0x08 | 0x10;
const USE_REAL_CAMERA = process.env.USE_REAL_CAMERA === "true";
const USE_MOCK_CAMERA = !USE_REAL_CAMERA;

const installMockCamera = async (
  context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>
) => {
  await context.addInitScript({ content: mockCameraInitScript });
};

const installRealCameraShim = async (
  context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>
) => {
  await context.addInitScript({
    content: `
      (() => {
        if (typeof navigator === 'undefined' || !navigator.bluetooth) {
          return;
        }
        const originalRequestDevice = navigator.bluetooth.requestDevice?.bind(navigator.bluetooth);
        if (!originalRequestDevice) {
          return;
        }
        navigator.bluetooth.requestDevice = async (...args) => {
          try {
            const devices = await navigator.bluetooth.getDevices();
            if (devices.length > 0) {
              console.info("[e2e] returning first paired device", devices[0]?.id);
              return devices[0];
            }
          } catch (error) {
            console.warn("[e2e] failed to list devices before requestDevice", error);
          }
          return originalRequestDevice(...args);
        };
      })();
    `,
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

  await page.waitForFunction(
    async () => {
      const devices = await navigator.bluetooth.getDevices();
      return devices.length > 0;
    },
    { timeout: 60_000 }
  );
};

const withinCard = (page: Page, title: string): Locator =>
  page
    .locator(".card")
    .filter({ has: page.getByRole("heading", { level: 2, name: title }) });

const setRangeFieldValue = async (
  container: Locator,
  index: number,
  value: number
) => {
  const range = container
    .locator(".range-field")
    .nth(index)
    .locator('input[type="range"]');
  const result = await range.evaluate((input, newValue) => {
    const descriptor = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    );
    descriptor?.set?.call(input, String(newValue));
    const inputEvent =
      typeof InputEvent === "function"
        ? new InputEvent("input", {
            bubbles: true,
            data: String(newValue),
          })
        : new Event("input", { bubbles: true });
    input.dispatchEvent(inputEvent);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return Number(input.value);
  }, value);
  return result;
};

const waitForMockCamera = async (page: Page) => {
  await page.waitForFunction(
    () => Boolean(window.__mockCamera && window.__mockCamera.getState),
    undefined,
    { timeout: 10_000 }
  );
};

const waitForGridReady = async (page: Page) => {
  const overlay = page.locator(".grid__overlay").first();
  if (await overlay.count()) {
    await overlay.waitFor({ state: "detached", timeout: 10_000 });
  }
};

const getCameraStateValue = async (page: Page, path: string) => {
  const segments = path.split(".");
  return page.evaluate((keys) => {
    const camera = window.__mockCamera;
    if (!camera || typeof camera.getState !== "function") return undefined;
    let current: unknown = camera.getState();
    for (const key of keys) {
      if (
        current == null ||
        (typeof current !== "object" && !Array.isArray(current))
      ) {
        return undefined;
      }
      if (Array.isArray(current)) {
        const index = Number(key);
        current = current[index];
      } else {
        current = (current as Record<string, unknown>)[key];
      }
    }
    return current;
  }, segments);
};

const expectCameraValue = async (
  page: Page,
  path: string,
  expected: unknown
) => {
  await expect.poll(() => getCameraStateValue(page, path)).toBe(expected);
};

const getNumericStateValue = async (page: Page, path: string) => {
  const value = await getCameraStateValue(page, path);
  return typeof value === "number" ? value : Number(value);
};

const getCameraCommandCount = async (page: Page, key: string) => {
  return page.evaluate((commandKey) => {
    const camera = window.__mockCamera;
    if (!camera || typeof camera.getCommandCounts !== "function") {
      return 0;
    }
    const counts = camera.getCommandCounts();
    return counts[commandKey] ?? 0;
  }, key);
};

const expectCameraCommandCount = async (
  page: Page,
  key: string,
  expected: number
) => {
  await expect
    .poll(() => getCameraCommandCount(page, key))
    .toBeGreaterThanOrEqual(expected);
};

const expectMockCameraValue = async (
  page: Page,
  path: string,
  expected: unknown
) => {
  if (!USE_MOCK_CAMERA) {
    return;
  }
  await expectCameraValue(page, path, expected);
};

const expectMockCameraCommandCount = async (
  page: Page,
  key: string,
  expected: number
) => {
  if (!USE_MOCK_CAMERA) {
    return;
  }
  await expectCameraCommandCount(page, key, expected);
};

const expectMockNumericValue = async (
  page: Page,
  path: string,
  expected: number,
  precision = 2
) => {
  if (!USE_MOCK_CAMERA) {
    return;
  }
  expect(await getNumericStateValue(page, path)).toBeCloseTo(
    expected,
    precision
  );
};

test.describe("Camera integration", () => {
  test("synchronizes every configuration option with the camera", async ({}, testInfo) => {
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

    if (USE_MOCK_CAMERA) {
      await installMockCamera(context);
    } else {
      await installRealCameraShim(context);
    }

    const page = context.pages()[0] ?? (await context.newPage());
    page.on("console", (message) => {
      // eslint-disable-next-line no-console
      console.log("[browser]", message.type(), message.text());
    });
    const baseURL = process.env.WEB_CONTROL_URL ?? "http://localhost:3000";

    try {
      await page.goto(baseURL, { waitUntil: "domcontentloaded" });
      if (USE_MOCK_CAMERA) {
        await waitForMockCamera(page);
      }
      await ensureCameraAvailable(page);

      await page.evaluate(async (serviceUuid) => {
        const device = await navigator.bluetooth.requestDevice({
          filters: [{ services: [serviceUuid] }],
        });
        console.log("[debug] manual requestDevice", device?.id);
      }, CAMERA_SERVICE_UUID);

      await page.waitForTimeout(1_000);

      await page.locator("[data-testid=connect-toggle]").click();
      await expect(
        page.locator("[data-testid=connection-status]")
      ).toHaveText("Connected", {
        timeout: 15_000,
      });
      if (USE_MOCK_CAMERA) {
        await expect(page.locator("[data-testid=status-message]")).toHaveText(
          "Connected to camera."
        );
        await expect(page.locator(".info")).toContainText(
          "Blackmagic Design • Mock Cinema Camera"
        );
      }

      await waitForGridReady(page);

      // ISO
      const isoCard = withinCard(page, "ISO");
      await isoCard.getByRole("button", { name: "800", exact: true }).click();
      await expectMockCameraValue(page, "iso", 800);

      // White Balance
      const whiteBalanceCard = withinCard(page, "White Balance");
      await setRangeFieldValue(whiteBalanceCard, 0, 6000);
      await expectMockCameraValue(page, "whiteBalance", 6000);
      await setRangeFieldValue(whiteBalanceCard, 1, 5);
      await expectMockCameraValue(page, "tint", 5);
      await whiteBalanceCard
        .getByRole("button", { name: "6500", exact: true })
        .click();
      await expectMockCameraValue(page, "whiteBalance", 6500);
      await whiteBalanceCard
        .getByRole("button", { name: "Auto WB", exact: true })
        .click();
      await expectMockCameraCommandCount(page, "autoWhiteBalance", 1);
      await whiteBalanceCard
        .getByRole("button", { name: "Restore Auto WB", exact: true })
        .click();
      await expectMockCameraCommandCount(page, "restoreWhiteBalance", 1);

      // Shutter
      const shutterCard = withinCard(page, "Shutter");
      await shutterCard.getByRole("button", { name: "Speed" }).click();
      await shutterCard.getByRole("button", { name: "1/60" }).click();
      await expectMockCameraValue(page, "shutterMeasurement", "speed");
      await expectMockCameraValue(page, "shutterSpeed", 60);
      await shutterCard.getByRole("button", { name: "Angle" }).click();
      await shutterCard.getByRole("button", { name: "90.0°" }).click();
      await expectMockCameraValue(page, "shutterMeasurement", "angle");
      await expectMockNumericValue(page, "shutterAngle", 90, 2);

      // Gain & Iris
      const gainCard = withinCard(page, "Gain & Iris");
      await gainCard.getByRole("button", { name: "6 dB" }).click();
      await expectMockCameraValue(page, "gain", 6);
      await setRangeFieldValue(gainCard, 0, 0.8);
      await expectMockNumericValue(page, "iris", 0.8, 2);

      // Focus
      const focusCard = withinCard(page, "Focus");
      await setRangeFieldValue(focusCard, 0, 0.6);
      await expectMockNumericValue(page, "focus", 0.6, 2);
      await focusCard.getByRole("button", { name: "Auto Focus" }).click();
      await expectMockCameraCommandCount(page, "autoFocus", 1);

      // ND Filter
      const ndCard = withinCard(page, "ND Filter");
      await setRangeFieldValue(ndCard, 0, 2);
      await expectMockNumericValue(page, "ndStop", 2, 2);
      await ndCard.getByRole("button", { name: "4", exact: true }).click();
      await expectMockNumericValue(page, "ndStop", 4, 2);

      // Video Mode
      const videoModeCard = withinCard(page, "Video Mode");
      await videoModeCard
        .getByLabel("Frame Rate")
        .selectOption({ value: "29.97" });
      await videoModeCard
        .getByLabel("Dimension")
        .selectOption({ value: "4k-uhd" });
      const interlacedToggle = videoModeCard.locator(
        "[data-testid=interlaced-toggle]"
      );
      if (!(await interlacedToggle.isChecked())) {
        await interlacedToggle.check();
      }
      const windowedToggle = videoModeCard.locator(
        "[data-testid=sensor-windowed]"
      );
      if (!(await windowedToggle.isChecked())) {
        await windowedToggle.check();
      }
      await expectMockCameraValue(page, "sensorWindowed", true);
      await videoModeCard
        .getByRole("button", { name: "Send Video Mode Command" })
        .click();
      await expectMockCameraValue(page, "frameRate", 30);
      await expectMockCameraValue(page, "videoWidth", 3840);
      await expectMockCameraValue(page, "videoHeight", 2160);
      await expectMockCameraValue(page, "videoModeDimensionCode", 9);
      await expectMockCameraValue(page, "mRateEnabled", true);
      await expectMockCameraValue(page, "interlacedVideo", true);
      await expectMockCameraValue(page, "recordingFormatFlags", VIDEO_FLAGS_EXPECTED);

      // Video Options
      const videoOptionsCard = withinCard(page, "Video Options");
      await videoOptionsCard
        .locator("[data-testid=dynamic-range-select]")
        .selectOption("2");
      await expectMockCameraValue(page, "dynamicRangeMode", 2);
      await videoOptionsCard
        .locator("[data-testid=sharpening-select]")
        .selectOption("3");
      await expectMockCameraValue(page, "sharpeningLevel", 3);
      await videoOptionsCard
        .locator("[data-testid=lut-select]")
        .selectOption("2");
      await expectMockCameraValue(page, "lutIndex", 2);
      const lutToggle = videoOptionsCard.locator(
        "[data-testid=lut-enabled-toggle]"
      );
      if (!(await lutToggle.isChecked())) {
        await lutToggle.check();
      }
      await expectMockCameraValue(page, "lutEnabled", true);
      await videoOptionsCard
        .locator("[data-testid=codec-select]")
        .selectOption("3");
      await videoOptionsCard.locator("[data-testid=codec-mode-1]").check();
      await expectMockCameraValue(page, "codecBitrateMode", 1);
      await videoOptionsCard
        .locator("[data-testid=codec-variant-select]")
        .selectOption("4");
      await expectMockCameraValue(page, "codecVariant", 4);
      await videoOptionsCard
        .locator("[data-testid=codec-select]")
        .selectOption("2");
      await expectMockCameraValue(page, "codec", 2);
      await expectMockCameraValue(page, "codecBitrateMode", 0);

      // Audio
      const audioCard = withinCard(page, "Audio");
      await setRangeFieldValue(audioCard, 0, 0.75);
      await expectMockNumericValue(page, "micLevel", 0.75, 2);
      await setRangeFieldValue(audioCard, 1, 0.65);
      await expectMockNumericValue(page, "headphoneLevel", 0.65, 2);
      await setRangeFieldValue(audioCard, 2, 0.4);
      await expectMockNumericValue(page, "headphoneMix", 0.4, 2);
      await setRangeFieldValue(audioCard, 3, 0.55);
      await expectMockNumericValue(page, "speakerLevel", 0.55, 2);
      await audioCard.getByLabel("Audio Input Type").selectOption("1");
      await expectMockCameraValue(page, "audioInputType", 1);
      await setRangeFieldValue(audioCard, 4, 0.8);
      await page.waitForTimeout(100);
      await setRangeFieldValue(audioCard, 5, 0.5);
      if (USE_MOCK_CAMERA) {
        const audioLevels = (await getCameraStateValue(
          page,
          "audioInputLevels"
        )) as unknown;
        expect(Array.isArray(audioLevels)).toBe(true);
        if (Array.isArray(audioLevels)) {
          expect(Number(audioLevels[0])).toBeCloseTo(0.8, 2);
          expect(Number(audioLevels[1])).toBeCloseTo(0.5, 2);
        }
      }
      const phantomToggle = audioCard.locator("label.checkbox input");
      if (!(await phantomToggle.isChecked())) {
        await phantomToggle.check();
      }
      await expectMockCameraValue(page, "phantomPower", true);

      // Monitoring
      const monitoringCard = withinCard(page, "Monitoring");
      // eslint-disable-next-line no-console
      console.log(
        "[test] monitoring card count",
        await monitoringCard.count()
      );
      // eslint-disable-next-line no-console
      console.log(
        "[test] monitoring card text snippet",
        (await monitoringCard.innerText()).slice(0, 40)
      );
      // eslint-disable-next-line no-console
      console.log(
        "[test] monitoring range count",
        await monitoringCard.locator(".range-field").count()
      );
      const displaySlider = monitoringCard
        .locator(".range-field")
        .nth(0)
        .locator('input[type="range"]');
      await displaySlider.scrollIntoViewIfNeeded();
      // eslint-disable-next-line no-console
      console.log(
        "[test] display slider disabled",
        await displaySlider.evaluate((input) => input.disabled)
      );
      const sliderBox = await displaySlider.boundingBox();
      if (!sliderBox) {
        throw new Error("Failed to measure display brightness slider.");
      }
      const targetX = sliderBox.x + sliderBox.width * 0.8;
      const targetY = sliderBox.y + sliderBox.height / 2;
      await page.mouse.click(targetX, targetY);
      const displaySliderValue = Number(
        await displaySlider.evaluate((input) => input.value)
      );
      if (USE_MOCK_CAMERA) {
        // eslint-disable-next-line no-console
        console.log(
          "[test] displayBrightness",
          await getNumericStateValue(page, "displayBrightness")
        );
      }
      // eslint-disable-next-line no-console
      console.log("[test] display slider", displaySliderValue);
      await expectMockNumericValue(page, "displayBrightness", 0.8, 2);
      await setRangeFieldValue(monitoringCard, 1, 0.6);
      await expectMockNumericValue(page, "zebraLevel", 0.6, 2);
      await setRangeFieldValue(monitoringCard, 2, 0.7);
      await expectMockNumericValue(page, "peakingLevel", 0.7, 2);
      await monitoringCard
        .getByLabel("Focus Assist Method")
        .selectOption("1");
      await expectMockCameraValue(page, "focusAssistMethod", 1);
      await monitoringCard
        .getByLabel("Focus Assist Color")
        .selectOption("2");
      await expectMockCameraValue(page, "focusAssistColor", 2);
      await setRangeFieldValue(monitoringCard, 3, 10);
      await expectMockCameraValue(page, "programReturnTimeout", 10);
      await setRangeFieldValue(monitoringCard, 4, 5);
      await expectMockCameraValue(page, "colorBarsTimeout", 5);

      // Tally
      const tallyCard = withinCard(page, "Tally");
      await setRangeFieldValue(tallyCard, 0, 0.9);
      await expectMockNumericValue(page, "tallyBrightness", 0.9, 2);
      await setRangeFieldValue(tallyCard, 1, 0.4);
      await expectMockNumericValue(page, "frontTallyBrightness", 0.4, 2);
      await setRangeFieldValue(tallyCard, 2, 0.3);
      await expectMockNumericValue(page, "rearTallyBrightness", 0.3, 2);

      // Recording toggle
      await page.getByRole("button", { name: "Start Recording" }).click();
      await expectMockCameraValue(page, "recording", true);
      await expect(
        page.getByRole("button", { name: "Stop Recording" })
      ).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: "Stop Recording" }).click();
      await expectMockCameraValue(page, "recording", false);
      await expect(
        page.getByRole("button", { name: "Start Recording" })
      ).toBeVisible({ timeout: 10_000 });

      const summary = await page.evaluate(() => ({
        state: window.__mockCamera?.getState?.(),
        commandCounts: window.__mockCamera?.getCommandCounts?.(),
      }));

      testInfo.attach("camera-state", {
        body: JSON.stringify(summary, null, 2),
        contentType: "application/json",
      });
    } finally {
      await context.close();
    }
  });
});
