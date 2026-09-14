/**
 * LIFO stack for Android hardware-back overlays.
 *
 * Children push handlers while open (property detail, sheets). The shell owns
 * the single BackHandler subscription so closing an overlay cannot fall through
 * to the default Activity finish (instant app exit).
 */

type AndroidBackHandler = () => boolean;

const stack: AndroidBackHandler[] = [];

export function pushAndroidBackHandler(handler: AndroidBackHandler): () => void {
  stack.push(handler);
  return () => {
    const idx = stack.lastIndexOf(handler);
    if (idx >= 0) stack.splice(idx, 1);
  };
}

export function runAndroidBackStack(): boolean {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i]?.()) return true;
  }
  return false;
}
