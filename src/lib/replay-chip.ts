/** 短标签只有整名放得下才显示，避免截成半个字。 */

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

export type ReplayObstacle = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** 正课标题已经占用的宽度，短标签从它右边让开。 */
  titleWidth: number;
};

const DOT_PX = 6;
const GAP_PX = 4;

export function replayChipLayout(input: {
  title: string;
  top: number;
  laneWidth: number;
  obstacles: readonly ReplayObstacle[];
  fontPx?: number;
}): { left: number; label: string } {
  const fontPx = input.fontPx ?? 11;
  const lineTop = input.top;
  const lineBottom = input.top + 16;
  let left = 4;
  for (const box of input.obstacles) {
    if (lineBottom <= box.top + 1 || lineTop >= box.bottom - 1) continue;
    const reserved = Math.min(
      box.right,
      box.left + Math.max(0, box.titleWidth),
    );
    if (reserved + 6 > left) left = reserved + 6;
  }
  const room = input.laneWidth - left - 6;
  const text = estimateTextWidth(input.title, fontPx);
  const fits =
    input.title.trim().length > 0 &&
    room > 0 &&
    text + DOT_PX + GAP_PX <= room;
  const maxLeft = Math.max(4, input.laneWidth - DOT_PX - 8);
  return {
    left: Math.min(left, maxLeft),
    label: fits ? input.title : "",
  };
}
