/* access.js - Three-role helpers, settings, users, communications, and profile extras. */

let newAnnouncementImageData = "";

function previewAnnouncementImage(input) {
    const file = input.files && input.files[0];
    const wrap = document.getElementById("announceImagePreviewWrap");
    const preview = document.getElementById("announceImagePreview");
    newAnnouncementImageData = "";
    if (preview) preview.removeAttribute("src");
    if (wrap) wrap.classList.add("hidden");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        input.value = "";
        showToast("Choose a JPG, PNG, or WebP image.", "error");
        return;
    }
    if (file.size > 1024 * 1024) {
        input.value = "";
        showToast("Announcement images must be 1 MB or smaller.", "error");
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        if (typeof reader.result !== "string") {
            showToast("Unable to preview this image.", "error");
            return;
        }
        newAnnouncementImageData = reader.result;
        if (preview) preview.src = reader.result;
        if (wrap) wrap.classList.remove("hidden");
    };
    reader.onerror = () => showToast("Unable to read this image.", "error");
    reader.readAsDataURL(file);
}

function clearAnnouncementImagePreview() {
    newAnnouncementImageData = "";
    const input = document.getElementById("announceImage");
    const wrap = document.getElementById("announceImagePreviewWrap");
    const preview = document.getElementById("announceImagePreview");
    if (input) input.value = "";
    if (preview) preview.removeAttribute("src");
    if (wrap) wrap.classList.add("hidden");
}

function normalizeRole(role) {
    if (role === "registrar") return "staff";
    return String(role || "");
}

function currentRole() {
    return normalizeRole(currentUser && currentUser.role);
}

function isAdminRole(role) {
    return normalizeRole(role || (currentUser && currentUser.role)) === "admin";
}

function isStaffRole(role) {
    return normalizeRole(role || (currentUser && currentUser.role)) === "staff";
}

function isAlumniRole(role) {
    return normalizeRole(role || (currentUser && currentUser.role)) === "alumni";
}

function roleLabel(role) {
    const r = normalizeRole(role);
    if (r === "admin") return "System Administrator";
    if (r === "staff") return "Registrar";
    if (r === "alumni") return "Alumni";
    return r || "User";
}

function toggleSidebarGroup(btn) {
    const group = btn && btn.closest(".sidebar-group");
    if (group) group.classList.toggle("open");
}

function openSidebarGroupsFor(viewId) {
    document.querySelectorAll(".sidebar-group").forEach((group) => {
        const hasActive = !!group.querySelector(`.sidebar-link.active, #nav-${viewId}, #alumni-nav-${viewId}, #staff-nav-${viewId}, #registrar-nav-${viewId}`);
        const match = group.querySelector(`[id$="-${viewId}"]`);
        if (match || hasActive) group.classList.add("open");
    });
}

function confirmLogout() {
    const modal = document.getElementById("logoutConfirmModal");
    if (modal) modal.classList.add("active");
    else handleLogout();
}

function closeLogoutConfirm() {
    const modal = document.getElementById("logoutConfirmModal");
    if (modal) modal.classList.remove("active");
}

function confirmAndLogout() {
    closeLogoutConfirm();
    handleLogout();
}

function applyRoleChrome() {
    const role = currentRole();
    const staffOps = isAdminRole() || isStaffRole();
    ["adminAddEventBtn", "adminCreateReunionBtn", "adminNewsletterBtn", "adminAddJobOpportunityBtn", "adminSmsSweepBtn", "adminEventReminderBtn"].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle("hidden", !staffOps);
    });

    const alumni = isAlumniRole();
    ["profileAcademicSection", "profileCareerSection", "profileResumeSection", "profileAlumniIdentity"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle("hidden", !alumni);
    });
    const staffSection = document.getElementById("profileStaffSection");
    if (staffSection) staffSection.classList.toggle("hidden", alumni);
    ["profileAlumniId", "profileBatch", "profileProgram", "profileTrack"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.readOnly = true;
    });
    const nameInput = document.getElementById("profileName");
    if (nameInput) {
        nameInput.readOnly = alumni;
        nameInput.classList.toggle("bg-slate-50", alumni);
    }
    const nameLock = document.getElementById("profileNameLock");
    if (nameLock) nameLock.classList.toggle("hidden", !alumni);
    const nameHelp = document.getElementById("profileNameHelp");
    if (nameHelp) nameHelp.classList.toggle("hidden", !alumni);
    const department = document.getElementById("profileStaffDepartment");
    if (department) department.textContent = isStaffRole() ? "Registrar's Office" : "System Administration";

    const badge = document.querySelector("#view-profile .status-badge");
    if (badge) badge.textContent = isAlumniRole() ? "Alumni Account" : roleLabel(role);

    const meta = document.getElementById("profileRoleMeta");
    if (meta && currentUser) {
        meta.classList.remove("hidden");
        meta.innerHTML = `
            <p><span class="font-bold text-slate-600">Username:</span> ${escapeHtml(currentUser.username || "—")}</p>
            <p><span class="font-bold text-slate-600">Role:</span> ${escapeHtml(roleLabel(currentUser.role))}</p>
            <p><span class="font-bold text-slate-600">Account status:</span> ${escapeHtml(currentUser.status || "Active")}</p>
        `;
    }
    const viewTitle = document.getElementById("currentViewTitle");
    const profileView = document.getElementById("view-profile");
    if (viewTitle && profileView && !profileView.classList.contains("hidden")) viewTitle.textContent = "My Profile";

    const welcomeBadge = document.getElementById("dashboardWelcomeBadge");
    const welcomeSubtitle = document.getElementById("dashboardWelcomeSubtitle");
    if (welcomeBadge) {
        welcomeBadge.textContent = isAlumniRole() ? "SAA Alumni Network" : isStaffRole() ? "Registrar Workspace" : "System Administration";
    }
    if (welcomeSubtitle) {
        welcomeSubtitle.textContent = isAlumniRole()
            ? "Stay connected. Be involved. Make a difference."
            : isStaffRole()
                ? "Manage alumni records and document services."
                : "Monitor alumni records, requests, engagement, and graduate tracking.";
    }

    if (typeof applyTrackingRoleView === "function") applyTrackingRoleView();
}

function documentRequestRows() {
    return [].concat(transcriptRequests || [], reprintRequests || []);
}

function renderDashboardStats() {
    const grid = document.getElementById("dashboardStatsGrid");
    if (!grid) return;
    const rows = documentRequestRows();
    const pendingCount = rows.filter((r) => ["Pending", "For Correction"].includes(r.status)).length;
    const processingCount = rows.filter((r) => ["Approved", "Processing", "Ready for Release"].includes(r.status)).length;
    const completedCount = rows.filter((r) => ["Released", "Completed"].includes(r.status)).length;
    const recentBatch = String(new Date().getFullYear());
    const empCount = (alumniList || []).filter((a) => ["Employed", "Self-employed", "Freelance"].includes(a.status)).length;
    const recordsToVerify = (alumniList || []).filter((a) => (a.trackingReviewStatus || "Pending") === "Pending").length;
    const upcomingEvents = (eventsList || []).length;
    const openJobs = (jobsList || []).filter((j) => j.status === "Published").length;
    const myRequests = isAlumniRole() ? rows.length : 0;
    const requestStatus = rows.length ? (rows[0].status || "Pending") : "None";

    let cards = [];
    if (isAdminRole()) {
        cards = [
            { icon: "fa-solid fa-users", color: "bg-pink-50 text-brand-magenta", value: (alumniList || []).length, label: "Total Alumni", target: "alumni" },
            { icon: "fa-solid fa-file-lines", color: "bg-amber-50 text-amber-600", value: pendingCount, label: "Pending Requests", target: "transcript" },
            { icon: "fa-solid fa-briefcase", color: "bg-emerald-50 text-emerald-600", value: empCount, label: "Employed Alumni", target: "tracking" },
            { icon: "fa-regular fa-calendar-check", color: "bg-purple-50 text-purple-600", value: upcomingEvents, label: "Upcoming Events", target: "events" }
        ];
    } else if (isStaffRole()) {
        cards = [
            { icon: "fa-solid fa-file-lines", color: "bg-amber-50 text-amber-600", value: pendingCount, label: "Pending Requests", target: "transcript" },
            { icon: "fa-solid fa-gears", color: "bg-purple-50 text-purple-600", value: processingCount, label: "For Processing", target: "transcript" },
            { icon: "fa-solid fa-circle-check", color: "bg-emerald-50 text-emerald-600", value: completedCount, label: "Completed Requests", target: "transcript" },
            { icon: "fa-solid fa-user-graduate", color: "bg-pink-50 text-brand-magenta", value: recordsToVerify, label: "Records to Verify", target: "tracking" }
        ];
    } else {
        cards = [
            { icon: "fa-solid fa-file-lines", color: "bg-pink-50 text-brand-magenta", value: myRequests, label: "My Requests", target: "transcript" },
            { icon: "fa-solid fa-hourglass-half", color: "bg-amber-50 text-amber-600", value: requestStatus, label: "Request Status", target: "transcript" },
            { icon: "fa-solid fa-briefcase", color: "bg-emerald-50 text-emerald-600", value: openJobs, label: "Job Opportunities", target: "jobs" },
            { icon: "fa-regular fa-calendar-check", color: "bg-purple-50 text-purple-600", value: upcomingEvents, label: "Upcoming Events", target: "events" }
        ];
    }

    grid.innerHTML = cards.map((c) => `
        <button type="button" class="stat-card text-left w-full" onclick="openDashboardModule('${c.target}')" title="Open ${escapeHtml(c.label)}">
            <div class="stat-icon-wrapper ${c.color}">
                <i class="${c.icon}"></i>
            </div>
            <div>
                <p class="text-2xl font-extrabold text-slate-800">${escapeHtml(String(c.value))}</p>
                <p class="text-xs font-semibold text-slate-400">${escapeHtml(c.label)}</p>
            </div>
        </button>
    `).join("");
}

function renderDashboardAnnouncements() {
    const featuredBox = document.getElementById("dashboardAnnouncementsFeatured");
    const othersBox = document.getElementById("dashboardAnnouncementsOthers");
    if (!featuredBox || !othersBox) return;
    const visible = (announcementsList || [])
        .filter((a) => isAnnouncementVisibleFor(a, currentRole()))
        .slice()
        .sort((a, b) => new Date(b.publish_at || b.created_at || 0) - new Date(a.publish_at || a.created_at || 0));

    if (!visible.length) {
        featuredBox.innerHTML = `<p class="text-sm text-slate-400 py-8 text-center">No announcements yet.</p>`;
        othersBox.innerHTML = "";
        return;
    }

    const [featured, ...rest] = visible;
    featuredBox.innerHTML = `
        <button type="button" onclick="showAnnouncementDetails('${featured.id}')" class="w-full text-left rounded-xl bg-gradient-to-br from-[#801235] to-[#4a0a1f] text-white hover:shadow-lg transition overflow-hidden">
            ${featured.imageUrl ? `<img src="${escapeHtml(featured.imageUrl)}" alt="" class="w-full h-40 sm:h-56 object-cover">` : ""}
            <div class="p-6">
                <span class="inline-block px-2.5 py-1 rounded-full bg-white/15 text-pink-100 text-[10px] font-bold tracking-wider uppercase mb-2">Featured • ${escapeHtml(announcementAudienceLabel(featured))}</span>
                <h4 class="text-lg font-extrabold">${escapeHtml(featured.title)}</h4>
                <p class="text-sm text-pink-100/90 mt-2 line-clamp-3 whitespace-pre-wrap">${escapeHtml(featured.body || "")}</p>
                <span class="inline-flex items-center gap-1 text-xs font-bold text-pink-100 mt-4">View Details <i class="fa-solid fa-arrow-right text-[10px]"></i></span>
            </div>
        </button>
    `;

    othersBox.innerHTML = rest.length
        ? rest.slice(0, 4).map((a) => `
            <button type="button" onclick="showAnnouncementDetails('${a.id}')" class="w-full text-left app-card overflow-hidden hover:shadow-md transition">
                ${a.imageUrl ? `<img src="${escapeHtml(a.imageUrl)}" alt="" class="w-full h-28 object-cover">` : ""}
                <div class="p-4">
                    <span class="text-[10px] font-bold text-brand-magenta uppercase tracking-wider">${escapeHtml(announcementAudienceLabel(a))}</span>
                    <h5 class="font-bold text-slate-800 text-sm mt-1">${escapeHtml(a.title)}</h5>
                    <p class="text-xs text-slate-500 mt-1 line-clamp-2">${escapeHtml(a.body || "")}</p>
                </div>
            </button>
        `).join("")
        : `<p class="text-xs text-slate-400 col-span-1 sm:col-span-2 py-4 text-center">No other announcements.</p>`;
}

function renderRoleDashboard() {
    if (typeof applyRoleChrome === "function") applyRoleChrome();
    renderDashboardStats();
    renderDashboardAnnouncements();
}

function escapeHtml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

async function changeOwnPassword(event) {
    if (event) event.preventDefault();
    const currentPassword = (document.getElementById("ownCurrentPassword") || {}).value;
    const newPassword = (document.getElementById("ownNewPassword") || {}).value;
    const confirm = (document.getElementById("ownConfirmPassword") || {}).value;
    if (!currentPassword || !newPassword) {
        showToast("Enter your current password and a new password.", "error");
        return;
    }
    if (newPassword !== confirm) {
        showToast("New password confirmation does not match.", "error");
        return;
    }
    try {
        await SAA_API.request("/api/auth/password", {
            method: "PUT",
            body: JSON.stringify({ currentPassword, newPassword })
        });
        ["ownCurrentPassword", "ownNewPassword", "ownConfirmPassword"].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });
        showToast("Password updated.", "success");
    } catch (err) {
        showToast(err.message || "Unable to update password.", "error");
    }
}

async function loadLoginActivity() {
    const box = document.getElementById("loginActivityList");
    if (!box || typeof SAA_API === "undefined") return;
    try {
        const data = await SAA_API.request("/api/auth/login-logs");
        const logs = data.logs || [];
        if (!logs.length) {
            box.innerHTML = `<p class="text-xs text-slate-400">No login activity recorded yet.</p>`;
            return;
        }
        box.innerHTML = logs.map((log) => `
            <div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <span class="text-xs font-semibold text-slate-700">${escapeHtml(log.action)}</span>
                <span class="text-[11px] text-slate-400">${escapeHtml(log.createdAt)}</span>
            </div>
        `).join("");
    } catch (err) {
        box.innerHTML = `<p class="text-xs text-slate-400">${escapeHtml(err.message)}</p>`;
    }
}

function settingsSectionsForRole(role) {
    const r = normalizeRole(role);
    if (r === "admin") {
        return ["general", "communications", "notifications", "ai", "security"];
    }
    if (r === "staff") return ["notifications", "security"];
    return ["notifications", "privacy", "security"];
}

function showSettingsTab(tab) {
    document.querySelectorAll("[data-settings-panel]").forEach((el) => {
        el.classList.toggle("hidden", el.getAttribute("data-settings-panel") !== tab);
    });
    document.querySelectorAll("[data-settings-tab]").forEach((btn) => {
        btn.classList.toggle("btn-primary", btn.getAttribute("data-settings-tab") === tab);
        btn.classList.toggle("btn-secondary", btn.getAttribute("data-settings-tab") !== tab);
    });
}

function openSecuritySettings() {
    switchView("settings");
    showSettingsTab("security");
}

async function loadSettingsView() {
    const allowed = settingsSectionsForRole(currentRole());
    document.querySelectorAll("[data-settings-tab]").forEach((btn) => {
        btn.classList.toggle("hidden", !allowed.includes(btn.getAttribute("data-settings-tab")));
    });
    document.querySelectorAll("[data-settings-panel]").forEach((el) => {
        const key = el.getAttribute("data-settings-panel");
        el.classList.toggle("hidden", !allowed.includes(key) || key !== allowed[0]);
    });
    showSettingsTab(allowed[0]);

    const prefs = JSON.parse(localStorage.getItem("saaNotifyPrefs") || "{}");
    ["prefSystem", "prefEmail", "prefSms", "prefDocs", "prefEvents", "prefJobs", "prefSurveys", "prefAnnounce"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.checked = prefs[id] !== false;
    });

    loadLoginActivity();

    if (!isAdminRole() || typeof SAA_API === "undefined") return;
    try {
        const data = await SAA_API.request("/api/settings");
        const s = data.settings || {};
        const setVal = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.value = value == null ? "" : value;
        };
        setVal("setSystemName", s.general && s.general.systemName);
        setVal("setSystemDescription", s.general && s.general.systemDescription);
        setVal("setInstitution", s.general && s.general.institution);
        setVal("setContact", s.general && s.general.contact);
        setVal("setAddress", s.general && s.general.address);
        setVal("setLanguage", s.general && s.general.language);
        setVal("setDateFormat", s.general && s.general.dateFormat);
        setVal("setTimeFormat", s.general && s.general.timeFormat);
        setVal("setTimeZone", s.general && s.general.timeZone);
    } catch (err) {
        showToast(err.message || "Unable to load system settings.", "error");
    }
}

function saveNotificationPrefs() {
    const prefs = {};
    ["prefSystem", "prefEmail", "prefSms", "prefDocs", "prefEvents", "prefJobs", "prefSurveys", "prefAnnounce"].forEach((id) => {
        const el = document.getElementById(id);
        prefs[id] = !!(el && el.checked);
    });
    localStorage.setItem("saaNotifyPrefs", JSON.stringify(prefs));
    showToast("Notification preferences saved on this device.", "success");
}

async function saveSystemSettings(event) {
    if (event) event.preventDefault();
    if (!isAdminRole()) {
        showToast("Only the System Administrator can change system-wide settings.", "error");
        return;
    }
    try {
        await SAA_API.request("/api/settings", {
            method: "PUT",
            body: JSON.stringify({
                general: {
                    systemName: document.getElementById("setSystemName").value,
                    systemDescription: document.getElementById("setSystemDescription").value,
                    institution: document.getElementById("setInstitution").value,
                    contact: document.getElementById("setContact").value,
                    address: document.getElementById("setAddress").value,
                    language: document.getElementById("setLanguage").value,
                    dateFormat: document.getElementById("setDateFormat").value,
                    timeFormat: document.getElementById("setTimeFormat").value,
                    timeZone: document.getElementById("setTimeZone").value
                }
            })
        });
        showToast("System settings saved.", "success");
        loadSettingsView();
    } catch (err) {
        showToast(err.message || "Unable to save system settings.", "error");
    }
}

async function loadUsersView() {
    const tbody = document.getElementById("usersTableBody");
    if (!tbody) return;
    if (!isAdminRole()) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-rose-600">Administrator access required.</td></tr>`;
        return;
    }
    try {
        const data = await SAA_API.request("/api/users");
        const users = data.users || [];
        if (!users.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-slate-400">No user accounts found.</td></tr>`;
            return;
        }
        tbody.innerHTML = users.map((u) => `
            <tr>
                <td class="font-bold">${escapeHtml(u.name)}</td>
                <td class="font-mono text-xs text-slate-500">${escapeHtml(u.userCode || "—")}</td>
                <td>${escapeHtml(u.username)}</td>
                <td>${escapeHtml(roleLabel(u.role))}</td>
                <td>${escapeHtml(u.email || "—")}</td>
                <td><span class="status-badge">${escapeHtml(u.status || "Active")}</span></td>
                <td class="space-x-2">
                    <button type="button" class="btn btn-secondary text-[10px] py-1 px-2" onclick="openEditUser(${u.id})">Edit</button>
                    <button type="button" class="text-rose-600 text-[10px] font-bold" onclick="deleteUserAccount(${u.id}, '${escapeHtml(u.username)}')">Remove</button>
                </td>
            </tr>
        `).join("");
        window._saaUsers = users;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-rose-600">${escapeHtml(err.message)}</td></tr>`;
    }
}

function openCreateUser() {
    document.getElementById("userFormTitle").textContent = "Create user account";
    document.getElementById("userFormId").value = "";
    document.getElementById("userFormName").value = "";
    document.getElementById("userFormUsername").value = "";
    document.getElementById("userFormUsername").disabled = false;
    document.getElementById("userFormEmail").value = "";
    document.getElementById("userFormContact").value = "";
    document.getElementById("userFormRole").value = "staff";
    document.getElementById("userFormStatus").value = "Active";
    document.getElementById("userFormPassword").value = "";
    document.getElementById("userFormModal").classList.add("active");
}

function openEditUser(id) {
    const user = (window._saaUsers || []).find((u) => Number(u.id) === Number(id));
    if (!user) return;
    document.getElementById("userFormTitle").textContent = "Edit user account";
    document.getElementById("userFormId").value = user.id;
    document.getElementById("userFormName").value = user.name || "";
    document.getElementById("userFormUsername").value = user.username || "";
    document.getElementById("userFormUsername").disabled = true;
    document.getElementById("userFormEmail").value = user.email || "";
    document.getElementById("userFormContact").value = user.contact || "";
    document.getElementById("userFormRole").value = normalizeRole(user.role);
    document.getElementById("userFormStatus").value = user.status || "Active";
    document.getElementById("userFormPassword").value = "";
    document.getElementById("userFormModal").classList.add("active");
}

function closeUserForm() {
    const modal = document.getElementById("userFormModal");
    if (modal) modal.classList.remove("active");
}

async function submitUserForm(event) {
    event.preventDefault();
    const id = document.getElementById("userFormId").value;
    const payload = {
        name: document.getElementById("userFormName").value.trim(),
        username: document.getElementById("userFormUsername").value.trim(),
        email: document.getElementById("userFormEmail").value.trim(),
        contact: document.getElementById("userFormContact").value.trim(),
        role: document.getElementById("userFormRole").value,
        status: document.getElementById("userFormStatus").value,
        password: document.getElementById("userFormPassword").value
    };
    try {
        if (id) {
            await SAA_API.request(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(payload) });
            showToast("User account updated.", "success");
        } else {
            if (!payload.password) {
                showToast("A password is required for new accounts.", "error");
                return;
            }
            await SAA_API.request("/api/users", { method: "POST", body: JSON.stringify(payload) });
            showToast("User account created.", "success");
        }
        closeUserForm();
        loadUsersView();
    } catch (err) {
        showToast(err.message || "Unable to save user account.", "error");
    }
}

async function deleteUserAccount(id, username) {
    if (!confirm(`Remove account "${username}"? This cannot be undone.`)) return;
    try {
        await SAA_API.request(`/api/users/${id}`, { method: "DELETE" });
        showToast("User account removed.", "success");
        loadUsersView();
    } catch (err) {
        showToast(err.message || "Unable to remove account.", "error");
    }
}

function announcementAudienceLabel(a) {
    const audience = a.audience || "alumni";
    if (audience === "all") return "All Users";
    if (audience === "staff") return "Admin & Registrar";
    if (audience === "batch") return `Batch ${a.batch || "—"}`;
    return "Alumni Only";
}

function isAnnouncementVisibleFor(a, role) {
    if ((a.status || "Published") !== "Published") return false;
    const today = new Date().toISOString().slice(0, 10);
    if (a.expires_at && a.expires_at < today) return false;
    const audience = a.audience || "alumni";
    if (role === "admin") return true;
    if (audience === "all") return true;
    if (role === "staff") return audience === "staff";
    if (audience === "alumni") return true;
    if (audience === "batch") return String((currentUser && currentUser.batch) || "") === String(a.batch || "");
    return false;
}

function populateAnnouncementBatchOptions() {
    const select = document.getElementById("announceBatch");
    if (!select) return;
    const batches = Array.from(new Set((alumniList || []).map((a) => String(a.batch || "").trim()).filter(Boolean)))
        .sort((a, b) => b.localeCompare(a));
    select.innerHTML = batches.length
        ? batches.map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("")
        : `<option value="">No batches available</option>`;
}

function toggleAnnouncementBatchField() {
    const audience = document.getElementById("announceAudience")?.value;
    const field = document.getElementById("announceBatchField");
    if (field) field.classList.toggle("hidden", audience !== "batch");
    if (audience === "batch") populateAnnouncementBatchOptions();
}

function renderAnnouncementsView() {
    const list = document.getElementById("announcementsPageList");
    const form = document.getElementById("announcementCompose");
    const canManage = isAdminRole() || isStaffRole();
    if (form) form.classList.toggle("hidden", !canManage);
    if (canManage) populateAnnouncementBatchOptions();
    if (!list) return;
    const visible = canManage
        ? announcementsList
        : announcementsList.filter((a) => isAnnouncementVisibleFor(a, currentRole()));
    if (!visible.length) {
        list.innerHTML = `<p class="text-sm text-slate-400 py-8 text-center">No announcements are available.</p>`;
        return;
    }
    list.innerHTML = visible.map((a) => `
        <article class="app-card overflow-hidden">
            ${a.imageUrl ? `<img src="${escapeHtml(a.imageUrl)}" alt="" class="w-full h-48 sm:h-64 object-cover">` : ""}
            <div class="p-5">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <h4 class="font-extrabold text-slate-800">${escapeHtml(a.title)}</h4>
                        <p class="text-xs text-slate-400 mt-1">${escapeHtml(a.status || "Published")} • ${escapeHtml(announcementAudienceLabel(a))}${a.status === "Scheduled" && a.publish_at ? ` • Publishes ${escapeHtml(a.publish_at)}` : ""}${a.expires_at ? ` • Expires ${escapeHtml(a.expires_at)}` : ""}</p>
                    </div>
                </div>
                <p class="text-sm text-slate-600 mt-3 whitespace-pre-wrap">${escapeHtml(a.body || "")}</p>
                ${canManage && a.status !== "Draft" ? `
                <div class="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    <span><i class="fa-solid fa-tower-broadcast text-[#801235] mr-1"></i>${escapeHtml(announcementChannelSummary(a))}</span>
                    <button type="button" class="text-[#801235] font-bold hover:underline" onclick="showAnnouncementDeliveryReport(${a.id})">Delivery Report</button>
                </div>
                <div id="announcementDeliveryReport_${a.id}" class="hidden mt-3 border border-slate-200 rounded-lg bg-slate-50/60 p-3"></div>` : ""}
            </div>
        </article>
    `).join("");
}

/** "Portal + Email + SMS" label for one announcement's selected channels. */
function announcementChannelSummary(item) {
    const channels = [];
    if (Number(item.send_in_app)) channels.push("Portal");
    if (Number(item.send_email)) channels.push("Email");
    if (Number(item.send_sms)) channels.push("SMS");
    return channels.length ? channels.join(" + ") : "No channels selected";
}

/** Maps a stored delivery status to a readable label and colour. */
function deliveryStatusLabel(status, selected) {
    const value = String(status || "");
    if (!selected) return { label: "Not selected", className: "text-slate-400" };
    if (value === "accepted") return { label: "Sent", className: "text-emerald-700 font-bold" };
    if (value === "failed") return { label: "Failed", className: "text-rose-600 font-bold" };
    if (value === "not_configured") return { label: "Service unavailable", className: "text-amber-600 font-bold" };
    if (value === "skipped") return { label: "Skipped (no contact)", className: "text-amber-600" };
    return { label: "Not attempted", className: "text-slate-400" };
}

async function showAnnouncementDeliveryReport(id) {
    const panel = document.getElementById(`announcementDeliveryReport_${id}`);
    if (!panel) return;
    panel.classList.remove("hidden");
    panel.innerHTML = `<p class="text-[11px] text-slate-500"><span class="fa-solid fa-spinner fa-spin mr-1"></span> Loading delivery report…</p>`;
    try {
        const data = await SAA_API.request(`/api/announcements/${id}/deliveries`);
        renderAnnouncementDeliveryReport(id, data);
    } catch (err) {
        panel.innerHTML = `<p class="text-[11px] text-rose-600">${escapeHtml(err.message || "Unable to load the delivery report.")}</p>`;
    }
}

function hideAnnouncementDeliveryReport(id) {
    const panel = document.getElementById(`announcementDeliveryReport_${id}`);
    if (!panel) return;
    panel.classList.add("hidden");
    panel.innerHTML = "";
}

/** Renders the per-channel delivery report returned by the API. */
function renderAnnouncementDeliveryReport(id, data) {
    const panel = document.getElementById(`announcementDeliveryReport_${id}`);
    if (!panel) return;
    const channels = data.channels || {};
    const summary = data.summary || {};
    const portal = summary.portal || {};
    const email = summary.email || {};
    const sms = summary.sms || {};
    const chip = (label, value, selected) => `
        <span class="px-2 py-1 rounded-full bg-white border border-slate-200 ${selected ? "text-emerald-700" : "text-slate-400"}">${escapeHtml(label)}: ${escapeHtml(value)}</span>`;
    const channelDetail = (totals) => [
        `${totals.accepted || 0} sent`,
        `${totals.failed || 0} failed`,
        totals.notAttempted ? `${totals.notAttempted} not attempted` : "",
        totals.notConfigured ? `${totals.notConfigured} service unavailable` : ""
    ].filter(Boolean).join(", ");
    const chipRow = [
        chip("Portal", channels.portal ? `${portal.delivered || 0} published, ${portal.read || 0} read` : "Not selected", channels.portal),
        chip("Email", channels.email ? channelDetail(email) : "Not selected", channels.email),
        chip("SMS", channels.sms ? channelDetail(sms) : "Not selected", channels.sms)
    ].join("");
    const rows = (data.recipients || []).map((row) => {
        const emailState = deliveryStatusLabel(row.emailStatus, channels.email);
        const smsState = deliveryStatusLabel(row.smsStatus, channels.sms);
        const portalState = row.portal
            ? `<span class="text-emerald-700 font-bold">Published${row.portalRead ? " • Read" : ""}</span>`
            : `<span class="text-slate-400">${channels.portal ? "Not delivered" : "Not selected"}</span>`;
        return `
        <tr>
            <td>${escapeHtml(row.name || "—")}</td>
            <td>${escapeHtml(row.email || row.contact || "—")}</td>
            <td>${portalState}</td>
            <td class="${emailState.className}">${escapeHtml(emailState.label)}${row.emailReason ? ` <span class="text-slate-400">(${escapeHtml(row.emailReason)})</span>` : ""}</td>
            <td class="${smsState.className}">${escapeHtml(smsState.label)}${row.smsReason ? ` <span class="text-slate-400">(${escapeHtml(row.smsReason)})</span>` : ""}</td>
        </tr>`;
    }).join("");
    panel.innerHTML = `
        <div class="flex flex-wrap items-center gap-2 text-[11px]">${chipRow}</div>
        <div class="data-table-container mt-3 max-h-64 overflow-y-auto">
            <table class="modern-table">
                <thead><tr><th>Recipient</th><th>Email / Contact</th><th>Portal</th><th>Email</th><th>SMS</th></tr></thead>
                <tbody>${rows || `<tr><td colspan="5" class="text-center text-slate-400">No delivery records yet.</td></tr>`}</tbody>
            </table>
        </div>
        <p class="text-[10px] text-slate-400 mt-2">${data.truncated ? "Showing the first 300 recipients. " : ""}&ldquo;Sent&rdquo; means the email or SMS provider accepted the message. Statuses are read from the system delivery logs.</p>
        <button type="button" class="btn btn-secondary text-[11px] mt-2" onclick="hideAnnouncementDeliveryReport(${id})">Close</button>
    `;
}

function toggleAnnouncementSchedule() {
    const scheduleField = document.getElementById("announcementScheduleField");
    const publishAt = document.getElementById("announcePublishAt");
    const scheduled = document.querySelector('input[name="announcementTiming"]:checked')?.value === "schedule";
    if (scheduleField) scheduleField.classList.toggle("hidden", !scheduled);
    if (publishAt) publishAt.required = scheduled;
}

async function publishAnnouncement(event) {
    event.preventDefault();
    const title = document.getElementById("announceTitle").value.trim();
    const body = document.getElementById("announceBody").value.trim();
    const action = event.submitter?.value || "publish";
    const timing = document.querySelector('input[name="announcementTiming"]:checked')?.value || "now";
    const localPublishAt = document.getElementById("announcePublishAt").value;
    const expiresAt = document.getElementById("announceExpiresAt").value;
    const audience = document.getElementById("announceAudience")?.value || "alumni";
    const batch = document.getElementById("announceBatch")?.value || "";
    const status = action === "draft" ? "Draft" : (timing === "schedule" ? "Scheduled" : "Published");
    if (!title || !body) {
        showToast("Title and message are required.", "error");
        return;
    }
    if (status === "Scheduled" && !localPublishAt) {
        showToast("Choose a publish date and time.", "error");
        return;
    }
    if (audience === "batch" && !batch) {
        showToast("Choose a batch year to target.", "error");
        return;
    }
    try {
        const result = await SAA_API.request("/api/announcements", {
            method: "POST",
            body: JSON.stringify({
                title,
                body,
                status,
                audience,
                batch: audience === "batch" ? batch : "",
                publishAt: status === "Scheduled" ? new Date(localPublishAt).toISOString() : "",
                expiresAt,
                sendInApp: document.getElementById("announceInApp").checked,
                sendEmail: document.getElementById("announceEmail").checked,
                sendSms: document.getElementById("announceSms").checked,
                imageData: newAnnouncementImageData
            })
        });
        event.target.reset();
        toggleAnnouncementSchedule();
        toggleAnnouncementBatchField();
        clearAnnouncementImagePreview();
        const outcome = result.notification;
        if (status === "Draft") showToast("Announcement saved as a draft.", "success");
        else if (status === "Scheduled") showToast("Announcement scheduled.", "success");
        else if (outcome && outcome.attempted) showToast(`Announcement published. Notifications attempted for ${outcome.attempted} alumni.`, "success");
        else showToast("Announcement published.", "success");
        if (SAA_API.refreshAllData) await SAA_API.refreshAllData();
        renderAnnouncementsView();
    } catch (err) {
        showToast(err.message || "Unable to save the announcement.", "error");
    }
}

/**
 * AI Compose for the Announcement Composer (OpenAI API via
 * /api/ai/compose-announcement). Falls back to an institutional template when
 * the API is offline. The admin always reviews the draft before publishing.
 */
async function aiComposeAnnouncement() {
    const topicInput = document.getElementById("announceAiTopic");
    const titleInput = document.getElementById("announceTitle");
    const bodyInput = document.getElementById("announceBody");
    const btn = document.getElementById("announceAiComposeBtn");
    if (!titleInput || !bodyInput) return;

    const topic = (topicInput?.value || titleInput.value || "").trim();
    if (!topic) {
        showToast("Enter an AI topic (or a title) first.", "error");
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="fa-solid fa-spinner fa-spin mr-1"></span> Drafting…';
    }

    try {
        let content = null;
        if (typeof SAA_API !== "undefined" && (await SAA_API.health())) {
            const data = await SAA_API.request("/api/ai/compose-announcement", {
                method: "POST",
                body: JSON.stringify({ topic, channel: "Announcement" })
            });
            if (data && data.content) content = data.content;
        }
        if (content === null) {
            // Local fallback template kept in the institution's notice format.
            content = `ST. AGNES ACADEMY OF CALOOCAN INC. NOTICE: Warm greetings! In line with "${topic}", we invite all Agnesian alumni to participate. Please check your Alumni Portal for the complete schedule and details. Caritas et Scientia.`;
        }
        if (!titleInput.value.trim()) titleInput.value = topic.slice(0, 160);
        bodyInput.value = content;
        showToast("AI-drafted announcement is ready. Review before publishing.", "success");
    } catch (err) {
        showToast("AI draft failed: " + (err.message || "unknown error"), "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles text-amber-500 mr-1"></i> Generate Draft';
        }
    }
}

function renderNotificationsPage() {
    const list = document.getElementById("notificationsPageList");
    const detail = document.getElementById("notificationDetailPanel");
    if (!list) return;
    const unread = Number(window.notificationUnreadCount || notificationsList.filter((n) => !n.isRead).length);
    const unreadLabel = document.getElementById("notificationsUnreadLabel");
    if (unreadLabel) unreadLabel.textContent = String(unread);
    if (typeof updateNotificationBadge === "function") updateNotificationBadge();
    if (detail && !currentDetailId) detail.classList.add("hidden");
    if (!notificationsList.length) {
        list.innerHTML = `<p class="text-sm text-slate-400 py-8 text-center">No notifications yet.</p>`;
        list.classList.remove("hidden");
        return;
    }
    list.classList.toggle("hidden", Boolean(currentDetailId && detail && !detail.classList.contains("hidden")));
    list.innerHTML = notificationsList.map((n) => `
        <div class="flex items-start justify-between gap-3 py-3 border-b border-slate-100 ${n.isRead ? "" : "bg-rose-50/60 -mx-2 px-2 rounded-lg"}">
            <button type="button" class="text-left flex-1" onclick="openNotificationRecord(${n.id})">
                <div class="flex items-center gap-2">
                    ${n.isRead ? "" : `<span class="w-2 h-2 rounded-full bg-[#801235] flex-shrink-0"></span>`}
                    <p class="text-sm ${n.isRead ? "font-semibold text-slate-700" : "font-extrabold text-slate-900"}">${escapeHtml(n.subject)}</p>
                </div>
                <p class="text-xs text-slate-500 mt-1">${escapeHtml(n.message || "")}</p>
                <p class="text-[11px] text-slate-400 mt-1">${escapeHtml(n.notificationType || n.channel || "system")} • ${n.isRead ? "Read" : "Unread"} • ${escapeHtml(n.date || "")}</p>
            </button>
            <div class="flex flex-col gap-1 text-[10px] font-bold">
                <button type="button" class="text-[#801235]" onclick="openNotificationRecord(${n.id})">View</button>
                <button type="button" class="text-slate-500" onclick="event.stopPropagation(); toggleNotificationRead(${n.id}, ${n.isRead ? "false" : "true"})">${n.isRead ? "Mark unread" : "Mark read"}</button>
                <button type="button" class="text-rose-600" onclick="event.stopPropagation(); deleteNotificationRecord(${n.id})">Delete</button>
            </div>
        </div>
    `).join("");
}

function closeNotificationDetail() {
    const list = document.getElementById("notificationsPageList");
    const detail = document.getElementById("notificationDetailPanel");
    if (detail) detail.classList.add("hidden");
    if (list) list.classList.remove("hidden");
    if (typeof switchView === "function") switchView("notifications", { replace: true });
}

function showNotificationDetail(n) {
    const list = document.getElementById("notificationsPageList");
    const detail = document.getElementById("notificationDetailPanel");
    if (!detail || !n) return;
    if (list) list.classList.add("hidden");
    detail.classList.remove("hidden");
    document.getElementById("notificationDetailType").textContent = n.notificationType || n.relatedType || n.channel || "system";
    document.getElementById("notificationDetailTitle").textContent = n.subject || n.title || "Notification";
    document.getElementById("notificationDetailMessage").textContent = n.message || "";
    document.getElementById("notificationDetailMeta").textContent = `${n.isRead ? "Read" : "Unread"} • ${n.date || n.createdAt || ""}`;
    const actions = document.getElementById("notificationDetailActions");
    const relatedId = n.relatedId;
    const type = String(n.relatedType || "").toLowerCase();
    if (actions) {
        actions.innerHTML = relatedId && type
            ? `<button type="button" class="btn btn-primary text-xs" onclick="openRelatedFromNotification('${escapeHtml(type)}', '${escapeHtml(String(relatedId))}')">View related record</button>`
            : "";
    }
}

async function openRelatedFromNotification(type, relatedId) {
    await navigateNotificationTarget(type, relatedId, false);
}

async function navigateNotificationTarget(type, relatedId, missing) {
    const id = relatedId == null || relatedId === "" || relatedId === "0" ? "" : String(relatedId);
    const kind = String(type || "").toLowerCase();
    if (missing || !kind || !id) return false;
    if (kind === "transcript" || kind === "document") {
        switchView("transcript", { detailId: id });
        if (typeof showTranscriptDetails === "function") await showTranscriptDetails(id, true);
        return true;
    }
    if (kind === "reprint") {
        switchView("reprint", { detailId: id });
        if (typeof showReprintDetails === "function") await showReprintDetails(id, true);
        return true;
    }
    if (kind === "event") {
        switchView("events", { detailId: id });
        if (typeof showEventDetails === "function") await showEventDetails(id, true);
        return true;
    }
    if (kind === "job") {
        switchView("job-opportunities", { detailId: id });
        if (typeof showJobDetails === "function") await showJobDetails(id, true);
        return true;
    }
    if (kind === "announcement") {
        switchView("announcements", { detailId: id });
        if (typeof showAnnouncementDetails === "function") showAnnouncementDetails(id, true);
        return true;
    }
    if (kind === "survey" || kind === "feedback") {
        switchView("feedback", { detailId: id });
        return true;
    }
    if (kind === "payment") {
        try {
            const rec = await SAA_API.request(`/api/payments/${id}/receipt`);
            if (rec && rec.payment) {
                switchView("payment-receipt", { detailId: id });
                return true;
            }
        } catch (e) { /* unpaid payments open the QR page */ }
        switchView("payment", { detailId: id });
        return true;
    }
    if (kind === "application") {
        const allowed = typeof allowedViewsFor === "function" ? allowedViewsFor(currentRole()) : [];
        if (allowed.length && !allowed.includes("applications")) {
            /* Admin/Registrar manage the posting, not the alumnus personal record. */
            try {
                const data = await SAA_API.request("/api/applications");
                const record = (data.applications || []).find((row) => Number(row.id) === Number(id));
                if (record && Number(record.job_id)) {
                    switchView("job-opportunities", { detailId: record.job_id });
                    if (typeof showJobDetails === "function") await showJobDetails(record.job_id, true);
                    showToast("Opened the job posting for this application.", "info");
                    return true;
                }
            } catch (e) { /* fall through to the job list */ }
            switchView("job-opportunities");
            return true;
        }
        switchView("applications", { detailId: id });
        return true;
    }
    return false;
}

async function openNotificationRecord(id) {
    try {
        if (typeof closeNotificationCenterModal === "function") closeNotificationCenterModal();
        const data = await SAA_API.request(`/api/notifications/${id}/open`, { method: "POST" });
        window.notificationUnreadCount = Number(data.unreadCount || 0);
        const n = Object.assign({}, data.notification || {});
        n.isRead = true;
        const idx = notificationsList.findIndex((row) => String(row.id) === String(id));
        if (idx >= 0) notificationsList[idx] = Object.assign({}, notificationsList[idx], n, { isRead: true });
        if (typeof updateNotificationBadge === "function") updateNotificationBadge();
        const relatedType = n.relatedType || (data.target && data.target.view) || "";
        const relatedId = n.relatedId || "";
        const opened = await navigateNotificationTarget(relatedType, relatedId, data.relatedMissing);
        if (!opened) {
            switchView("notifications", { detailId: String(id) });
            showNotificationDetail(Object.assign({}, n, {
                date: n.createdAt || n.date || ""
            }));
        }
    } catch (err) {
        showToast(err.message || "Unable to open this notification.", "error");
    }
}

async function refreshNotificationsFromServer() {
    if (!SAA_API.refreshAllData) return;
    await SAA_API.refreshAllData();
    renderNotificationsPage();
}

async function toggleNotificationRead(id, makeRead) {
    try {
        const path = makeRead ? `/api/notifications/${id}/read` : `/api/notifications/${id}/unread`;
        const data = await SAA_API.request(path, { method: "POST" });
        window.notificationUnreadCount = Number(data.unreadCount || 0);
        if (SAA_API.refreshAllData) await SAA_API.refreshAllData();
        renderNotificationsPage();
    } catch (err) {
        showToast(err.message || "Unable to update notification.", "error");
    }
}

async function markAllNotificationsRead() {
    try {
        const data = await SAA_API.request("/api/notifications/read-all", { method: "POST" });
        window.notificationUnreadCount = Number(data.unreadCount || 0);
        if (SAA_API.refreshAllData) await SAA_API.refreshAllData();
        renderNotificationsPage();
        showToast("All notifications marked as read.", "success");
    } catch (err) {
        showToast(err.message || "Unable to mark notifications as read.", "error");
    }
}

async function deleteNotificationRecord(id) {
    try {
        const data = await SAA_API.request(`/api/notifications/${id}`, { method: "DELETE" });
        window.notificationUnreadCount = Number(data.unreadCount || 0);
        if (SAA_API.refreshAllData) await SAA_API.refreshAllData();
        renderNotificationsPage();
    } catch (err) {
        showToast(err.message || "Unable to delete notification.", "error");
    }
}

function showAnnouncementDetails(id, silent) {
    const item = (announcementsList || []).find((a) => String(a.id) === String(id));
    if (!item) return;
    renderAnnouncementsView();
    const list = document.getElementById("announcementsPageList");
    if (list) {
        const cards = list.querySelectorAll("article");
        cards.forEach((card, idx) => {
            if (String((announcementsList[idx] || {}).id) === String(id)) {
                card.classList.add("ring-2", "ring-[#801235]");
                card.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        });
    }
    if (!silent) switchView("announcements", { detailId: id });
}

function renderRequestStatusView() {
    const box = document.getElementById("requestStatusList");
    if (!box) return;
    const rows = []
        .concat((transcriptRequests || []).map((r) => ({ kind: "Transcript", id: r.id, name: r.name, status: r.status, date: r.date, extra: r.purpose })))
        .concat((reprintRequests || []).map((r) => ({ kind: "Certificate Reprint", id: r.id, name: r.name, status: r.status, date: "", extra: r.type })));
    if (!rows.length) {
        box.innerHTML = `<tr><td colspan="5" class="text-center text-slate-400">You have no document requests yet.</td></tr>`;
        return;
    }
    box.innerHTML = rows.map((r) => `
        <tr>
            <td>${escapeHtml(r.kind)} #${escapeHtml(r.id)}</td>
            <td>${escapeHtml(r.extra || "—")}</td>
            <td>${escapeHtml(r.date || "—")}</td>
            <td><span class="status-badge">${escapeHtml(r.status)}</span></td>
            <td>${escapeHtml(r.name)}</td>
        </tr>
    `).join("");
}

/** Opens the job listing an application refers to (My Applications > View). */
function openJobFromApplication(id) {
    switchView("job-opportunities", { detailId: id });
    if (typeof showJobDetails === "function") showJobDetails(id, true);
}

async function loadApplicationsView() {
    const box = document.getElementById("applicationsTableBody");
    if (!box) return;
    try {
        const data = await SAA_API.request("/api/applications");
        const rows = data.applications || [];
        applicationsList = rows;
        if (!rows.length) {
            box.innerHTML = `<tr><td colspan="5" class="text-center text-slate-400">You have not submitted any job applications yet.</td></tr>`;
            return;
        }
        box.innerHTML = rows.map((r) => {
            const jobId = Number(r.job_id) || 0;
            const listingOpen = jobId > 0 && (jobsList || []).some((job) => Number(job.id) === jobId);
            return `
            <tr>
                <td>${escapeHtml(r.title || "—")}</td>
                <td>${escapeHtml(r.company || "—")}</td>
                <td>${escapeHtml(r.created_at || r.createdAt || "—")}</td>
                <td><span class="status-badge">Submitted</span></td>
                <td>${listingOpen ? `<button type="button" class="btn btn-secondary text-xs" onclick="openJobFromApplication(${jobId})">View</button>` : `<span class="text-xs text-slate-400">Listing closed</span>`}</td>
            </tr>`;
        }).join("");
    } catch (err) {
        box.innerHTML = `<tr><td colspan="5" class="text-center text-rose-600">${escapeHtml(err.message)}</td></tr>`;
    }
}

const communicationRecipients = { SMS: [], EMAIL: [] };
const communicationSelectedRecipients = { SMS: new Set(), EMAIL: new Set() };

function updateCommunicationRecipientUI(channel) {
    const kind = String(channel).toUpperCase();
    const mode = document.querySelector(`input[name="${kind.toLowerCase()}RecipientMode"]:checked`)?.value || "individual";
    const picker = document.getElementById(`${kind.toLowerCase()}RecipientPicker`);
    const select = document.getElementById(`${kind.toLowerCase()}Recipients`);
    if (!picker || !select) return;
    const allRecipients = mode === "all";
    picker.classList.toggle("hidden", allRecipients);
    select.multiple = mode === "selected";
    select.required = !allRecipients;
    select.size = mode === "individual" ? 1 : 5;
    if (mode !== "selected" && communicationSelectedRecipients[kind].size > 1) {
        communicationSelectedRecipients[kind] = new Set();
    }
    filterCommunicationRecipients(kind);
}

function rememberCommunicationRecipients(channel) {
    const kind = String(channel).toUpperCase();
    const select = document.getElementById(`${kind.toLowerCase()}Recipients`);
    if (!select) return;
    communicationSelectedRecipients[kind] = new Set(Array.from(select.selectedOptions).map((option) => String(option.value)));
}

function filterCommunicationRecipients(channel) {
    const kind = String(channel).toUpperCase();
    const search = String(document.getElementById(`${kind.toLowerCase()}RecipientSearch`)?.value || "").toLowerCase().trim();
    const select = document.getElementById(`${kind.toLowerCase()}Recipients`);
    if (!select) return;
    const selected = communicationSelectedRecipients[kind];
    const rows = communicationRecipients[kind] || [];
    select.innerHTML = rows.filter((recipient) => {
        const text = `${recipient.name || ""} ${recipient.batch || ""} ${recipient.email || ""}`.toLowerCase();
        return !search || text.includes(search);
    }).map((recipient) => `<option value="${escapeHtml(recipient.id)}" ${selected.has(String(recipient.id)) ? "selected" : ""}>${escapeHtml(recipient.name)}${recipient.batch ? ` • ${escapeHtml(recipient.batch)}` : ""}${recipient.email ? ` — ${escapeHtml(recipient.email)}` : ""}</option>`).join("");
}

function applyCommunicationTemplate(channel) {
    const kind = String(channel).toUpperCase();
    const template = document.getElementById("smsTemplate")?.value;
    const messages = {
        announcement: "St. Agnes Alumni: A new announcement is available. Log in to the Alumni Portal for details.",
        event: "St. Agnes Alumni: A new school event is available. Log in to the Alumni Portal for details.",
        profile: "St. Agnes Alumni: Please log in to the Alumni Portal to update your alumni profile."
    };
    const message = messages[template];
    if (kind === "SMS" && message) {
        document.getElementById("smsMessage").value = message.slice(0, 160);
        updateSmsCharacterCount();
    }
}

function updateSmsCharacterCount() {
    const message = document.getElementById("smsMessage");
    const counter = document.getElementById("smsCharacterCount");
    if (!message || !counter) return;
    const length = message.value.length;
    counter.textContent = `Characters: ${length} / 160 • Estimated SMS: ${length ? Math.ceil(length / 160) : 0}`;
}

async function loadCommunicationRecipients() {
    const data = await SAA_API.request("/api/notifications/communications/recipients");
    communicationRecipients.SMS = data.recipients || [];
    communicationRecipients.EMAIL = communicationRecipients.SMS;
    filterCommunicationRecipients("SMS");
    filterCommunicationRecipients("EMAIL");
    updateCommunicationRecipientUI("SMS");
    updateCommunicationRecipientUI("EMAIL");
}

function renderCommunicationHistory(channel, messages) {
    const kind = String(channel).toUpperCase();
    const tbody = document.getElementById(kind === "SMS" ? "smsHistoryList" : "emailHistoryList");
    if (!tbody) return;
    const rows = (messages || []).filter((row) => row.channel === kind);
    tbody.innerHTML = rows.length ? rows.map((row) => `
        <tr>
            <td>${escapeHtml(row.recipient || "—")}</td>
            <td>${escapeHtml(row.title || "—")}</td>
            <td>${escapeHtml(row.createdAt || "—")}</td>
            <td>${escapeHtml(row.status || "Unknown")}</td>
        </tr>
    `).join("") : `<tr><td colspan="4" class="text-center text-slate-400">No delivery history yet.</td></tr>`;
}

async function loadCommunicationHistory() {
    const data = await SAA_API.request("/api/notifications/communications/history");
    renderCommunicationHistory("SMS", data.messages || []);
    renderCommunicationHistory("EMAIL", data.messages || []);
}

async function logInternalMessage(event, channel) {
    event.preventDefault();
    const kind = String(channel).toUpperCase();
    const prefix = kind.toLowerCase();
    const recipientMode = document.querySelector(`input[name="${prefix}RecipientMode"]:checked`)?.value || "individual";
    rememberCommunicationRecipients(kind);
    const userIds = recipientMode === "all" ? [] : Array.from(communicationSelectedRecipients[kind]).map(Number);
    const subject = kind === "EMAIL" ? document.getElementById("emailSubject").value.trim() : "";
    const message = document.getElementById(kind === "SMS" ? "smsMessage" : "emailBody").value.trim();
    if (recipientMode !== "all" && !userIds.length) {
        showToast("Select at least one Alumni recipient.", "error");
        return;
    }
    if (!message || (kind === "EMAIL" && !subject)) {
        showToast(kind === "EMAIL" ? "Subject and message are required." : "Message is required.", "error");
        return;
    }
    const recipientCount = recipientMode === "all"
        ? communicationRecipients[kind].length
        : userIds.length;
    if (!recipientCount) {
        showToast("There are no active Alumni recipients available.", "error");
        return;
    }
    if (!confirm(`Send ${kind} to ${recipientCount} Alumni recipient${recipientCount === 1 ? "" : "s"}?`)) return;
    try {
        let attachment;
        if (kind === "EMAIL") {
            const file = document.getElementById("emailAttachment").files?.[0];
            if (file) {
                if (file.type !== "application/pdf" || file.size > 1048576) {
                    showToast("Choose a PDF attachment no larger than 1 MB.", "error");
                    return;
                }
                const bytes = new Uint8Array(await file.arrayBuffer());
                let binary = "";
                for (let i = 0; i < bytes.length; i += 0x8000) {
                    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
                }
                attachment = { filename: file.name, contentType: file.type, contentBase64: btoa(binary) };
            }
        }
        const data = await SAA_API.request("/api/notifications/communications/send", {
            method: "POST",
            body: JSON.stringify({ channel: kind, recipientMode, userIds, subject, message, attachment })
        });
        showToast(`${kind}: ${data.accepted} accepted, ${data.failed} failed or unavailable, ${data.attempted} attempted.`, data.failed ? "info" : "success");
        await Promise.all([loadCommunicationRecipients(), loadCommunicationHistory()]);
        event.target.reset();
        updateCommunicationRecipientUI(kind);
        updateSmsCharacterCount();
    } catch (err) {
        showToast(err.message || "Unable to send the message.", "error");
    }
}

async function loadMessageConfigStatus() {
    try {
        const health = await fetch((window.SAA_API && SAA_API.base ? SAA_API.base : "") + "/api/health").then((r) => r.json());
        const sms = document.getElementById("smsConfigStatus");
        const email = document.getElementById("emailConfigStatus");
        if (sms) sms.textContent = health.sms && health.sms.configured
            ? `SMS provider (${health.sms.provider}) is configured. Status will show Accepted or Failed after send.`
            : "SMS service is currently unavailable. Please contact the system administrator.";
        if (email) email.textContent = health.mail && health.mail.configured
            ? "Email service is available. Delivery status will show whether the provider accepted the message."
            : "Email service is currently unavailable. Please contact the system administrator.";
    } catch (e) {
        const sms = document.getElementById("smsConfigStatus");
        const email = document.getElementById("emailConfigStatus");
        if (sms) sms.textContent = "Unable to check SMS service availability.";
        if (email) email.textContent = "Unable to check email service availability.";
    }
    try {
        await Promise.all([loadCommunicationRecipients(), loadCommunicationHistory()]);
    } catch (err) {
        showToast(err.message || "Unable to load communication recipients or delivery history.", "error");
    }
    updateSmsCharacterCount();
}

function renderUnauthorizedView() {
    const who = roleLabel(currentRole());
    const el = document.getElementById("unauthorizedRoleLabel");
    if (el) el.textContent = who;
}
