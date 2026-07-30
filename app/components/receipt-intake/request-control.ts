export type ReceiptRequestControl = {
  active: Set<string>;
  cancelled: Set<string>;
  controllers: Map<string, AbortController>;
};

export function newReceiptRequestControl(): ReceiptRequestControl {
  return {
    active: new Set<string>(),
    cancelled: new Set<string>(),
    controllers: new Map<string, AbortController>(),
  };
}

export function finishReceiptRequest(
  control: ReceiptRequestControl,
  id: string,
): void {
  control.active.delete(id);
  control.controllers.delete(id);
}

export function cancelReceiptRequests(
  control: ReceiptRequestControl,
  ids: readonly string[],
): void {
  ids.forEach((id) => {
    control.cancelled.add(id);
    control.controllers.get(id)?.abort();
  });
}
