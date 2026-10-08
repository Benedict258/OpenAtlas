/**
 * Character-level diff between the Before and After text, so the cleaned panel
 * can highlight exactly what changed. Falls back to a single changed region when
 * the texts are too large for a full LCS table.
 */

export interface DiffSeg {
  text: string;
  changed: boolean;
}

const MAX_CELLS = 4_000_000;

export function diffChars(before: string, after: string): DiffSeg[] {
  if (before === after) return after ? [{ text: after, changed: false }] : [];

  const a = Array.from(before);
  const b = Array.from(after);
  const n = a.length;
  const m = b.length;

  if (n * m > MAX_CELLS) return singleRegionDiff(a, b);

  // dp[(i)*(m+1)+j] = LCS length of a[i:] and b[j:]
  const row = m + 1;
  const dp = new Uint16Array((n + 1) * row);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * row + j] =
        a[i] === b[j]
          ? dp[(i + 1) * row + j + 1] + 1
          : Math.max(dp[(i + 1) * row + j], dp[i * row + j + 1]);
    }
  }

  const segs: DiffSeg[] = [];
  let i = 0;
  let j = 0;
  const push = (text: string, changed: boolean) => {
    const last = segs[segs.length - 1];
    if (last && last.changed === changed) last.text += text;
    else segs.push({ text, changed });
  };

  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push(b[j], false);
      i++;
      j++;
    } else if (dp[(i + 1) * row + j] >= dp[i * row + j + 1]) {
      i++; // a[i] was removed
    } else {
      push(b[j], true); // b[j] was added
      j++;
    }
  }
  while (j < m) {
    push(b[j], true);
    j++;
  }
  return segs;
}

function singleRegionDiff(a: string[], b: string[]): DiffSeg[] {
  const n = a.length;
  const m = b.length;
  let s = 0;
  while (s < n && s < m && a[s] === b[s]) s++;
  let e = 0;
  while (e < n - s && e < m - s && a[n - 1 - e] === b[m - 1 - e]) e++;
  const segs: DiffSeg[] = [];
  if (s > 0) segs.push({ text: b.slice(0, s).join(""), changed: false });
  if (m - s - e > 0) segs.push({ text: b.slice(s, m - e).join(""), changed: true });
  if (e > 0) segs.push({ text: b.slice(m - e).join(""), changed: false });
  return segs;
}
