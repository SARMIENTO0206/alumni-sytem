/* navigation.js - View routing (switchView), counters, digital ID, profile and page navigation. */

/* ------------------------------------------------------------------------- */
/* Hash history router for the existing vanilla SPA views.                   */
/* Path-style URLs like /alumni would 404 on XAMPP refresh, so routes live  */
/* in the hash: #/dashboard, #/alumni, #/events, etc.                       */
/* ------------------------------------------------------------------------- */

    const APP_VIEWS = [
        "dashboard", "idcard", "database", "profile", "job-opportunities", "transcript", "reprint",
        "tracking", "placement", "events", "reunions", "donor", "newsletter", "feedback",
        "reports", "verification", "request-approval", "document-processing", "release-claiming",
        "request-history", "registrar-reports", "academic-records", "users", "settings",
        "announcements", "notifications", "sms", "gmail", "request-status",
        "applications", "unauthorized", "payment", "payment-receipt"
    ];

    const VIEW_TO_HASH = {
        dashboard: "/dashboard",
        database: "/alumni",
        tracking: "/graduate-tracking",
        transcript: "/transcript-requests",
        reprint: "/certificate-requests",
        events: "/events",
        reunions: "/batch-reunions",
        donor: "/donor-campaigns",
        newsletter: "/newsletter",
        feedback: "/surveys",
        "job-opportunities": "/jobs",
        reports: "/reports",
        profile: "/profile",
        idcard: "/idcard",
        placement: "/placement",
        verification: "/verification",
        "request-approval": "/request-approval",
        "document-processing": "/document-processing",
        "release-claiming": "/release-claiming",
        "academic-records": "/academic-records",
        "request-history": "/request-history",
        "registrar-reports": "/registrar-reports",
        users: "/users",
        settings: "/settings",
        announcements: "/announcements",
        notifications: "/notifications",
        sms: "/sms",
        gmail: "/gmail",
        "request-status": "/request-status",
        applications: "/applications",
        unauthorized: "/unauthorized",
        payment: "/payment",
        "payment-receipt": "/payment-receipt"
    };

    const HASH_TO_VIEW = {
        "": "home",
        home: "home",
        login: "login",
        dashboard: "dashboard",
        alumni: "database",
        database: "database",
        "graduate-tracking": "tracking",
        tracking: "tracking",
        "transcript-requests": "transcript",
        transcript: "transcript",
        "certificate-requests": "reprint",
        reprint: "reprint",
        events: "events",
        "batch-reunions": "reunions",
        reunions: "reunions",
        "donor-campaigns": "donor",
        donor: "donor",
        newsletter: "newsletter",
        announcements: "announcements",
        surveys: "feedback",
        feedback: "feedback",
        jobs: "job-opportunities",
        "job-opportunities": "job-opportunities",
        reports: "reports",
        profile: "profile",
        idcard: "idcard",
        placement: "placement",
        verification: "verification",
        "request-approval": "request-approval",
        "document-processing": "document-processing",
        "release-claiming": "release-claiming",
        "academic-records": "academic-records",
        "request-history": "request-history",
        "registrar-reports": "registrar-reports",
        notifications: "notifications",
        users: "users",
        settings: "settings",
        sms: "sms",
        gmail: "gmail",
        email: "gmail",
        "request-status": "request-status",
        applications: "applications",
        unauthorized: "unauthorized",
        "payment-return": "payment",
        payment: "payment",
        payments: "unauthorized",
        "payment-history": "unauthorized",
        "payment-receipt": "payment-receipt"
    };

    let currentAppView = "dashboard";
    let currentDetailId = null;
    let isApplyingHistory = false;

    function isAuthenticated() {
        if (!currentUser) {
            try {
                const saved = sessionStorage.getItem("currentUser");
                if (saved) currentUser = JSON.parse(saved);
            } catch (e) {
                currentUser = null;
            }
        }
        return !!(currentUser && (currentUser.username || currentUser.role));
    }

    function allowedViewsFor(role) {
        const key = (typeof normalizeRole === "function") ? normalizeRole(role) : role;
        return (typeof rolePermissions !== "undefined" && rolePermissions[key]) ? rolePermissions[key] : [];
    }

    function parseAppLocation() {
        const raw = String(location.hash || "").replace(/^#/, "");
        const parts = raw.split("/").filter(Boolean);
        const first = (parts[0] || "").toLowerCase();
        const viewId = HASH_TO_VIEW.hasOwnProperty(first) ? HASH_TO_VIEW[first] : (first || "home");
        const detailId = parts[1] || null;
        return { viewId, detailId, first };
    }

    function hashForView(viewId, detailId) {
        const base = VIEW_TO_HASH[viewId] || ("/" + viewId);
        return "#" + (detailId ? `${base}/${detailId}` : base);
    }

    function showPublicScreen(which) {
        const homePage = document.getElementById("homePage");
        const loginPage = document.getElementById("loginPage");
        const dashboardPage = document.getElementById("dashboardPage");
        if (homePage) homePage.classList.toggle("hidden", which !== "home");
        if (loginPage) loginPage.classList.toggle("hidden", which !== "login");
        if (dashboardPage) dashboardPage.classList.add("hidden");
        if (typeof closeChat === "function") closeChat();
        window.scrollTo(0, 0);
    }

    function showDashboardScreen() {
        const homePage = document.getElementById("homePage");
        const loginPage = document.getElementById("loginPage");
        const dashboardPage = document.getElementById("dashboardPage");
        if (homePage) homePage.classList.add("hidden");
        if (loginPage) loginPage.classList.add("hidden");
        if (dashboardPage) dashboardPage.classList.remove("hidden");
    }

    function syncHistory(viewId, detailId, mode) {
        if (isApplyingHistory || mode === "skip") return;
        const nextHash = hashForView(viewId, detailId);
        const state = { viewId, detailId: detailId || null, auth: true };
        if (mode === "replace" || location.hash === nextHash) {
            history.replaceState(state, "", nextHash);
        } else {
            history.pushState(state, "", nextHash);
        }
    }

    function hideDetailPanels() {
        const alumniList = document.getElementById("alumniListPanel");
        const alumniDetail = document.getElementById("alumniDetailPanel");
        const transcriptList = document.getElementById("transcriptListPanel");
        const transcriptDetail = document.getElementById("transcriptDetailPanel");
        const eventsList = document.getElementById("eventsListPanel");
        const eventsDetail = document.getElementById("eventDetailPanel");
        const reprintList = document.getElementById("reprintListPanel");
        const reprintDetail = document.getElementById("reprintDetailPanel");
        const jobsList = document.getElementById("jobsListPanel");
        const jobsDetail = document.getElementById("jobDetailPanel");
        if (alumniList) alumniList.classList.remove("hidden");
        if (alumniDetail) alumniDetail.classList.add("hidden");
        if (transcriptList) transcriptList.classList.remove("hidden");
        if (transcriptDetail) transcriptDetail.classList.add("hidden");
        if (eventsList) eventsList.classList.remove("hidden");
        if (eventsDetail) eventsDetail.classList.add("hidden");
        if (reprintList) reprintList.classList.remove("hidden");
        if (reprintDetail) reprintDetail.classList.add("hidden");
        if (jobsList) jobsList.classList.remove("hidden");
        if (jobsDetail) jobsDetail.classList.add("hidden");
    }

    async function applyDetailPanel(viewId, detailId) {
        hideDetailPanels();
        if (!detailId) return;
        if (viewId === "database" && typeof showAlumniDetails === "function") {
            await showAlumniDetails(detailId, true);
        } else if (viewId === "transcript" && typeof showTranscriptDetails === "function") {
            await showTranscriptDetails(detailId, true);
        } else if (viewId === "events" && typeof showEventDetails === "function") {
            await showEventDetails(detailId, true);
        } else if (viewId === "reprint" && typeof showReprintDetails === "function") {
            await showReprintDetails(detailId, true);
        } else if (viewId === "job-opportunities" && typeof showJobDetails === "function") {
            await showJobDetails(detailId, true);
        } else if (viewId === "announcements" && typeof showAnnouncementDetails === "function") {
            showAnnouncementDetails(detailId, true);
        } else if (viewId === "notifications" && typeof showNotificationDetail === "function") {
            const note = (notificationsList || []).find((n) => String(n.id) === String(detailId));
            if (note) showNotificationDetail(note);
        }
    }

    function updateSidebarActive(viewId) {
        document.querySelectorAll(".sidebar-link").forEach((link) => link.classList.remove("active"));
        const ids = [`nav-${viewId}`, `alumni-nav-${viewId}`, `registrar-nav-${viewId}`, `staff-nav-${viewId}`];
        ids.forEach((id) => {
            const btn = document.getElementById(id);
            if (btn && !btn.closest(".hidden")) btn.classList.add("active");
        });
        const fallback = document.getElementById(`nav-${viewId}`) ||
            document.getElementById(`alumni-nav-${viewId}`) ||
            document.getElementById(`registrar-nav-${viewId}`) ||
            document.getElementById(`staff-nav-${viewId}`);
        if (fallback) fallback.classList.add("active");
        if (typeof openSidebarGroupsFor === "function") openSidebarGroupsFor(viewId);
    }

    function renderOpenedView(viewId) {
        if (viewId === "dashboard") {
            if (typeof renderRoleDashboard === "function") renderRoleDashboard();
        }
        if (viewId === "idcard" && typeof renderDigitalIdCard === "function") renderDigitalIdCard();
        if (viewId === "profile" && typeof loadAlumniProfile === "function") loadAlumniProfile();
        if (viewId === "database" && typeof renderAlumniTable === "function") renderAlumniTable();
        if (viewId === "transcript" && typeof renderTranscriptRequests === "function") renderTranscriptRequests();
        if (viewId === "reprint" && typeof renderReprintRequests === "function") renderReprintRequests();
        if (viewId === "tracking") {
            if (typeof applyTrackingRoleView === "function") applyTrackingRoleView();
            if (typeof renderTrackingCharts === "function") renderTrackingCharts();
            if (typeof renderGrowthChart === "function") renderGrowthChart();
            if (typeof renderOutdatedProfilesTable === "function") renderOutdatedProfilesTable();
            if (typeof renderTrackingRecordsTable === "function") renderTrackingRecordsTable();
            if (typeof renderMyTrackingSummary === "function") renderMyTrackingSummary();
        }
        if (viewId === "placement" && typeof renderPlacementLogs === "function") renderPlacementLogs();
        if (viewId === "job-opportunities" && typeof renderJobsGrid === "function") renderJobsGrid();
        if (viewId === "events" && typeof renderEventsGrid === "function") renderEventsGrid();
        if (viewId === "reunions" && typeof renderReunionsGrid === "function") renderReunionsGrid();
        if (viewId === "newsletter" && typeof renderNewsletterArchive === "function") renderNewsletterArchive();
        if (viewId === "donor" && typeof renderDonorProgress === "function") renderDonorProgress();
        if (viewId === "feedback" && typeof renderFeedbackPage === "function") renderFeedbackPage();
        if (viewId === "academic-records" && typeof renderAcademicRecords === "function") renderAcademicRecords();
        if (viewId === "reports") {
            if (typeof updateReports === "function") updateReports();
            if (typeof refreshAiStatus === "function") refreshAiStatus();
        }
        if (viewId === "request-approval" && typeof renderRequestApproval === "function") renderRequestApproval();
        if (viewId === "document-processing" && typeof renderDocumentPreparation === "function") renderDocumentPreparation();
        if (viewId === "release-claiming" && typeof renderReleaseClaiming === "function") renderReleaseClaiming();
        if (viewId === "request-history" && typeof renderRequestHistory === "function") renderRequestHistory();
        if (viewId === "registrar-reports" && typeof updateRegistrarReports === "function") updateRegistrarReports();
        if (viewId === "users" && typeof loadUsersView === "function") loadUsersView();
        if (viewId === "settings" && typeof loadSettingsView === "function") loadSettingsView();
        if (viewId === "announcements" && typeof renderAnnouncementsView === "function") renderAnnouncementsView();
        if (viewId === "notifications" && typeof renderNotificationsPage === "function") {
            renderNotificationsPage();
            if (currentDetailId && typeof showNotificationDetail === "function") {
                const note = (notificationsList || []).find((n) => String(n.id) === String(currentDetailId));
                if (note) showNotificationDetail(note);
            }
        }
        if ((viewId === "sms" || viewId === "gmail") && typeof loadMessageConfigStatus === "function") loadMessageConfigStatus();
        if (viewId === "request-status" && typeof renderRequestStatusView === "function") renderRequestStatusView();
        if (viewId === "applications" && typeof loadApplicationsView === "function") loadApplicationsView();
        if (viewId === "unauthorized" && typeof renderUnauthorizedView === "function") renderUnauthorizedView();
        if (viewId === "payment" && typeof renderPaymentQrPage === "function") renderPaymentQrPage();
        if (viewId === "payment-receipt" && typeof renderPaymentReceiptPage === "function") renderPaymentReceiptPage();
        if (viewId === "profile" && typeof applyRoleChrome === "function") applyRoleChrome();
    }

    function switchView(viewId, options) {
        if (options && typeof options !== "object") options = { detailId: options };
        options = options || {};

        if (!isAuthenticated()) {
            goToLoginPage(true);
            return;
        }

        const allowed = allowedViewsFor(currentUser.role);
        if (allowed.length && !allowed.includes(viewId)) {
            showToast("You do not have permission to access that section.", "error");
            viewId = "unauthorized";
        }

        const targetView = document.getElementById(`view-${viewId}`);
        if (!targetView) {
            showToast("That page is not available.", "error");
            return;
        }

        APP_VIEWS.forEach((v) => {
            const el = document.getElementById(`view-${v}`);
            if (el) el.classList.add("hidden");
        });
        targetView.classList.remove("hidden");

        currentAppView = viewId;
        currentDetailId = options.detailId || null;
        updateSidebarActive(viewId);

        const titleEl = document.getElementById("currentViewTitle");
        if (titleEl) titleEl.textContent = formatViewTitle(viewId);

        if (window.innerWidth < 768) {
            const sidebar = document.getElementById("sidebarDrawer");
            const overlay = document.getElementById("drawerOverlay");
            if (sidebar) sidebar.classList.add("-translate-x-full");
            if (overlay) overlay.classList.add("hidden");
        }

        const main = document.getElementById("mainContentContainer");
        if (main && !currentDetailId) main.scrollTop = 0;

        renderOpenedView(viewId);
        void applyDetailPanel(viewId, currentDetailId);
        syncHistory(viewId, currentDetailId, options.replace ? "replace" : (options.skipHistory ? "skip" : "push"));
    }

    function openDashboardModule(kind) {
        const role = (typeof normalizeRole === "function")
            ? normalizeRole(currentUser && currentUser.role)
            : (currentUser && currentUser.role);
        const map = {
            alumni: { admin: "database", alumni: "profile", staff: "database" },
            tracking: { admin: "tracking", alumni: "tracking", staff: "tracking" },
            events: { admin: "events", alumni: "events", staff: "events" },
            transcript: { admin: "transcript", alumni: "transcript", staff: "transcript" },
            jobs: { admin: "placement", alumni: "job-opportunities", staff: "placement" },
            profile: { admin: "profile", alumni: "profile", staff: "profile" }
        };
        const viewId = (map[kind] && map[kind][role]) || "dashboard";
        switchView(viewId);
    }

    function goAppBack() {
        if (currentDetailId) {
            history.back();
            return;
        }
        if (window.history.length > 1) history.back();
        else switchView("dashboard", { replace: true });
    }

    function restoreRouteFromLocation() {
        const parsed = parseAppLocation();
        if (parsed.first === "reset-password") {
            showPublicScreen("login");
            if (typeof showResetPasswordFromLocation === "function") showResetPasswordFromLocation();
            return;
        }
        if (!isAuthenticated()) {
            if (parsed.viewId === "home") {
                showPublicScreen("home");
                return;
            }
            showPublicScreen("login");
            if (location.hash !== "#/login") history.replaceState({ auth: "logged-out" }, "", "#/login");
            return;
        }

        showDashboardScreen();
        if (parsed.viewId === "login" || parsed.viewId === "home") {
            switchView("dashboard", { replace: true });
            return;
        }
        switchView(parsed.viewId, { detailId: parsed.detailId, skipHistory: true });
    }

    let lastHistorySync = 0;

    function handleAppPopState() {
        isApplyingHistory = true;
        lastHistorySync = Date.now();
        try {
            restoreRouteFromLocation();
        } finally {
            isApplyingHistory = false;
        }
    }

    window.addEventListener("popstate", handleAppPopState);
    window.addEventListener("hashchange", () => {
        if (isApplyingHistory || Date.now() - lastHistorySync < 80) return;
        handleAppPopState();
    });

    function formatViewTitle(id) {
        const titles = {
            dashboard: "Dashboard Overview",
            idcard: "Digital Alumni Identification",
            database: "Alumni Records Database",
            profile: "My Profile",
            "job-opportunities": "Job Opportunities Board",
            transcript: "Transcript Request Portal",
            reprint: "Certificate Reprint Requests",
            tracking: "Graduate Tracking Analytics",
            placement: "Alumni Employment Records",
            events: "Alumni Events Registration",
            reunions: "Batch Reunions Manager",
            donor: "Donor Campaign Portal",
            newsletter: "Alumni Newsletter Broadcast",
            feedback: currentUser?.role === "alumni"
                ? "Alumni Surveys & Feedback"
                : currentUser?.role === "admin"
                    ? "Feedback & Survey Analytics"
                    : "Feedback Management",
            reports: "System Reports & Statistics",
            verification: "Alumni Record Verification",
            "request-approval": "Request Approval Queue",
            "document-processing": "Document Preparation",
            "release-claiming": "Release & Claiming Records",
            "request-history": "Request History Log",
            "registrar-reports": "Registrar Processing Reports",
            "academic-records": "Academic Records",
            users: "User & Access Management",
            settings: "Settings",
            announcements: "Announcements",
            notifications: "Notifications",
            sms: "SMS",
            gmail: "Gmail / Email",
            "request-status": "Request Status",
            applications: "My Applications",
            unauthorized: "Access Denied",
            payment: "Donation Checkout",
            "payment-receipt": "Payment Receipt"
        };
        return titles[id] || "Alumni Portal";
    }

    /* Counters */
    function updateStatCounters() {
        if (typeof renderRoleDashboard === "function") renderRoleDashboard();
        else if (typeof renderDashboardStats === "function") renderDashboardStats();
        if (typeof renderDashboardActivity === "function") renderDashboardActivity();
    }

    function renderDashboardActivity() {
        const box = document.getElementById("recentActivityList");
        if (!box) return;
        const items = [];
        if (alumniList[0]) items.push({ title: "Latest alumni record", detail: alumniList[0].name + (alumniList[0].batch ? ` (Batch ${alumniList[0].batch})` : "") });
        if (transcriptRequests[0]) items.push({ title: "Latest transcript request", detail: transcriptRequests[0].name + " • " + (transcriptRequests[0].status || "") });
        const latestEmployment = alumniList.find((alumnus) => ["Employed", "Self-employed"].includes(alumnus.status));
        if (latestEmployment) items.push({ title: "Latest alumni employment update", detail: latestEmployment.name + " • " + (latestEmployment.company || latestEmployment.status) });
        if (eventsList[0]) items.push({ title: "Latest event", detail: eventsList[0].title });

        if (!items.length) {
            box.innerHTML = `<p class="text-xs text-slate-400 font-medium py-6 text-center">No activity yet. Add alumni, events, or requests to see them here.</p>`;
            return;
        }
        box.innerHTML = items.map(item => `
            <div class="flex items-start space-x-3">
                <div class="w-8 h-8 rounded-full bg-slate-50 text-brand-magenta flex items-center justify-center flex-shrink-0 text-xs font-bold">
                    <i class="fa-regular fa-bell"></i>
                </div>
                <div>
                    <p class="font-bold text-slate-800 text-xs">${item.title}</p>
                    <p class="text-[11px] text-slate-500 font-medium">${item.detail}</p>
                </div>
            </div>
        `).join("");
    }

    /* Digital Alumni ID */
    function renderDigitalIdCard() {
        if (!currentUser) return;
        const match = alumniList.find(a =>
            currentUser && (
                (currentUser.studentId && a.studentId === currentUser.studentId) ||
                (a.name && currentUser.name && a.name.toLowerCase() === currentUser.name.toLowerCase())
            )
        ) || {};
        const name = currentUser.name || match.name || "Alumni";
        const program = currentUser.program || match.program || "—";
        const batch = currentUser.batch || match.batch || "—";
        const studentId = match.studentId || currentUser.studentId || "—";
        const photoUrl = currentUser.photoUrl || JSON.parse(localStorage.getItem("alumniProfile") || "{}").photoUrl || "";

        document.getElementById("idCardName").textContent = name;
        document.getElementById("idCardProgram").textContent = program;
        document.getElementById("idCardBatch").textContent = batch;
        document.getElementById("idCardNumber").textContent = studentId;
        document.getElementById("idCardSignature").textContent = name;

        const avatarEl = document.getElementById("idCardAvatar");
        if (avatarEl) {
            if (photoUrl) {
                avatarEl.innerHTML = `<img src="${photoUrl}" class="avatar-img">`;
            } else {
                avatarEl.textContent = currentUser.avatar || "AL";
            }
        }

        // Generate QR code for ID Card
        const qrContainer = document.getElementById("idCardQRCode");
        if (qrContainer && typeof QRCode !== 'undefined') {
            qrContainer.innerHTML = "";
            new QRCode(qrContainer, {
                text: `https://stagnes.edu.ph/verify?id=${studentId}&name=${encodeURIComponent(name)}`,
                width: 68,
                height: 68,
                colorDark: "#4a0422",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M
            });
        }
    }

    function flipIdCard() {
        const card = document.getElementById("digitalIdCard");
        if (card) card.classList.toggle("flipped");
    }

    /* Alumni Profile Photo Upload */
    function triggerProfilePhotoUpload() {
        const fileInput = document.getElementById("profilePhotoInput");
        if (fileInput) fileInput.click();
    }

    function handleProfilePhotoSelected(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            showToast("Please upload a valid image file (JPG, PNG, GIF, WebP).", "error");
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showToast("File size is too large. Please select a photo under 5MB.", "warning");
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const photoUrl = e.target.result;

            // Update Current User
            currentUser.photoUrl = photoUrl;
            sessionStorage.setItem("currentUser", JSON.stringify(currentUser));

            // Update Accounts & Profile in LocalStorage
            if (accounts[currentUser.username]) {
                accounts[currentUser.username].photoUrl = photoUrl;
            }

            const savedProfile = JSON.parse(localStorage.getItem("alumniProfile") || "{}");
            savedProfile.photoUrl = photoUrl;
            localStorage.setItem("alumniProfile", JSON.stringify(savedProfile));
            updateLocalStorage();

            // Render updated avatars
            loadAlumniProfile();
            renderGlobalAvatar(photoUrl, currentUser.avatar);
            showToast("Profile photo updated successfully!", "success");
        };
        reader.readAsDataURL(file);
    }

    function removeProfilePhoto() {
        if (!confirm("Are you sure you want to remove your profile photo and revert to initials?")) return;

        currentUser.photoUrl = "";
        sessionStorage.setItem("currentUser", JSON.stringify(currentUser));

        if (accounts[currentUser.username]) {
            accounts[currentUser.username].photoUrl = "";
        }

        const savedProfile = JSON.parse(localStorage.getItem("alumniProfile") || "{}");
        savedProfile.photoUrl = "";
        localStorage.setItem("alumniProfile", JSON.stringify(savedProfile));
        updateLocalStorage();

        loadAlumniProfile();
        renderGlobalAvatar("", currentUser.avatar);
        showToast("Profile photo removed.", "info");
    }

    /* Profile Functions */
    async function loadAlumniProfile() {
        let user = currentUser || {};
        let pendingEmailChange = null;
        let alumni = alumniList.find(a =>
            currentUser && (
                (currentUser.studentId && a.studentId === currentUser.studentId) ||
                (currentUser.alumniId && a.id === currentUser.alumniId) ||
                (a.name && currentUser.name && a.name.toLowerCase() === currentUser.name.toLowerCase())
            )
        ) || {};
        if (typeof SAA_API !== "undefined") {
            try {
                const data = await SAA_API.request("/api/auth/me");
                user = data.user || user;
                alumni = data.alumni || alumni;
                pendingEmailChange = data.pendingEmailChange || null;
                currentUser = Object.assign({}, currentUser || {}, user);
                sessionStorage.setItem("currentUser", JSON.stringify(currentUser));
            } catch (e) { /* keep last known session user */ }
        }
        const name = user.name || "";
        const photoUrl = user.photoUrl || "";

        const setVal = (id, value) => { const el = document.getElementById(id); if (el) el.value = value || ""; };
        setVal("profileName", name);
        const heading = document.getElementById("profileHeadingName");
        if (heading) heading.textContent = name || "My Profile";
        setVal("profileEmail", user.email || "");
        renderEmailChangeState(pendingEmailChange);
        setVal("profileContact", user.contact || alumni.contact || "");
        setVal("profileAddress", user.address || alumni.address || "");
        /* Alumni ID = official record ID issued on verification. The account code
           (ADM-/REG-/ALU-) identifies a staff or admin account instead. */
        setVal("profileAlumniId", alumni.studentId || user.studentId || "");
        setVal("profileStaffId", user.userCode || "");
        const staffIdLabel = document.getElementById("profileStaffIdLabel");
        if (staffIdLabel) staffIdLabel.textContent = isAdminRole() ? "Admin ID" : "Staff ID";
        setVal("profileBatch", user.batch || alumni.batch || "");
        setVal("profileProgram", user.program || alumni.program || "");
        setVal("profileTrack", user.strand || user.track || alumni.strand || alumni.track || "");
        ["profileEmployment", "profileCompany", "profileJobTitle"].forEach((id, index) => {
            const el = document.getElementById(id);
            if (el) el.textContent = [alumni.status, alumni.company, alumni.title || alumni.jobTitle][index] || "—";
        });

        const avatarEl = document.getElementById("alumniProfileAvatar");
        const removeBtn = document.getElementById("removePhotoBtn");

        if (photoUrl) {
            if (avatarEl) avatarEl.innerHTML = `<img src="${photoUrl}" class="avatar-img">`;
            if (removeBtn) removeBtn.classList.remove("hidden");
        } else {
            const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
            if (avatarEl) avatarEl.textContent = initials;
            if (removeBtn) removeBtn.classList.add("hidden");
        }
    }

    /** Shows/hides the verified email-change panel from the API state. */
    function renderEmailChangeState(pending, hint) {
        const panel = document.getElementById("profileEmailPending");
        if (!panel) return;
        const address = document.getElementById("profileEmailPendingAddress");
        const hintEl = document.getElementById("profileEmailHint");
        const code = document.getElementById("profileEmailCode");
        if (pending && pending.newEmail) {
            panel.classList.remove("hidden");
            if (address) address.textContent = pending.newEmail;
            if (hintEl) hintEl.textContent = hint || "Enter the 6-digit code sent to the new address. Your registered email stays the same until it is confirmed.";
        } else {
            panel.classList.add("hidden");
            if (address) address.textContent = "";
            if (hintEl) hintEl.textContent = "";
            if (code) code.value = "";
        }
    }

    /** Step 1: ask the server to send a verification code to the new address. */
    async function requestEmailChange(newEmail) {
        try {
            const data = await SAA_API.request("/api/auth/profile/email/request", {
                method: "POST",
                body: JSON.stringify({ email: newEmail })
            });
            const hint = data.devCode
                ? `No email provider is configured, so the code is shown here for testing: ${data.devCode}`
                : "Enter the 6-digit code sent to the new address. Your registered email stays the same until it is confirmed.";
            renderEmailChangeState({ newEmail: data.pendingEmail }, hint);
            showToast(data.message || "Verification code sent to the new address.", "info");
            return true;
        } catch (err) {
            showToast(err.message || "Unable to start the email change.", "error");
            return false;
        }
    }

    /** Step 2: confirm the code so the new address becomes the registered email. */
    async function confirmEmailChange() {
        const code = (document.getElementById("profileEmailCode") || {}).value || "";
        if (!/^\d{6}$/.test(code.trim())) {
            showToast("Enter the 6-digit code sent to the new address.", "error");
            return;
        }
        try {
            const data = await SAA_API.request("/api/auth/profile/email/verify", {
                method: "POST",
                body: JSON.stringify({ code: code.trim() })
            });
            currentUser = Object.assign({}, currentUser, data.user || {});
            sessionStorage.setItem("currentUser", JSON.stringify(currentUser));
            renderEmailChangeState(null);
            showToast(data.message || "Email address verified and updated.", "success");
            if (SAA_API.refreshAllData) await SAA_API.refreshAllData();
            loadAlumniProfile();
        } catch (err) {
            showToast(err.message || "Unable to verify this code.", "error");
        }
    }

    async function cancelEmailChange() {
        try {
            await SAA_API.request("/api/auth/profile/email/cancel", { method: "POST" });
        } catch (err) { /* the pending code simply expires */ }
        renderEmailChangeState(null);
        showToast("Pending email change cancelled. Your registered email was not changed.", "info");
        loadAlumniProfile();
    }

    /** PUT the editable profile fields (the registered email is verified separately). */
    async function saveProfileDetails(profile) {
        try {
            if (typeof SAA_API === "undefined") throw new Error("The server is offline.");
            const data = await SAA_API.request("/api/auth/profile", {
                method: "PUT",
                body: JSON.stringify(profile)
            });
            currentUser = Object.assign({}, currentUser, data.user || profile);
            sessionStorage.setItem("currentUser", JSON.stringify(currentUser));
            if (SAA_API.refreshAllData) await SAA_API.refreshAllData();
            document.getElementById("headerUserName").textContent = currentUser.name;
            const welcome = document.getElementById("welcomeName");
            if (welcome) welcome.textContent = currentUser.name;
            document.getElementById("profileHeadingName").textContent = currentUser.name;
            if (typeof applyRoleChrome === "function") applyRoleChrome();
            showToast("Profile details saved to the database.", "success");
            return true;
        } catch (err) {
            showToast(err.message || "Unable to save profile to the database.", "error");
            return false;
        }
    }

    async function saveAlumniProfile() {
        const emailField = document.getElementById("profileEmail");
        const typedEmail = emailField.value.trim();
        const currentEmail = String(currentUser.email || "").trim();
        const profile = {
            email: currentEmail,
            contact: document.getElementById("profileContact").value.trim(),
            address: (document.getElementById("profileAddress") || {}).value || "",
            photoUrl: currentUser.photoUrl || ""
        };
        if (!isAlumniRole()) profile.name = document.getElementById("profileName").value.trim() || currentUser.name;

        /* The registered email is the communication address for announcements,
           notifications and AI-assisted replies, so it is required. */
        if (!typedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typedEmail)) {
            showToast("Enter a valid email address so notifications can reach you.", "error");
            emailField.focus();
            return;
        }

        const saved = await saveProfileDetails(profile);
        if (!saved) return;

        /* A different address is verified first: it never becomes the active
           registered email just by saving the form. */
        if (typedEmail.toLowerCase() !== currentEmail.toLowerCase()) {
            await requestEmailChange(typedEmail);
            return;
        }
        loadAlumniProfile();
    }

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 5565-5624 */
/* ------------------------------------------------------------------------- */
    /* ========================================================================
       HOMEPAGE BUTTON CONNECTIONS - Navigation Functions
       ======================================================================== */
    
    /**
     * Navigate from homepage to login page
     * Hides homepage, shows login form
     */
    function goToLoginPage(fromGuard) {
        if (isAuthenticated()) {
            showDashboardScreen();
            switchView(currentAppView || "dashboard", { replace: true });
            return;
        }
        showPublicScreen("login");
        const nextHash = "#/login";
        if (fromGuard) {
            history.replaceState({ auth: "logged-out" }, "", nextHash);
        } else if (location.hash !== nextHash) {
            history.pushState({ auth: "logged-out" }, "", nextHash);
        } else {
            history.replaceState({ auth: "logged-out" }, "", nextHash);
        }
        window.scrollTo(0, 0);
        if (!fromGuard) showToast("Welcome to SAA Alumni Management System! Please sign in.", "info");
    }

    /**
     * Scroll to explore features section on homepage
     */
    function exploreFeatures() {
        const sections = document.querySelectorAll("section");
        if (sections.length >= 3) {
            sections[2].scrollIntoView({ behavior: 'smooth', block: 'start' });
            showToast("Exploring our alumni services and features...", "info");
        }
    }

    function scrollHomeSection(sectionId) {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    window.addEventListener("DOMContentLoaded", () => {
        const parsed = parseAppLocation();
        if (isAuthenticated()) return;
        if (parsed.first === "reset-password") {
            restoreRouteFromLocation();
            return;
        }
        if (parsed.viewId && parsed.viewId !== "home" && parsed.viewId !== "login") {
            goToLoginPage(true);
        }
    });
