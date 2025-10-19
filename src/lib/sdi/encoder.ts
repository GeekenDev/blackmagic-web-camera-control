import { ALIGNMENT_BYTES, CAMERA_CONTROL_COMMAND_ID, SdiDataType, SdiOperation } from "./constants";
import { EncodedSdiCommand, SdiCommand, SdiMessageOptions, SdiValue } from "./types";

const HEADER_LENGTH = 4;
const COMMAND_HEADER_LENGTH = 4;

const DEFAULT_DESTINATION = 0xff;

const clampInt = (value: number, min: number, max: number) => {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    throw new RangeError(`Value ${value} is not finite.`);
  }
  if (value < min || value > max) {
    throw new RangeError(`Value ${value} outside of range [${min}, ${max}].`);
  }
  return value;
};

const toInt8 = (value: number) => {
  const clamped = clampInt(Math.round(value), -128, 127);
  return clamped & 0xff;
};

const toUint8 = (value: number) => {
  const clamped = clampInt(Math.round(value), 0, 0xff);
  return clamped & 0xff;
};

const encodeNumberLE = (value: number, byteLength: 1 | 2 | 4): Uint8Array => {
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);
  switch (byteLength) {
    case 1:
      view.setInt8(0, clampInt(Math.round(value), -128, 127));
      break;
    case 2:
      view.setInt16(0, clampInt(Math.round(value), -0x8000, 0x7fff), true);
      break;
    case 4:
      view.setInt32(0, clampInt(Math.round(value), -0x80000000, 0x7fffffff), true);
      break;
  }
  return new Uint8Array(buffer);
};

const encodeFixed16 = (value: number) => {
  const scaled = Math.round(value * 2048);
  return encodeNumberLE(scaled, 2);
};

const encodeFixed32 = (value: number) => {
  const scaled = Math.round(value * 65536);
  return encodeNumberLE(scaled, 4);
};

const alignLength = (value: number) => {
  const remainder = value % ALIGNMENT_BYTES;
  return remainder === 0 ? value : value + (ALIGNMENT_BYTES - remainder);
};

const ensureUint8Array = (value: Uint8Array | number[] | number): Uint8Array => {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (Array.isArray(value)) {
    const bytes = value.map((item) => clampInt(item, 0, 0xff));
    return Uint8Array.from(bytes);
  }
  return Uint8Array.from([toUint8(value)]);
};

const encodeValue = (dataType: SdiDataType, value: SdiValue): Uint8Array => {
  switch (dataType) {
    case SdiDataType.Boolean:
      if (typeof value !== "boolean" && typeof value !== "number") {
        throw new TypeError("Boolean values must be boolean or numeric.");
      }
      return Uint8Array.from([value ? 1 : 0]);
    case SdiDataType.Int8:
      if (typeof value === "boolean") {
        return Uint8Array.from([value ? 1 : 0]);
      }
      if (typeof value === "number") {
        return Uint8Array.from([toInt8(value)]);
      }
      if (value instanceof Uint8Array) {
        return value;
      }
      throw new TypeError("Unsupported value for Int8.");
    case SdiDataType.Int16:
      if (typeof value === "number") {
        return encodeNumberLE(value, 2);
      }
      if (Array.isArray(value)) {
        const buffer = new ArrayBuffer(value.length * 2);
        const view = new DataView(buffer);
        value.forEach((entry, index) => {
          view.setInt16(index * 2, clampInt(Math.round(entry), -0x8000, 0x7fff), true);
        });
        return new Uint8Array(buffer);
      }
      if (value instanceof Uint8Array) {
        if (value.length % 2 !== 0) {
          throw new RangeError("Int16 payload must be an even number of bytes.");
        }
        return value;
      }
      throw new TypeError("Unsupported value for Int16.");
    case SdiDataType.Int32:
      if (typeof value === "number") {
        return encodeNumberLE(value, 4);
      }
      if (value instanceof Uint8Array) {
        if (value.length % 4 !== 0) {
          throw new RangeError("Int32 payload must be aligned to 4 bytes.");
        }
        return value;
      }
      throw new TypeError("Unsupported value for Int32.");
    case SdiDataType.Fixed16:
      if (typeof value === "number") {
        return encodeFixed16(value);
      }
      if (value instanceof Uint8Array) {
        if (value.length % 2 !== 0) {
          throw new RangeError("Fixed16 payload must be an even number of bytes.");
        }
        return value;
      }
      throw new TypeError("Fixed16 requires a numeric value or pre-encoded bytes.");
    case SdiDataType.Fixed32:
      if (typeof value === "number") {
        return encodeFixed32(value);
      }
      if (value instanceof Uint8Array) {
        if (value.length % 4 !== 0) {
          throw new RangeError("Fixed32 payload must be aligned to 4 bytes.");
        }
        return value;
      }
      throw new TypeError("Fixed32 requires a numeric value or pre-encoded bytes.");
    case SdiDataType.Float16:
      throw new Error("Float16 encoding is not implemented.");
    case SdiDataType.Utf8String: {
      if (typeof value === "string") {
        const encoder = new TextEncoder();
        return encoder.encode(value);
      }
      if (value instanceof Uint8Array) {
        return value;
      }
      throw new TypeError("Utf8String must be a string or Uint8Array.");
    }
    default:
      return ensureUint8Array(value as number);
  }
};

export const encodeCommand = (command: SdiCommand): EncodedSdiCommand => {
  const operation = command.operation ?? SdiOperation.Assign;
  const valueBytes = encodeValue(command.dataType, command.value);
  const groupLength = COMMAND_HEADER_LENGTH + valueBytes.length;
  const paddedLength = alignLength(groupLength);
  const bytes = new Uint8Array(paddedLength);
  bytes[0] = command.category & 0xff;
  bytes[1] = command.parameter & 0xff;
  bytes[2] = command.dataType & 0xff;
  bytes[3] = operation & 0xff;
  bytes.set(valueBytes, COMMAND_HEADER_LENGTH);
  return { bytes, valueLength: valueBytes.length };
};

export const encodeMessage = (
  commands: SdiCommand[],
  options: SdiMessageOptions = {},
): Uint8Array => {
  if (commands.length === 0) {
    throw new Error("At least one command is required.");
  }
  const encoded = commands.map(encodeCommand);
  const payloadLength = encoded.reduce((total, item) => total + item.bytes.length, 0);
  const totalLength = HEADER_LENGTH + payloadLength;
  const buffer = new Uint8Array(totalLength);
  const destination = options.destination ?? DEFAULT_DESTINATION;
  const commandId = options.commandId ?? CAMERA_CONTROL_COMMAND_ID;
  const reserved = options.reserved ?? 0x00;

  buffer[0] = destination & 0xff;
  buffer[1] = payloadLength & 0xff;
  buffer[2] = commandId & 0xff;
  buffer[3] = reserved & 0xff;

  let offset = HEADER_LENGTH;
  encoded.forEach((item) => {
    buffer.set(item.bytes, offset);
    offset += item.bytes.length;
  });

  return buffer;
};
