# PushNotificationsSection.tsx — index

Settings → Notifications surface over `usePushSubscription`: device enable/disable/test controls, unsupported and denied states, and iOS installed-PWA guidance. Also owns independent default-on `actionsRequired` and `claudeDecides` controls. They gate push delivery only; unread stripes and session urgency remain unchanged. Web Push only; native/Capacitor and redesigned permission UX are deferred. See change: add-server-push-notifications.
