import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { RuntimeModelOption } from "../shared/types";

interface DependencyConfig {
  id: string;
  name: string;
  required: boolean;
  checkCommand: string;
  installHint: string;
  installScript: string;
}

interface RuntimeConfigFile {
  cli: {
    npmPackage: string;
    defaultExecutable: string;
    pathCandidates: string[];
    healthcheck: {
      prompt: string;
      args: string[];
      timeoutMs: number;
    };
    chat: {
      outputFormat: "json" | "stream-json";
    };
  };
  dependencies: DependencyConfig[];
  models: RuntimeModelOption[];
}

let cachedConfig: RuntimeConfigFile | null = null;

function resolveConfigPath(): string {
  const baseDir = app.getAppPath();
  return path.join(baseDir, "config", "cli.runtime.json");
}

export function getRuntimeConfig(): RuntimeConfigFile {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = resolveConfigPath();
  const raw = fs.readFileSync(configPath, "utf8");
  cachedConfig = JSON.parse(raw) as RuntimeConfigFile;
  return cachedConfig;
}

export type { DependencyConfig, RuntimeConfigFile };
