const { app, dialog, shell } = require("electron");

const WEB_URL = process.env.RELAY_DESKTOP_URL || "http://127.0.0.1:3000";

async function launchBrowserAndExit() {
  try {
    await shell.openExternal(WEB_URL);
    app.quit();
  } catch {
    dialog.showErrorBox(
      "Relay Service Unavailable",
      `Unable to open ${WEB_URL}.\n\nPlease start Relay services first (for example: pnpm dev:up).`,
    );
    app.exit(1);
  }
}

app.whenReady().then(launchBrowserAndExit).catch(() => {
  app.exit(1);
});
