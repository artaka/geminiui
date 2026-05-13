import path from "node:path";
import { app, BrowserWindow, Menu } from "electron";
import { GeminiCliManager } from "./cli";
import { DiagnosticsManager } from "./diagnostics";
import { EnvironmentManager } from "./environment";
import { registerIpcHandlers } from "./ipc";
import { getRuntimeConfig } from "./runtime-config";
import { JsonStore } from "./storage";

let mainWindow: BrowserWindow | null = null;

function createMenu() {
  Menu.setApplicationMenu(null);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1200,
    minHeight: 780,
    backgroundColor: "#171717",
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const emitMaximizedChanged = () => {
    mainWindow?.webContents.send("window:maximizedChanged", mainWindow.isMaximized());
  };
  mainWindow.on("maximize", emitMaximizedChanged);
  mainWindow.on("unmaximize", emitMaximizedChanged);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
    mainWindow.webContents.openDevTools({mode:'detach'});

  const rendererUrl = process.env.VITE_DEV_SERVER_URL ?? (!app.isPackaged ? "http://localhost:5173" : undefined);
  if (rendererUrl) {
    await mainWindow.loadURL(rendererUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  const store = new JsonStore();
  const cli = new GeminiCliManager(() => mainWindow);
  cli.setCliPath(store.getSettings().cliPath);
  const diagnostics = new DiagnosticsManager();
  const runtimeConfig = getRuntimeConfig();
  const environment = new EnvironmentManager(runtimeConfig.dependencies);
  registerIpcHandlers({ store, cli, diagnostics, environment, runtimeConfig });
  createMenu();
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });

  app.on("before-quit", () => {
    cli.shutdown();
  });
}).catch((error) => {
  console.error("Failed to bootstrap Electron app:", error);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
