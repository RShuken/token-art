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

export function initSession(startedAt) {
  return { tokens: 0, count: 0, nextThreshold: 0, lastTokens: 0, startedAt, started: false, ended: false };
}

export function nextInterval(config, rng) {
  const base = config.thresholdTokens;
  if (config.mode === 'fixed') return Math.max(1, Math.round(base));
  const factor = 1 + (rng() * 2 - 1) * config.jitterPct;
  return Math.max(1, Math.round(base * factor));
}

export function decideEmissions(prevSession, stats, event, config, rng) {
  const s = prevSession || initSession(stats.now);
  // copy only the known session fields into a fresh object so prevSession is never mutated
  const session = {
    tokens: s.tokens, count: s.count, nextThreshold: s.nextThreshold,
    lastTokens: s.lastTokens, startedAt: s.startedAt, started: s.started, ended: s.ended
  };
  const emissions = [];
  const cap = config.maxPerSession;
  const canEmit = () => session.count < cap;

  if (event === 'SessionStart') {
    if (config.events.sessionStart && !session.started && canEmit()) {
      emissions.push({ trigger: 'session-start' }); session.count++;
    }
    session.started = true;
    return { emissions, nextSession: session };
  }

  if (event === 'SessionEnd') {
    if (config.events.sessionEnd && !session.ended && canEmit()) {
      emissions.push({ trigger: 'session-end' }); session.count++;
    }
    session.ended = true;
    return { emissions, nextSession: session };
  }

  // event === 'Stop'
  session.tokens = stats.tokens;
  if (session.nextThreshold <= 0) session.nextThreshold = nextInterval(config, rng);
  while (session.tokens >= session.nextThreshold && canEmit()) {
    if (rng() < config.emitProbability) { emissions.push({ trigger: 'interval' }); session.count++; }
    session.nextThreshold += nextInterval(config, rng);
  }
  if (config.events.burst && canEmit() && (session.tokens - session.lastTokens) >= config.events.burstTokens) {
    emissions.push({ trigger: 'burst' }); session.count++;
  }
  session.lastTokens = session.tokens;
  return { emissions, nextSession: session };
}
