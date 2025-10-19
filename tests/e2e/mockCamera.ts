export const mockCameraInitScript = `
(() => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return;
  }
  if (window.__mockCamera) {
    return;
  }

  const CAMERA_SERVICE_UUID = '291d567a-6d75-11e6-8b77-86f30ca893d3';
  const DEVICE_INFO_SERVICE_UUID = '0000180a-0000-1000-8000-00805f9b34fb';
  const OUTGOING_UUID = '5dd3465f-1aee-4299-8493-d2eca2f8e1bb';
  const INCOMING_UUID = 'b864e140-76a0-416a-bf30-5876504537d9';
  const STATUS_UUID = '7fe8691d-95dc-4fc5-8abd-ca74339b51b9';
  const MANUFACTURER_UUID = '00002a29-0000-1000-8000-00805f9b34fb';
  const MODEL_UUID = '00002a24-0000-1000-8000-00805f9b34fb';

  const ALIGNMENT_BYTES = 4;
  const RecordingFormatFlags = {
    FileMRate: 0x01,
    SensorMRate: 0x02,
    SensorOffSpeed: 0x04,
    Interlaced: 0x08,
    WindowedMode: 0x10,
  };
  const BRAW_BITRATE_VARIANTS = [2, 3, 4, 5];
  const BRAW_BITRATE_SET = new Set(BRAW_BITRATE_VARIANTS);

  const defaultState = {
    connection: 'connected',
    statusMessage: 'Connected to camera.',
    ready: true,
    loading: false,
    initialSyncComplete: true,
    iso: 400,
    isoOptions: [100, 200, 400, 800, 1600, 3200, 6400, 12800],
    whiteBalance: 5600,
    whiteBalanceRange: [2500, 10000],
    tint: 0,
    tintRange: [-50, 50],
    shutterMeasurement: 'angle',
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
    deviceInformation: {
      manufacturer: 'Blackmagic Design',
      model: 'Mock Cinema Camera',
    },
    videoModeDimensionCode: 3,
  };

  const KNOWN_PAYLOAD_LENGTHS = {
    '1-0': 5,
    '1-2': 4,
    '1-7': 1,
    '1-8': 1,
    '1-9': 10,
    '1-11': 4,
    '1-12': 4,
    '1-13': 1,
    '1-14': 4,
    '1-15': 2,
    '1-16': 4,
    '2-0': 2,
    '2-1': 2,
    '2-2': 2,
    '2-3': 2,
    '2-4': 1,
    '2-5': 4,
    '2-6': 1,
    '4-0': 2,
    '4-2': 2,
    '4-3': 2,
    '4-4': 1,
    '4-5': 2,
    '4-6': 1,
    '5-0': 2,
    '5-1': 2,
    '5-2': 2,
    '0-0': 2,
    '0-3': 2,
    '0-1': 1,
    '10-0': 2,
    '10-1': 5,
  };

  function getDataTypeSize(dataType) {
    switch (dataType) {
      case 0x00:
      case 0x01:
        return 1;
      case 0x02:
      case 0x80:
        return 2;
      case 0x03:
      case 0x81:
        return 4;
      default:
        return undefined;
    }
  }

  function alignOffset(offset) {
    const remainder = offset % ALIGNMENT_BYTES;
    return remainder === 0 ? offset : offset + (ALIGNMENT_BYTES - remainder);
  }

  function clamp01(value) {
    if (typeof value !== 'number' || !isFinite(value)) {
      return 0;
    }
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  function readFixed16(payload, offset) {
    const targetOffset = offset || 0;
    if (!payload || payload.length < targetOffset + 2) {
      return null;
    }
    const view = new DataView(payload.buffer, payload.byteOffset + targetOffset, 2);
    return view.getInt16(0, true) / 2048;
  }

  function decodeCommands(buffer) {
    const packet = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (packet.length < 4) {
      return [];
    }
    const payloadLength = packet[1];
    const end = 4 + payloadLength;
    if (packet.length < end) {
      return [];
    }
    let offset = 4;
    const commands = [];
    while (offset < end) {
      if (offset + 4 > end) {
        break;
      }
      const category = packet[offset];
      const parameter = packet[offset + 1];
      const dataType = packet[offset + 2];
      const operation = packet[offset + 3];
      offset += 4;
      const key = category + '-' + parameter;
      const explicitLength = KNOWN_PAYLOAD_LENGTHS[key];
      const typeSize = getDataTypeSize(dataType);
      let valueEnd;
      if (explicitLength != null) {
        valueEnd = offset + explicitLength;
      } else if (typeSize != null) {
        valueEnd = offset + typeSize;
      }
      if (valueEnd != null && valueEnd > end) {
        break;
      }
      if (valueEnd == null) {
        let candidate = alignOffset(offset + 1);
        if (candidate <= offset) {
          candidate = offset + ALIGNMENT_BYTES;
        }
        let found = false;
        while (candidate < end) {
          if (end - candidate >= 4) {
            valueEnd = candidate;
            found = true;
            break;
          }
          candidate += ALIGNMENT_BYTES;
        }
        if (!found) {
          valueEnd = end;
        }
      }
      const sliceEnd = valueEnd != null ? valueEnd : end;
      if (sliceEnd > end) {
        break;
      }
      const valueBytes = packet.slice(offset, sliceEnd);
      offset = alignOffset(sliceEnd);
      commands.push({
        category: category,
        parameter: parameter,
        dataType: dataType,
        operation: operation,
        payload: valueBytes,
      });
    }
    return commands;
  }

  class MockCharacteristic {
    constructor(camera, kind) {
      this.camera = camera;
      this.kind = kind;
      this.listeners = new Set();
      this.valueView = new DataView(new ArrayBuffer(0));
      this.notificationsStarted = false;
    }

    addEventListener(event, handler) {
      if (event === 'characteristicvaluechanged') {
        this.listeners.add(handler);
      }
    }

    removeEventListener(event, handler) {
      if (event === 'characteristicvaluechanged') {
        this.listeners.delete(handler);
      }
    }

    async startNotifications() {
      this.notificationsStarted = true;
      if (this.kind === 'status') {
        setTimeout(() => this.camera.emitStatus(), 0);
      } else if (this.kind === 'incoming') {
        setTimeout(() => this.camera.emitInitialConfig(), 0);
      }
      return this;
    }

    async stopNotifications() {
      this.notificationsStarted = false;
      return this;
    }

    async readValue() {
      if (this.kind === 'status' && this.valueView.byteLength === 0) {
        this.camera.emitStatus();
      }
      return this.valueView;
    }

    dispatchValue(data) {
      let view;
      if (data instanceof DataView) {
        view = data;
      } else if (data instanceof Uint8Array) {
        view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      } else if (data instanceof ArrayBuffer) {
        view = new DataView(data);
      } else {
        return;
      }
      this.valueView = view;
      const event = { target: { value: view } };
      this.listeners.forEach((listener) => listener(event));
    }

    async writeValueWithResponse(value) {
      if (this.kind !== 'outgoing') {
        return;
      }
      let bytes;
      if (value instanceof Uint8Array) {
        bytes = value.slice();
      } else if (value instanceof DataView) {
        bytes = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      } else if (value instanceof ArrayBuffer) {
        bytes = new Uint8Array(value.slice(0));
      } else {
        bytes = new Uint8Array();
      }
      this.camera.handleCommand(bytes);
    }
  }

  class MockValueCharacteristic {
    constructor(value) {
      const encoder = new TextEncoder();
      this.encoded = encoder.encode(value);
    }

    async readValue() {
      return new DataView(this.encoded.buffer.slice(0));
    }

    addEventListener() {}
    removeEventListener() {}
    async startNotifications() {
      return this;
    }
  }

  class MockService {
    constructor(camera, kind) {
      this.camera = camera;
      this.kind = kind;
    }

    async getCharacteristic(uuid) {
      return this.camera.getCharacteristic(uuid, this.kind);
    }
  }

  class MockGATTServer {
    constructor(camera) {
      this.camera = camera;
      this.connected = false;
    }

    async connect() {
      this.connected = true;
      return this;
    }

    disconnect() {
      this.connected = false;
      const event = new Event('gattserverdisconnected');
      this.camera.device.dispatchEvent(event);
    }

    async getPrimaryService(uuid) {
      if (uuid === CAMERA_SERVICE_UUID) {
        return new MockService(this.camera, 'camera');
      }
      if (uuid === DEVICE_INFO_SERVICE_UUID) {
        return new MockService(this.camera, 'info');
      }
      throw new Error('Unknown service UUID: ' + uuid);
    }
  }

  class MockBluetoothDevice extends EventTarget {
    constructor(camera) {
      super();
      this.name = 'Mock Camera';
      this.id = 'mock-camera';
      this.gatt = camera.server;
    }
  }

  class MockBluetooth {
    constructor(camera) {
      this.camera = camera;
    }

    async getDevices() {
      console.log("[MockCamera] getDevices");
      return [this.camera.device];
    }

    async requestDevice() {
      console.log("[MockCamera] requestDevice");
      return this.camera.device;
    }
  }

  class MockCamera {
    constructor() {
      this.state = JSON.parse(JSON.stringify(defaultState));
      this.commandCounts = {};
      this.outgoingCharacteristic = new MockCharacteristic(this, 'outgoing');
      this.incomingCharacteristic = new MockCharacteristic(this, 'incoming');
      this.statusCharacteristic = new MockCharacteristic(this, 'status');
      this.infoCharacteristics = {};
      this.infoCharacteristics[MANUFACTURER_UUID] = new MockValueCharacteristic(defaultState.deviceInformation.manufacturer);
      this.infoCharacteristics[MODEL_UUID] = new MockValueCharacteristic(defaultState.deviceInformation.model);
      this.server = new MockGATTServer(this);
      this.device = new MockBluetoothDevice(this);
      this.bluetooth = new MockBluetooth(this);
    }

    getCharacteristic(uuid, kind) {
      if (kind === 'camera') {
        if (uuid === OUTGOING_UUID) return this.outgoingCharacteristic;
        if (uuid === INCOMING_UUID) return this.incomingCharacteristic;
        if (uuid === STATUS_UUID) return this.statusCharacteristic;
      } else if (kind === 'info') {
        if (this.infoCharacteristics[uuid]) {
          return this.infoCharacteristics[uuid];
        }
      }
      throw new Error('Unknown characteristic UUID: ' + uuid);
    }

    handleCommand(bytes) {
      const copy = bytes.slice();
      const commands = decodeCommands(copy);
      for (const command of commands) {
        this.applyCommand(command);
      }
    }

    applyCommand(command) {
      const key = command.category + '-' + command.parameter;
      const payload = command.payload;
      switch (key) {
        case '1-14': {
          if (payload.length >= 4) {
            const view = new DataView(payload.buffer, payload.byteOffset, 4);
            this.state.iso = view.getInt32(0, true);
          }
          break;
        }
        case '1-2': {
          if (payload.length >= 2) {
            const view = new DataView(payload.buffer, payload.byteOffset, Math.max(payload.length, 4));
            this.state.whiteBalance = view.getInt16(0, true);
            if (payload.length >= 4) {
              this.state.tint = view.getInt16(2, true);
            }
            console.log("[MockCamera] apply WhiteBalance", this.state.whiteBalance, this.state.tint);
          }
          break;
        }
        case '1-7': {
          if (payload.length >= 1) {
            this.state.dynamicRangeMode = payload[0];
          }
          break;
        }
        case '1-8': {
          if (payload.length >= 1) {
            this.state.sharpeningLevel = payload[0];
          }
          break;
        }
        case '1-11': {
          if (payload.length >= 4) {
            const view = new DataView(payload.buffer, payload.byteOffset, 4);
            this.state.shutterAngle = view.getInt32(0, true) / 100;
            this.state.shutterMeasurement = 'angle';
          }
          break;
        }
        case '1-12': {
          if (payload.length >= 4) {
            const view = new DataView(payload.buffer, payload.byteOffset, 4);
            this.state.shutterSpeed = view.getInt32(0, true);
            this.state.shutterMeasurement = 'speed';
          }
          break;
        }
        case '1-13': {
          if (payload.length >= 1) {
            const view = new DataView(payload.buffer, payload.byteOffset, 1);
            this.state.gain = view.getInt8(0);
          }
          break;
        }
        case '1-15': {
          if (payload.length >= 2) {
            this.state.lutIndex = payload[0];
            this.state.lutEnabled = payload[1] !== 0;
          }
          break;
        }
        case '1-16': {
          const stop = readFixed16(payload, 0);
          const mode = readFixed16(payload, 2);
          if (stop != null) {
            this.state.ndStop = stop;
          }
          if (mode != null) {
            this.state.ndDisplayModeIndex = Math.round(mode);
          }
          break;
        }
        case '1-9': {
          if (payload.length >= 10) {
            const view = new DataView(payload.buffer, payload.byteOffset, 10);
            this.state.frameRate = view.getInt16(0, true);
            this.state.offSpeedFrameRate = view.getInt16(2, true);
            this.state.videoWidth = view.getInt16(4, true);
            this.state.videoHeight = view.getInt16(6, true);
            const flags = view.getInt16(8, true);
            this.state.recordingFormatFlags = flags;
            this.state.offSpeedEnabled = (flags & RecordingFormatFlags.SensorOffSpeed) !== 0;
            this.state.mRateEnabled = (flags & RecordingFormatFlags.FileMRate) !== 0;
            this.state.interlacedVideo = (flags & RecordingFormatFlags.Interlaced) !== 0;
            this.state.sensorWindowed = (flags & RecordingFormatFlags.WindowedMode) !== 0;
          }
          break;
        }
        case '1-0': {
          if (payload.length >= 4) {
            this.state.frameRate = payload[0];
            this.state.mRateEnabled = payload[1] === 1;
            this.state.videoModeDimensionCode = payload[2];
            this.state.interlacedVideo = payload[3] === 1;
          }
          break;
        }
        case '10-0': {
          if (payload.length >= 2) {
            const codec = payload[0];
            const variant = payload[1];
            this.state.codec = codec;
            this.state.codecVariant = variant;
            if (codec === 3) {
              this.state.codecBitrateMode = BRAW_BITRATE_SET.has(variant) ? 1 : 0;
            } else {
              this.state.codecBitrateMode = 0;
            }
          }
          break;
        }
        case '10-1': {
          if (payload.length >= 1) {
            this.state.recording = payload[0] === 2;
          }
          break;
        }
        case '2-0': {
          const value = readFixed16(payload, 0);
          if (value != null) {
            this.state.micLevel = clamp01(value);
            console.log("[MockCamera] apply MicLevel", this.state.micLevel);
          }
          break;
        }
        case '2-1': {
          const value = readFixed16(payload, 0);
          if (value != null) {
            this.state.headphoneLevel = clamp01(value);
            console.log("[MockCamera] apply HeadphoneLevel", this.state.headphoneLevel);
          }
          break;
        }
        case '2-2': {
          const value = readFixed16(payload, 0);
          if (value != null) {
            this.state.headphoneMix = clamp01(value);
            console.log("[MockCamera] apply HeadphoneMix", this.state.headphoneMix);
          }
          break;
        }
        case '2-3': {
          const value = readFixed16(payload, 0);
          if (value != null) {
            this.state.speakerLevel = clamp01(value);
            console.log("[MockCamera] apply SpeakerLevel", this.state.speakerLevel);
          }
          break;
        }
        case '2-4': {
          if (payload.length >= 1) {
            this.state.audioInputType = payload[0];
          }
          break;
        }
        case '2-5': {
          const ch0 = readFixed16(payload, 0);
          const ch1 = readFixed16(payload, 2);
          if (ch0 != null && ch1 != null) {
            this.state.audioInputLevels = [clamp01(ch0), clamp01(ch1)];
            console.log(
              "[MockCamera] apply AudioInputLevels",
              this.state.audioInputLevels[0],
              this.state.audioInputLevels[1]
            );
          }
          break;
        }
        case '2-6': {
          if (payload.length >= 1) {
            this.state.phantomPower = payload[0] !== 0;
          }
          break;
        }
        case '4-0': {
          const value = readFixed16(payload, 0);
          if (value != null) {
            this.state.displayBrightness = clamp01(value);
            console.log(
              "[MockCamera] apply DisplayBrightness",
              this.state.displayBrightness
            );
          }
          break;
        }
        case '4-2': {
          const value = readFixed16(payload, 0);
          if (value != null) {
            this.state.zebraLevel = clamp01(value);
            console.log("[MockCamera] apply ZebraLevel", this.state.zebraLevel);
          }
          break;
        }
        case '4-3': {
          const value = readFixed16(payload, 0);
          if (value != null) {
            this.state.peakingLevel = clamp01(value);
            console.log(
              "[MockCamera] apply PeakingLevel",
              this.state.peakingLevel
            );
          }
          break;
        }
        case '4-4': {
          if (payload.length >= 1) {
            this.state.colorBarsTimeout = payload[0];
          }
          break;
        }
        case '4-5': {
          if (payload.length >= 2) {
            this.state.focusAssistMethod = payload[0];
            this.state.focusAssistColor = payload[1];
          }
          break;
        }
        case '4-6': {
          if (payload.length >= 1) {
            this.state.programReturnTimeout = payload[0];
          }
          break;
        }
        case '5-0': {
          const value = readFixed16(payload, 0);
          if (value != null) {
            this.state.tallyBrightness = clamp01(value);
            console.log(
              "[MockCamera] apply TallyBrightness",
              this.state.tallyBrightness
            );
          }
          break;
        }
        case '5-1': {
          const value = readFixed16(payload, 0);
          if (value != null) {
            this.state.frontTallyBrightness = clamp01(value);
            console.log(
              "[MockCamera] apply FrontTallyBrightness",
              this.state.frontTallyBrightness
            );
          }
          break;
        }
        case '5-2': {
          const value = readFixed16(payload, 0);
          if (value != null) {
            this.state.rearTallyBrightness = clamp01(value);
            console.log(
              "[MockCamera] apply RearTallyBrightness",
              this.state.rearTallyBrightness
            );
          }
          break;
        }
        case '0-3': {
          const value = readFixed16(payload, 0);
          if (value != null) {
            this.state.iris = clamp01(value);
          }
          break;
        }
        case '0-0': {
          const value = readFixed16(payload, 0);
          if (value != null) {
            this.state.focus = clamp01(value);
          }
          break;
        }
        case '0-1': {
          this.incrementCommandCount('autoFocus');
          break;
        }
        case '1-3': {
          this.incrementCommandCount('autoWhiteBalance');
          break;
        }
        case '1-4': {
          this.incrementCommandCount('restoreWhiteBalance');
          break;
        }
        default:
          break;
      }
    }

    incrementCommandCount(key) {
      this.commandCounts[key] = (this.commandCounts[key] || 0) + 1;
    }

    emitStatus() {
      console.log("[MockCamera] emitStatus");
      const bytes = new Uint8Array([0x07]);
      this.statusCharacteristic.dispatchValue(bytes);
    }

    emitInitialConfig() {
      console.log("[MockCamera] emitInitialConfig");
      const bytes = new Uint8Array([
        0xff,
        16,
        0x00,
        0x00,
        0x01,
        0x09,
        0x02,
        0x00,
        0x18,
        0x00,
        0x18,
        0x00,
        0x80,
        0x07,
        0x38,
        0x04,
        0x00,
        0x00,
        0x00,
        0x00,
      ]);
      this.incomingCharacteristic.dispatchValue(bytes);
    }

    getState() {
      return JSON.parse(JSON.stringify(this.state));
    }

    getCommandCounts() {
      return Object.assign({}, this.commandCounts);
    }
  }

  const camera = new MockCamera();

  Object.defineProperty(navigator, 'bluetooth', {
    configurable: true,
    get() {
      return camera.bluetooth;
    },
  });

  window.__mockCamera = camera;
})();
`;

declare global {
  interface Window {
    __mockCamera?: {
      getState: () => Record<string, unknown>;
      getCommandCounts: () => Record<string, number>;
    };
  }
}
