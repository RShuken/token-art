export const DEFAULT_CONFIG = {
  mode: 'jittered',
  thresholdTokens: 15000,
  jitterPct: 0.4,
  emitProbability: 0.85,
  maxPerSession: 10,
  events: { sessionStart: false, sessionEnd: true, burst: true, burstTokens: 25000 }
};

export function mergeConfig(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const e = r.events && typeof r.events === 'object' ? r.events : {};
  return {
    mode: r.mode ?? DEFAULT_CONFIG.mode,
    thresholdTokens: r.thresholdTokens ?? DEFAULT_CONFIG.thresholdTokens,
    jitterPct: r.jitterPct ?? DEFAULT_CONFIG.jitterPct,
    emitProbability: r.emitProbability ?? DEFAULT_CONFIG.emitProbability,
    maxPerSession: r.maxPerSession ?? DEFAULT_CONFIG.maxPerSession,
    events: {
      sessionStart: e.sessionStart ?? DEFAULT_CONFIG.events.sessionStart,
      sessionEnd: e.sessionEnd ?? DEFAULT_CONFIG.events.sessionEnd,
      burst: e.burst ?? DEFAULT_CONFIG.events.burst,
      burstTokens: e.burstTokens ?? DEFAULT_CONFIG.events.burstTokens
    }
  };
}
