export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function invariant(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}