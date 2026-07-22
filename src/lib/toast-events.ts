export type ToastTone = "success" | "error" | "info";

export type ToastEvent = {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastListener = (event: ToastEvent) => void;

const listeners = new Set<ToastListener>();

export function publishToast(event: ToastEvent) {
  for (const listener of listeners) {
    listener(event);
  }
}

export function subscribeToast(listener: ToastListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
