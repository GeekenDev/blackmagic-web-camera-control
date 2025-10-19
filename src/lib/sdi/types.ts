import { SdiDataType, SdiOperation } from "./constants";

export type NumericLike = number;

export type SdiValue =
  | boolean
  | NumericLike
  | NumericLike[]
  | Uint8Array;

export interface SdiCommand {
  category: number;
  parameter: number;
  dataType: SdiDataType;
  operation?: SdiOperation;
  /**
   * Value to encode. Accepts boolean/number/Uint8Array depending on data type.
   */
  value: SdiValue;
}

export interface SdiMessageOptions {
  /**
   * Camera destination address. 0x7E broadcast, 0x7F reply.
   */
  destination?: number;
  /**
   * Command identifier. Default 0x00 (Camera Control).
   */
  commandId?: number;
  /**
   * Reserved byte (third header byte). Defaults to 0.
   */
  reserved?: number;
}

export interface EncodedSdiCommand {
  readonly bytes: Uint8Array;
  readonly valueLength: number;
}

export interface DecodedSdiCommand {
  category: number;
  parameter: number;
  dataType: SdiDataType;
  operation: SdiOperation;
  valueBytes: Uint8Array;
}

export interface DecodedSdiMessage {
  destination: number;
  commandId: number;
  commands: DecodedSdiCommand[];
}
