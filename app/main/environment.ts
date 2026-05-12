import { spawn } from "node:child_process";
import { EnvironmentDependencyStatus, EnvironmentStatus } from "../shared/types";
import { DependencyConfig } from "./runtime-config";

async function checkCommandExists(command: string): Promise<boolean> {
  return await new Promise((resolve) => {
    const child = spawn("cmd.exe", ["/d", "/c", "where", command], {
      windowsHide: true
    });

    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

export class EnvironmentManager {
  constructor(private readonly dependencies: DependencyConfig[]) {}

  async getStatus(): Promise<EnvironmentStatus> {
    const dependencyStatuses = await Promise.all(
      this.dependencies.map(async (dependency) => {
        const installed = await checkCommandExists(dependency.checkCommand);
        const status: EnvironmentDependencyStatus = {
          id: dependency.id,
          name: dependency.name,
          required: dependency.required,
          installed,
          installHint: dependency.installHint,
          message: installed
            ? `${dependency.name} detected.`
            : dependency.required
              ? `${dependency.name} is missing.`
              : `${dependency.name} is optional but recommended.`
        };
        return status;
      })
    );

    return {
      dependencies: dependencyStatuses
    };
  }

  openInstallTerminal(): void {
    const scriptLines = [
      "@echo off",
      "title GeminiApp dependency setup",
      ...this.dependencies.map((dependency) => `echo Installing ${dependency.name}... && ${dependency.installScript}`),
      "echo.",
      "echo Setup finished. You can close this window.",
      "pause"
    ];

    const command = scriptLines.join(" && ");
    spawn("cmd.exe", ["/d", "/c", "start", "\"GeminiApp Setup\"", "cmd.exe", "/k", command], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    }).unref();
  }
}
