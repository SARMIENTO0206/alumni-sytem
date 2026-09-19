/* navigation.js - View routing (switchView), counters, digital ID, profile and page navigation. */

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
            "dashboard", "idcard", "database", "profile", "job-opportunities", "transcript", "reprint",
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
        if (viewId === "dashboard") renderGrowthChart();
        if (viewId === "idcard") renderDigitalIdCard();
        if (viewId === "profile") loadAlumniProfile();
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
            idcard: "Digital Alumni Identification",
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

    /* Digital Alumni ID */
    function renderDigitalIdCard() {
        if (!currentUser) return;
        const name = currentUser.name || "Maria Clara Santos";
        const program = currentUser.program || "BS Information Technology";
        const batch = currentUser.batch || "2024";
        const studentId = currentUser.studentId || `SAA-${batch}-0089`;
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

