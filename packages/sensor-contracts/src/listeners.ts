/**
 * Calls one listener. A listener's failure is not the publisher's failure (ADR 0007): it is reported and the
 * other listeners still receive the event, so one faulty subscriber can never stop or reorder delivery.
 * Internal to the package.
 */
export function deliver(call: () => void): void {
  try {
    call();
  } catch (error) {
    console.error('A listener failed; delivery to the other listeners continued.', error);
  }
}
