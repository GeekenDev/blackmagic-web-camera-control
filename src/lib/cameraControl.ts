import {
  CAMERA_CONTROL_COMMAND_ID,
  SdiCategory,
  SdiDataType,
  SdiOperation,
  encodeMessage,
  decodeMessage,
  type SdiCommand,
  type SdiMessageOptions,
} from "./sdi";

export interface DecodedCameraCommand {
  destination: number;
  category: number;
  parameter: number;
  dataType: SdiDataType;
  operation: SdiOperation;
  payload: Uint8Array;
}

export const RecordingFormatFlags = {
  FileMRate: 0x01,
  SensorMRate: 0x02,
  SensorOffSpeed: 0x04,
  Interlaced: 0x08,
  WindowedMode: 0x10,
} as const;

const singleCommand = (command: SdiCommand, options?: SdiMessageOptions): Uint8Array =>
  encodeMessage([command], { commandId: CAMERA_CONTROL_COMMAND_ID, ...options });

const fixed16WithDisplayMode = (stop: number, displayModeIndex: number) => {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setInt16(0, Math.round(stop * 2048), true);
  view.setInt16(2, displayModeIndex, true);
  return new Uint8Array(buffer);
};

const packInt16 = (values: number[]) => {
  const buffer = new ArrayBuffer(values.length * 2);
  const view = new DataView(buffer);
  values.forEach((value, index) => {
    view.setInt16(index * 2, value, true);
  });
  return new Uint8Array(buffer);
};

const toFixed16Bytes = (...values: number[]) =>
  packInt16(values.map((value) => Math.round(value * 2048)));

export const CameraCommands = {
  setDynamicRange: (mode: number) =>
    singleCommand({
      category: SdiCategory.Video,
      parameter: 7,
      dataType: SdiDataType.Int8,
      value: mode,
    }),
  setSharpening: (level: number) =>
    singleCommand({
      category: SdiCategory.Video,
      parameter: 8,
      dataType: SdiDataType.Int8,
      value: level,
    }),
  setDisplayLut: (index: number, enabled: boolean) =>
    singleCommand({
      category: SdiCategory.Video,
      parameter: 15,
      dataType: SdiDataType.Int8,
      value: Uint8Array.from([index & 0xff, enabled ? 1 : 0]),
    }),
  setCodec: (codec: number, variant: number) =>
    singleCommand({
      category: SdiCategory.Media,
      parameter: 0,
      dataType: SdiDataType.Int8,
      value: Uint8Array.from([codec & 0xff, variant & 0xff]),
    }),
  setISO: (iso: number) =>
    singleCommand({
      category: SdiCategory.Video,
      parameter: 14,
      dataType: SdiDataType.Int32,
      value: iso,
    }),
  setShutterAngle: (angle: number) =>
    singleCommand({
      category: SdiCategory.Video,
      parameter: 11,
      dataType: SdiDataType.Int32,
      value: Math.round(angle * 100),
    }),
  setShutterSpeed: (denominator: number) =>
    singleCommand({
      category: SdiCategory.Video,
      parameter: 12,
      dataType: SdiDataType.Int32,
      value: denominator,
    }),
  setGain: (decibels: number) =>
    singleCommand({
      category: SdiCategory.Video,
      parameter: 13,
      dataType: SdiDataType.Int8,
      value: decibels,
    }),
  setWhiteBalance: (kelvin: number, tint: number) =>
    singleCommand({
      category: SdiCategory.Video,
      parameter: 2,
      dataType: SdiDataType.Int16,
      value: packInt16([kelvin, tint]),
    }),
  triggerAutoWhiteBalance: () =>
    singleCommand({
      category: SdiCategory.Video,
      parameter: 3,
      dataType: SdiDataType.Boolean,
      value: true,
    }),
  restoreAutoWhiteBalance: () =>
    singleCommand({
      category: SdiCategory.Video,
      parameter: 4,
      dataType: SdiDataType.Boolean,
      value: true,
    }),
  setIris: (value: number) =>
    singleCommand({
      category: SdiCategory.Lens,
      parameter: 3,
      dataType: SdiDataType.Fixed16,
      value,
    }),
  setFocus: (value: number) =>
    singleCommand({
      category: SdiCategory.Lens,
      parameter: 0,
      dataType: SdiDataType.Fixed16,
      value,
    }),
  triggerAutoFocus: () =>
    singleCommand({
      category: SdiCategory.Lens,
      parameter: 1,
      dataType: SdiDataType.Boolean,
      value: true,
    }),
  setVideoMode: (frameRate: number, mRate: boolean, dimensionCode: number, interlaced: boolean) =>
    singleCommand({
      category: SdiCategory.Video,
      parameter: 0,
      dataType: SdiDataType.Int8,
      value: Uint8Array.from([
        frameRate & 0xff,
        mRate ? 1 : 0,
        dimensionCode & 0xff,
        interlaced ? 1 : 0,
        0x00,
      ]),
    }),
  setRecordingFormat: (frameRate: number, offSpeedFrameRate: number, width: number, height: number, flags: number) =>
    singleCommand({
      category: SdiCategory.Video,
      parameter: 9,
      dataType: SdiDataType.Int16,
      value: packInt16([frameRate, offSpeedFrameRate, width, height, flags]),
    }),
  setNDFilter: (stop: number, displayModeIndex: number) =>
    singleCommand({
      category: SdiCategory.Video,
      parameter: 16,
      dataType: SdiDataType.Fixed16,
      value: fixed16WithDisplayMode(stop, displayModeIndex),
    }),
  setMicLevel: (value: number) =>
    singleCommand({
      category: SdiCategory.Audio,
      parameter: 0,
      dataType: SdiDataType.Fixed16,
      value: toFixed16Bytes(value),
    }),
  setHeadphoneLevel: (value: number) =>
    singleCommand({
      category: SdiCategory.Audio,
      parameter: 1,
      dataType: SdiDataType.Fixed16,
      value: toFixed16Bytes(value),
    }),
  setHeadphoneProgramMix: (value: number) =>
    singleCommand({
      category: SdiCategory.Audio,
      parameter: 2,
      dataType: SdiDataType.Fixed16,
      value: toFixed16Bytes(value),
    }),
  setSpeakerLevel: (value: number) =>
    singleCommand({
      category: SdiCategory.Audio,
      parameter: 3,
      dataType: SdiDataType.Fixed16,
      value: toFixed16Bytes(value),
    }),
  setAudioInputType: (inputType: number) =>
    singleCommand({
      category: SdiCategory.Audio,
      parameter: 4,
      dataType: SdiDataType.Int8,
      value: inputType,
    }),
  setAudioInputLevels: (ch0: number, ch1: number) =>
    singleCommand({
      category: SdiCategory.Audio,
      parameter: 5,
      dataType: SdiDataType.Fixed16,
      value: toFixed16Bytes(ch0, ch1),
    }),
  setPhantomPower: (enabled: boolean) =>
    singleCommand({
      category: SdiCategory.Audio,
      parameter: 6,
      dataType: SdiDataType.Boolean,
      value: enabled,
    }),
  setDisplayBrightness: (value: number) =>
    singleCommand({
      category: SdiCategory.Display,
      parameter: 0,
      dataType: SdiDataType.Fixed16,
      value: toFixed16Bytes(value),
    }),
  setZebraLevel: (value: number) =>
    singleCommand({
      category: SdiCategory.Display,
      parameter: 2,
      dataType: SdiDataType.Fixed16,
      value: toFixed16Bytes(value),
    }),
  setPeakingLevel: (value: number) =>
    singleCommand({
      category: SdiCategory.Display,
      parameter: 3,
      dataType: SdiDataType.Fixed16,
      value: toFixed16Bytes(value),
    }),
  setColorBars: (timeoutSeconds: number) =>
    singleCommand({
      category: SdiCategory.Display,
      parameter: 4,
      dataType: SdiDataType.Int8,
      value: timeoutSeconds,
    }),
  setFocusAssist: (method: number, color: number) =>
    singleCommand({
      category: SdiCategory.Display,
      parameter: 5,
      dataType: SdiDataType.Int8,
      value: Uint8Array.from([method & 0xff, color & 0xff]),
    }),
  setProgramReturnFeed: (timeoutSeconds: number) =>
    singleCommand({
      category: SdiCategory.Display,
      parameter: 6,
      dataType: SdiDataType.Int8,
      value: timeoutSeconds,
    }),
  setRecording: (active: boolean) =>
    singleCommand({
      category: SdiCategory.Media,
      parameter: 1,
      dataType: SdiDataType.Int8,
      value: Uint8Array.from([active ? 2 : 0, 0, 0, 0, 0]),
    }),
  setTallyBrightness: (value: number) =>
    singleCommand({
      category: SdiCategory.Tally,
      parameter: 0,
      dataType: SdiDataType.Fixed16,
      value: toFixed16Bytes(value),
    }),
  setFrontTallyBrightness: (value: number) =>
    singleCommand({
      category: SdiCategory.Tally,
      parameter: 1,
      dataType: SdiDataType.Fixed16,
      value: toFixed16Bytes(value),
    }),
  setRearTallyBrightness: (value: number) =>
    singleCommand({
      category: SdiCategory.Tally,
      parameter: 2,
      dataType: SdiDataType.Fixed16,
      value: toFixed16Bytes(value),
    }),
};

export const decodeCommands = (buffer: ArrayBuffer): DecodedCameraCommand[] => {
  const packet = new Uint8Array(buffer);
  const message = decodeMessage(packet);
  return message.commands.map((command) => ({
    destination: message.destination,
    category: command.category,
    parameter: command.parameter,
    dataType: command.dataType,
    operation: command.operation,
    payload: command.valueBytes,
  }));
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
