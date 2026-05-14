import { BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { UpdateState } from "../shared/types";

export class UpdateManager {
  private windowGetter: () => BrowserWindow | null;
  private state: UpdateState = { status: "idle" };

  constructor(windowGetter: () => BrowserWindow | null) {
    this.windowGetter = windowGetter;
    
    // Crucial for unsigned updates on Windows
    // Returning null skips the signature check
    if (process.platform === "win32") {
      (autoUpdater as any).verifyUpdateCodeSignature = async () => null;
    }
    autoUpdater.autoDownload = true;
    autoUpdater.logger = console;
    
    autoUpdater.on("checking-for-update", () => {
      this.updateState({ status: "checking" });
    });

    autoUpdater.on("update-available", (info) => {
      this.updateState({ status: "available", version: info.version });
    });

    autoUpdater.on("update-not-available", () => {
      this.updateState({ status: "not-available" });
    });

    autoUpdater.on("error", (err) => {
      this.updateState({ status: "error", error: err.message });
    });

    autoUpdater.on("download-progress", (progress) => {
      this.updateState({ status: "downloading", progress });
    });

    autoUpdater.on("update-downloaded", (info) => {
      this.updateState({ status: "downloaded", version: info.version });
    });
  }

  private updateState(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch };
    const win = this.windowGetter();
    if (win) {
      win.webContents.send("updater:state-changed", this.state);
    }
  }

  async checkForUpdates() {
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      this.updateState({ status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  quitAndInstall() {
    autoUpdater.quitAndInstall();
  }

  getState(): UpdateState {
    return this.state;
  }
}
