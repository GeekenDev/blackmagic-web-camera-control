export const SDI_DID = 0x51;
export const SDI_SDID = 0x53;

export const CAMERA_CONTROL_COMMAND_ID = 0x00;

export enum SdiCategory {
  Lens = 0,
  Video = 1,
  Audio = 2,
  Reference = 3,
  Configuration = 4,
  Display = 5,
  Tally = 6,
  Metadata = 7,
  Transport = 8,
  Power = 9,
  Media = 10,
  Status = 11,
}

export enum SdiDataType {
  Boolean = 0x00,
  Int8 = 0x01,
  Int16 = 0x02,
  Int32 = 0x03,
  /**
   * Fixed point value where 1.0 == 2048.
   */
  Fixed16 = 0x80,
  /**
   * Fixed point value where 1.0 == 65536.
   */
  Fixed32 = 0x81,
  /**
   * IEEE 754 half-float. Support is uncommon but included for completeness.
   */
  Float16 = 0x82,
  /**
   * UTF-8 string (length is implicit, padded to 4-byte boundary).
   */
  Utf8String = 0x90,
}

export enum SdiOperation {
  Assign = 0x00,
  Offset = 0x01,
}

export const ALIGNMENT_BYTES = 4;
