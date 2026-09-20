/* auth.js - Authentication, self-registration, role permissions and session handling. */

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 3117-3336 */
/* ------------------------------------------------------------------------- */

    function togglePassword() {
        const pass = document.getElementById("password");
        const icon = document.getElementById("passwordIcon");
        if (pass.type === "password") {
            pass.type = "text";
            icon.className = "fa-regular fa-eye-slash";
        } else {
            pass.type = "password";
            icon.className = "fa-regular fa-eye";
        }
    }

    function handleLogin(event) {
        event.preventDefault();
        const username = document.getElementById("username").value.trim();
        const password = document.getElementById("password").value;
        const error = document.getElementById("loginError");
        const errorText = document.getElementById("loginErrorText");

        const enterDashboard = (user, token) => {
            error.classList.add("hidden");
            currentUser = user;
            sessionStorage.setItem("currentUser", JSON.stringify(currentUser));
            if (token) sessionStorage.setItem("saaToken", token); else sessionStorage.removeItem("saaToken");
            if (document.getElementById("remember").checked) {
                localStorage.setItem("rememberedUsername", username);
            } else {
                localStorage.removeItem("rememberedUsername");
            }
            showDashboardScreen();
            history.replaceState({ viewId: "dashboard", auth: true }, "", "#/dashboard");
            applyUserRole();
            showToast(`Welcome back, ${currentUser.name}!`, "success");
            if (typeof SAA_API !== "undefined" && SAA_API.refreshAllData) {
                SAA_API.refreshAllData().then((ok) => {
                    if (!ok) {
                        showToast("Unable to load records from the server.", "warning");
                        return;
                    }
                    if (typeof renderAlumniTable === "function") renderAlumniTable();
                    if (typeof updateStatCounters === "function") updateStatCounters();
                    if (typeof updateReports === "function") updateReports();
                    if (typeof renderDashboardActivity === "function") renderDashboardActivity();
                });
            }
        };

        const showLoginError = (msg) => {
            error.classList.remove("hidden");
            if (errorText) errorText.textContent = msg || "Invalid username or password credentials.";
        };

        /* Primary path: bcrypt verification happens on the backend (Express + SQLite). */
        const tryServerLogin = async () => {
            if (typeof SAA_API === "undefined") return false;
            if (!(await SAA_API.health())) return false;
            try {
                const data = await SAA_API.request("/api/auth/login", {
                    method: "POST",
                    body: JSON.stringify({ username, password })
                });
                enterDashboard(data.user, data.token);
                return true;
            } catch (err) {
                showLoginError(err.message || "Invalid username or password credentials.");
                return true; /* handled upstream - never fall through to demo mode on a server error */
            }
        };

        tryServerLogin().then(online => {
            if (online) return;
            showLoginError("The server is unavailable. Sign in requires a registered account.");
        });
    }

    /* Self-Registration System */
    function openSelfRegisterModal() {
        document.getElementById("selfRegisterModal").classList.add("active");
    }

    function closeSelfRegisterModal() {
        document.getElementById("selfRegisterModal").classList.remove("active");
    }

    async function handleRegisterAlumni(event) {
        event.preventDefault();
        const name = document.getElementById("regName").value.trim();
        const username = document.getElementById("regUsername").value.trim();
        const password = document.getElementById("regPassword").value;
        const studentId = document.getElementById("regStudentId").value.trim() || `SAA-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const batch = document.getElementById("regBatch").value;
        const program = document.getElementById("regProgram").value.trim();
        const email = document.getElementById("regEmail").value.trim();

        const finishRegistration = (displayName) => {
            closeSelfRegisterModal();
            event.target.reset();
            showDashboardScreen();
            history.replaceState({ viewId: "dashboard", auth: true }, "", "#/dashboard");
            applyUserRole();
            showToast(`Welcome, ${displayName}! Your alumni registration was successful.`, "success");
        };

        /* Primary path: register through the backend - the password is bcrypt-hashed server-side. */
        try {
            if (typeof SAA_API !== "undefined" && (await SAA_API.health())) {
                const data = await SAA_API.request("/api/auth/register", {
                    method: "POST",
                    body: JSON.stringify({ username, password, name, studentId, batch, program, email })
                });
                currentUser = data.user;
                sessionStorage.setItem("currentUser", JSON.stringify(currentUser));
                if (data.token) sessionStorage.setItem("saaToken", data.token); else sessionStorage.removeItem("saaToken");
                finishRegistration(name);
                if (typeof SAA_API !== "undefined" && SAA_API.refreshAllData) {
                    SAA_API.refreshAllData().then(() => {
                        if (typeof renderAlumniTable === "function") renderAlumniTable();
                        if (typeof updateStatCounters === "function") updateStatCounters();
                    });
                }
                return;
            }
        } catch (err) {
            showToast(err.message || "Registration failed. Please try again.", "error");
            return;
        }

        showToast("The server is unavailable. Registration requires a live account.", "error");
    }

    function applyUserRole() {
        if (!currentUser) return;

        document.getElementById("headerUserName").textContent = currentUser.name;
        document.getElementById("headerUserRole").textContent = currentUser.title;
        document.getElementById("welcomeName").textContent = currentUser.name;
        document.getElementById("sidebarRoleName").textContent = currentUser.title;

        // Render Topbar & Sidebar Avatars (image or initials)
        renderGlobalAvatar(currentUser.photoUrl, currentUser.avatar);

        document.getElementById("adminSidebar").classList.add("hidden");
        document.getElementById("alumniSidebar").classList.add("hidden");
        document.getElementById("registrarSidebar").classList.add("hidden");

        currentUser.role = (typeof normalizeRole === "function") ? normalizeRole(currentUser.role) : currentUser.role;

        document.getElementById("headerUserRole").textContent = (typeof roleLabel === "function")
            ? roleLabel(currentUser.role)
            : currentUser.title;
        document.getElementById("sidebarRoleName").textContent = currentUser.name || currentUser.title;

        if (typeof applyRoleChrome === "function") applyRoleChrome();

        if (currentUser.role === "admin") {
            document.getElementById("adminSidebar").classList.remove("hidden");
        } else if (currentUser.role === "alumni") {
            document.getElementById("alumniSidebar").classList.remove("hidden");
        } else if (currentUser.role === "staff" || currentUser.role === "registrar") {
            document.getElementById("registrarSidebar").classList.remove("hidden");
        }

        const parsed = parseAppLocation();
        const initialView = (parsed.viewId && parsed.viewId !== "login" && parsed.viewId !== "home")
            ? parsed.viewId
            : "dashboard";
        switchView(initialView, { replace: true, detailId: parsed.detailId });
        updateStatCounters();
        updateReports();
    }

    function renderGlobalAvatar(photoUrl, initials) {
        const headerAv = document.getElementById("headerAvatar");
        const sidebarAv = document.getElementById("sidebarRoleAvatar");
        if (photoUrl) {
            if (headerAv) headerAv.innerHTML = `<img src="${photoUrl}" class="avatar-img">`;
            if (sidebarAv) sidebarAv.innerHTML = `<img src="${photoUrl}" class="avatar-img">`;
        } else {
            if (headerAv) headerAv.textContent = initials || "AD";
            if (sidebarAv) sidebarAv.textContent = initials || "AD";
        }
    }

    async function handleLogout() {
        const token = sessionStorage.getItem("saaToken");
        if (token && typeof SAA_API !== "undefined") {
            SAA_API.request("/api/auth/logout", { method: "POST" }).catch(() => { /* offline */ });
        }
        if (window.saaSupabase && window.saaSupabase.auth && typeof window.saaSupabase.auth.signOut === "function") {
            try { await window.saaSupabase.auth.signOut(); } catch (e) { /* optional client */ }
        }

        currentUser = null;
        currentAppView = null;
        currentDetailId = null;
        sessionStorage.removeItem("currentUser");
        sessionStorage.removeItem("saaToken");

        if (typeof hideDetailPanels === "function") hideDetailPanels();
        document.querySelectorAll("[id^='view-']").forEach((el) => el.classList.add("hidden"));

        const loginForm = document.getElementById("loginForm");
        const loginError = document.getElementById("loginError");
        if (loginForm) loginForm.reset();
        if (loginError) loginError.classList.add("hidden");
        if (typeof closeChat === "function") closeChat();

        showPublicScreen("login");
        history.replaceState({ auth: "logged-out" }, "", "#/login");
        history.pushState({ auth: "logged-out" }, "", "#/login");
        showToast("You have been securely logged out.", "info");
    }

    function showForgotPassword() {
        showToast("Please contact the Alumni Affairs Office at (02) 8361-2345 to reset your password.", "info");
    }

    function showContactRegistrar() {
        showToast("Contact Registrar at registrar@stagnes.edu.ph or call (02) 8288-1234.", "info");
    }

    function toggleSidebar() {
        const sidebar = document.getElementById("sidebarDrawer");
        const overlay = document.getElementById("drawerOverlay");
        if (sidebar) sidebar.classList.toggle("-translate-x-full");
        if (overlay) overlay.classList.toggle("hidden");
    }

    /* Role-Based Navigation Permissions */
    const rolePermissions = {
        admin: [
            "dashboard", "database", "profile", "transcript", "reprint", "tracking", "placement",
            "job-opportunities", "events", "reunions", "donor", "newsletter", "feedback", "reports",
            "verification", "academic-records", "request-approval", "document-processing",
            "release-claiming", "request-history", "registrar-reports", "users", "settings",
            "announcements", "notifications", "sms", "gmail", "ai-chat", "applications", "unauthorized",
            "payment-return", "payment", "payment-history", "payment-receipt"
        ],
        staff: [
            "dashboard", "database", "profile", "transcript", "reprint", "tracking", "placement",
            "job-opportunities", "events", "reunions", "donor", "newsletter", "feedback",
            "verification", "academic-records", "request-approval", "document-processing",
            "release-claiming", "request-history", "registrar-reports", "settings",
            "announcements", "notifications", "sms", "gmail", "ai-chat", "applications", "unauthorized",
            "payment-return", "payment", "payment-history", "payment-receipt"
        ],
        registrar: [
            "dashboard", "database", "profile", "transcript", "reprint", "tracking", "placement",
            "job-opportunities", "events", "reunions", "donor", "newsletter", "feedback",
            "verification", "academic-records", "request-approval", "document-processing",
            "release-claiming", "request-history", "registrar-reports", "settings",
            "announcements", "notifications", "sms", "gmail", "ai-chat", "applications", "unauthorized",
            "payment-return", "payment", "payment-history", "payment-receipt"
        ],
        alumni: [
            "dashboard", "idcard", "profile", "job-opportunities", "transcript",
            "reprint", "tracking", "events", "reunions", "donor", "newsletter", "feedback",
            "request-status", "announcements", "notifications", "settings", "ai-chat",
            "applications", "unauthorized", "payment-return", "payment", "payment-history", "payment-receipt"
        ]
    };

