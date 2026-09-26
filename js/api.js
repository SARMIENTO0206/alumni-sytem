/* api.js - REST client. Records are loaded from the Node.js API, not from hard-coded arrays. */
(function () {
    const API_PORT = 3000;
    const runtimeBase = (typeof window !== "undefined" && window.SAA_API_BASE) ? String(window.SAA_API_BASE).replace(/\/$/, "") : "";
    const API_BASE = runtimeBase || (
        (typeof location !== "undefined" && location.protocol !== "file:" && location.host)
            ? ""
            : `http://localhost:${API_PORT}`
    );

    async function apiRequest(path, options = {}) {
        const token = sessionStorage.getItem("saaToken");
        const headers = Object.assign({}, options.headers || {});
        headers["Content-Type"] = "application/json";
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE}${path}`, Object.assign({}, options, { headers }));
        if (res.status === 401 && path !== "/api/auth/logout" && path !== "/api/auth/login") {
            sessionStorage.removeItem("saaToken");
            sessionStorage.removeItem("currentUser");
            if (typeof currentUser !== "undefined") currentUser = null;
            if (typeof goToLoginPage === "function") goToLoginPage(true);
        }
        if (res.status === 403) {
            let message = "You do not have permission to perform this action.";
            try {
                const data = await res.json();
                if (data && data.error) message = data.error;
            } catch (e) { /* non-JSON */ }
            const err = new Error(message);
            err.status = 403;
            throw err;
        }
        if (!res.ok) {
            let message = `Unable to complete the request (HTTP ${res.status}).`;
            try {
                const data = await res.json();
                if (data && data.error) message = data.error;
            } catch (e) { /* non-JSON error body */ }
            const err = new Error(message);
            err.status = res.status;
            throw err;
        }
        if (res.status === 204) return null;
        return res.json();
    }

    async function apiHealth() {
        try {
            const res = await fetch(`${API_BASE}/api/health`, { method: "GET" });
            return res.ok;
        } catch (e) {
            return false;
        }
    }

    function logNotificationServerSide(payload) {
        try {
            apiRequest("/api/notifications", {
                method: "POST",
                body: JSON.stringify(payload)
            }).catch(() => { /* offline / unreachable */ });
        } catch (e) { /* ignore */ }
    }

    async function refreshAllData() {
        if (!(await apiHealth())) return false;
        try {
            const [alumni, transcripts, reprints, placements, events, reunions, donations, newsletters, jobs, announcements, notifications] = await Promise.all([
                apiRequest("/api/alumni"),
                apiRequest("/api/transcripts"),
                apiRequest("/api/reprints"),
                apiRequest("/api/placements"),
                apiRequest("/api/events"),
                apiRequest("/api/reunions"),
                apiRequest("/api/donations"),
                apiRequest("/api/newsletters"),
                apiRequest("/api/jobs").catch(() => ({ jobs: [] })),
                apiRequest("/api/announcements").catch(() => ({ announcements: [] })),
                apiRequest("/api/notifications").catch(() => ({ notifications: [] }))
            ]);
            alumniList = alumni.alumni || [];
            transcriptRequests = transcripts.requests || [];
            reprintRequests = reprints.reprints || [];
            placementLogs = placements.placements || [];
            eventsList = (events.events || []).map((ev) => {
                const name = currentUser && currentUser.name;
                const registered = !!(name && (ev.attendees || []).some((a) => String(a.name).toLowerCase() === String(name).toLowerCase()));
                return Object.assign({}, ev, { registered });
            });
            reunionsList = reunions.reunions || [];
            donationsList = donations.donations || [];
            newslettersList = newsletters.newsletters || [];
            jobsList = jobs.jobs || [];
            announcementsList = announcements.announcements || [];
            notificationsList = (notifications.notifications || []).map((n) => ({
                id: n.id,
                channel: n.channel,
                recipient: n.recipient,
                subject: n.subject,
                title: n.title || n.subject,
                message: n.message,
                date: n.createdAt || n.date || "",
                isRead: Boolean(n.isRead),
                readAt: n.readAt || "",
                notificationType: n.notificationType || n.relatedType || n.channel || "system",
                relatedType: n.relatedType || "",
                relatedId: n.relatedId || "",
                targetUrl: n.targetUrl || "",
                emailStatus: n.emailStatus || "",
                smsStatus: n.smsStatus || "",
                status: n.emailStatus || n.smsStatus || (n.isRead ? "READ" : "UNREAD")
            }));
            window.notificationUnreadCount = Number(notifications.unreadCount || notificationsList.filter((n) => !n.isRead).length);
            if (typeof applyLiveDataToUi === "function") applyLiveDataToUi();
            return true;
        } catch (err) {
            console.warn("Unable to refresh records from the API:", err.message);
            return false;
        }
    }

    window.SAA_API = {
        base: API_BASE,
        request: apiRequest,
        health: apiHealth,
        logNotification: logNotificationServerSide,
        refreshAllData
    };
})();
