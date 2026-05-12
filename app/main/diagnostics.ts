import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { AuthState, DiagnosticsSnapshot, Workspace } from "../shared/types";

export class DiagnosticsManager {
  getSnapshot(cliStatus: DiagnosticsSnapshot["cliStatus"], cliPath: string, authState: AuthState, activeWorkspace?: Workspace): DiagnosticsSnapshot {
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      cliStatus,
      cliPath,
      authState,
      activeWorkspacePath: activeWorkspace?.path
    };
  }

  exportLogs(snapshot: DiagnosticsSnapshot): string {
    const logDir = app.getPath("userData");
    const filePath = path.join(logDir, `diagnostics-${Date.now()}.log`);
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf8");
    return filePath;
  }
}
