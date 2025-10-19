# SDI Camera Control Upgrade – Command Audit

This document captures a first-pass audit of the Blackmagic *SDI Camera Control Protocol* (per **BlackmagicCameraControl.pdf**, Oct‑2023) and how it compares with the current BLE-based controller implementation.

## 1. SDI Transport Requirements
- **Transport framing** – Commands are wrapped in SMPTE 291M ANC packets using DID/SDID `0x51/0x53`. Each packet may carry one or more Camera Control “messages”.
- **Message layout** (per *SDI Camera Control Protocol*, Section “Camera Control Message Format”):
  - `header[0]`: Destination (0x01‑0x3F for specific camera id, 0x7E broadcast, 0x7F reply); today we broadcast `0xFF`.
  - `header[1]`: Payload length (bytes following the 4‑byte header).
  - `header[2]`: Command ID (`0x00` CameraControl, `0x01` LensControl, etc. — current controllers only emit `0x00`).
  - `header[3]`: Reserved.
  - Payload is a sequence of command groups; each group is 4+N bytes aligned to 4‑byte boundary.
- **Command group**:
  - Byte 0: `category`
  - Byte 1: `parameter`
  - Byte 2: `data type` (per Table “Supported Data Types”: 0=bool, 1=int8, 2=int16, 3=int32, 4‑7 reserved, 0x80=fixed16, 0x81=fixed32, 0x82=float16 etc.)
  - Byte 3: `operation` (0=Assign, 1=Offset, matching existing BLE protocol)
  - Bytes 4…: value payload encoded per data type (little-endian)
  - Pad to 4‑byte boundary with zeros.
- **Encoding rules**:
  - Multi-command packets allowed, cameras execute sequentially.
  - No checksum beyond SMPTE CRC; still need local validation before send.
  - Reply packets (command-id bit 7 set) use same format.

## 2. Category / Parameter Coverage
The SDI spec defines the following categories (Table “Camera Control Categories”):

| Category (decimal) | Domain | Notes | BLE Support |
| --- | --- | --- | --- |
| 0 | Lens | focus, iris, zoom, autofocus | Partial (focus/iris only) |
| 1 | Video | white balance, tint, shutter, exposure, ISO/gain, ND, frame format | Partial (no dynamic range, LUT, color correction) |
| 2 | Audio | mic/speaker levels, phantom power | Not implemented |
| 3 | Reference | reference source + offsets | Not implemented |
| 4 | Configuration | language, time zone, location | Not implemented |
| 5 | Display | monitor overlays, LUT | Not implemented |
| 6 | Tally | brightness (front/rear) | Not implemented |
| 7 | Metadata | scene, take, lens data | Not implemented |
| 8 | Transport | slot selection, record/play | Partial (record toggle only) |
| 9 | Power | power on/off | Not exposed in web UI |
| 10 | Status | read-backs (ANC to UI) | BLE UI already parses subset |
| 11+ | Reserved | — | — |

Parameter matrices for each category (Tables 4–13 in spec) include:
- **Video**: dynamic range (0x07), sharpness (0x08), recording format (0x09), auto exposure (0x0A), shutter angle (0x0B), shutter speed (0x0C), gain (0x0D), ISO (0x0E), LUT (0x0F), ND filter (0x10).
- **Lens**: focus (0x00), auto focus (0x01), iris (0x03), zoom (0x04), aux data (0x05–0x07).
- **Audio**: input levels, headphone, speaker, phantom.
- **Metadata**: project name, scene, take, good take, camera ID, lens info, slate toggles.

## 3. BLE Implementation Audit
Current BLE controller (see `CameraCommands` in `src/lib/cameraControl.ts` and `useBleCamera.ts`):
- **Implemented**: ISO, white balance (+tint), shutter angle/speed, gain, iris, focus, ND filter, record toggle, off-speed frame rate (recent patch).
- **Not implemented**: dynamic range, LUT, sharpening, metadata strings, tally brightness, audio levels, transport slot selection, follow focus/zoom, location/timezone configuration, project metadata etc.
- **Message format**: already copies SDI format (category, parameter, data type, op) but omits padding enforcement and multi-command bundling; command-id always `0x00`.
- **State gaps**: no internal model for metadata, audio, tally, configuration; limited validation of value ranges; width/height mapping still approximated.

## 4. Work Items Identified
- Formalize a shared schema for category/parameter definitions (to avoid scattering magic numbers).
- Implement padding/alignment and multi-command packaging helper.
- Expand BLE command helpers for each SDI parameter (video dynamic range, LUT, metadata strings, etc.).
- Extend `CameraUiState` (and UI) to expose missing features with sensible UX.
- Add validation tables for enumerations (e.g., dynamic range values, LUT indices, tally brightness).
- Introduce unit tests that compare emitted packets to spec examples (i.e., replicate “Example Protocol Packets” section).

This audit completes step 1 of the SDI upgrade plan. Subsequent steps will build out the encoder, transport abstraction, UI controls, and documentation/tests.
