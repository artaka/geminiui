import { describe, it, expect, vi, beforeEach } from "vitest";
import { JsonStore } from "./storage";
import fs from "node:fs";
import { app } from "electron";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/tmp/geminiapp-test"),
    getAppPath: vi.fn().mockReturnValue("/app"),
    isPackaged: false
  }
}));

vi.mock("./runtime-config", () => ({
  getRuntimeConfig: vi.fn().mockReturnValue({
    cli: { defaultExecutable: "gemini" },
    models: [{ id: "auto", label: "Auto" }],
    dependencies: []
  })
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    promises: {
      writeFile: vi.fn(),
      rename: vi.fn()
    }
  }
}));

describe("JsonStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with default settings if no file exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const store = new JsonStore();
    const settings = store.getSettings();

    expect(settings.theme).toBe("dark-codex");
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it("should save and list workspaces", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const store = new JsonStore();
    
    const workspace = {
      id: "w1",
      name: "Test Workspace",
      path: "/test/path",
      lastOpenedAt: new Date().toISOString()
    };
    
    store.saveWorkspace(workspace);
    const list = store.listWorkspaces();
    
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("w1");
  });

  it("should track mutation activity from shell redirection", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const store = new JsonStore();

    // Setup workspace and chat
    const workspace = { id: "w1", name: "W", path: "/test/w", lastOpenedAt: "..." };
    store.saveWorkspace(workspace);
    store.saveChat({
      id: "c1", workspaceId: "w1", title: "T", createdAt: "...", updatedAt: "...",
      model: "auto", approvalMode: "default", sandbox: false,
      usage: { requestCount: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 }
    });

    const activity = {
      id: "a1", chatId: "c1", messageId: "m1", kind: "command" as const,
      status: "done" as const, title: "T", body: "echo 'hello' > test.txt",
      tone: "execute" as const, createdAt: "..."
    };

    // Mock file read for "after" content
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith("test.txt"));
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("hello"));

    store.trackMutationActivity(activity);
    store.finalizeChangeSet("c1", "m1");

    const payload = store.getChatPayload("c1");
    expect(payload?.changeSets).toHaveLength(1);
    expect(payload?.changeSets[0].files[0].relativePath).toBe("test.txt");
  });

  it("should track mutation activity from PowerShell Out-File", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const store = new JsonStore();

    // Setup workspace and chat
    const workspace = { id: "w1", name: "W", path: "/test/w", lastOpenedAt: "..." };
    store.saveWorkspace(workspace);
    store.saveChat({
      id: "c1", workspaceId: "w1", title: "T", createdAt: "...", updatedAt: "...",
      model: "auto", approvalMode: "default", sandbox: false,
      usage: { requestCount: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 }
    });

    const activity = {
      id: "a1", chatId: "c1", messageId: "m1", kind: "command" as const,
      status: "done" as const, title: "T", body: "Out-File -FilePath config.json -InputObject $data",
      tone: "execute" as const, createdAt: "..."
    };

    // Mock file read for "after" content
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith("config.json"));
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("{}"));

    store.trackMutationActivity(activity);
    store.finalizeChangeSet("c1", "m1");

    const payload = store.getChatPayload("c1");
    expect(payload?.changeSets).toHaveLength(1);
    expect(payload?.changeSets[0].files[0].relativePath).toBe("config.json");
  });
});
