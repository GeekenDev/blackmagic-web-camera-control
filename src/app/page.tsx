'use client';

import { useMemo, useState } from 'react';
import { useBleCamera } from '@/hooks/useBleCamera';

const whiteBalancePresets = [2800, 3200, 4500, 5000, 5600, 6500, 7500];
const videoDimensions = [
  { label: '1080p', code: 3 },
  { label: 'UHD', code: 6 },
  { label: '4K DCI', code: 8 },
  { label: '4K 16:9', code: 9 },
];

export default function HomePage() {
  const { state, deviceInfo, controls } = useBleCamera();
  const [frameRate, setFrameRate] = useState(24);
  const [mRate, setMRate] = useState(false);
  const [dimensionCode, setDimensionCode] = useState(3);
  const [interlaced, setInterlaced] = useState(false);

  const connectionLabel = useMemo(() => {
    switch (state.connection) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting…';
      default:
        return 'Disconnected';
    }
  }, [state.connection]);
  const showLoadingOverlay = state.connection === 'connecting' || state.loading;
  const shouldDimGrid = showLoadingOverlay || !state.ready;

  return (
    <main className="page">
      <section className="card">
        <header className="card__header">
          <div>
            <h1>Blackmagic Camera Control</h1>
            <p className="subtitle">Web Bluetooth (BLE) Controller</p>
          </div>
          <div className={`status status--${state.connection}`}>{connectionLabel}</div>
        </header>

        <div className="card__body">
          <p>{state.statusMessage ?? 'Ready to connect to a camera.'}</p>

          <div className="button-row">
            {state.connection === 'disconnected' ? (
              <button className="primary" onClick={controls.connect}>
                Connect
              </button>
            ) : (
              <button className="secondary" onClick={controls.disconnect}>
                Disconnect
              </button>
            )}
            <button className="secondary" onClick={() => controls.setRecording(!state.recording)} disabled={state.connection === 'disconnected'}>
              {state.recording ? 'Stop Recording' : 'Start Recording'}
            </button>
          </div>

          {(deviceInfo.manufacturer || deviceInfo.model) && (
            <div className="info">
              <strong>Device:</strong>{' '}
              {[deviceInfo.manufacturer, deviceInfo.model].filter(Boolean).join(' • ')}
            </div>
          )}
        </div>
      </section>

      {state.connection !== 'disconnected' && (
        <section
          className={`grid ${shouldDimGrid ? 'grid--dimmed' : ''}`}
          data-disabled={state.connection !== "connected"}
        >
          {showLoadingOverlay && (
            <div className="grid__overlay" aria-hidden="true">
              <div className="grid__spinner" />
            </div>
          )}
          <ControlCard title="ISO" description="Select supported ISO values.">
            <div className="button-row">
              {state.isoOptions.map((iso) => (
                <button
                  key={iso}
                className={iso === state.iso ? 'chip chip--active' : 'chip'}
                onClick={() => controls.setISO(iso)}
              >
                {iso}
              </button>
            ))}
          </div>
        </ControlCard>

        <ControlCard title="White Balance" description="Adjust Kelvin, Tint or trigger auto white balance.">
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
                className={preset === state.whiteBalance ? 'chip chip--active' : 'chip'}
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
            <button className="secondary" onClick={controls.triggerAutoWhiteBalance}>
              Auto WB
            </button>
            <button className="secondary" onClick={controls.restoreAutoWhiteBalance}>
              Restore Auto WB
            </button>
          </div>
        </ControlCard>

        <ControlCard title="Shutter" description="Toggle between shutter angle and shutter speed.">
          <div className="button-row">
            <button
              className={state.shutterMeasurement === 'angle' ? 'chip chip--active' : 'chip'}
              onClick={() => controls.setShutterAngle(state.shutterAngle)}
            >
              Angle
            </button>
            <button
              className={state.shutterMeasurement === 'speed' ? 'chip chip--active' : 'chip'}
              onClick={() => controls.setShutterSpeed(state.shutterSpeed)}
            >
              Speed
            </button>
          </div>

          {state.shutterMeasurement === 'angle' ? (
            <div className="button-row wrap">
              {state.shutterAngles.map((angle) => (
                <button
                  key={angle}
                  className={angle === state.shutterAngle ? 'chip chip--active' : 'chip'}
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
                  className={speed === state.shutterSpeed ? 'chip chip--active' : 'chip'}
                  onClick={() => controls.setShutterSpeed(speed)}
                >
                  1/{speed}
                </button>
              ))}
            </div>
          )}
        </ControlCard>

        <ControlCard title="Gain & Iris" description="Adjust gain (dB) and iris position (normalized).">
          <div className="button-row wrap">
            {state.gainOptions.map((gain) => (
              <button
                key={gain}
                className={gain === state.gain ? 'chip chip--active' : 'chip'}
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

        <ControlCard title="Focus" description="Set focus position or trigger auto-focus.">
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

        <ControlCard title="ND Filter" description="Adjust ND filter stops and display mode.">
          <RangeField
            label={`${state.ndStop.toFixed(2)} stops`}
            min={Math.min(...state.ndStops)}
            max={Math.max(...state.ndStops)}
            step={0.1}
            value={state.ndStop}
            onChange={(value) => controls.setNDFilter(value, state.ndDisplayModeIndex)}
          />

          <div className="button-row wrap">
            {state.ndStops.map((stop) => (
              <button
                key={stop}
                className={Math.abs(stop - state.ndStop) < 0.05 ? 'chip chip--active' : 'chip'}
                onClick={() => controls.setNDFilter(stop, state.ndDisplayModeIndex)}
              >
                {stop}
              </button>
            ))}
          </div>
        </ControlCard>

        <ControlCard title="Video Mode" description="Send CCU video mode command (frame rate & dimensions).">
          <div className="form-grid">
            <label>
              Frame Rate
              <input
                type="number"
                value={frameRate}
                onChange={(event) => setFrameRate(Number(event.target.value))}
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={mRate}
                onChange={(event) => setMRate(event.target.checked)}
              />
              M-Rate (1000/1001)
            </label>
            <label>
              Dimension
              <select value={dimensionCode} onChange={(event) => setDimensionCode(Number(event.target.value))}>
                {videoDimensions.map((dimension) => (
                  <option key={dimension.code} value={dimension.code}>
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
              />
              Interlaced
            </label>
          </div>
          <button
            className="secondary"
            onClick={() => controls.setVideoMode(frameRate, mRate, dimensionCode, interlaced)}
          >
            Send Video Mode Command
          </button>
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

function RangeField({ label, min, max, step, value, onChange }: RangeFieldProps) {
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
