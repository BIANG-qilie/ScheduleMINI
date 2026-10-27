/** 短标记的圆点留在钟点竖线内侧，名字让开课程胶囊，整名放不下就不写。 */

export function estimateTextWidth(text: string, fontPx: number) {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x20) width += fontPx * 0.3;
    else if (code < 0x80) width += fontPx * 0.56;
    else width += fontPx;
  }
  return width;
}

/** 相对日程列左缘。整颗圆点都在边框里面，留出一小段空隙。当前时间圆点用同一个数。 */
export const REPLAY_CHIP_RAIL_LEFT = 6;

export const REPLAY_CHIP_HEIGHT = 16;

/** 手机按天列里，不超过这时长的一次性安排走圆点，不跟正课并排切标题。 */
export const PHONE_RAIL_MAX_MINUTES = 60;

export function isRailMark(input: {
  dayLayout: boolean;
  once: boolean;
  minutes: number;
  marked: boolean;
  band: boolean;
}) {
  if (input.band) return false;
  if (input.marked) return true;
  return (
    input.dayLayout &&
    input.once &&
    input.minutes > 0 &&
    input.minutes <= PHONE_RAIL_MAX_MINUTES
  );
}

const DOT_PX = 6;
const DOT_GAP = 4;
/** 名字和胶囊、名字和名字之间的空隙。 */
const CLEAR_GAP = 8;
const FONT_PX = 11;

export type ReplayRect = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export function replayChipSpan(title: string, fontPx = FONT_PX) {
  const text = estimateTextWidth(title.trim(), fontPx);
  const labelLeft = REPLAY_CHIP_RAIL_LEFT + DOT_PX + DOT_GAP;
  return {
    text,
    labelLeft,
    right: labelLeft + text,
  };
}

/**
 * 名字列有多宽时，把胶囊往右让。列宽会把胶囊挤到最小宽度以下时返回 0，
 * 改由名字另找空档。
 */
export function replayCapsuleInset(input: {
  titles: readonly string[];
  laneWidth: number;
  minCapsule: number;
}): number {
  if (input.laneWidth <= 0) return 0;
  let right = REPLAY_CHIP_RAIL_LEFT;
  for (const title of input.titles) {
    const trimmed = title.trim();
    if (!trimmed) continue;
    right = Math.max(right, replayChipSpan(trimmed).right);
  }
  if (right <= REPLAY_CHIP_RAIL_LEFT) return 0;
  const cardLeft = Math.ceil(right + CLEAR_GAP);
  const capsule = input.laneWidth - cardLeft - 4;
  if (capsule < input.minCapsule) return 0;
  return Math.max(0, cardLeft - 4);
}

function overlaps(a: ReplayRect, b: ReplayRect, gap: number) {
  return !(
    a.right + gap <= b.left ||
    b.right + gap <= a.left ||
    a.bottom + gap <= b.top ||
    b.bottom + gap <= a.top
  );
}

export function placeReplayLabel(input: {
  title: string;
  top: number;
  laneWidth: number;
  obstacles: readonly ReplayRect[];
  taken: readonly ReplayRect[];
}): { top: number; label: string; labelLeft: number } {
  const title = input.title.trim();
  const span = replayChipSpan(title);
  const fits =
    title.length > 0 &&
    input.laneWidth > 0 &&
    span.text + DOT_PX + DOT_GAP <= input.laneWidth - 8;
  if (!fits) {
    return { top: input.top, label: "", labelLeft: span.labelLeft };
  }

  const blocks = [...input.obstacles, ...input.taken];
  const fitsAt = (top: number) => {
    if (top < 0) return false;
    const box: ReplayRect = {
      top,
      bottom: top + REPLAY_CHIP_HEIGHT,
      left: span.labelLeft,
      right: span.right,
    };
    return !blocks.some((block) => overlaps(box, block, CLEAR_GAP));
  };

  if (fitsAt(input.top)) {
    return { top: input.top, label: title, labelLeft: span.labelLeft };
  }

  const limit = 6 * 60;
  for (let delta = 4; delta <= limit; delta += 4) {
    if (fitsAt(input.top + delta)) {
      return { top: input.top + delta, label: title, labelLeft: span.labelLeft };
    }
    if (fitsAt(input.top - delta)) {
      return { top: input.top - delta, label: title, labelLeft: span.labelLeft };
    }
  }

  return { top: input.top, label: title, labelLeft: span.labelLeft };
}

export function replayCardRect(input: {
  column: number;
  span: number;
  columnCount: number;
  top: number;
  height: number;
  laneWidth: number;
  inset: number;
}): ReplayRect {
  const count = Math.max(1, input.columnCount);
  const leftPct = input.column / count;
  const widthPct = input.span / count;
  const left = leftPct * input.laneWidth + 4 + input.inset * (1 - leftPct);
  const width = widthPct * input.laneWidth - 8 - input.inset * widthPct;
  return {
    top: input.top,
    bottom: input.top + input.height,
    left,
    right: left + width,
  };
}
