// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\util\time.ts
export function nowIso(): string {
  return new Date().toISOString();
}

export function safeFileTimestamp(d: Date = new Date()): string {
  // yyyyMMdd_HHmmss
  const pad = (n: number) => n.toString().padStart(2, "0");
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const HH = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}${MM}${dd}_${HH}${mm}${ss}`;
}
