import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type OpenProjectPlan =
  | {
      ok: true;
      kind: "expo" | "react_native";
      metroCommand: string;
      launchUrl?: string;
    }
  | { ok: false; code: "not_expo_or_rn"; message: string };

export function planOpenInSimulator(worktreePath: string): OpenProjectPlan {
  const pkgPath = join(worktreePath, "package.json");
  if (!existsSync(pkgPath)) {
    return {
      ok: false,
      code: "not_expo_or_rn",
      message: "No package.json in this worktree",
    };
  }
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as typeof pkg;
  } catch {
    return {
      ok: false,
      code: "not_expo_or_rn",
      message: "package.json could not be parsed",
    };
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps.expo) {
    return {
      ok: true,
      kind: "expo",
      metroCommand: "npx expo start",
      launchUrl: "exp://127.0.0.1:8081",
    };
  }
  if (deps["react-native"]) {
    return {
      ok: true,
      kind: "react_native",
      metroCommand: "npx react-native start",
    };
  }
  return {
    ok: false,
    code: "not_expo_or_rn",
    message: "This worktree is not an Expo or React Native app",
  };
}
