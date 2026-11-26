# Serve POS Desktop

The point of sale at the counter for [Serve POS](https://github.com/badeeltechnology/servepos), the open-source restaurant POS for ERPNext. It runs on Windows, macOS and Linux, keeps its own copy of the menu, and saves every sale on the computer first, so it keeps selling when the internet drops. Sales post to ERPNext as standard Sales Invoices.

- Floor plan, dine in, takeaway and delivery, modifiers, split bills, discounts, promos and vouchers
- English and Arabic, right to left, with Arabic on any ESC/POS thermal printer
- Kitchen tickets routed to each kitchen's printer, a kitchen screen, shifts with a cash count
- Updates itself from GitHub releases

## Download

| Computer | Download |
|---|---|
| **Windows** 10 or 11 | [**Download for Windows**](https://github.com/badeeltechnology/servepos-releases/releases/download/v2.19.3/servepos-desktop-2.19.3-setup.exe) (64-bit and 32-bit in one installer) |
| **macOS** (Apple silicon) | [**Download for Mac**](https://github.com/badeeltechnology/servepos-releases/releases/download/v2.19.3/ServePOS-2.19.3-arm64-mac.zip) |
| **Waiter app** for Android | [**Download the APK**](https://github.com/badeeltechnology/waiterapp/releases/latest/download/ServePOS-Waiter.apk) |

Every version is on the [releases page](https://github.com/badeeltechnology/servepos-releases/releases). Once installed, the POS updates itself.

## Use it

Install the latest version from the [releases page](https://github.com/badeeltechnology/servepos-releases/releases/latest), then follow the [Serve POS guide](https://github.com/badeeltechnology/servepos/blob/docs/user-guide/docs/guide/index.md): it needs the Serve POS app on your ERPNext site and a POS Profile for the outlet.

## Develop

```bash
npm install
npm run dev          # Electron with hot reload
npm run build        # production build
npm run typecheck    # type checks
npm run test:database # database tests
npm run package:win  # Windows installer (package:win32 for 32-bit, package:mac)
```

Work on the screens in a plain browser, with sample data and no server:

```bash
npx vite --config vite.renderer.dev.config.ts --port 5199
```

Options such as `?setup=1` or `?currency=OMR` are listed at the top of `src/renderer/src/dev/mockApi.ts`.

Built with Electron, React, TypeScript and SQLite (better-sqlite3).

## Licence

GNU Affero General Public License v3.0. See [LICENSE](LICENSE).

Made by [Badeel Technology](https://badeeltechnology.com), Doha.
