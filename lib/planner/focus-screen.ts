export function coverScreenSiblings(screen: HTMLElement | null) {
  const previous: { element: HTMLElement; inert: boolean }[] = [];
  let current = screen;
  while (current?.parentElement) {
    const parent = current.parentElement;
    for (const sibling of Array.from(parent.children)) {
      if (sibling !== current && sibling instanceof HTMLElement) {
        previous.push({ element: sibling, inert: sibling.inert }); sibling.inert = true;
      }
    }
    if (parent.classList.contains("atlas-app")) break;
    current = parent;
  }
  return () => previous.forEach(({ element, inert }) => { element.inert = inert; });
}
