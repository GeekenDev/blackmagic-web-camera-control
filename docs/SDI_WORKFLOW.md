# SDI Command Workflow Guide

This guide explains how the web controller now mirrors the **Blackmagic SDI Camera Control Protocol** and how to extend it safely.

## 1. Reading the Specification

- Use the official PDF: `https://documents.blackmagicdesign.com/DeveloperManuals/BlackmagicCameraControl.pdf`.
- Tables in the PDF define each command group (category, parameter, data type and interpretation). Use a structured reader such as `pdfplumber` when you need to extract these tables programmatically.
- Pay attention to alignment and data types:
  - `int8/int16/int32` are little endian.
  - `fixed16` = value × 2048.
  - Command groups are padded to 4 bytes.
  - Messages are packed in SMPTE 291 ANC packets (DID 0x51 / SDID 0x53).

## 2. Encoding Commands

- New SDI utilities live in `src/lib/sdi/`:
  - `constants.ts` – enums for categories, data types, operations.
  - `encoder.ts` – builds command groups, enforces padding.
  - `decoder.ts` – parses incoming packets back into discrete commands.
  - `transport.ts` – basic transport abstraction (BLE chunking helper).
- `CameraCommands` wraps common commands (video mode, recording format, audio, tally, etc.) and returns SDI-compliant packets.
- When adding a new helper:
  1. Locate the category/parameter definition in the PDF.
  2. Add an entry in `CameraCommands` using the proper data type.
  3. Update `useBleCamera` to expose a control method, mutate UI state and send the packet.
  4. If the command reports back, extend the decoder switch in `useBleCamera` to interpret the payload.

## 3. Updating UI & State

- The hook `useBleCamera` keeps the canonical UI state. Add new fields to `CameraUiState` and the default object as needed.
- Expose user-facing controls in `src/app/page.tsx` via `ControlCard` components. Prefer descriptive labels, clamp slider values to spec ranges, and wire controls to the hook.

## 4. Testing Packets

- Unit tests live in `tests/`. Use Vitest (`npm run test`).
- Add assertions that compare emitted packets against spec examples (see `tests/sdi-encoder.test.ts`).
- When adding new helpers ensure both encoding and decoding of the command are covered.

## 5. Developer Checklist

1. Read the relevant spec table (category + parameter).
2. Extend `CameraCommands` and `useBleCamera` (state, decoder, control method).
3. Update the UI with new controls.
4. Add or update tests verifying the packet payload.
5. Document the change (update this file if the workflow shifts).

Following this workflow keeps the BLE controller aligned with Blackmagic’s SDI control surface and makes future protocol expansion predictable.
