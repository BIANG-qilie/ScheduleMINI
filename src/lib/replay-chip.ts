/** 短标记的圆点留在钟点竖线内侧。正课胶囊保持整列宽，名字只占竖向空档，放不下就不写。 */

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
 * 不再为短名字预留左列。把胶囊右移会截断「心理健康」「午读 · 五年级」。
 * 名字改由 placeReplayLabel 找竖向空档。
 */
export function replayCapsuleInset(_input: {
  titles: readonly string[];
  laneWidth: number;
  minCapsule: number;
}): number {
  return 0;
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

  return { top: input.top, label: "", labelLeft: span.labelLeft };
}

/**
 * 淡色底只占这段起止时间。名字会压到正课标题时，整行挪到胶囊上方或下方，
 * 两个标题不占同一块像素。
 */
export function placeReplayBand(input: {
  top: number;
  height: number;
  labelHeight: number;
  obstacles: readonly ReplayRect[];
  gap?: number;
}): { washTop: number; washHeight: number; labelTop: number } {
  const gap = input.gap ?? 8;
  const spanTop = input.top;
  const spanHeight = Math.max(0, input.height);
  const spanBottom = spanTop + spanHeight;
  const labelH = input.labelHeight;
  const hits = (top: number) => {
    const bottom = top + labelH;
    return input.obstacles.some((block) => bottom > block.top && top < block.bottom);
  };
  const overlap = (top: number) =>
    Math.max(0, Math.min(top + labelH, spanBottom) - Math.max(top, spanTop));

  let labelTop = spanTop + (spanHeight - labelH) / 2;
  if (hits(labelTop)) {
    const clear = input.obstacles
      .flatMap((block) => [block.top - gap - labelH, block.bottom + gap])
      .filter((top) => !hits(top));
    if (clear.length) {
      const center = spanTop + spanHeight / 2;
      clear.sort((a, b) => {
        const byOverlap = overlap(b) - overlap(a);
        if (byOverlap !== 0) return byOverlap;
        return Math.abs(a + labelH / 2 - center) - Math.abs(b + labelH / 2 - center);
      });
      labelTop = clear[0];
    }
  }

  return {
    washTop: spanTop,
    washHeight: spanHeight,
    labelTop,
  };
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
