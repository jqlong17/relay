import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function pickWorkspaceFolder() {
  if (process.platform !== "darwin") {
    throw new Error("Workspace picker is currently supported on macOS only");
  }

  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'POSIX path of (choose folder with prompt "Choose a workspace folder")',
    ]);

    const localPath = stdout.trim();
    return localPath.length > 0 ? localPath : null;
  } catch (error) {
    if (isUserCanceledPicker(error)) {
      return null;
    }

    throw error;
  }
}

function isUserCanceledPicker(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("User canceled") || error.message.includes("(-128)");
}

export { pickWorkspaceFolder };
