/// <reference types="web-bluetooth" />

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BLE_UUIDS,
  CameraCommands,
  RecordingFormatFlags,
  decodeCommands,
} from "@/lib/cameraControl";

export type ConnectionState = "disconnected" | "connecting" | "connected";

export interface BleDeviceInfo {
  manufacturer?: string;
  model?: string;
}

export interface CameraUiState {
  connection: ConnectionState;
  statusMessage?: string;
  ready: boolean;
  loading: boolean;
  initialSyncComplete: boolean;
  iso: number;
  isoOptions: number[];
  whiteBalance: number;
  whiteBalanceRange: [number, number];
  tint: number;
  tintRange: [number, number];
  shutterMeasurement: "angle" | "speed";
  shutterAngle: number;
  shutterAngles: number[];
  shutterSpeed: number;
  shutterSpeeds: number[];
  gain: number;
  gainOptions: number[];
  iris: number;
  focus: number;
  ndStop: number;
  ndStops: number[];
  ndDisplayModeIndex: number;
  recording: boolean;
  frameRate: number;
  offSpeedFrameRate: number;
  offSpeedEnabled: boolean;
  videoWidth: number;
  videoHeight: number;
  recordingFormatFlags: number;
  mRateEnabled: boolean;
  interlacedVideo: boolean;
  dynamicRangeMode: number;
  sharpeningLevel: number;
  lutIndex: number;
  lutEnabled: boolean;
  micLevel: number;
  headphoneLevel: number;
  headphoneMix: number;
  speakerLevel: number;
  audioInputType: number;
  audioInputLevels: [number, number];
  phantomPower: boolean;
  displayBrightness: number;
  zebraLevel: number;
  peakingLevel: number;
  focusAssistMethod: number;
  focusAssistColor: number;
  programReturnTimeout: number;
  colorBarsTimeout: number;
  tallyBrightness: number;
  frontTallyBrightness: number;
  rearTallyBrightness: number;
  codec: number;
  codecVariant: number;
  codecBitrateMode: number;
  sensorWindowed: boolean;
}

const DEFAULT_STATE: CameraUiState = {
  connection: "disconnected",
  statusMessage: undefined,
  ready: false,
  loading: false,
  initialSyncComplete: false,
  iso: 400,
  isoOptions: [100, 200, 400, 800, 1600, 3200, 6400, 12800],
  whiteBalance: 5600,
  whiteBalanceRange: [2500, 10000],
  tint: 0,
  tintRange: [-50, 50],
  shutterMeasurement: "angle",
  shutterAngle: 180,
  shutterAngles: [45, 90, 120, 144, 172.8, 180],
  shutterSpeed: 50,
  shutterSpeeds: [24, 25, 30, 48, 50, 60, 96, 100, 120],
  gain: 0,
  gainOptions: [0, 6, 12, 18, 24],
  iris: 0.5,
  focus: 0.5,
  ndStop: 0,
  ndStops: [0, 2, 4, 6],
  ndDisplayModeIndex: 0,
  recording: false,
  frameRate: 24,
  offSpeedFrameRate: 24,
  offSpeedEnabled: false,
  videoWidth: 1920,
  videoHeight: 1080,
  recordingFormatFlags: 0,
  mRateEnabled: false,
  interlacedVideo: false,
  dynamicRangeMode: 0,
  sharpeningLevel: 0,
  lutIndex: 0,
  lutEnabled: false,
  micLevel: 0.5,
  headphoneLevel: 0.5,
  headphoneMix: 0.5,
  speakerLevel: 0.5,
  audioInputType: 0,
  audioInputLevels: [0.5, 0.5],
  phantomPower: false,
  displayBrightness: 0.5,
  zebraLevel: 0.7,
  peakingLevel: 0.5,
  focusAssistMethod: 0,
  focusAssistColor: 0,
  programReturnTimeout: 0,
  colorBarsTimeout: 0,
  tallyBrightness: 0.5,
  frontTallyBrightness: 0.5,
  rearTallyBrightness: 0.5,
  codec: 3,
  codecVariant: 0,
  codecBitrateMode: 0,
  sensorWindowed: false,
};

interface BleRefs {
  device?: BluetoothDevice;
  server?: BluetoothRemoteGATTServer;
  outgoing?: BluetoothRemoteGATTCharacteristic;
  incoming?: BluetoothRemoteGATTCharacteristic;
  status?: BluetoothRemoteGATTCharacteristic;
}

const FIXED16_SCALE = 2048;
const BRAW_QUALITY_VARIANTS = [0, 1, 7, 8] as const;
const BRAW_BITRATE_VARIANTS = [2, 3, 4, 5] as const;
const PRORES_VARIANTS = [0, 1, 2, 3] as const;
const BRAW_BITRATE_SET = new Set<number>(BRAW_BITRATE_VARIANTS);

const readFixed16 = (payload: Uint8Array, offset = 0): number | null => {
  if (payload.byteLength < offset + 2) {
    return null;
  }
  const view = new DataView(payload.buffer, payload.byteOffset + offset, 2);
  return view.getInt16(0, true) / FIXED16_SCALE;
};

const clamp01 = (value: number) => {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
};

export function useBleCamera() {
  const [state, setState] = useState<CameraUiState>(DEFAULT_STATE);
  const [deviceInfo, setDeviceInfo] = useState<BleDeviceInfo>({});
  const refs = useRef<BleRefs>({});
  const gattConnected = useRef(false);
  const lastIncomingLogRef = useRef<{
    signature: string;
    timestamp: number;
  } | null>(null);
  const lastUiLogRef = useRef<{ signature: string; timestamp: number } | null>(
    null
  );
  const incomingBufferRef = useRef<Uint8Array>(new Uint8Array());

  const reset = useCallback(() => {
    setState((prev) => ({
      ...DEFAULT_STATE,
      connection: "disconnected",
      statusMessage:
        prev.connection === "connected" ? "Disconnected." : prev.statusMessage,
      ready: false,
      loading: false,
    }));
    setDeviceInfo({});
    gattConnected.current = false;
    incomingBufferRef.current = new Uint8Array();
  }, []);

  const disconnect = useCallback(async () => {
    const { device } = refs.current;
    if (device?.gatt?.connected) {
      device.gatt.disconnect();
    }
    refs.current = {};
    gattConnected.current = false;
    reset();
  }, [reset]);

  const handleIncoming = useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (!target?.value) return;
    const chunkBuffer = target.value.buffer.slice(
      target.value.byteOffset,
      target.value.byteOffset + target.value.byteLength
    ) as ArrayBuffer;
    const chunk = new Uint8Array(chunkBuffer);
    let combined = new Uint8Array(
      incomingBufferRef.current.length + chunk.length
    );
    combined.set(incomingBufferRef.current, 0);
    combined.set(chunk, incomingBufferRef.current.length);

    const packets: Uint8Array[] = [];
    while (combined.length >= 4) {
      const payloadLength = combined[1];
      const totalLength = 4 + payloadLength;
      if (combined.length < totalLength) {
        break;
      }
      packets.push(combined.slice(0, totalLength));
      combined = combined.slice(totalLength);
    }

    incomingBufferRef.current = combined;

    if (packets.length === 0) {
      return;
    }

    const totalPacketBytes = packets.reduce(
      (sum, packet) => sum + packet.length,
      0
    );
    const commands = packets.flatMap((packet) => {
      const copy = packet.slice();
      return decodeCommands(copy.buffer);
    });

    console.log("[BLE] Incoming configuration chunk", {
      byteLength: chunk.byteLength,
      bufferedBytes: incomingBufferRef.current.length,
      packets: packets.length,
      commandCount: commands.length,
    });

    setState((prev) => {
      const next: CameraUiState = { ...prev };
      const connectedMessage = "Connected to camera.";
      const appliedParameters: string[] = [];
      commands.forEach((command) => {
        const key = `${command.category}-${command.parameter}`;
        switch (key) {
          case "1-14": {
            const view = new DataView(
              command.payload.buffer,
              command.payload.byteOffset,
              command.payload.byteLength
            );
            next.iso = view.getInt32(0, true);
            appliedParameters.push("ISO");
            break;
          }
          case "1-2": {
            const view = new DataView(
              command.payload.buffer,
              command.payload.byteOffset,
              command.payload.byteLength
            );
            if (command.payload.byteLength >= 2) {
              next.whiteBalance = view.getInt16(0, true);
              appliedParameters.push("WhiteBalance");
            }
            if (command.payload.byteLength >= 4) {
              next.tint = view.getInt16(2, true);
              appliedParameters.push("Tint");
            }
            break;
          }
          case "1-7": {
            if (command.payload.length >= 1) {
              next.dynamicRangeMode = command.payload[0];
              appliedParameters.push("DynamicRange");
            }
            break;
          }
          case "1-8": {
            if (command.payload.length >= 1) {
              next.sharpeningLevel = command.payload[0];
              appliedParameters.push("Sharpening");
            }
            break;
          }
          case "1-11": {
            const view = new DataView(command.payload.buffer);
            next.shutterAngle = view.getInt32(0, true) / 100;
            next.shutterMeasurement = "angle";
            appliedParameters.push("ShutterAngle");
            break;
          }
          case "1-12": {
            const view = new DataView(command.payload.buffer);
            next.shutterSpeed = view.getInt32(0, true);
            next.shutterMeasurement = "speed";
            appliedParameters.push("ShutterSpeed");
            break;
          }
          case "1-13": {
            next.gain = new DataView(command.payload.buffer).getInt8(0);
            appliedParameters.push("Gain");
            break;
          }
          case "1-15": {
            if (command.payload.length >= 2) {
              next.lutIndex = command.payload[0];
              next.lutEnabled = command.payload[1] !== 0;
              appliedParameters.push("DisplayLUT");
            }
            break;
          }
          case "1-16": {
            const view = new DataView(command.payload.buffer);
            if (command.payload.byteLength >= 2) {
              next.ndStop = view.getInt16(0, true) / 2048;
              appliedParameters.push("NDStop");
            }
            if (command.payload.byteLength >= 4) {
              const mode = view.getInt16(2, true);
              next.ndDisplayModeIndex = mode;
              appliedParameters.push("NDMode");
            }
            break;
          }
          case "1-9": {
            if (command.payload.byteLength >= 10) {
              const view = new DataView(
                command.payload.buffer,
                command.payload.byteOffset,
                10
              );
              next.frameRate = view.getInt16(0, true);
              next.offSpeedFrameRate = view.getInt16(2, true);
              next.videoWidth = view.getInt16(4, true);
              next.videoHeight = view.getInt16(6, true);
              const flags = view.getInt16(8, true);
              next.recordingFormatFlags = flags;
              next.offSpeedEnabled =
                (flags & RecordingFormatFlags.SensorOffSpeed) !== 0;
              next.mRateEnabled =
                (flags & RecordingFormatFlags.FileMRate) !== 0;
              next.interlacedVideo =
                (flags & RecordingFormatFlags.Interlaced) !== 0;
              next.sensorWindowed =
                (flags & RecordingFormatFlags.WindowedMode) !== 0;
              appliedParameters.push("RecordingFormat");
            }
            break;
          }
          case "10-0": {
            if (command.payload.length >= 2) {
              const codec = command.payload[0];
              const variant = command.payload[1];
              next.codec = codec;
              next.codecVariant = variant;
              if (codec === 3) {
                if (BRAW_BITRATE_SET.has(variant)) {
                  next.codecBitrateMode = 1;
                } else {
                  next.codecBitrateMode = 0;
                }
              } else {
                next.codecBitrateMode = 0;
              }
              appliedParameters.push("Codec");
            }
            break;
          }
          case "2-0": {
            const value = readFixed16(command.payload);
            if (value != null) {
              next.micLevel = clamp01(value);
              appliedParameters.push("MicLevel");
            }
            break;
          }
          case "2-1": {
            const value = readFixed16(command.payload);
            if (value != null) {
              next.headphoneLevel = clamp01(value);
              appliedParameters.push("HeadphoneLevel");
            }
            break;
          }
          case "2-2": {
            const value = readFixed16(command.payload);
            if (value != null) {
              next.headphoneMix = clamp01(value);
              appliedParameters.push("HeadphoneMix");
            }
            break;
          }
          case "2-3": {
            const value = readFixed16(command.payload);
            if (value != null) {
              next.speakerLevel = clamp01(value);
              appliedParameters.push("SpeakerLevel");
            }
            break;
          }
          case "2-4": {
            if (command.payload.length >= 1) {
              next.audioInputType = command.payload[0];
              appliedParameters.push("AudioInputType");
            }
            break;
          }
          case "2-5": {
            if (command.payload.length >= 4) {
              const ch0 = readFixed16(command.payload, 0);
              const ch1 = readFixed16(command.payload, 2);
              if (ch0 != null && ch1 != null) {
                next.audioInputLevels = [clamp01(ch0), clamp01(ch1)];
                appliedParameters.push("AudioInputLevels");
              }
            }
            break;
          }
          case "2-6": {
            if (command.payload.length >= 1) {
              next.phantomPower = command.payload[0] !== 0;
              appliedParameters.push("PhantomPower");
            }
            break;
          }
          case "4-0": {
            const value = readFixed16(command.payload);
            if (value != null) {
              next.displayBrightness = clamp01(value);
              appliedParameters.push("DisplayBrightness");
            }
            break;
          }
          case "4-2": {
            const value = readFixed16(command.payload);
            if (value != null) {
              next.zebraLevel = clamp01(value);
              appliedParameters.push("ZebraLevel");
            }
            break;
          }
          case "4-3": {
            const value = readFixed16(command.payload);
            if (value != null) {
              next.peakingLevel = clamp01(value);
              appliedParameters.push("PeakingLevel");
            }
            break;
          }
          case "4-4": {
            if (command.payload.length >= 1) {
              next.colorBarsTimeout = command.payload[0];
              appliedParameters.push("ColorBars");
            }
            break;
          }
          case "4-5": {
            if (command.payload.length >= 2) {
              next.focusAssistMethod = command.payload[0];
              next.focusAssistColor = command.payload[1];
              appliedParameters.push("FocusAssist");
            }
            break;
          }
          case "4-6": {
            if (command.payload.length >= 1) {
              next.programReturnTimeout = command.payload[0];
              appliedParameters.push("ProgramReturn");
            }
            break;
          }
          case "5-0": {
            const value = readFixed16(command.payload);
            if (value != null) {
              next.tallyBrightness = clamp01(value);
              appliedParameters.push("TallyBrightness");
            }
            break;
          }
          case "5-1": {
            const value = readFixed16(command.payload);
            if (value != null) {
              next.frontTallyBrightness = clamp01(value);
              appliedParameters.push("FrontTally");
            }
            break;
          }
          case "5-2": {
            const value = readFixed16(command.payload);
            if (value != null) {
              next.rearTallyBrightness = clamp01(value);
              appliedParameters.push("RearTally");
            }
            break;
          }
          case "0-3": {
            const view = new DataView(command.payload.buffer);
            next.iris = view.getInt16(0, true) / 2048;
            appliedParameters.push("Iris");
            break;
          }
          case "0-0": {
            const view = new DataView(command.payload.buffer);
            next.focus = view.getInt16(0, true) / 2048;
            appliedParameters.push("Focus");
            break;
          }
          case "10-1": {
            const recording = command.payload[0] === 2;
            next.recording = recording;
            appliedParameters.push("Recording");
            break;
          }
          default:
            break;
        }
      });
      const nextInitialSync = prev.initialSyncComplete || commands.length > 0;
      const shouldFinalizeReady =
        prev.ready && !prev.initialSyncComplete && nextInitialSync;
      if (shouldFinalizeReady) {
        next.statusMessage = connectedMessage;
        next.loading = false;
        console.log("[BLE] Initial camera configuration sync complete.");
      } else if (appliedParameters.length > 0) {
        const payloadSignature = commands
          .map((command) => {
            const payloadBytes = Array.from(command.payload);
            return `${command.category}-${
              command.parameter
            }:${payloadBytes.join(".")}`;
          })
          .join("|");
        const signature = `${totalPacketBytes}:${
          commands.length
        }:${appliedParameters.join(",")}:${payloadSignature}`;
        const now =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const lastLog = lastIncomingLogRef.current;
        const isDuplicate =
          lastLog &&
          lastLog.signature === signature &&
          now - lastLog.timestamp < 10;
        if (!isDuplicate) {
          console.log(
            "[BLE] Applied configuration parameters",
            appliedParameters
          );
          lastIncomingLogRef.current = { signature, timestamp: now };
        }
      }
      return {
        ...next,
        ready: prev.ready,
        initialSyncComplete: nextInitialSync,
        loading: shouldFinalizeReady ? false : prev.loading,
      };
    });
  }, []);

  const handleStatus = useCallback((event: Event | CustomEvent<DataView>) => {
    const dataView =
      event instanceof CustomEvent
        ? event.detail
        : (event.target as BluetoothRemoteGATTCharacteristic | null)?.value;
    if (!dataView) return;
    const statusByte = dataView.getUint8(0);
    const paired = (statusByte & 0x01) !== 0;
    const ready = (statusByte & 0x02) !== 0;
    const encrypted = (statusByte & 0x04) !== 0;
    console.log("[BLE] Status characteristic update", {
      statusByte,
      paired,
      ready,
      encrypted,
    });
    setState((prev) => {
      const nextReady = ready ? true : prev.ready;
      const waitingMessage = "Connected. Waiting for camera status…";
      const connectedMessage = "Connected to camera.";
      const nextConnection: ConnectionState = nextReady
        ? "connected"
        : prev.connection === "connected"
        ? "connected"
        : paired || gattConnected.current
        ? "connecting"
        : "disconnected";

      let statusMessage: string;
      if (nextReady && prev.initialSyncComplete) {
        statusMessage = connectedMessage;
      } else if (nextReady) {
        statusMessage = waitingMessage;
      } else if (
        prev.connection === "connected" ||
        prev.statusMessage === waitingMessage
      ) {
        statusMessage = waitingMessage;
      } else if (paired || gattConnected.current) {
        statusMessage = encrypted
          ? "Establishing encrypted session…"
          : "Connecting to camera…";
      } else {
        statusMessage = "Confirm the Bluetooth pairing code on the camera.";
      }

      const shouldShowLoading =
        nextConnection === "connecting" || statusMessage === waitingMessage;

      if (
        statusMessage !== prev.statusMessage ||
        nextConnection !== prev.connection ||
        shouldShowLoading !== prev.loading ||
        nextReady !== prev.ready
      ) {
        const signature = `${nextConnection}|${statusMessage}|${shouldShowLoading}|${nextReady}|${prev.initialSyncComplete}|${encrypted}`;
        const now =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const lastLog = lastUiLogRef.current;
        const isDuplicate =
          lastLog &&
          lastLog.signature === signature &&
          now - lastLog.timestamp < 10;
        if (!isDuplicate) {
          console.log("[BLE] UI link state", {
            connection: nextConnection,
            statusMessage,
            loading: shouldShowLoading,
            ready: nextReady,
            initialSyncComplete: prev.initialSyncComplete,
            encrypted,
          });
          lastUiLogRef.current = { signature, timestamp: now };
        }
      }

      return {
        ...prev,
        connection: nextConnection,
        statusMessage,
        ready: nextReady,
        loading: shouldShowLoading,
      };
    });
  }, []);

  const connect = useCallback(async () => {
    if (!navigator.bluetooth) {
      setState((prev) => ({
        ...prev,
        statusMessage:
          'Web Bluetooth not supported in this browser. If you\'re on an iPhone download Bluefy. &nbsp;<a style="color: #6c8cff; text-decoration: underline;" href="https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055">Download here</a>',
      }));
      return;
    }

    try {
      console.log("[BLE] Initiating camera connection…");
      setState((prev) => ({
        ...prev,
        connection: "connecting",
        statusMessage: "Scanning for cameras…",
        ready: false,
        loading: true,
        initialSyncComplete: false,
      }));
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [BLE_UUIDS.cameraService] }],
        optionalServices: [
          BLE_UUIDS.cameraService,
          BLE_UUIDS.deviceInformationService,
        ],
      });
      console.log("[BLE] Device selected", {
        name: device.name,
        id: device.id,
      });
      refs.current.device = device;

      device.addEventListener("gattserverdisconnected", disconnect);

      const server = await device.gatt?.connect();
      if (!server) throw new Error("Unable to connect to GATT server.");
      console.log("[BLE] Connected to GATT server.");
      refs.current.server = server;

      const service = await server.getPrimaryService(BLE_UUIDS.cameraService);
      const outgoing = await service.getCharacteristic(
        BLE_UUIDS.outgoingControl
      );
      const incoming = await service.getCharacteristic(
        BLE_UUIDS.incomingControl
      );
      const status = await service.getCharacteristic(BLE_UUIDS.cameraStatus);
      console.log("[BLE] Camera service characteristics resolved.");

      refs.current.outgoing = outgoing;
      refs.current.incoming = incoming;
      refs.current.status = status;
      gattConnected.current = true;

      incoming.addEventListener("characteristicvaluechanged", handleIncoming);
      await incoming.startNotifications();

      status.addEventListener("characteristicvaluechanged", handleStatus);
      await status.startNotifications();
      const statusValue = await status.readValue();
      console.log("[BLE] Initial status value read.");
      handleStatus(
        new CustomEvent("camera-status", {
          detail: statusValue,
        } as CustomEventInit<DataView>)
      );

      // Device info
      try {
        const info = await server.getPrimaryService(
          BLE_UUIDS.deviceInformationService
        );
        const manufacturer = await info.getCharacteristic(
          BLE_UUIDS.manufacturer
        );
        const model = await info.getCharacteristic(BLE_UUIDS.model);
        const [manufacturerValue, modelValue] = await Promise.all([
          manufacturer.readValue(),
          model.readValue(),
        ]);
        setDeviceInfo({
          manufacturer: decoder.decode(manufacturerValue),
          model: decoder.decode(modelValue),
        });
        console.log("[BLE] Device information fetched.");
      } catch {
        setDeviceInfo({});
        console.log("[BLE] Failed to read device information.");
      }

      setState((prev) => ({
        ...prev,
        connection: "connected",
        statusMessage: "Connected. Waiting for camera status…",
        ready: false,
        loading: true,
      }));
    } catch (error) {
      console.error(error);
      console.log("[BLE] Connection attempt failed.", error);
      setState((prev) => ({
        ...prev,
        connection: "disconnected",
        statusMessage:
          error instanceof Error ? error.message : "Failed to connect.",
        ready: false,
        loading: false,
        initialSyncComplete: false,
      }));
      await disconnect();
    }
  }, [disconnect, handleIncoming, handleStatus]);

  const sendCommand = useCallback(async (payload: Uint8Array) => {
    const characteristic = refs.current.outgoing;
    if (!characteristic) throw new Error("Not connected to a camera.");
    await characteristic.writeValueWithResponse?.(
      payload as unknown as BufferSource
    );
  }, []);

  const wrap = useCallback(
    (fn: (state: CameraUiState) => Uint8Array | Promise<Uint8Array>) =>
      async () => {
        try {
          const result = await fn(state);
          await sendCommand(result);
        } catch (error: unknown) {
          console.error(error);
          setState((prev) => ({
            ...prev,
            statusMessage:
              error instanceof Error ? error.message : "Unexpected error",
          }));
        }
      },
    [sendCommand, state]
  );

  const controls = {
    connect,
    disconnect,
    setDynamicRange: async (mode: number) => {
      setState((prev) => ({ ...prev, dynamicRangeMode: mode }));
      await sendCommand(CameraCommands.setDynamicRange(mode));
    },
    setSharpening: async (level: number) => {
      setState((prev) => ({ ...prev, sharpeningLevel: level }));
      await sendCommand(CameraCommands.setSharpening(level));
    },
    setDisplayLut: async (index: number, enabled: boolean) => {
      setState((prev) => ({ ...prev, lutIndex: index, lutEnabled: enabled }));
      await sendCommand(CameraCommands.setDisplayLut(index, enabled));
    },
    setCodec: async (codec: number, variant?: number, bitrateMode?: number) => {
      const targetMode =
        codec === 3 ? bitrateMode ?? state.codecBitrateMode ?? 0 : 0;
      const allowedVariants =
        codec === 3
          ? targetMode === 1
            ? BRAW_BITRATE_VARIANTS
            : BRAW_QUALITY_VARIANTS
          : PRORES_VARIANTS;
      const allowedList = Array.from(allowedVariants) as number[];
      const candidate = variant ?? state.codecVariant;
      const nextVariant = allowedList.includes(candidate)
        ? candidate
        : allowedList[0];

      setState((prev) => ({
        ...prev,
        codec,
        codecVariant: nextVariant,
        codecBitrateMode: codec === 3 ? targetMode : 0,
      }));
      await sendCommand(CameraCommands.setCodec(codec, nextVariant));
    },
    setCodecVariant: async (variant: number) => {
      let nextMode = state.codecBitrateMode;
      let allowedVariants: readonly number[];
      if (state.codec === 3) {
        nextMode = BRAW_BITRATE_SET.has(variant) ? 1 : 0;
        allowedVariants =
          nextMode === 1 ? BRAW_BITRATE_VARIANTS : BRAW_QUALITY_VARIANTS;
      } else {
        allowedVariants = PRORES_VARIANTS;
        nextMode = 0;
      }
      const allowedList = Array.from(allowedVariants) as number[];
      const nextVariant = allowedList.includes(variant)
        ? variant
        : allowedList[0];
      setState((prev) => ({
        ...prev,
        codecVariant: nextVariant,
        codecBitrateMode: nextMode,
      }));
      await sendCommand(CameraCommands.setCodec(state.codec, nextVariant));
    },
    setCodecBitrateMode: async (mode: number) => {
      if (state.codec !== 3) {
        return;
      }
      const allowedVariants =
        mode === 1 ? BRAW_BITRATE_VARIANTS : BRAW_QUALITY_VARIANTS;
      const allowedList = Array.from(allowedVariants) as number[];
      const nextVariant = allowedList.includes(state.codecVariant)
        ? state.codecVariant
        : allowedList[0];
      setState((prev) => ({
        ...prev,
        codecBitrateMode: mode,
        codecVariant: nextVariant,
      }));
      await sendCommand(CameraCommands.setCodec(state.codec, nextVariant));
    },
    setISO: async (iso: number) => {
      setState((prev) => ({ ...prev, iso }));
      await sendCommand(CameraCommands.setISO(iso));
    },
    setWhiteBalance: async (kelvin: number) => {
      setState((prev) => ({ ...prev, whiteBalance: kelvin }));
      await sendCommand(CameraCommands.setWhiteBalance(kelvin, state.tint));
    },
    setTint: async (tint: number) => {
      setState((prev) => ({ ...prev, tint }));
      await sendCommand(
        CameraCommands.setWhiteBalance(state.whiteBalance, tint)
      );
    },
    setShutterAngle: async (angle: number) => {
      setState((prev) => ({
        ...prev,
        shutterAngle: angle,
        shutterMeasurement: "angle",
      }));
      await sendCommand(CameraCommands.setShutterAngle(angle));
    },
    setShutterSpeed: async (speed: number) => {
      setState((prev) => ({
        ...prev,
        shutterSpeed: speed,
        shutterMeasurement: "speed",
      }));
      await sendCommand(CameraCommands.setShutterSpeed(speed));
    },
    setGain: async (gain: number) => {
      setState((prev) => ({ ...prev, gain }));
      await sendCommand(CameraCommands.setGain(gain));
    },
    setIris: async (value: number) => {
      setState((prev) => ({ ...prev, iris: value }));
      await sendCommand(CameraCommands.setIris(value));
    },
    setFocus: async (value: number) => {
      setState((prev) => ({ ...prev, focus: value }));
      await sendCommand(CameraCommands.setFocus(value));
    },
    triggerAutoFocus: wrap(() => CameraCommands.triggerAutoFocus()),
    triggerAutoWhiteBalance: wrap(() =>
      CameraCommands.triggerAutoWhiteBalance()
    ),
    restoreAutoWhiteBalance: wrap(() =>
      CameraCommands.restoreAutoWhiteBalance()
    ),
    setMicLevel: async (value: number) => {
      const clamped = clamp01(value);
      setState((prev) => ({ ...prev, micLevel: clamped }));
      await sendCommand(CameraCommands.setMicLevel(clamped));
    },
    setHeadphoneLevel: async (value: number) => {
      const clamped = clamp01(value);
      setState((prev) => ({ ...prev, headphoneLevel: clamped }));
      await sendCommand(CameraCommands.setHeadphoneLevel(clamped));
    },
    setHeadphoneMix: async (value: number) => {
      const clamped = clamp01(value);
      setState((prev) => ({ ...prev, headphoneMix: clamped }));
      await sendCommand(CameraCommands.setHeadphoneProgramMix(clamped));
    },
    setSpeakerLevel: async (value: number) => {
      const clamped = clamp01(value);
      setState((prev) => ({ ...prev, speakerLevel: clamped }));
      await sendCommand(CameraCommands.setSpeakerLevel(clamped));
    },
    setAudioInputType: async (inputType: number) => {
      setState((prev) => ({ ...prev, audioInputType: inputType }));
      await sendCommand(CameraCommands.setAudioInputType(inputType));
    },
    setAudioInputLevel: async (channel: 0 | 1, value: number) => {
      const clamped = clamp01(value);
      const currentLevels: [number, number] = [...state.audioInputLevels] as [
        number,
        number
      ];
      currentLevels[channel] = clamped;
      setState((prev) => ({ ...prev, audioInputLevels: currentLevels }));
      await sendCommand(
        CameraCommands.setAudioInputLevels(currentLevels[0], currentLevels[1])
      );
    },
    setPhantomPower: async (enabled: boolean) => {
      setState((prev) => ({ ...prev, phantomPower: enabled }));
      await sendCommand(CameraCommands.setPhantomPower(enabled));
    },
    setDisplayBrightness: async (value: number) => {
      const clamped = clamp01(value);
      setState((prev) => ({ ...prev, displayBrightness: clamped }));
      await sendCommand(CameraCommands.setDisplayBrightness(clamped));
    },
    setZebraLevel: async (value: number) => {
      const clamped = clamp01(value);
      setState((prev) => ({ ...prev, zebraLevel: clamped }));
      await sendCommand(CameraCommands.setZebraLevel(clamped));
    },
    setPeakingLevel: async (value: number) => {
      const clamped = clamp01(value);
      setState((prev) => ({ ...prev, peakingLevel: clamped }));
      await sendCommand(CameraCommands.setPeakingLevel(clamped));
    },
    setFocusAssist: async (method: number, color: number) => {
      setState((prev) => ({
        ...prev,
        focusAssistMethod: method,
        focusAssistColor: color,
      }));
      await sendCommand(CameraCommands.setFocusAssist(method, color));
    },
    setProgramReturnTimeout: async (timeout: number) => {
      const clamped = Math.max(0, Math.min(30, Math.round(timeout)));
      setState((prev) => ({ ...prev, programReturnTimeout: clamped }));
      await sendCommand(CameraCommands.setProgramReturnFeed(clamped));
    },
    setColorBarsTimeout: async (timeout: number) => {
      const clamped = Math.max(0, Math.min(30, Math.round(timeout)));
      setState((prev) => ({ ...prev, colorBarsTimeout: clamped }));
      await sendCommand(CameraCommands.setColorBars(clamped));
    },
    setTallyBrightness: async (value: number) => {
      const clamped = clamp01(value);
      setState((prev) => ({ ...prev, tallyBrightness: clamped }));
      await sendCommand(CameraCommands.setTallyBrightness(clamped));
    },
    setFrontTallyBrightness: async (value: number) => {
      const clamped = clamp01(value);
      setState((prev) => ({ ...prev, frontTallyBrightness: clamped }));
      await sendCommand(CameraCommands.setFrontTallyBrightness(clamped));
    },
    setRearTallyBrightness: async (value: number) => {
      const clamped = clamp01(value);
      setState((prev) => ({ ...prev, rearTallyBrightness: clamped }));
      await sendCommand(CameraCommands.setRearTallyBrightness(clamped));
    },
    setVideoMode: async (
      frameRate: number,
      mRate: boolean,
      dimensionCode: number,
      interlaced: boolean,
      width?: number,
      height?: number
    ) => {
      const clampInt16 = (value: number) => {
        if (Number.isNaN(value)) return 0;
        return Math.max(0, Math.min(0x7fff, Math.round(value)));
      };
      const widthToSend = clampInt16(width ?? state.videoWidth ?? 0);
      const heightToSend = clampInt16(height ?? state.videoHeight ?? 0);
      const sensorFrameRate = 0; // disable off-speed when setting base FPS

      let flags = 0;
      if (mRate) {
        flags |= RecordingFormatFlags.FileMRate;
      }
      if (interlaced) {
        flags |= RecordingFormatFlags.Interlaced;
      }
      if (state.sensorWindowed) {
        flags |= RecordingFormatFlags.WindowedMode;
      }

      setState((prev) => ({
        ...prev,
        frameRate,
        offSpeedFrameRate: sensorFrameRate,
        videoWidth: widthToSend,
        videoHeight: heightToSend,
        recordingFormatFlags: flags,
        offSpeedEnabled: false,
        mRateEnabled: mRate,
        interlacedVideo: interlaced,
      }));
      console.log("[BLE] Sending video mode command", {
        frameRate,
        mRate,
        dimensionCode,
        interlaced,
      });
      await sendCommand(
        CameraCommands.setVideoMode(frameRate, mRate, dimensionCode, interlaced)
      );
      await sendCommand(
        CameraCommands.setRecordingFormat(
          frameRate,
          sensorFrameRate,
          widthToSend,
          heightToSend,
          flags
        )
      );
    },
    setSensorWindowed: async (enabled: boolean) => {
      let flags = state.recordingFormatFlags;
      if (enabled) {
        flags |= RecordingFormatFlags.WindowedMode;
      } else {
        flags &= ~RecordingFormatFlags.WindowedMode;
      }

      setState((prev) => ({
        ...prev,
        sensorWindowed: enabled,
        recordingFormatFlags: flags,
      }));

      await sendCommand(
        CameraCommands.setRecordingFormat(
          state.frameRate,
          state.offSpeedFrameRate,
          state.videoWidth,
          state.videoHeight,
          flags
        )
      );
    },
    setNDFilter: async (stop: number, displayModeIndex: number) => {
      setState((prev) => ({
        ...prev,
        ndStop: stop,
        ndDisplayModeIndex: displayModeIndex,
      }));
      await sendCommand(CameraCommands.setNDFilter(stop, displayModeIndex));
    },
    setRecording: async (active: boolean) => {
      setState((prev) => ({ ...prev, recording: active }));
      await sendCommand(CameraCommands.setRecording(active));
    },
  };

  useEffect(() => {
    return () => {
      const { incoming, status } = refs.current;
      incoming?.removeEventListener(
        "characteristicvaluechanged",
        handleIncoming
      );
      status?.removeEventListener("characteristicvaluechanged", handleStatus);
      disconnect();
    };
  }, [disconnect, handleIncoming, handleStatus]);

  return { state, deviceInfo, controls };
}

const decoder = new TextDecoder("utf-8");
