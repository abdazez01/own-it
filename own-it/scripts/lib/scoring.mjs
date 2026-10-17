export const XP = { element: 10, half: 5, solid: 20, partial: 10, curiosity: 5, curiosityMax: 3,
  challenge: 20, hint: -15, rung: 50, wrongTurn: 5, cleanRun: 50, claim: 200, fog: 30 };

const TEXT_XP = { solid: XP.solid, partial: XP.partial, miss: 0 };

// XP earned by the mission itself (before rung/claim/fog bonuses), clamped at 0.
export function missionXp({ got = 0, text = {}, curiosity = 0, challengesWon = 0, hintsUsed = 0, mode = 'practice' }) {
  let xp = Math.floor(got) * XP.element + (got % 1 ? XP.half : 0);
  for (const grade of Object.values(text)) xp += TEXT_XP[grade] ?? 0;
  if (mode === 'practice') xp += Math.min(curiosity, XP.curiosityMax) * XP.curiosity;
  xp += challengesWon * XP.challenge;
  xp += hintsUsed * XP.hint;
  return Math.max(0, xp);
}

// Every badge the progress state has earned; the caller diffs against progress.badges.
export function badgesFor(progress) {
  const zones = Object.values(progress.zones || {});
  const anyCleared = (rung) => zones.some((z) => z.rungs?.[rung] === 'cleared');
  const out = [];
  if (anyCleared('words')) out.push('first-word');
  if (zones.length && zones.every((z) => z.rungs?.map === 'cleared')) out.push('cartographer');
  if (anyCleared('trace')) out.push('tracer');
  if (anyCleared('break')) out.push('red-team');
  if ((progress.curiosity || 0) >= 25) out.push('curious-mind');
  if (zones.some((z) => z.claimed)) out.push('defender');
  if (progress.finalBoss === 'cleared') out.push('owner');
  if ((progress.fogClears || 0) >= 5) out.push('fog-lifter');
  return out;
}
