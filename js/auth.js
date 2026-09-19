/* auth.js - Authentication, self-registration, role permissions and session handling. */

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 3117-3336 */
/* ------------------------------------------------------------------------- */

    /* Quick Fill Account Helper */
    function quickFillAccount(roleKey) {
        if (accounts[roleKey]) {
            document.getElementById("username").value = accounts[roleKey].username;
            document.getElementById("password").value = accounts[roleKey].password;
            showToast(`Filled credentials for ${accounts[roleKey].title}`, "info");
        }
    }

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
            const homePage = document.getElementById("homePage");
            if (homePage) homePage.classList.add("hidden");
            document.getElementById("loginPage").classList.add("hidden");
            document.getElementById("dashboardPage").classList.remove("hidden");
            applyUserRole();
            showToast(`Welcome back, ${currentUser.name}!`, "success");
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
            /* Offline demo fallback: plaintext demo accounts only. Real authentication is server-side bcrypt. */
            const matched = Object.values(accounts).find(acc => acc.username === username && acc.password === password);
            if (!matched) {
                showLoginError("Invalid username or password credentials. (API offline - demo mode.)");
                return;
            }
            showToast("⚠ Running in demo mode - API server offline.", "warning");
            enterDashboard(matched, null);
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
            document.getElementById("loginPage").classList.add("hidden");
            document.getElementById("dashboardPage").classList.remove("hidden");
            applyUserRole();
            showToast(`Welcome, ${displayName}! Your alumni registration was successful.`, "success");
        };

        /* Legacy offline registration fallback (demo only; no bcrypt client-side). */
        const doLegacyRegistration = () => {
            if (Object.values(accounts).some(acc => acc.username === username)) {
                showToast("Username already exists. Please pick a unique username.", "error");
                return;
            }
            const avatar = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
            const newAccount = {
                username, password, role: "alumni", name,
                title: `Alumnus (Batch ${batch})`, avatar, studentId, batch, program, email, photoUrl: ""
            };
            accounts[username] = newAccount;
            alumniList.unshift({ id: Date.now(), name, batch, program, status: "Employed", studentId });
            updateLocalStorage();
            currentUser = newAccount;
            sessionStorage.setItem("currentUser", JSON.stringify(currentUser));
            sessionStorage.removeItem("saaToken");
            finishRegistration(name);
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
                return;
            }
        } catch (err) {
            showToast(err.message || "Registration failed. Please try again.", "error");
            return;
        }

        /* Offline fallback: local demo registration. */
        doLegacyRegistration();
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

        const adminAddBtn = document.getElementById("adminAddEventBtn");
        if (adminAddBtn) {
            if (currentUser.role === "admin") adminAddBtn.classList.remove("hidden");
            else adminAddBtn.classList.add("hidden");
        }

        const adminReunionBtn = document.getElementById("adminCreateReunionBtn");
        if (adminReunionBtn) {
            if (currentUser.role === "admin") adminReunionBtn.classList.remove("hidden");
            else adminReunionBtn.classList.add("hidden");
        }

        const adminNewsBtn = document.getElementById("adminNewsletterBtn");
        if (adminNewsBtn) {
            if (currentUser.role === "admin") adminNewsBtn.classList.remove("hidden");
            else adminNewsBtn.classList.add("hidden");
        }

        if (currentUser.role === "admin") {
            document.getElementById("adminSidebar").classList.remove("hidden");
        } else if (currentUser.role === "alumni") {
            document.getElementById("alumniSidebar").classList.remove("hidden");
        } else if (currentUser.role === "registrar") {
            document.getElementById("registrarSidebar").classList.remove("hidden");
        }

        switchView("dashboard");
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

    function handleLogout() {
        /* Best-effort server-side session revocation (token auth). */
        const token = sessionStorage.getItem("saaToken");
        if (token && typeof SAA_API !== "undefined") {
            SAA_API.request("/api/auth/logout", { method: "POST" }).catch(() => { /* offline */ });
        }
        currentUser = null;
        sessionStorage.removeItem("currentUser");
        sessionStorage.removeItem("saaToken");
        document.getElementById("dashboardPage").classList.add("hidden");
        document.getElementById("loginPage").classList.remove("hidden");
        document.getElementById("loginForm").reset();
        document.getElementById("loginError").classList.add("hidden");
        closeChat();
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
            "dashboard", "database", "transcript", "reprint", "tracking", "placement", 
            "events", "reunions", "donor", "newsletter", "feedback", "reports", 
            "verification", "academic-records"
        ],
        alumni: [
            "dashboard", "profile", "job-opportunities", "transcript", 
            "reprint", "tracking", "events", "reunions", "donor", "newsletter", "feedback"
        ],
        registrar: [
            "dashboard", "verification", "request-approval", "document-processing", 
            "release-claiming", "transcript", "reprint", "academic-records", 
            "request-history", "registrar-reports"
        ]
    };

