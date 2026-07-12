# Agency OS — Desktop app (Tauri)

A thin native desktop window around the Agency OS web app. Agency OS is a
Next.js **server** app, so the desktop shell points at a running instance
(your deployed URL, or `localhost:3000` in dev) rather than bundling the UI.

Tauri (not Electron) keeps the binary tiny (~3–10 MB vs ~150 MB) and uses the
OS webview (WebView2, already on Windows 11) — in keeping with the project's
$0 / lean ethos. Packaging is a one-time local build; it adds no hosting cost.

## 1. Prerequisites

- **Rust** (stable) + Cargo — https://rustup.rs
- **Node.js** 18+ (for the Tauri CLI)
- **Tauri system deps** — https://tauri.app/start/prerequisites
  - Windows: "Microsoft C++ Build Tools" + WebView2 (preinstalled on Win 11)
  - macOS: Xcode Command Line Tools
  - Linux: `libwebkit2gtk-4.1`, `libgtk-3`, etc. (see the link)

## 2. Point it at your instance

Edit **`dist/index.html`** and set `APP_URL` to your deployed Agency OS URL:

```js
var APP_URL = 'https://your-agency-os.example.com';
```

(Leave it as `http://localhost:3000` to wrap a locally-running `pnpm start`.)

## 3. Install the CLI

```bash
cd desktop
npm install          # installs @tauri-apps/cli
```

## 4. (Optional) real app icon

The committed icons are plain placeholders. To use a real logo (any square
PNG, ≥512×512):

```bash
# replace src-tauri/icons/icon.png with your logo first, then:
npm run icon         # regenerates every platform icon incl. Windows .ico
```

## 5. Run / build

```bash
npm run dev          # launches the desktop window (hot-reloads dist/)
npm run build        # produces an installer
```

The installer lands in:

```
src-tauri/target/release/bundle/
  ├─ msi/     Agency OS_0.1.0_x64_en-US.msi        (Windows)
  ├─ nsis/    Agency OS_0.1.0_x64-setup.exe        (Windows)
  ├─ dmg/     Agency OS_0.1.0_aarch64.dmg          (macOS)
  └─ deb|appimage/  …                              (Linux)
```

## Notes

- **No secrets here.** The desktop shell only loads a URL — all auth happens in
  the web app exactly as in the browser.
- Because it wraps a remote URL, `app.security.csp` is `null` in
  `tauri.conf.json`. If you later add Rust ↔ JS IPC, tighten this and add a
  capabilities allowlist.
- To change the window title/size, edit `src-tauri/tauri.conf.json`.
