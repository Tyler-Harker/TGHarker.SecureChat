// Push notification event handler
// This code is appended to the next-pwa generated service worker

self.addEventListener("push", function (event) {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = {
      title: "SecureChat",
      body: event.data.text(),
      type: "generic",
    };
  }

  const title = payload.title || "SecureChat";
  const options = {
    body: payload.body || "You have a new notification",
    icon: "/icon-192x192.png",
    badge: "/favicon-32x32.png",
    tag: payload.tag || "default",
    renotify: true,
    data: {
      url: payload.url || "/chats",
      type: payload.type,
      conversationId: payload.conversationId,
      senderUserId: payload.senderUserId,
    },
    actions: [],
  };

  if (payload.type === "new_message") {
    options.actions = [{ action: "open", title: "View Message" }];
  } else if (payload.type === "contact_request") {
    options.actions = [{ action: "open", title: "View Request" }];
  } else if (payload.type === "contact_request_accepted") {
    options.actions = [{ action: "open", title: "View Contacts" }];
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const url = event.notification.data?.url || "/chats";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

self.addEventListener("pushsubscriptionchange", function (event) {
  event.waitUntil(
    clients.matchAll({ type: "window" }).then(function (clientList) {
      clientList.forEach(function (client) {
        client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED" });
      });
    })
  );
});
