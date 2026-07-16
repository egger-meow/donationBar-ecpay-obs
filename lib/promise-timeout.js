export function withTimeout(operation, timeoutMs, onTimeout) {
  if (typeof operation !== 'function') throw new TypeError('operation must be a function');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be positive');

  let timer;
  const work = Promise.resolve().then(operation);
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { onTimeout?.(); } catch { /* timeout cleanup must not mask the timeout */ }
      reject(new Error('Operation timed out'));
    }, timeoutMs);
    timer.unref?.();
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
