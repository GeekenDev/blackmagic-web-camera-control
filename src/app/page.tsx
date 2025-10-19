"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { useBleCamera } from "@/hooks/useBleCamera";
import Link from "next/link";

const whiteBalancePresets = [2800, 3200, 4500, 5000, 5600, 6500, 7500];
type DimensionOption = {
  id: string;
  label: string;
  width?: number;
  height?: number;
};

const dimensionOptions: DimensionOption[] = [
  { id: "1080p", label: "1080p (1920×1080)", width: 1920, height: 1080 },
  { id: "2k-dci", label: "2K DCI (2048×1080)", width: 2048, height: 1080 },
  { id: "4k-uhd", label: "4K UHD (3840×2160)", width: 3840, height: 2160 },
  { id: "4k-dci", label: "4K DCI (4096×2160)", width: 4096, height: 2160 },
];

const frameRateOptions = [
  { id: "23.98", label: "23.98p", frameRate: 24, mRate: true, interlaced: false },
  { id: "24", label: "24p", frameRate: 24, mRate: false, interlaced: false },
  { id: "25", label: "25p", frameRate: 25, mRate: false, interlaced: false },
  { id: "29.97", label: "29.97p", frameRate: 30, mRate: true, interlaced: false },
  { id: "30", label: "30p", frameRate: 30, mRate: false, interlaced: false },
  { id: "50", label: "50p", frameRate: 50, mRate: false, interlaced: false },
  { id: "59.94", label: "59.94p", frameRate: 60, mRate: true, interlaced: false },
  { id: "60", label: "60p", frameRate: 60, mRate: false, interlaced: false },
] as const;

const dynamicRangeOptions = [
  { id: 0, label: "Film" },
  { id: 1, label: "Video" },
  { id: 2, label: "Extended Video" },
];

const sharpeningOptions = [
  { id: 0, label: "Off" },
  { id: 1, label: "Low" },
  { id: 2, label: "Medium" },
  { id: 3, label: "High" },
];

const lutOptions = [
  { id: 0, label: "None" },
  { id: 1, label: "Custom" },
  { id: 2, label: "Film → Video" },
  { id: 3, label: "Film → Extended Video" },
];

const focusAssistMethodOptions = [
  { id: 0, label: "Peak" },
  { id: 1, label: "Colored Lines" },
];

const focusAssistColorOptions = [
  { id: 0, label: "Red" },
  { id: 1, label: "Green" },
  { id: 2, label: "Blue" },
  { id: 3, label: "White" },
  { id: 4, label: "Black" },
];

const audioInputTypeOptions = [
  { id: 0, label: "Internal Mic" },
  { id: 1, label: "Line Level" },
  { id: 2, label: "Low Mic Level" },
  { id: 3, label: "High Mic Level" },
];

const codecOptions = [
  {
    id: 3,
    label: "Blackmagic RAW",
    modes: [
      {
        id: 0,
        label: "Constant Quality",
        variants: [
          { id: 0, label: "Q0" },
          { id: 7, label: "Q1" },
          { id: 8, label: "Q3" },
          { id: 1, label: "Q5" },
        ],
      },
      {
        id: 1,
        label: "Constant Bitrate",
        variants: [
          { id: 2, label: "3:1" },
          { id: 3, label: "5:1" },
          { id: 4, label: "8:1" },
          { id: 5, label: "12:1" },
        ],
      },
    ],
  },
  {
    id: 2,
    label: "ProRes",
    modes: [
      {
        id: 0,
        label: "Quality",
        variants: [
          { id: 0, label: "HQ" },
          { id: 1, label: "422" },
          { id: 2, label: "LT" },
          { id: 3, label: "Proxy" },
        ],
      },
    ],
  },
];

const dimensionCodeFor = (option: DimensionOption | undefined, interlaced: boolean): number => {
  if (!option || option.width == null || option.height == null) {
    return interlaced ? 0 : 3;
  }

  const { width, height } = option;

  if (height === 486 || height === 480) return 0;
  if (height === 576) return 1;
  if ((width === 1280 && height === 720) || height === 720) return 2;
  if (width === 2048 && height === 1080) return 4;
  if (width === 2048 && height === 1152) return 5;
  if ((width === 1920 && height === 1080) || height === 1080) return 3;
  if (height === 2160) {
    if (width === 3840) return 9;
    if (width === 4096) return 8;
    return 6;
  }
  if (width === 4096 && height === 3072) return 7;
  if (width === 4608 && height === 1920) return 10;
  if (width === 4608 && height === 2592) return 11;
  if (height >= 2000 && height < 3000) return 4;
  if (height >= 3000 && height < 4000) return 7;
  if (height >= 4000 && height < 5000) return 8;
  return 3;
};

export default function HomePage() {
  const { state, deviceInfo, controls } = useBleCamera();
  const defaultFrameRateOption = frameRateOptions.find((option) => option.id === "24") ?? frameRateOptions[0];
  const [frameRate, setFrameRate] = useState<number>(defaultFrameRateOption.frameRate);
  const [mRate, setMRate] = useState<boolean>(defaultFrameRateOption.mRate);
  const [selectedDimensionId, setSelectedDimensionId] = useState<string>(dimensionOptions[0]?.id ?? "1080p");
  const [interlaced, setInterlaced] = useState<boolean>(defaultFrameRateOption.interlaced);

  const connectionLabel = useMemo(() => {
    switch (state.connection) {
      case "connected":
        return "Connected";
      case "connecting":
        return "Connecting…";
      default:
        return "Disconnected";
    }
  }, [state.connection]);
  const selectedFrameRateOption = useMemo(
    () =>
      frameRateOptions.find(
        (option) => option.frameRate === frameRate && option.mRate === mRate,
      ),
    [frameRate, mRate],
  );
  const selectedDimension = useMemo(
    () => dimensionOptions.find((option) => option.id === selectedDimensionId) ?? dimensionOptions[0],
    [selectedDimensionId],
  );
  const dimensionCode = useMemo(
    () => dimensionCodeFor(selectedDimension, interlaced),
    [selectedDimension, interlaced],
  );
  const selectedCodecOption = useMemo(
    () => codecOptions.find((option) => option.id === state.codec) ?? codecOptions[0],
    [state.codec],
  );
  const selectedCodecMode = useMemo(() => {
    const modes = selectedCodecOption.modes;
    if (modes.length <= 1) {
      return modes[0];
    }
    return modes.find((mode) => mode.id === state.codecBitrateMode) ?? modes[0];
  }, [selectedCodecOption, state.codecBitrateMode]);
  const codecVariantOptions = selectedCodecMode.variants;
  const codecVariantValid = codecVariantOptions.some((variant) => variant.id === state.codecVariant);
  const setCodecVariantControl = controls.setCodecVariant;
  useEffect(() => {
    if (!codecVariantValid && codecVariantOptions.length > 0) {
      setCodecVariantControl(codecVariantOptions[0].id);
    }
  }, [codecVariantValid, codecVariantOptions, setCodecVariantControl]);
  const codecVariantValue = codecVariantValid
    ? state.codecVariant
    : codecVariantOptions[0]?.id ?? 0;
  const handleFrameRateChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target;
    const option = frameRateOptions.find((item) => item.id === value);
    if (!option) return;
    setFrameRate(option.frameRate);
    setMRate(option.mRate);
    setInterlaced(option.interlaced);
  };
  const showLoadingOverlay = state.connection === "connecting" || state.loading;
  const shouldDimGrid = showLoadingOverlay || !state.ready;

  return (
    <main className="page">
      <section className="card">
        <header className="card__header">
          <div>
            <h1>Blackmagic Camera Control</h1>
            <p className="subtitle">Web Bluetooth (BLE) Controller</p>
            <p className="subtitle">
              Created by{" "}
              <Link
                href="https://twitter.com/geeken"
                target="_blank"
                style={{ color: "#6c8cff" }}
              >
                @geeken
              </Link>{" "}
              in Irvine, CA
            </p>
          </div>
          <div
            className={`status status--${state.connection}`}
            data-testid="connection-status"
          >
            {connectionLabel}
          </div>
        </header>

        <div className="card__body">
          <p data-testid="status-message">
            {state.statusMessage ?? "Ready to connect to a camera."}
          </p>

          <div className="button-row">
            {state.connection === "disconnected" ? (
              <button
                className="primary"
                onClick={controls.connect}
                data-testid="connect-toggle"
              >
                Connect
              </button>
            ) : (
              <button
                className="secondary"
                onClick={controls.disconnect}
                data-testid="connect-toggle"
              >
                Disconnect
              </button>
            )}
            <button
              className="secondary"
              onClick={() => controls.setRecording(!state.recording)}
              disabled={state.connection === "disconnected"}
            >
              {state.recording ? "Stop Recording" : "Start Recording"}
            </button>
          </div>

          {(deviceInfo.manufacturer || deviceInfo.model) && (
            <div className="info">
              <strong>Device:</strong>{" "}
              {[deviceInfo.manufacturer, deviceInfo.model]
                .filter(Boolean)
                .join(" • ")}
            </div>
          )}
        </div>
      </section>

      {state.connection !== "disconnected" && (
        <section
          className={`grid ${shouldDimGrid ? "grid--dimmed" : ""}`}
          data-disabled={state.connection !== "connected"}
        >
          {showLoadingOverlay && (
            <div className="grid__overlay" aria-hidden="true">
              <div className="grid__spinner" />
            </div>
          )}
          <ControlCard title="ISO" description="Select supported ISO values.">
            <div className="button-row wrap">
              {state.isoOptions.map((iso) => (
                <button
                  key={iso}
                  className={iso === state.iso ? "chip chip--active" : "chip"}
                  onClick={() => controls.setISO(iso)}
                >
                  {iso}
                </button>
              ))}
            </div>
          </ControlCard>

          <ControlCard
            title="White Balance"
            description="Adjust Kelvin, Tint or trigger auto white balance."
          >
            <RangeField
              label={`${state.whiteBalance} K`}
              min={state.whiteBalanceRange[0]}
              max={state.whiteBalanceRange[1]}
              step={50}
              value={state.whiteBalance}
              onChange={(value) => controls.setWhiteBalance(Math.round(value))}
            />

            <div className="button-row wrap">
              {whiteBalancePresets.map((preset) => (
                <button
                  key={preset}
                  className={
                    preset === state.whiteBalance ? "chip chip--active" : "chip"
                  }
                  onClick={() => controls.setWhiteBalance(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>

            <RangeField
              label={`Tint ${state.tint}`}
              min={state.tintRange[0]}
              max={state.tintRange[1]}
              step={1}
              value={state.tint}
              onChange={(value) => controls.setTint(Math.round(value))}
            />

            <div className="button-row">
              <button
                className="secondary"
                onClick={controls.triggerAutoWhiteBalance}
              >
                Auto WB
              </button>
              <button
                className="secondary"
                onClick={controls.restoreAutoWhiteBalance}
              >
                Restore Auto WB
              </button>
            </div>
          </ControlCard>

          <ControlCard
            title="Shutter"
            description="Toggle between shutter angle and shutter speed."
          >
            <div className="button-row">
              <button
                className={
                  state.shutterMeasurement === "angle"
                    ? "chip chip--active"
                    : "chip"
                }
                onClick={() => controls.setShutterAngle(state.shutterAngle)}
              >
                Angle
              </button>
              <button
                className={
                  state.shutterMeasurement === "speed"
                    ? "chip chip--active"
                    : "chip"
                }
                onClick={() => controls.setShutterSpeed(state.shutterSpeed)}
              >
                Speed
              </button>
            </div>

            {state.shutterMeasurement === "angle" ? (
              <div className="button-row wrap">
                {state.shutterAngles.map((angle) => (
                  <button
                    key={angle}
                    className={
                      angle === state.shutterAngle
                        ? "chip chip--active"
                        : "chip"
                    }
                    onClick={() => controls.setShutterAngle(angle)}
                  >
                    {angle.toFixed(1)}°
                  </button>
                ))}
              </div>
            ) : (
              <div className="button-row wrap">
                {state.shutterSpeeds.map((speed) => (
                  <button
                    key={speed}
                    className={
                      speed === state.shutterSpeed
                        ? "chip chip--active"
                        : "chip"
                    }
                    onClick={() => controls.setShutterSpeed(speed)}
                  >
                    1/{speed}
                  </button>
                ))}
              </div>
            )}
          </ControlCard>

          <ControlCard
            title="Gain & Iris"
            description="Adjust gain (dB) and iris position (normalized)."
          >
            <div className="button-row wrap">
              {state.gainOptions.map((gain) => (
                <button
                  key={gain}
                  className={gain === state.gain ? "chip chip--active" : "chip"}
                  onClick={() => controls.setGain(gain)}
                >
                  {gain} dB
                </button>
              ))}
            </div>

            <RangeField
              label={`Iris ${state.iris.toFixed(2)}`}
              min={0}
              max={1}
              step={0.01}
              value={state.iris}
              onChange={(value) => controls.setIris(value)}
            />
          </ControlCard>

          <ControlCard
            title="Focus"
            description="Set focus position or trigger auto-focus."
          >
            <RangeField
              label={`Focus ${state.focus.toFixed(2)}`}
              min={0}
              max={1}
              step={0.01}
              value={state.focus}
              onChange={(value) => controls.setFocus(value)}
            />
            <button className="secondary" onClick={controls.triggerAutoFocus}>
              Auto Focus
            </button>
          </ControlCard>

          <ControlCard
            title="ND Filter"
            description="Adjust ND filter stops and display mode."
          >
            <RangeField
              label={`${state.ndStop.toFixed(2)} stops`}
              min={Math.min(...state.ndStops)}
              max={Math.max(...state.ndStops)}
              step={0.1}
              value={state.ndStop}
              onChange={(value) =>
                controls.setNDFilter(value, state.ndDisplayModeIndex)
              }
            />

            <div className="button-row wrap">
              {state.ndStops.map((stop) => (
                <button
                  key={stop}
                  className={
                    Math.abs(stop - state.ndStop) < 0.05
                      ? "chip chip--active"
                      : "chip"
                  }
                  onClick={() =>
                    controls.setNDFilter(stop, state.ndDisplayModeIndex)
                  }
                >
                  {stop}
                </button>
              ))}
            </div>
          </ControlCard>

          <ControlCard
            title="Video Mode"
            description="Send CCU video mode command (frame rate & dimensions)."
          >
            <div className="form-grid">
              <label>
                Frame Rate
                <select value={selectedFrameRateOption?.id ?? "custom"} onChange={handleFrameRateChange}>
                  {frameRateOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                  <option value="custom" disabled>
                    Custom (
                    {Number.isInteger(frameRate) ? frameRate : frameRate.toFixed(2)}
                    {mRate ? " (M-Rate)" : ""})
                  </option>
                </select>
              </label>
              <label>
                Dimension
                <select
                  value={selectedDimensionId}
                  onChange={(event) => setSelectedDimensionId(event.target.value)}
                >
                  {dimensionOptions.map((dimension) => (
                    <option key={dimension.id} value={dimension.id}>
                      {dimension.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={interlaced}
                  onChange={(event) => setInterlaced(event.target.checked)}
                  data-testid="interlaced-toggle"
                />
                Interlaced
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={state.sensorWindowed}
                  onChange={(event) => controls.setSensorWindowed(event.target.checked)}
                  data-testid="sensor-windowed"
                />
                Sensor Windowed
              </label>
            </div>
            <button
              className="secondary"
              onClick={() =>
                controls.setVideoMode(
                  frameRate,
                  mRate,
                  dimensionCode,
                  interlaced,
                  selectedDimension?.width,
                  selectedDimension?.height
                )
              }
            >
              Send Video Mode Command
            </button>
          </ControlCard>

          <ControlCard
            title="Video Options"
            description="Adjust dynamic range, sharpening and display LUT."
          >
            <label>
              Dynamic Range
              <select
                value={state.dynamicRangeMode}
                onChange={(event) => controls.setDynamicRange(Number(event.target.value))}
                data-testid="dynamic-range-select"
              >
                {dynamicRangeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Sharpening
              <select
                value={state.sharpeningLevel}
                onChange={(event) => controls.setSharpening(Number(event.target.value))}
                data-testid="sharpening-select"
              >
                {sharpeningOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Display LUT
              <select
                value={state.lutIndex}
                onChange={(event) =>
                  controls.setDisplayLut(Number(event.target.value), state.lutEnabled)
                }
                data-testid="lut-select"
              >
                {lutOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={state.lutEnabled}
                onChange={(event) =>
                  controls.setDisplayLut(state.lutIndex, event.target.checked)
                }
                data-testid="lut-enabled-toggle"
              />
              Enable LUT
            </label>
            <label>
              Codec
              <select
                value={selectedCodecOption.id}
                onChange={(event) => {
                  const codecId = Number(event.target.value);
                  const option = codecOptions.find((item) => item.id === codecId);
                  if (!option) return;
                  const defaultMode = option.modes[0];
                  const defaultVariant = defaultMode.variants[0]?.id ?? 0;
                  controls.setCodec(codecId, defaultVariant, defaultMode.id);
                }}
                data-testid="codec-select"
              >
                {codecOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {selectedCodecOption.modes.length > 1 && (
              <div className="button-row wrap">
                {selectedCodecOption.modes.map((mode) => (
                  <label key={mode.id} className="checkbox">
                    <input
                      type="radio"
                      checked={selectedCodecMode.id === mode.id}
                      onChange={() => controls.setCodecBitrateMode(mode.id)}
                      data-testid={`codec-mode-${mode.id}`}
                    />
                    {mode.label}
                  </label>
                ))}
              </div>
            )}
            <label>
              {selectedCodecOption.id === 3 && selectedCodecMode.id === 1 ? "Bitrate" : "Quality"}
              <select
                value={codecVariantValue}
                onChange={(event) => controls.setCodecVariant(Number(event.target.value))}
                data-testid="codec-variant-select"
              >
                {codecVariantOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </ControlCard>

          <ControlCard title="Audio" description="Manage levels, mix and phantom power.">
            <RangeField
              label={`Mic Level ${(state.micLevel * 100).toFixed(0)}%`}
              min={0}
              max={1}
              step={0.01}
              value={state.micLevel}
              onChange={(value) => controls.setMicLevel(value)}
            />
            <RangeField
              label={`Headphone Level ${(state.headphoneLevel * 100).toFixed(0)}%`}
              min={0}
              max={1}
              step={0.01}
              value={state.headphoneLevel}
              onChange={(value) => controls.setHeadphoneLevel(value)}
            />
            <RangeField
              label={`Headphone Program Mix ${(state.headphoneMix * 100).toFixed(0)}%`}
              min={0}
              max={1}
              step={0.01}
              value={state.headphoneMix}
              onChange={(value) => controls.setHeadphoneMix(value)}
            />
            <RangeField
              label={`Speaker Level ${(state.speakerLevel * 100).toFixed(0)}%`}
              min={0}
              max={1}
              step={0.01}
              value={state.speakerLevel}
              onChange={(value) => controls.setSpeakerLevel(value)}
            />
            <label>
              Audio Input Type
              <select
                value={state.audioInputType}
                onChange={(event) => controls.setAudioInputType(Number(event.target.value))}
              >
                {audioInputTypeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <RangeField
              label={`Input Level (Ch1) ${(state.audioInputLevels[0] * 100).toFixed(0)}%`}
              min={0}
              max={1}
              step={0.01}
              value={state.audioInputLevels[0]}
              onChange={(value) => controls.setAudioInputLevel(0, value)}
            />
            <RangeField
              label={`Input Level (Ch2) ${(state.audioInputLevels[1] * 100).toFixed(0)}%`}
              min={0}
              max={1}
              step={0.01}
              value={state.audioInputLevels[1]}
              onChange={(value) => controls.setAudioInputLevel(1, value)}
            />
            <label className="checkbox">
              <input
                type="checkbox"
                checked={state.phantomPower}
                onChange={(event) => controls.setPhantomPower(event.target.checked)}
              />
              Phantom Power
            </label>
          </ControlCard>

          <ControlCard
            title="Monitoring"
            description="Configure monitor overlays, focus assist and program return."
          >
            <RangeField
              label={`Display Brightness ${(state.displayBrightness * 100).toFixed(0)}%`}
              min={0}
              max={1}
              step={0.01}
              value={state.displayBrightness}
              onChange={(value) => controls.setDisplayBrightness(value)}
            />
            <RangeField
              label={`Zebra Level ${(state.zebraLevel * 100).toFixed(0)}%`}
              min={0}
              max={1}
              step={0.01}
              value={state.zebraLevel}
              onChange={(value) => controls.setZebraLevel(value)}
            />
            <RangeField
              label={`Peaking Level ${(state.peakingLevel * 100).toFixed(0)}%`}
              min={0}
              max={1}
              step={0.01}
              value={state.peakingLevel}
              onChange={(value) => controls.setPeakingLevel(value)}
            />
            <label>
              Focus Assist Method
              <select
                value={state.focusAssistMethod}
                onChange={(event) =>
                  controls.setFocusAssist(Number(event.target.value), state.focusAssistColor)
                }
              >
                {focusAssistMethodOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Focus Assist Color
              <select
                value={state.focusAssistColor}
                onChange={(event) =>
                  controls.setFocusAssist(state.focusAssistMethod, Number(event.target.value))
                }
              >
                {focusAssistColorOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <RangeField
              label={`Program Return Timeout ${state.programReturnTimeout}s`}
              min={0}
              max={30}
              step={1}
              value={state.programReturnTimeout}
              onChange={(value) => controls.setProgramReturnTimeout(value)}
            />
            <RangeField
              label={`Color Bars Timeout ${state.colorBarsTimeout}s`}
              min={0}
              max={30}
              step={1}
              value={state.colorBarsTimeout}
              onChange={(value) => controls.setColorBarsTimeout(value)}
            />
          </ControlCard>

          <ControlCard
            title="Tally"
            description="Adjust tally brightness values."
          >
            <RangeField
              label={`Global Tally ${(state.tallyBrightness * 100).toFixed(0)}%`}
              min={0}
              max={1}
              step={0.01}
              value={state.tallyBrightness}
              onChange={(value) => controls.setTallyBrightness(value)}
            />
            <RangeField
              label={`Front Tally ${(state.frontTallyBrightness * 100).toFixed(0)}%`}
              min={0}
              max={1}
              step={0.01}
              value={state.frontTallyBrightness}
              onChange={(value) => controls.setFrontTallyBrightness(value)}
            />
            <RangeField
              label={`Rear Tally ${(state.rearTallyBrightness * 100).toFixed(0)}%`}
              min={0}
              max={1}
              step={0.01}
              value={state.rearTallyBrightness}
              onChange={(value) => controls.setRearTallyBrightness(value)}
            />
          </ControlCard>
        </section>
      )}
    </main>
  );
}

interface ControlCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

function ControlCard({ title, description, children }: ControlCardProps) {
  return (
    <section className="card">
      <header className="card__header">
        <div>
          <h2>{title}</h2>
          {description && <p className="subtitle">{description}</p>}
        </div>
      </header>
      <div className="card__body">{children}</div>
    </section>
  );
}

interface RangeFieldProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}

function RangeField({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: RangeFieldProps) {
  return (
    <label className="range-field">
      <div className="range-field__label">{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
