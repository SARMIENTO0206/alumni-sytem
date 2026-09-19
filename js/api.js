/* api.js - Lightweight REST client for the SAA Alumni System backend (Node.js + Express + SQLite).
 *
 * Discovery rules:
 *  - When the site is served from the API server itself (http://localhost:3000),
 *    requests are same-origin and API_BASE is "".
 *  - When the page is opened directly from disk (file://) and the local API is running,
 *    requests fall back to http://localhost:3000 (server sends permissive CORS headers).
 */
(function () {
    const API_PORT = 3000;
    const API_BASE =
        (typeof location !== "undefined" && location.protocol !== "file:" && location.host)
            ? ""
            : `http://localhost:${API_PORT}`;

    /** Generic fetch wrapper that attaches the session token and JSON body. */
    async function apiRequest(path, options = {}) {
        const token = sessionStorage.getItem("saaToken");
        const headers = Object.assign({}, options.headers || {});
        headers["Content-Type"] = "application/json";
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE}${path}`, Object.assign({}, options, { headers }));
        if (!res.ok) {
            let message = `API error (HTTP ${res.status})`;
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

    /** Quick reachability probe - never throws. */
    async function apiHealth() {
        try {
            const res = await fetch(`${API_BASE}/api/health`, { method: "GET" });
            return res.ok;
        } catch (e) {
            return false;
        }
    }

    /** Best-effort server-side notification log. Errors are swallowed on purpose. */
    function logNotificationServerSide(payload) {
        try {
            apiRequest("/api/notifications", {
                method: "POST",
                body: JSON.stringify(payload)
            }).catch(() => { /* offline / unreachable */ });
        } catch (e) { /* ignore */ }
    }

    window.SAA_API = {
        base: API_BASE,
        request: apiRequest,
        health: apiHealth,
        logNotification: logNotificationServerSide
    };
})();