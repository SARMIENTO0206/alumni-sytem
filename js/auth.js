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
        const form = document.querySelector("#selfRegisterModal form");
        form.reset();
        form.hidden = false;
        document.getElementById("registrationSubmitted").classList.add("hidden");
        document.getElementById("regSchool").value = "St. Agnes Academy of Caloocan";
        populateRegistrationYears();
        updateRegistrationEducationFields();
        updateRegistrationStrands();
        document.getElementById("selfRegisterModal").classList.add("active");
    }

    function closeSelfRegisterModal() {
        document.getElementById("selfRegisterModal").classList.remove("active");
    }

    function populateRegistrationYears() {
        const yearSelect = document.getElementById("regBatch");
        const currentYear = new Date().getFullYear();
        const selectedYear = yearSelect.value;
        yearSelect.replaceChildren(new Option("Select year", ""));
        for (let year = currentYear; year >= 1960; year--) {
            yearSelect.add(new Option(String(year), String(year)));
        }
        yearSelect.value = selectedYear;
    }

    const REGISTRATION_STRANDS = {
        Academic: ["STEM", "ABM", "HUMSS", "GAS"],
        TVL: ["ICT", "Home Economics", "Industrial Arts", "Agri-Fishery Arts"],
        Sports: ["Sports Track"],
        "Arts and Design": ["Arts and Design"]
    };

    function updateRegistrationStrands() {
        const track = document.getElementById("regTrack").value;
        const strandSelect = document.getElementById("regStrand");
        strandSelect.replaceChildren(new Option(track ? "Select strand" : "Select a track first", ""));
        for (const strand of REGISTRATION_STRANDS[track] || []) {
            strandSelect.add(new Option(strand, strand));
        }
        strandSelect.disabled = !track;
    }

    function updateRegistrationEducationFields() {
        const level = document.getElementById("regEducationLevel").value;
        const jhsFields = document.getElementById("regJhsFields");
        const shsFields = document.getElementById("regShsFields");
        const gradeSelect = document.getElementById("regGradeCompleted");
        const trackSelect = document.getElementById("regTrack");
        const strandSelect = document.getElementById("regStrand");

        jhsFields.classList.toggle("hidden", level !== "JHS");
        shsFields.classList.toggle("hidden", level !== "SHS");
        gradeSelect.required = level === "JHS";
        trackSelect.required = level === "SHS";
        strandSelect.required = level === "SHS";
        if (level !== "JHS") gradeSelect.value = "";
        if (level !== "SHS") {
            trackSelect.value = "";
            updateRegistrationStrands();
        }
    }

    async function handleRegisterAlumni(event) {
        event.preventDefault();
        const name = document.getElementById("regName").value.trim();
        const username = document.getElementById("regUsername").value.trim();
        const password = document.getElementById("regPassword").value;
        const confirmPassword = document.getElementById("regConfirmPassword").value;
        const studentId = document.getElementById("regStudentId").value.trim();
        const batch = document.getElementById("regBatch").value;
        const email = document.getElementById("regEmail").value.trim();
        const contact = document.getElementById("regContact").value.trim();
        const school = document.getElementById("regSchool").value.trim();
        const educationLevel = document.getElementById("regEducationLevel").value;
        const gradeCompleted = educationLevel === "JHS" ? document.getElementById("regGradeCompleted").value : "";
        const track = document.getElementById("regTrack").value;
        const strand = educationLevel === "SHS" ? document.getElementById("regStrand").value.trim() : "";
        const lrn = document.getElementById("regLrn").value.trim();
        const address = document.getElementById("regAddress").value.trim();
        const consent = document.getElementById("regConsent").checked;

        if (password !== confirmPassword) {
            showToast("Passwords do not match.", "error");
            document.getElementById("regConfirmPassword").focus();
            return;
        }

        /* Primary path: register through the backend - the password is bcrypt-hashed server-side. */
        try {
            if (typeof SAA_API !== "undefined" && (await SAA_API.health())) {
                const data = await SAA_API.request("/api/auth/register", {
                    method: "POST",
                    body: JSON.stringify({ username, password, name, studentId, batch, email, contact, school, educationLevel, gradeCompleted, track: educationLevel === "SHS" ? track : "", strand, lrn, address, consent })
                });
                event.target.hidden = true;
                document.getElementById("registrationSubmitted").classList.remove("hidden");
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
        document.getElementById("loginForm")?.classList.add("hidden");
        document.getElementById("forgotPasswordPanel")?.classList.remove("hidden");
        document.getElementById("resetPasswordPanel")?.classList.add("hidden");
        document.getElementById("resetIdentifier")?.focus();
    }

    function showLoginForm() {
        document.getElementById("loginForm")?.classList.remove("hidden");
        document.getElementById("forgotPasswordPanel")?.classList.add("hidden");
        document.getElementById("resetPasswordPanel")?.classList.add("hidden");
    }

    function showResetMessage(id, message, type) {
        const box = document.getElementById(id);
        if (!box) return;
        box.textContent = message;
        box.className = `text-xs p-3 rounded-lg ${type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-rose-50 border border-rose-200 text-rose-700"}`;
    }

    async function requestPasswordReset(event) {
        event.preventDefault();
        try {
            await SAA_API.request("/api/auth/password-reset/request", {
                method: "POST",
                body: JSON.stringify({ identifier: document.getElementById("resetIdentifier").value.trim() })
            });
            showResetMessage("forgotPasswordMessage", "If an account exists for that information, we’ll send a 6-digit OTP to the registered email or mobile number.", "success");
            document.getElementById("forgotPasswordPanel")?.classList.add("hidden");
            document.getElementById("resetPasswordPanel")?.classList.remove("hidden");
            document.getElementById("resetOtp")?.focus();
        } catch (err) {
            showResetMessage("forgotPasswordMessage", "If an account exists for that information, we’ll send a 6-digit OTP to the registered email or mobile number.", "success");
            document.getElementById("forgotPasswordPanel")?.classList.add("hidden");
            document.getElementById("resetPasswordPanel")?.classList.remove("hidden");
        }
    }

    function updateResetPasswordStrength() {
        const password = document.getElementById("newResetPassword")?.value || "";
        const strong = password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
        const label = document.getElementById("resetPasswordStrength");
        if (label) label.textContent = strong ? "Password meets the requirements." : "Use 8+ characters with upper, lower, and a number.";
    }

    async function completePasswordReset(event) {
        event.preventDefault();
        const password = document.getElementById("newResetPassword").value;
        if (password !== document.getElementById("confirmResetPassword").value) {
            showResetMessage("resetPasswordMessage", "The passwords do not match.", "error");
            return;
        }
        try {
            const otp = document.getElementById("resetOtp").value.trim();
            const result = await SAA_API.request("/api/auth/password-reset/complete", {
                method: "POST",
                body: JSON.stringify({ otp, newPassword: password })
            });
            showResetMessage("resetPasswordMessage", result.message, "success");
            event.target.reset();
            setTimeout(showLoginForm, 1200);
        } catch (err) {
            showResetMessage("resetPasswordMessage", err.message || "This reset link is invalid or has expired.", "error");
        }
    }

    function showResetPasswordFromLocation() {
        if (location.hash.startsWith("#/reset-password")) showPublicScreen("login");
    }

    function showContactRegistrar() {
        document.getElementById("contactRegistrarModal")?.classList.add("active");
    }

    function closeContactRegistrar() {
        document.getElementById("contactRegistrarModal")?.classList.remove("active");
    }

    async function submitRegistrarInquiry(event) {
        event.preventDefault();
        const payload = {
            name: document.getElementById("registrarName").value.trim(),
            email: document.getElementById("registrarEmail").value.trim(),
            contact: document.getElementById("registrarContact").value.trim(),
            studentId: document.getElementById("registrarStudentId").value.trim(),
            concern: document.getElementById("registrarConcern").value,
            message: document.getElementById("registrarMessage").value.trim()
        };
        const box = document.getElementById("registrarInquiryMessage");
        try {
            const result = await SAA_API.request("/api/public/registrar-inquiries", {
                method: "POST",
                body: JSON.stringify(payload)
            });
            box.textContent = `${result.message} Reference/Ticket No.: ${result.referenceNo}`;
            box.className = "text-xs p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700";
            event.target.reset();
        } catch (err) {
            box.textContent = err.message || "Unable to send your inquiry. Please try again.";
            box.className = "text-xs p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700";
        }
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
