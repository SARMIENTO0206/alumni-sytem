/* notify-client - Client-side Notification Dispatch, Badge, Inbox */
/* Split from engagement.js lines 1667-1745 */

    async function triggerNotification(channel, recipient, subject, message) {
        const target = recipient || (currentUser && (currentUser.email || currentUser.contact)) || "";
        if (!target) {
            showToast("No recipient email or mobile number is available.", "error");
            return;
        }
        try {
            const data = await SAA_API.request("/api/notifications", {
                method: "POST",
                body: JSON.stringify({ channel, recipient: target, subject, message })
            });
            if (SAA_API.refreshAllData) await SAA_API.refreshAllData();
            const status = data.deliveryStatus || "";
            if (status === "accepted") showToast(`${channel} accepted by the provider.`, "success");
            else if (status === "not_configured") showToast(channel === "SMS" ? "SMS service is currently unavailable. Please contact the system administrator." : "Email service is currently unavailable. Please contact the system administrator.", "error");
            else showToast(`${channel} status: ${status || "recorded"}.`, "info");
        } catch (err) {
            showToast(err.message || "Unable to send the notification.", "error");
        }
    }

    function updateNotificationBadge() {
        const badge = document.getElementById("notificationBadgeCount");
        const unread = Number(window.notificationUnreadCount || (notificationsList || []).filter((n) => !n.isRead).length);
        if (badge) {
            badge.textContent = String(unread);
            badge.classList.toggle("hidden", unread <= 0);
        }
        const unreadLabel = document.getElementById("notificationsUnreadLabel");
        if (unreadLabel) unreadLabel.textContent = String(unread);
    }

    function renderNotificationLogs() {
        const list = document.getElementById("notificationLogsList");
        if (!list) return;
        updateNotificationBadge();

        if (!notificationsList.length) {
            list.innerHTML = `<div class="p-6 text-center text-slate-400 font-semibold border border-slate-100 rounded-xl">No notifications yet.</div>`;
            return;
        }

        list.innerHTML = notificationsList.map(n => `
            <button type="button" onclick="openNotificationRecord(${n.id})" class="w-full text-left p-3.5 border ${n.isRead ? "border-slate-200/80 bg-white" : "border-[#801235]/30 bg-rose-50"} rounded-xl space-y-1">
                <div class="flex items-center justify-between">
                    <span class="inline-flex items-center gap-1 font-bold text-xs text-[#801235]">
                        ${n.isRead ? "" : `<span class="w-2 h-2 rounded-full bg-[#801235]"></span>`}
                        ${n.notificationType || n.channel || "SYSTEM"}
                    </span>
                    <span class="text-[10px] text-slate-400 font-medium">${n.date}</span>
                </div>
                <p class="font-extrabold text-slate-800 text-xs">${n.subject}</p>
                <p class="text-[11px] text-slate-600 leading-relaxed">${n.message}</p>
                <div class="pt-1.5 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100">
                    <span>${n.isRead ? "Read" : "Unread"}</span>
                    <span>${n.emailStatus || n.smsStatus || ""}</span>
                </div>
            </button>
        `).join("");
    }

    function openNotificationCenterModal() {
        renderNotificationLogs();
        document.getElementById("notificationCenterModal").classList.add("active");
    }

    function openNotificationsInbox() {
        closeNotificationCenterModal();
        switchView("notifications");
    }

    function closeNotificationCenterModal() {
        document.getElementById("notificationCenterModal").classList.remove("active");
    }

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 5054-5137 */
/* ------------------------------------------------------------------------- */
    /* Newsletter & Broadcast System */
