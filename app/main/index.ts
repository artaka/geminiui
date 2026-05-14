import path from "node:path";
import { pathToFileURL } from "node:url";
import { net } from "electron";
import { app, BrowserWindow, Menu, protocol } from "electron";
import { GeminiCliManager } from "./cli";
import { DiagnosticsManager } from "./diagnostics";
import { EnvironmentManager } from "./environment";
import { registerIpcHandlers } from "./ipc";
import { getRuntimeConfig } from "./runtime-config";
import { JsonStore } from "./storage";

protocol.registerSchemesAsPrivileged([
  { scheme: "gemini-file", privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, stream: true } }
]);

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
  protocol.handle("gemini-file", (request) => {
    const url = request.url;
    // Remove protocol and any number of leading slashes
    // gemini-file://d/path -> d/path
    // gemini-file:///D:/path -> D:/path
    let pathPart = decodeURIComponent(url.replace(/^gemini-file:\/+/i, ""));
    
    // Fix Windows drive letter: "d/path" -> "D:/path"
    if (process.platform === "win32" && /^[a-zA-Z](\/|$)/.test(pathPart)) {
      pathPart = pathPart[0].toUpperCase() + ":" + pathPart.slice(1);
    }
    
    // Final normalization to file:/// URL
    // pathToFileURL is the most robust way to do this
    const targetUrl = pathToFileURL(path.resolve(pathPart)).toString();
    
    console.log(`[gemini-file] Request: ${url} -> Path: ${pathPart} -> Fetching: ${targetUrl}`);
    
    return net.fetch(targetUrl).catch(err => {
      console.error(`[gemini-file] Failed to fetch ${targetUrl}:`, err);
      throw err;
    });
  });

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
