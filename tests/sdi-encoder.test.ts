import { describe, expect, it } from "vitest";

import {
  CameraCommands,
  RecordingFormatFlags,
  decodeCommands,
} from "@/lib/cameraControl";

const toHex = (bytes: Uint8Array) => Array.from(bytes).map((value) => value.toString(16).padStart(2, "0"));

describe("CameraCommands SDI encoding", () => {
  it("encodes video mode packets", () => {
    const packet = CameraCommands.setVideoMode(24, false, 3, false);
    const expected = Uint8Array.from([
      0xff, 0x0c, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x00,
      0x18, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    expect(toHex(packet)).toEqual(toHex(expected));

    const decoded = decodeCommands(packet);
    expect(decoded).toHaveLength(1);
    const [command] = decoded;
    expect(command.category).toBe(1);
    expect(command.parameter).toBe(0);
    expect(Array.from(command.payload.slice(0, 5))).toEqual([24, 0, 3, 0, 0]);
  });

  it("encodes recording format packets", () => {
    const packet = CameraCommands.setRecordingFormat(24, 0, 1920, 1080, RecordingFormatFlags.FileMRate);
    const expected = Uint8Array.from([
      0xff, 0x10, 0x00, 0x00,
      0x01, 0x09, 0x02, 0x00,
      0x18, 0x00, 0x00, 0x00, 0x80, 0x07, 0x38, 0x04, 0x01, 0x00, 0x00, 0x00,
    ]);
    expect(toHex(packet)).toEqual(toHex(expected));

    const decoded = decodeCommands(packet);
    expect(decoded).toHaveLength(1);
    const [command] = decoded;
    expect(command.category).toBe(1);
    expect(command.parameter).toBe(9);
    expect(Array.from(command.payload)).toEqual([0x18, 0x00, 0x00, 0x00, 0x80, 0x07, 0x38, 0x04, 0x01, 0x00]);
  });
});
