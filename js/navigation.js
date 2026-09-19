/* navigation.js - View routing (switchView), counters, profile and page navigation. */

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 3337-3612 */
/* ------------------------------------------------------------------------- */
    /* Navigation Controller */
    function switchView(viewId) {
        const allowed = rolePermissions[currentUser ? currentUser.role : "admin"];
        if (allowed && !allowed.includes(viewId)) {
            showToast("You do not have permission to access that section.", "error");
            return;
        }

        // Hide all views
        const views = [
            "dashboard", "database", "profile", "job-opportunities", "transcript", "reprint",
            "tracking", "placement", "events", "reunions", "donor", "newsletter", "feedback", 
            "reports", "verification", "request-approval", "document-processing", "release-claiming", 
            "request-history", "registrar-reports", "academic-records"
        ];

        views.forEach(v => {
            const el = document.getElementById(`view-${v}`);
            if (el) el.classList.add("hidden");
        });

        const targetView = document.getElementById(`view-${viewId}`);
        if (targetView) targetView.classList.remove("hidden");

        // Update active class on nav links
        const navLinks = document.querySelectorAll(".sidebar-link");
        navLinks.forEach(l => l.classList.remove("active"));

        const activeNavBtn = document.getElementById(`nav-${viewId}`) ||
                             document.getElementById(`alumni-nav-${viewId}`) ||
                             document.getElementById(`registrar-nav-${viewId}`);
        if (activeNavBtn) activeNavBtn.classList.add("active");

        document.getElementById("currentViewTitle").textContent = formatViewTitle(viewId);

        if (window.innerWidth < 768) {
            document.getElementById("sidebarDrawer").classList.add("-translate-x-full");
            document.getElementById("drawerOverlay").classList.add("hidden");
        }

        // Trigger view renderers
        if (viewId === "dashboard") renderDashboardPanels();
        if (viewId === "profile") loadAlumniProfile();
        if (viewId === "job-opportunities" && typeof renderJobBoard === "function") renderJobBoard();
        if (viewId === "database") renderAlumniTable();
        if (viewId === "transcript") renderTranscriptRequests();
        if (viewId === "reprint") renderReprintRequests();
        if (viewId === "tracking") {
            renderTrackingCharts();
            renderOutdatedProfilesTable();
        }
        if (viewId === "placement") renderPlacementLogs();
        if (viewId === "events") renderEventsGrid();
        if (viewId === "reunions") renderReunionsGrid();
        if (viewId === "newsletter") renderNewsletterArchive();
        if (viewId === "academic-records") renderAcademicRecords();
        if (viewId === "reports") {
            updateReports();
            if (typeof refreshAiStatus === "function") refreshAiStatus();
        }
        if (viewId === "request-approval") renderRequestApproval();
        if (viewId === "document-processing") renderDocumentPreparation();
        if (viewId === "release-claiming") renderReleaseClaiming();
        if (viewId === "request-history") renderRequestHistory();
        if (viewId === "registrar-reports") updateRegistrarReports();
    }

    function formatViewTitle(id) {
        const titles = {
            dashboard: "Dashboard Overview",
            database: "Alumni Records Database",
            profile: "My Alumni Profile",
            "job-opportunities": "Job Opportunities Board",
            transcript: "Transcript Request Portal",
            reprint: "Certificate Reprint Requests",
            tracking: "Graduate Tracking Analytics",
            placement: "Job Placement Logs",
            events: "Alumni Events Registration",
            reunions: "Batch Reunions Manager",
            donor: "Donor Campaign Portal",
            newsletter: "Alumni Newsletter Broadcast",
            feedback: "Alumni Surveys & Feedback",
            reports: "System Reports & Statistics",
            verification: "Alumni Record Verification",
            "request-approval": "Request Approval Queue",
            "document-processing": "Document Preparation",
            "release-claiming": "Release & Claiming Records",
            "request-history": "Request History Log",
            "registrar-reports": "Registrar Processing Reports",
            "academic-records": "Academic Records"
        };
        return titles[id] || "Alumni Portal";
    }

    /* Counters */
    function updateStatCounters() {
        const totalEl = document.getElementById("stat-total");
        if (totalEl) totalEl.textContent = (alumniList.length + 5240).toLocaleString();

        const empCount = alumniList.filter(a => a.status === "Employed").length + 1890;
        const empEl = document.getElementById("stat-employed");
        if (empEl) empEl.textContent = empCount.toLocaleString();

        const eventsEl = document.getElementById("stat-events");
        if (eventsEl) eventsEl.textContent = eventsList.length;
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
    function loadAlumniProfile() {
        const saved = JSON.parse(localStorage.getItem("alumniProfile") || "{}");
        const name = saved.name || currentUser.name || "Maria Clara Santos";
        const photoUrl = saved.photoUrl || currentUser.photoUrl || "";

        document.getElementById("profileName").value = name;
        document.getElementById("profileHeadingName").textContent = name;
        document.getElementById("profileEmail").value = saved.email || currentUser.email || "alumni@stagnes.edu.ph";
        document.getElementById("profileContact").value = saved.contact || "+63 917 888 9999";
        document.getElementById("profileBatch").value = saved.batch || currentUser.batch || "2024";
        document.getElementById("profileProgram").value = saved.program || currentUser.program || "BS Information Technology";
        document.getElementById("profileEmployment").value = saved.employment || "Employed";
        document.getElementById("profileCompany").value = saved.company || "TechSolutions Inc.";
        document.getElementById("profileJobTitle").value = saved.jobTitle || "Software Engineer";
        document.getElementById("profileAdviser").value = saved.adviser || "";
        document.getElementById("profileSection").value = saved.section || "";

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

    function saveAlumniProfile() {
        const savedProfile = JSON.parse(localStorage.getItem("alumniProfile") || "{}");
        const profile = {
            name: document.getElementById("profileName").value.trim() || currentUser.name,
            email: document.getElementById("profileEmail").value.trim(),
            contact: document.getElementById("profileContact").value.trim(),
            batch: document.getElementById("profileBatch").value,
            program: document.getElementById("profileProgram").value.trim(),
            employment: document.getElementById("profileEmployment").value,
            company: document.getElementById("profileCompany").value.trim(),
            jobTitle: document.getElementById("profileJobTitle").value.trim(),
            adviser: document.getElementById("profileAdviser").value.trim(),
            section: document.getElementById("profileSection").value.trim(),
            photoUrl: currentUser.photoUrl || savedProfile.photoUrl || ""
        };

        localStorage.setItem("alumniProfile", JSON.stringify(profile));
        currentUser.name = profile.name;
        currentUser.batch = profile.batch;
        currentUser.program = profile.program;
        currentUser.email = profile.email;
        currentUser.photoUrl = profile.photoUrl;

        sessionStorage.setItem("currentUser", JSON.stringify(currentUser));
        if (accounts[currentUser.username]) {
            accounts[currentUser.username] = { ...accounts[currentUser.username], ...profile };
        }
        updateLocalStorage();

        document.getElementById("headerUserName").textContent = profile.name;
        document.getElementById("welcomeName").textContent = profile.name;
        document.getElementById("profileHeadingName").textContent = profile.name;
        renderDashboardRecordCard();
        showToast("Profile details successfully updated.", "success");
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
    function goToLoginPage() {
        const homePage = document.getElementById("homePage");
        const loginPage = document.getElementById("loginPage");
        const dashboardPage = document.getElementById("dashboardPage");
        
        if (homePage) homePage.classList.add("hidden");
        if (loginPage) loginPage.classList.remove("hidden");
        if (dashboardPage) dashboardPage.classList.add("hidden");
        
        window.scrollTo(0, 0);
        showToast("Welcome to SAA Alumni Management System! Please sign in.", "info");
    }

    /**
     * Navigate to registration modal via login page
     */
    function goToRegister() {
        goToLoginPage();
        setTimeout(() => {
            openSelfRegisterModal();
        }, 300);
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

    /**
     * Return to homepage from any page
     */
    function goBackToHomepage() {
        const homePage = document.getElementById("homePage");
        const loginPage = document.getElementById("loginPage");
        const dashboardPage = document.getElementById("dashboardPage");
        
        if (homePage) homePage.classList.remove("hidden");
        if (loginPage) loginPage.classList.add("hidden");
        if (dashboardPage) dashboardPage.classList.add("hidden");
        
        closeSelfRegisterModal();
        closeOfficialCertModal();
        closeClaimStubModal();
        window.scrollTo(0, 0);
    }

/* ------------------------------------------------------------------------- */
/* Portal-style dashboard: record / adviser cards + paginated announcements   */
/* ------------------------------------------------------------------------- */

    /* Notices shown when the newsletter archive has no published entries yet. */
    const dashboardAnnouncements = [
        {
            title: "Alumni Homecoming 2026: Save the Date",
            date: "June 2026",
            author: "Alumni Relations Office",
            body: "The Agnesian Grand Homecoming returns to the SAA Main Campus Grounds. Batch coordinators are requested to submit their attendance mastersheets early so that reunion tables and kits can be prepared. Pre-registration is open in the Alumni Events section of this portal."
        },
        {
            title: "CHED Tracer Study: Update Your Employment Status",
            date: "May 2026",
            author: "Graduate Tracking Unit",
            body: "All graduates of the last five years are requested to update their employment details in Graduate Tracking. The consolidated CHED tracer report is generated from these records, so kindly confirm your employer, job title and industry before the end of the month."
        },
        {
            title: "Transcript and Diploma Requests: Online Processing",
            date: "April 2026",
            author: "Office of the Registrar",
            body: "Official transcripts of records and diploma reprints can now be requested online. Submit the request through the Transcript Request or Certificate Reprint page, wait for the approval notification, then claim the document at the registrar releasing window."
        },
        {
            title: "Scholarship Endowment Drive for Agnesian Scholars",
            date: "March 2026",
            author: "Alumni Relations Office",
            body: "The alumni association is raising funds for the endowment programme that supports deserving students. Small recurring pledges are welcome, and every donation is acknowledged in the annual alumni report and in the donor honour roll."
        },
        {
            title: "Career Fair 2026: Partner Companies Now Hiring",
            date: "February 2026",
            author: "Career Placement Center",
            body: "Alumni who are hiring are invited to post vacancies on the Job Board. Graduates looking for new opportunities may submit applications online and upload an updated resume through their alumni profile page."
        },
        {
            title: "Alumni ID and Discount Card Renewal",
            date: "January 2026",
            author: "Alumni Relations Office",
            body: "Renewal of the alumni identification and partner discount card is open at the alumni desk. Present proof of graduation and one valid government identification. Renewed cards are released within five working days."
        },
        {
            title: "Batch Reunion Committee: Call for Volunteers",
            date: "December 2025",
            author: "Batch Reunions Committee",
            body: "Batch representatives from the silver, ruby and golden jubilee batches are needed to coordinate reunion programmes, venue arrangements and memorabilia. Register your interest at the alumni desk or through the Batch Reunions page."
        }
    ];

    /* Pagination and expansion state of the dashboard announcement feed. */
    const dashboardFeed = {
        page: 1,
        pageSize: 10,
        items: [],
        expanded: {},
        serverItems: [],
        serverLoaded: false
    };

    /** Escapes announcement text so published newsletters cannot inject markup. */
    function escapeAnnouncementText(value) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    /** Formats a newsletter timestamp (e.g. "2026-09-19 10:58:11") for display. */
    function formatAnnouncementDate(value) {
        if (!value) return "Recent";
        const parsed = new Date(String(value).replace(" ", "T"));
        if (isNaN(parsed.getTime())) return String(value);
        return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    }

    /** Normalises API and local newsletter shapes into one announcement shape. */
    function normaliseAnnouncement(raw, source) {
        const item = raw || {};
        return {
            title: item.subject || item.title || "Untitled announcement",
            body: item.body || item.snippet || "",
            date: item.date || formatAnnouncementDate(item.sentAt),
            author: item.author || "Alumni Relations Office",
            reads: item.reads || "",
            source: source
        };
    }

    /** Server archive + locally composed newsletters + the built-in notices. */
    function buildAnnouncementFeed() {
        const items = [];
        const seen = {};
        const add = (item) => {
            const key = String(item.title || "").toLowerCase();
            if (!key || seen[key]) return;
            seen[key] = true;
            items.push(item);
        };

        dashboardFeed.serverItems.forEach(n => add(normaliseAnnouncement(n, "server")));

        let local = [];
        try {
            local = JSON.parse(localStorage.getItem("saaNewsletters")) || [];
        } catch (e) {
            local = [];
        }
        local.forEach(n => add(normaliseAnnouncement(n, "local")));

        dashboardAnnouncements.forEach(n => add(normaliseAnnouncement(n, "default")));
        return items;
    }

    /** Entry point used by switchView("dashboard"). */
    function renderDashboardPanels() {
        renderDashboardRecordCard();
        renderAnnouncementFeed();
        loadDashboardAnnouncementsFromServer();
    }

    /** Fills the left record card and the right adviser / alumni desk card. */
    function renderDashboardRecordCard() {
        const saved = JSON.parse(localStorage.getItem("alumniProfile") || "{}");
        const role = currentUser ? currentUser.role : "alumni";
        const isAlumni = role === "alumni";
        const name = (isAlumni && saved.name) || (currentUser && currentUser.name) || "Alumni";

        const nameEl = document.getElementById("dashRecordName");
        if (nameEl) nameEl.textContent = name;

        const subtitleEl = document.getElementById("dashRecordSubtitle");
        if (subtitleEl) subtitleEl.textContent = (currentUser && currentUser.title) || (isAlumni ? "Alumnus" : "Staff");

        const avatarEl = document.getElementById("dashRecordAvatar");
        const photoUrl = (currentUser && currentUser.photoUrl) || saved.photoUrl || "";
        if (avatarEl) {
            if (photoUrl) avatarEl.innerHTML = `<img src="${photoUrl}" class="avatar-img" alt="">`;
            else avatarEl.textContent = initialsFromName(name);
        }

        if (isAlumni) {
            fillDashboardRows("dashRecordRows", [
                ["Course / Program", saved.program || (currentUser && currentUser.program)],
                ["Batch Year", saved.batch || (currentUser && currentUser.batch)],
                ["Student ID", currentUser && currentUser.studentId],
                ["Employment Status", saved.employment],
                ["Current Position", [saved.jobTitle, saved.company].filter(Boolean).join(" - ")],
                ["Contact Number", saved.contact || (currentUser && currentUser.contact)]
            ]);
        } else {
            fillDashboardRows("dashRecordRows", [
                ["Role", currentUser && currentUser.title],
                ["Username", currentUser && currentUser.username],
                ["Email Address", currentUser && currentUser.email],
                ["Portal Access", role === "admin" ? "Full system access" : "Registrar workflows"]
            ]);
        }

        const adviserLabelEl = document.getElementById("dashAdviserLabel");
        const adviserNoteEl = document.getElementById("dashAdviserNote");

        if (isAlumni) {
            if (adviserLabelEl) adviserLabelEl.textContent = "Alumni Adviser";
            if (adviserNoteEl) adviserNoteEl.textContent = "For enrolment, clearance and alumni concerns";
            const program = saved.program || (currentUser && currentUser.program) || "";
            const batch = saved.batch || (currentUser && currentUser.batch) || "";
            fillDashboardRows("dashAdviserRows", [
                ["Name", saved.adviser || "Alumni Relations Office"],
                ["My Section", saved.section || [program, batch ? "Batch " + batch : ""].filter(Boolean).join(" - ")],
                ["Office Email", "alumni@stagnes.edu.ph"],
                ["Telephone", "(02) 8361-2345"]
            ]);
        } else {
            if (adviserLabelEl) adviserLabelEl.textContent = "Alumni Affairs Desk";
            if (adviserNoteEl) adviserNoteEl.textContent = "Registrar and alumni office coordination";
            fillDashboardRows("dashAdviserRows", [
                ["Office", "Alumni Relations Office"],
                ["Office Email", "alumni@stagnes.edu.ph"],
                ["Registrar Email", "registrar@stagnes.edu.ph"],
                ["Telephone", "(02) 8361-2345"]
            ]);
        }

        toggleDashboardButton("dashRecordEditBtn", isAlumni);
        toggleDashboardButton("dashTrackingBtn", role !== "registrar");
        toggleDashboardButton("dashNewsletterLinkBtn", role !== "registrar");
    }

    /** Renders labelled rows into one of the dashboard cards. */
    function fillDashboardRows(containerId, rows) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = rows.map(([label, value]) => `
            <div class="record-row">
                <span class="record-label">${escapeAnnouncementText(label)}</span>
                <span class="record-value">${escapeAnnouncementText(value || "-")}</span>
            </div>
        `).join("");
    }

    /** Two-letter initials used when the alumnus has no uploaded photo. */
    function initialsFromName(name) {
        const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return "AD";
        return parts.map(w => w[0]).join("").slice(0, 2).toUpperCase();
    }

    /** Shows / hides a dashboard button according to the signed-in role. */
    function toggleDashboardButton(id, visible) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle("hidden", !visible);
    }

    /** Renders the current page of the announcement feed plus the pager state. */
    function renderAnnouncementFeed() {
        const list = document.getElementById("announcementFeed");
        if (!list) return;

        dashboardFeed.items = buildAnnouncementFeed();

        const total = dashboardFeed.items.length;
        const pageSize = dashboardFeed.pageSize;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        dashboardFeed.page = Math.min(Math.max(1, dashboardFeed.page), totalPages);

        const start = (dashboardFeed.page - 1) * pageSize;
        const pageItems = dashboardFeed.items.slice(start, start + pageSize);

        list.innerHTML = pageItems.map((item, offset) => {
            const index = start + offset;
            const expanded = !!dashboardFeed.expanded[index];
            const toggleLabel = expanded ? "Collapse announcement" : "Read full announcement";
            return `
            <article class="announcement-card">
                <div class="announcement-poster">
                    <i class="fa-solid fa-bullhorn"></i>
                    <h4>${escapeAnnouncementText(item.title)}</h4>
                </div>
                <div class="announcement-content">
                    <p class="announcement-body ${expanded ? "" : "line-clamp-2"}">${escapeAnnouncementText(item.body)}</p>
                </div>
                <div class="announcement-foot">
                    <span class="announcement-meta">
                        <i class="fa-regular fa-calendar mr-0.5"></i> ${escapeAnnouncementText(item.date)}
                        <span class="mx-1">|</span>
                        <i class="fa-regular fa-user mr-0.5"></i> ${escapeAnnouncementText(item.author)}
                    </span>
                    <button type="button" onclick="toggleAnnouncement(${index})" class="announcement-toggle" title="${toggleLabel}" aria-label="${toggleLabel}">
                        <i class="fa-solid ${expanded ? "fa-minus" : "fa-plus"}"></i>
                    </button>
                </div>
            </article>`;
        }).join("");

        const rangeEl = document.getElementById("announcementRange");
        if (rangeEl) {
            rangeEl.textContent = total === 0
                ? "0 of 0"
                : `${start + 1}-${start + pageItems.length} of ${total}`;
        }

        const sizeEl = document.getElementById("announcementPageSize");
        if (sizeEl) sizeEl.value = String(pageSize);

        const atStart = dashboardFeed.page <= 1;
        const atEnd = dashboardFeed.page >= totalPages;
        setDashboardPagerState("announcementFirstBtn", atStart);
        setDashboardPagerState("announcementPrevBtn", atStart);
        setDashboardPagerState("announcementNextBtn", atEnd);
        setDashboardPagerState("announcementLastBtn", atEnd);
    }

    function setDashboardPagerState(id, disabled) {
        const el = document.getElementById(id);
        if (el) el.disabled = disabled;
    }

    function goToAnnouncementPage(direction) {
        const totalPages = Math.max(1, Math.ceil(dashboardFeed.items.length / dashboardFeed.pageSize));
        if (direction === "first") dashboardFeed.page = 1;
        else if (direction === "prev") dashboardFeed.page -= 1;
        else if (direction === "next") dashboardFeed.page += 1;
        else if (direction === "last") dashboardFeed.page = totalPages;
        renderAnnouncementFeed();
    }

    function changeAnnouncementPageSize(value) {
        const size = Number(value);
        dashboardFeed.pageSize = Number.isFinite(size) && size > 0 ? size : 10;
        dashboardFeed.page = 1;
        renderAnnouncementFeed();
    }

    function toggleAnnouncement(index) {
        dashboardFeed.expanded[index] = !dashboardFeed.expanded[index];
        renderAnnouncementFeed();
    }

    /** Merges published server newsletters into the feed (once per session). */
    async function loadDashboardAnnouncementsFromServer() {
        if (dashboardFeed.serverLoaded) return;
        dashboardFeed.serverLoaded = true;
        if (typeof SAA_API === "undefined") return;
        try {
            const data = await SAA_API.request("/api/newsletters");
            const rows = (data && data.newsletters) || [];
            if (rows.length) {
                dashboardFeed.serverItems = rows;
                dashboardFeed.page = 1;
                renderAnnouncementFeed();
            }
        } catch (err) {
            /* Offline or unauthenticated: local archive and built-in notices are used. */
        }
    }
