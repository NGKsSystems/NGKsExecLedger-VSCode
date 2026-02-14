// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\core\autosave.ts
import * as os from "os";
import * as path from "path";
import { copyFileSyncSafe } from "../util/fs";
import { safeFileTimestamp } from "../util/time";

export type AutosaveResult = { autosaved: boolean; autosavePath?: string };

export function autosaveartifactsCopy(params: {
  logFilePath: string;
  appName: string;
  sessionId: string;
  reason: "normal_exit" | "error_exit" | "manual_stop";
}): AutosaveResult {
  try {
    const downloads = path.join(os.homedir(), "Downloads");
    const root = path.join(downloads, "NGKsLogs", params.appName);

    const ts = safeFileTimestamp();
    const fileName = `${ts}_${params.reason}_${params.sessionId}.jsonl`;
    const dest = path.join(root, fileName);

    copyFileSyncSafe(params.logFilePath, dest);
    return { autosaved: true, autosavePath: dest };
  } catch {
    return { autosaved: false };
  }
}
