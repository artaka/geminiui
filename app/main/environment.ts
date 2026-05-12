import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

  private openTerminalWithScript(title: string, lines: string[]): void {
    const safeTitle = title.replace(/[^\w\s-]/g, "").trim() || "GeminiApp";
    const scriptPath = path.join(os.tmpdir(), `geminiapp-${safeTitle.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.cmd`);
    fs.writeFileSync(scriptPath, lines.join("\r\n"), "utf8");

    spawn("cmd.exe", ["/d", "/c", "start", `"${safeTitle}"`, scriptPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    }).unref();
  }

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
    this.openTerminalWithScript("GeminiApp Setup", [
      "@echo off",
      "title GeminiApp dependency setup",
      ...this.dependencies.map((dependency) => `echo Installing ${dependency.name}... && ${dependency.installScript}`),
      "echo.",
      "echo Setup finished. You can close this window.",
      "pause"
    ]);
  }

  openSandboxSetupTerminal(cliPath: string): void {
    this.openTerminalWithScript("GeminiApp Sandbox Setup", [
      "@echo off",
      "title GeminiApp sandbox setup",
      "setlocal enableextensions enabledelayedexpansion",
      "where docker >nul 2>nul || (",
      "  echo Docker Desktop was not found. Trying to install it with winget...",
      "  where winget >nul 2>nul && winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements",
      ")",
      "echo.",
      "echo Waiting for Docker engine...",
      "set /a attempts=0",
      ":waitdocker",
      "docker version >nul 2>nul && goto dockerready",
      "set /a attempts+=1",
      "if !attempts! geq 30 goto dockertimeout",
      "timeout /t 2 >nul",
      "goto waitdocker",
      ":dockertimeout",
      "echo Docker engine did not become ready in time.",
      "goto finish",
      ":dockerready",
      `for /f "delims=" %%v in ('powershell -NoProfile -Command "$v = & ''${cliPath.replace(/'/g, "''")}'' --version 2^>$null; if ($v -match ''([0-9]+\\.[0-9]+\\.[0-9]+)'') { $matches[1] }"' ) do set CLI_VERSION=%%v`,
      "if not defined CLI_VERSION set CLI_VERSION=latest",
      "echo Detected Gemini CLI version: !CLI_VERSION!",
      "set SANDBOX_IMAGE=us-docker.pkg.dev/gemini-code-dev/gemini-cli/sandbox:!CLI_VERSION!",
      "echo Pulling !SANDBOX_IMAGE! ...",
      "docker pull !SANDBOX_IMAGE!",
      "echo.",
      "echo Running sandbox smoke test...",
      `call "${cliPath}" -p ping --output-format json --skip-trust --sandbox`,
      ":finish",
      "echo.",
      "echo Sandbox setup finished. You can close this window.",
      "pause"
    ]);
  }
}
