// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\util\fs.ts
import * as fs from "fs";
import * as path from "path";

export function ensureDirSync(dirPath: string): void {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

export function copyFileSyncSafe(src: string, dest: string): void {
  ensureDirSync(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

export function writeLineSync(filePath: string, line: string): void {
  fs.appendFileSync(filePath, line + "\n", { encoding: "utf8" });
}

export function fileExists(p: string): boolean {
  return fs.existsSync(p);
}
