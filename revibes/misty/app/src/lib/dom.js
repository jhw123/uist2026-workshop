// Walk up from the hovered element to a meaningful block, so a drop lands on a
// card or section rather than on a line of text.
export function pickTarget(element, root) {
  let current = element;
  while (current && !(current instanceof HTMLElement)) current = current.parentElement;
  while (current && current !== root) {
    const parent = current.parentElement;
    if (!parent || parent === root) break;
    if (current.offsetWidth >= root.clientWidth * 0.5 && current.offsetHeight >= 36) break;
    current = parent;
  }
  return current && current !== root ? current : root.firstElementChild;
}
