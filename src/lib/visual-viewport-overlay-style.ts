/**
 * Pin a fixed portal root to the visual viewport.
 * Must include offsetLeft/width — offsetTop/height alone leaves the sheet
 * stranded when mobile browsers pan horizontally on focus/overflow.
 */
export function visualViewportOverlayStyle(vv: {
  offsetLeft: number;
  offsetTop: number;
  width: number;
  height: number;
} | null): {
  left: string;
  top: string;
  width: string;
  height: string;
  right: string;
  bottom: string;
} {
  if (!vv) {
    return {
      left: "0px",
      top: "0px",
      width: "100%",
      height: "100%",
      right: "auto",
      bottom: "auto",
    };
  }
  return {
    left: `${vv.offsetLeft}px`,
    top: `${vv.offsetTop}px`,
    width: `${vv.width}px`,
    height: `${vv.height}px`,
    right: "auto",
    bottom: "auto",
  };
}
