type ScrollBody = { style: { overflow: string } };
type ScrollLock = { owners: number; originalOverflow: string };

const locks = new WeakMap<ScrollBody, ScrollLock>();

export function lockBodyScroll(body: ScrollBody) {
  const lock = locks.get(body) ?? { owners: 0, originalOverflow: body.style.overflow };
  locks.set(body, lock);
  lock.owners += 1;
  body.style.overflow = "hidden";
  let released = false;

  return () => {
    if (released) return;
    released = true;
    lock.owners -= 1;
    if (lock.owners === 0) {
      body.style.overflow = lock.originalOverflow;
      locks.delete(body);
    }
  };
}
