import { ALIGNMENT_BYTES, SdiCategory, SdiDataType, SdiOperation } from "./constants";
import { DecodedSdiCommand, DecodedSdiMessage } from "./types";

const HEADER_LENGTH = 4;
const COMMAND_HEADER_LENGTH = 4;

const getDataTypeSize = (dataType: SdiDataType): number | undefined => {
  switch (dataType) {
    case SdiDataType.Boolean:
    case SdiDataType.Int8:
      return 1;
    case SdiDataType.Int16:
    case SdiDataType.Fixed16:
      return 2;
    case SdiDataType.Int32:
    case SdiDataType.Fixed32:
      return 4;
    case SdiDataType.Utf8String:
      return undefined;
    default:
      return undefined;
  }
};

const alignOffset = (offset: number) => {
  const remainder = offset % ALIGNMENT_BYTES;
  return remainder === 0 ? offset : offset + (ALIGNMENT_BYTES - remainder);
};

const KNOWN_PAYLOAD_LENGTHS = new Map<string, number>([
  [`${SdiCategory.Video}-0`, 5],
  [`${SdiCategory.Video}-2`, 4],
  [`${SdiCategory.Video}-9`, 10],
  [`${SdiCategory.Video}-11`, 4],
  [`${SdiCategory.Video}-12`, 4],
  [`${SdiCategory.Video}-13`, 1],
  [`${SdiCategory.Video}-14`, 4],
  [`${SdiCategory.Video}-16`, 4],
  [`${SdiCategory.Lens}-0`, 2],
  [`${SdiCategory.Lens}-3`, 2],
  [`${SdiCategory.Metadata}-5`, 2],
  [`${SdiCategory.Transport}-1`, 5],
  [`${SdiCategory.Media}-0`, 2],
  [`${SdiCategory.Media}-1`, 5],
  [`${SdiCategory.Media}-5`, 0],
  [`${SdiCategory.Media}-6`, 0],
  [`${SdiCategory.Media}-7`, 0],
]);

export const decodeMessage = (packet: Uint8Array): DecodedSdiMessage => {
  if (packet.length < HEADER_LENGTH) {
    throw new Error("Packet too short to contain SDI message header.");
  }
  const destination = packet[0];
  const payloadLength = packet[1];
  const commandId = packet[2];
  const reserved = packet[3]; // eslint-disable-line @typescript-eslint/no-unused-vars -- reserved for completeness
  const expectedLength = HEADER_LENGTH + payloadLength;
  if (packet.length < expectedLength) {
    throw new Error(`Packet length ${packet.length} shorter than declared payload ${expectedLength}.`);
  }

  let offset = HEADER_LENGTH;
  const end = HEADER_LENGTH + payloadLength;
  const commands: DecodedSdiCommand[] = [];

  while (offset < end) {
    if (offset + COMMAND_HEADER_LENGTH > end) {
      // Incomplete command header – drop the remainder of this message.
      break;
    }
    const category = packet[offset];
    const parameter = packet[offset + 1];
    const dataType = packet[offset + 2] as SdiDataType;
    const operation = packet[offset + 3] as SdiOperation;
    offset += COMMAND_HEADER_LENGTH;

    const key = `${category}-${parameter}`;
    const explicitLength = KNOWN_PAYLOAD_LENGTHS.get(key);
    const typeSize = getDataTypeSize(dataType);

    let valueEnd: number | undefined;
    if (explicitLength != null) {
      valueEnd = offset + explicitLength;
    } else if (typeSize != null) {
      valueEnd = offset + typeSize;
    }

    if (valueEnd != null && valueEnd > end) {
      break;
    } else if (valueEnd == null) {
      // Unknown length: find next aligned boundary that leaves enough bytes for another command.
      let candidate = alignOffset(offset + 1);
      if (candidate <= offset) {
        candidate = offset + ALIGNMENT_BYTES;
      }
      let found = false;
      while (candidate < end) {
        if (end - candidate >= COMMAND_HEADER_LENGTH) {
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

    const sliceEnd = valueEnd ?? end;
    if (sliceEnd > end) {
      break;
    }

    const valueBytes = packet.slice(offset, sliceEnd);
    offset = alignOffset(sliceEnd);

    commands.push({
      category,
      parameter,
      dataType,
      operation,
      valueBytes,
    });
  }

  return {
    destination,
    commandId,
    commands,
  };
};
