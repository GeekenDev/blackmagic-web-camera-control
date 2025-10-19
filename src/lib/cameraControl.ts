export enum CameraDataType {
  Boolean = 0,
  Int8 = 1,
  Int16 = 2,
  Int32 = 3,
  Fixed16 = 128,
}

export enum CameraOperation {
  Assign = 0,
  Offset = 1,
}

export interface CameraControlCommand {
  destination?: number;
  category: number;
  parameter: number;
  dataType: CameraDataType;
  operation?: CameraOperation;
  payload?: Uint8Array;
}

export interface DecodedCameraCommand {
  destination: number;
  category: number;
  parameter: number;
  dataType: CameraDataType;
  operation: CameraOperation;
  payload: Uint8Array;
}

const PADDING = 4;

export function encodeCommand(command: CameraControlCommand): Uint8Array {
  const destination = command.destination ?? 0xff;
  const payload = command.payload ?? new Uint8Array(0);

  const commandBytes = new Uint8Array(4 + payload.length);
  commandBytes[0] = command.category & 0xff;
  commandBytes[1] = command.parameter & 0xff;
  commandBytes[2] = command.dataType & 0xff;
  commandBytes[3] = (command.operation ?? CameraOperation.Assign) & 0xff;
  commandBytes.set(payload, 4);

  let totalLength = 4 + commandBytes.length;
  if (totalLength % PADDING !== 0) {
    totalLength += PADDING - (totalLength % PADDING);
  }

  const packet = new Uint8Array(totalLength);
  packet[0] = destination & 0xff;
  packet[1] = commandBytes.length & 0xff;
  packet[2] = 0; // command id 0
  packet[3] = 0; // reserved
  packet.set(commandBytes, 4);

  return packet;
}

export function decodeCommands(buffer: ArrayBuffer): DecodedCameraCommand[] {
  const bytes = new Uint8Array(buffer);
  const commands: DecodedCameraCommand[] = [];
  let index = 0;

  while (index + 4 <= bytes.length) {
    const destination = bytes[index];
    const length = bytes[index + 1];
    const commandId = bytes[index + 2];
    index += 4;

    if (length < 4 || index + length > bytes.length) {
      break;
    }

    if (commandId !== 0) {
      index = align(index + length, PADDING);
      continue;
    }

    const segment = bytes.slice(index, index + length);
    index += length;
    index = align(index, PADDING);

    commands.push({
      destination,
      category: segment[0],
      parameter: segment[1],
      dataType: segment[2] as CameraDataType,
      operation: segment[3] as CameraOperation,
      payload: segment.slice(4),
    });
  }

  return commands;
}

function align(value: number, multiple: number): number {
  const remainder = value % multiple;
  return remainder === 0 ? value : value + multiple - remainder;
}

/* Convenience builders mirroring the Swift helpers */

function int32Payload(value: number): Uint8Array {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setInt32(0, value, true);
  return new Uint8Array(buffer);
}

function int16Payload(value: number): Uint8Array {
  const buffer = new ArrayBuffer(2);
  new DataView(buffer).setInt16(0, value, true);
  return new Uint8Array(buffer);
}

function fixed16Payload(value: number): Uint8Array {
  const scaled = Math.round(value * 2048);
  return int16Payload(scaled);
}

export const CameraCommands = {
  setISO: (iso: number) =>
    encodeCommand({
      category: 1,
      parameter: 14,
      dataType: CameraDataType.Int32,
      payload: int32Payload(iso),
    }),
  setShutterAngle: (angle: number) =>
    encodeCommand({
      category: 1,
      parameter: 11,
      dataType: CameraDataType.Int32,
      payload: int32Payload(Math.round(angle * 100)),
    }),
  setShutterSpeed: (denominator: number) =>
    encodeCommand({
      category: 1,
      parameter: 12,
      dataType: CameraDataType.Int32,
      payload: int32Payload(denominator),
    }),
  setGain: (decibels: number) =>
    encodeCommand({
      category: 1,
      parameter: 13,
      dataType: CameraDataType.Int8,
      payload: new Uint8Array([decibels & 0xff]),
    }),
  setWhiteBalance: (kelvin: number, tint: number) => {
    const payload = new Uint8Array(4);
    payload.set(int16Payload(kelvin));
    payload.set(int16Payload(tint), 2);
    return encodeCommand({
      category: 1,
      parameter: 2,
      dataType: CameraDataType.Int16,
      payload,
    });
  },
  triggerAutoWhiteBalance: () =>
    encodeCommand({
      category: 1,
      parameter: 3,
      dataType: CameraDataType.Boolean,
      payload: new Uint8Array([1]),
    }),
  restoreAutoWhiteBalance: () =>
    encodeCommand({
      category: 1,
      parameter: 4,
      dataType: CameraDataType.Boolean,
      payload: new Uint8Array([1]),
    }),
  setIris: (value: number) =>
    encodeCommand({
      category: 0,
      parameter: 3,
      dataType: CameraDataType.Fixed16,
      payload: fixed16Payload(value),
    }),
  setFocus: (value: number) =>
    encodeCommand({
      category: 0,
      parameter: 0,
      dataType: CameraDataType.Fixed16,
      payload: fixed16Payload(value),
    }),
  triggerAutoFocus: () =>
    encodeCommand({
      category: 0,
      parameter: 1,
      dataType: CameraDataType.Boolean,
      payload: new Uint8Array([1]),
    }),
  setVideoMode: (frameRate: number, mRate: boolean, dimensionCode: number, interlaced: boolean) => {
    const payload = new Uint8Array([frameRate & 0xff, mRate ? 1 : 0, dimensionCode & 0xff, interlaced ? 1 : 0, 0]);
    return encodeCommand({
      category: 1,
      parameter: 0,
      dataType: CameraDataType.Int8,
      payload,
    });
  },
  setNDFilter: (stop: number, displayModeIndex: number) => {
    const buffer = new Uint8Array(4);
    buffer.set(fixed16Payload(stop));
    buffer.set(int16Payload(displayModeIndex), 2);
    return encodeCommand({
      category: 1,
      parameter: 16,
      dataType: CameraDataType.Fixed16,
      payload: buffer,
    });
  },
  setRecording: (active: boolean) =>
    encodeCommand({
      category: 10,
      parameter: 1,
      dataType: CameraDataType.Int8,
      payload: new Uint8Array([active ? 2 : 0, 0, 0, 0, 0]),
    }),
};

export const BLE_UUIDS = {
  cameraService: "291d567a-6d75-11e6-8b77-86f30ca893d3",
  deviceInformationService: "0000180a-0000-1000-8000-00805f9b34fb",
  outgoingControl: "5dd3465f-1aee-4299-8493-d2eca2f8e1bb",
  incomingControl: "b864e140-76a0-416a-bf30-5876504537d9",
  cameraStatus: "7fe8691d-95dc-4fc5-8abd-ca74339b51b9",
  manufacturer: "00002a29-0000-1000-8000-00805f9b34fb",
  model: "00002a24-0000-1000-8000-00805f9b34fb",
};
