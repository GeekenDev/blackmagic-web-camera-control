import { encodeMessage } from "./encoder";
import { SdiCommand, SdiMessageOptions } from "./types";

export interface SdiTransport {
  send(commands: SdiCommand[], options?: SdiMessageOptions): Promise<void>;
}

export type PacketSender = (packet: Uint8Array) => Promise<void>;

export class BleSdiTransport implements SdiTransport {
  private readonly mtu: number;

  constructor(private readonly sender: PacketSender, mtu = 20) {
    this.mtu = mtu;
  }

  async send(commands: SdiCommand[], options?: SdiMessageOptions): Promise<void> {
    const packet = encodeMessage(commands, options);
    if (packet.length <= this.mtu) {
      await this.sender(packet);
      return;
    }

    for (let offset = 0; offset < packet.length; offset += this.mtu) {
      const chunk = packet.subarray(offset, Math.min(offset + this.mtu, packet.length));
      await this.sender(chunk);
    }
  }
}
