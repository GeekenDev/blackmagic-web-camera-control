## Blackmagic Camera Control (Web)

This application enables live camera control straight from a Web Bluetooth–capable browser (Chrome, Edge, or other Chromium builds).

> **Note:** Web Bluetooth only works in secure contexts (`https://` or `http://localhost`) and requires explicit user permission for each connection.

## Getting Started

```bash
npm install    # already executed by scaffolding, repeat if needed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a Chromium browser. When prompted, select the camera that advertises the Blackmagic Camera Service (`291D567A-6D75-11E6-8B77-86F30CA893D3`).

## Features

- **Pair & Connect:** Requests a BLE device, subscribes to `Incoming Camera Control` and `Camera Status`, and writes commands via `Outgoing Camera Control`.
- **Transport & ISO:** Toggle record/stop, adjust ISO and gain presets.
- **Imaging Controls:** White balance (with presets, auto/restore), tint, shutter angle/speed, iris, focus (with auto focus trigger), ND filter stop and display mode, video mode CCU command.
- **State Sync:** Incoming CCU packets update the UI so local state follows changes made on the camera body.

## Browser Support

- Chromium-based browsers on macOS, Windows, and Android.
- Web Bluetooth is not available in Safari or Firefox at the time of writing.

## Extending

- BLE helpers live in `src/lib/cameraControl.ts`. Add new CCU commands here to keep encoding/decoding consistent with the Swift implementation.
- `src/hooks/useBleCamera.ts` centralises connection logic and UI state. Extend this hook for additional controls (e.g. audio, monitoring, slate once exposed over BLE).
- The UI is defined in `src/app/page.tsx` using client components; augment this page or break the controls into smaller components as the surface grows.
