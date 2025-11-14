self.addEventListener("install", () => {
  console.log("[firebase-messaging-sw] Installed");
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
  console.log("[firebase-messaging-sw] Activated");
});

importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyDZ-TGLEa_QuclBA7FMUmwAristBqk4c2o",
  authDomain: "hotcode-ai-project.firebaseapp.com",
  projectId: "hotcode-ai-project",
  storageBucket: "hotcode-ai-project.appspot.com",
  messagingSenderId: "746561497589",
  appId: "1:746561497589:web:6110eeb35b457118b158bc"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw] Received background message", payload);

  const notification = payload.notification ?? {};
  const notificationTitle = notification.title ?? "New message";
  const notificationOptions = {
    body: notification.body ?? "Open HotCodeChat to continue the conversation.",
    icon: "/icons/icon-192.png",
    data: payload?.data
  };

  const dedupeKey =
    payload?.data?.messageId ?? `${notificationTitle}:${notificationOptions.body}`;

  self.registration.getNotifications().then((existing) => {
    const alreadyVisible = existing.some(
      (item) =>
        item.data?.messageId === notificationOptions.data?.messageId ||
        `${item.title}:${item.body}` === dedupeKey
    );

    if (alreadyVisible) {
      console.log("[firebase-messaging-sw] Skipping duplicate notification", dedupeKey);
      return;
    }

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const chatId = event.notification.data?.chatId;
  const targetUrl = chatId ? `/c/${chatId}` : "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.postMessage({ type: "OPEN_CHAT", chatId });
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});

