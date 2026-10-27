/** 短标记都贴在钟点竖线同一列。整名放得下才写字，避免截成半个字。 */

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

/** 和当前时间圆点同一条竖线（相对日程列左缘）。 */
export const REPLAY_CHIP_RAIL_LEFT = -5;

const DOT_PX = 6;
const GAP_PX = 4;

export function replayChipLayout(input: {
  title: string;
  laneWidth: number;
  fontPx?: number;
}): { left: number; label: string } {
  const fontPx = input.fontPx ?? 11;
  const left = REPLAY_CHIP_RAIL_LEFT;
  const room = input.laneWidth - 8;
  const text = estimateTextWidth(input.title, fontPx);
  const fits =
    input.title.trim().length > 0 &&
    room > 0 &&
    text + DOT_PX + GAP_PX <= room;
  return { left, label: fits ? input.title : "" };
}
