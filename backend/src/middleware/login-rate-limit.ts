import type { RequestHandler } from "express";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const MAX_TRACKED_KEYS = 10_000;

type AttemptWindow = {
  count: number;
  resetAt: number;
};

export function createLoginRateLimiter(now: () => number = Date.now): RequestHandler {
  const ipAttempts = new Map<string, AttemptWindow>();
  const accountAttempts = new Map<string, AttemptWindow>();
  let requestsSinceCleanup = 0;

  function getWindow(attempts: Map<string, AttemptWindow>, key: string, currentTime: number): AttemptWindow {
    let window = attempts.get(key);
    if (!window || window.resetAt <= currentTime) {
      if (!window && attempts.size >= MAX_TRACKED_KEYS) {
        const oldestKey = attempts.keys().next().value;
        if (oldestKey) attempts.delete(oldestKey);
      }
      window = { count: 0, resetAt: currentTime + WINDOW_MS };
      attempts.set(key, window);
    }
    return window;
  }

  return (req, res, next) => {
    const currentTime = now();

    if (++requestsSinceCleanup >= 100) {
      requestsSinceCleanup = 0;
      for (const attempts of [ipAttempts, accountAttempts]) {
        for (const [key, window] of attempts) {
          if (window.resetAt <= currentTime) attempts.delete(key);
        }
      }
    }

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const windows = [getWindow(ipAttempts, ip, currentTime)];
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 254) : "";
    if (email) windows.push(getWindow(accountAttempts, email, currentTime));

    const blockedWindows = windows.filter((window) => window.count >= MAX_ATTEMPTS);
    if (blockedWindows.length > 0) {
      const retryAfter = Math.max(...blockedWindows.map((window) => Math.ceil((window.resetAt - currentTime) / 1000)));
      res.set("Retry-After", String(Math.max(1, retryAfter)));
      return res.status(429).json({ message: "Muitas tentativas de login. Tente novamente mais tarde." });
    }

    for (const window of windows) window.count += 1;
    next();
  };
}
