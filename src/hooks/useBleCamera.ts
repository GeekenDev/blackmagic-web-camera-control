import { useCallback, useEffect, useRef, useState } from "react";
import {
  BLE_UUIDS,
  CameraCommands,
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
  shutterAngles: [45, 60, 90, 120, 144, 172.8, 180],
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
};

interface BleRefs {
  device?: BluetoothDevice;
  server?: BluetoothRemoteGATTServer;
  outgoing?: BluetoothRemoteGATTCharacteristic;
  incoming?: BluetoothRemoteGATTCharacteristic;
  status?: BluetoothRemoteGATTCharacteristic;
}

export function useBleCamera() {
  const [state, setState] = useState<CameraUiState>(DEFAULT_STATE);
  const [deviceInfo, setDeviceInfo] = useState<BleDeviceInfo>({});
  const refs = useRef<BleRefs>({});
  const gattConnected = useRef(false);

  const reset = useCallback(() => {
    setState((prev) => ({
      ...DEFAULT_STATE,
      connection: "disconnected",
      statusMessage: prev.connection === "connected" ? "Disconnected." : prev.statusMessage,
      ready: false,
      loading: false,
    }));
    setDeviceInfo({});
    gattConnected.current = false;
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
    const buffer = target.value.buffer.slice(target.value.byteOffset, target.value.byteOffset + target.value.byteLength);
    const commands = decodeCommands(buffer);
    console.log("[BLE] Incoming configuration chunk", {
      byteLength: buffer.byteLength,
      commandCount: commands.length,
    });

    setState((prev) => {
      const next: CameraUiState = { ...prev };
      const connectedMessage = "Connected to camera.";
      const appliedParameters: string[] = [];
      commands.forEach((command) => {
        switch (`${command.category}-${command.parameter}`) {
          case "1-14": {
            const view = new DataView(command.payload.buffer, command.payload.byteOffset, command.payload.byteLength);
            next.iso = view.getInt32(0, true);
            appliedParameters.push("ISO");
            break;
          }
          case "1-2": {
            const view = new DataView(command.payload.buffer, command.payload.byteOffset, command.payload.byteLength);
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
      const shouldFinalizeReady = prev.ready && !prev.initialSyncComplete && nextInitialSync;
      if (shouldFinalizeReady) {
        next.statusMessage = connectedMessage;
        next.loading = false;
        console.log("[BLE] Initial camera configuration sync complete.");
      } else if (appliedParameters.length > 0) {
        console.log("[BLE] Applied configuration parameters", appliedParameters);
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
    console.log("[BLE] Status characteristic update", { statusByte, paired, ready, encrypted });
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
      } else if (prev.connection === "connected" || prev.statusMessage === waitingMessage) {
        statusMessage = waitingMessage;
      } else if (paired || gattConnected.current) {
        statusMessage = encrypted ? "Establishing encrypted session…" : "Connecting to camera…";
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
        console.log("[BLE] UI link state", {
          connection: nextConnection,
          statusMessage,
          loading: shouldShowLoading,
          ready: nextReady,
          initialSyncComplete: prev.initialSyncComplete,
          encrypted,
        });
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
      setState((prev) => ({ ...prev, statusMessage: "Web Bluetooth not supported in this browser." }));
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
        optionalServices: [BLE_UUIDS.cameraService, BLE_UUIDS.deviceInformationService],
      });
      console.log("[BLE] Device selected", { name: device.name, id: device.id });
      refs.current.device = device;

      device.addEventListener("gattserverdisconnected", disconnect);

      const server = await device.gatt?.connect();
      if (!server) throw new Error("Unable to connect to GATT server.");
      console.log("[BLE] Connected to GATT server.");
      refs.current.server = server;

      const service = await server.getPrimaryService(BLE_UUIDS.cameraService);
      const outgoing = await service.getCharacteristic(BLE_UUIDS.outgoingControl);
      const incoming = await service.getCharacteristic(BLE_UUIDS.incomingControl);
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
      handleStatus(new CustomEvent("camera-status", { detail: statusValue } as CustomEventInit<DataView>))

      // Device info
      try {
        const info = await server.getPrimaryService(BLE_UUIDS.deviceInformationService);
        const manufacturer = await info.getCharacteristic(BLE_UUIDS.manufacturer);
        const model = await info.getCharacteristic(BLE_UUIDS.model);
        const [manufacturerValue, modelValue] = await Promise.all([manufacturer.readValue(), model.readValue()]);
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
        statusMessage: error instanceof Error ? error.message : "Failed to connect.",
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
    await characteristic.writeValueWithResponse?.(payload);
  }, []);

  const wrap = useCallback(
    (fn: (state: CameraUiState) => Uint8Array | Promise<Uint8Array>) => async () => {
      try {
        const result = await fn(state);
        await sendCommand(result);
      } catch (error: unknown) {
        console.error(error);
        setState((prev) => ({
          ...prev,
          statusMessage: error instanceof Error ? error.message : "Unexpected error",
        }));
      }
    },
    [sendCommand, state],
  );

  const controls = {
    connect,
    disconnect,
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
      await sendCommand(CameraCommands.setWhiteBalance(state.whiteBalance, tint));
    },
    setShutterAngle: async (angle: number) => {
      setState((prev) => ({ ...prev, shutterAngle: angle, shutterMeasurement: "angle" }));
      await sendCommand(CameraCommands.setShutterAngle(angle));
    },
    setShutterSpeed: async (speed: number) => {
      setState((prev) => ({ ...prev, shutterSpeed: speed, shutterMeasurement: "speed" }));
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
    triggerAutoWhiteBalance: wrap(() => CameraCommands.triggerAutoWhiteBalance()),
    restoreAutoWhiteBalance: wrap(() => CameraCommands.restoreAutoWhiteBalance()),
    setVideoMode: async (frameRate: number, mRate: boolean, dimensionCode: number, interlaced: boolean) => {
      await sendCommand(CameraCommands.setVideoMode(frameRate, mRate, dimensionCode, interlaced));
    },
    setNDFilter: async (stop: number, displayModeIndex: number) => {
      setState((prev) => ({ ...prev, ndStop: stop, ndDisplayModeIndex: displayModeIndex }));
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
      incoming?.removeEventListener("characteristicvaluechanged", handleIncoming);
      status?.removeEventListener("characteristicvaluechanged", handleStatus);
      disconnect();
    };
  }, [disconnect, handleIncoming, handleStatus]);

  return { state, deviceInfo, controls };
}

const decoder = new TextDecoder("utf-8");
