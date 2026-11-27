type DeletionSession = { uid: string; getIdToken(forceRefresh?: boolean): Promise<string> };

export class DeletionSessionChangedError extends Error {
  constructor() { super("Your account changed. Refresh these controls and confirm the account before requesting deletion."); }
}

export async function confirmedDeletionToken(currentSession: () => DeletionSession | null, expectedUid: string | null, signal: AbortSignal) {
  signal.throwIfAborted();
  const user = currentSession();
  if (!expectedUid || !user || user.uid !== expectedUid) throw new DeletionSessionChangedError();
  const token = await user.getIdToken(true);
  signal.throwIfAborted();
  if (currentSession()?.uid !== expectedUid) throw new DeletionSessionChangedError();
  return token;
}
