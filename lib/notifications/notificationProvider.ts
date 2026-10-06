// Notification abstraction. MVP: in-app realtime alerts + optional browser
// notifications. A future SMS/WhatsApp/push provider implements this interface.
export interface NotificationPayload {
  title: string;
  body: string;
  tag?: string;
}

export interface Notifier {
  readonly name: string;
  isAvailable(): boolean;
  requestPermission(): Promise<boolean>;
  notify(payload: NotificationPayload): void;
}
