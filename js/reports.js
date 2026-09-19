/* reports.js - Graduate tracking, CHED tracer study, charts, registrar workflow and app initialization. */

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 4712-5052 */
/* ------------------------------------------------------------------------- */
    /* Graduate Employment Tracking & Profile Freshness Engine */
    const PROFILE_FRESHNESS_MONTHS = 6;

    /**
     * Dynamically detect stale alumni profiles that have not been updated
     * within the freshness period (6 months by default).
     */
    function detectStaleProfiles() {
        const reminders = JSON.parse(localStorage.getItem("saaOutdatedReminders") || "{}");
        const now = new Date();
        const cutoff = new Date(now.getFullYear(), now.getMonth() - PROFILE_FRESHNESS_MONTHS, now.getDate());

        return alumniList
            .filter(a => {
                if (!a.lastUpdated) return true;
                const last = new Date(a.lastUpdated);
                return isNaN(last.getTime()) || last < cutoff;
            })
            .map(a => ({
                id: a.id,
                name: a.name,
                batch: a.batch,
                lastUpdated: a.lastUpdated || "Never",
                contact: a.contact || a.phone || "+63 917 123 4567",
                status: "Needs Update",
                reminded: !!reminders[a.id]
            }));
    }

    /**
     * Refresh all KPI summary cards in the Graduate Tracking dashboard
     */
    function updateTrackingKPIs() {
        const total = alumniList.length || 1;
        
        // 1. Employment Rate (Employed + Freelance)
        const employedCount = alumniList.filter(a => a.status === "Employed" || a.status === "Freelance").length;
        const empRate = Math.round((employedCount / total) * 100);
        const kpiEmp = document.getElementById("kpiEmployedRate");
        if (kpiEmp) kpiEmp.textContent = empRate + "%";

        // 2. Field Alignment (Directly Related / Employed)
        const directlyRelated = alumniList.filter(a => a.relevance === "Directly Related").length;
        const fieldRate = employedCount > 0 ? Math.round((directlyRelated / employedCount) * 100) : 85;
        const kpiField = document.getElementById("kpiFieldRelevance");
        if (kpiField) kpiField.textContent = (fieldRate > 0 ? fieldRate : 82) + "%";

        // 3. Profile Freshness
        const stale = detectStaleProfiles();
        const freshCount = total - stale.length;
        const pct = Math.max(0, Math.round((freshCount / total) * 100));
        const kpiFresh = document.getElementById("kpiProfileFreshness");
        const kpiCountEl = document.getElementById("kpiOutdatedCount");
        if (kpiFresh) kpiFresh.textContent = pct + "% Up-to-Date";
        if (kpiCountEl) {
            kpiCountEl.textContent = stale.length + " Outdated (>6 Months)";
            kpiCountEl.className = "text-[10px] " + (stale.length > 0 ? "text-amber-600 font-semibold mt-0.5" : "text-emerald-600 font-semibold mt-0.5");
        }
    }

    /**
     * Render the dynamically computed outdated alumni table.
     */
    function renderOutdatedProfilesTable() {
        const body = document.getElementById("outdatedProfilesTableBody");
        if (!body) return;

        const outdatedAlumniList = detectStaleProfiles();
        updateTrackingKPIs();

        if (!outdatedAlumniList.length) {
            body.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400 font-semibold"><i class="fa-solid fa-circle-check text-emerald-500 mr-1"></i> All alumni profiles are up to date!</td></tr>`;
            return;
        }

        body.innerHTML = outdatedAlumniList.map(a => `
            <tr>
                <td class="font-extrabold text-slate-800">${a.name}</td>
                <td class="text-slate-500">${a.batch}</td>
                <td class="text-slate-600 font-medium">
                    <span class="inline-flex items-center text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[11px] border border-amber-200">
                        <i class="fa-regular fa-clock mr-1"></i> ${a.lastUpdated}
                    </span>
                </td>
                <td class="text-slate-600 font-mono text-xs">${a.contact}</td>
                <td>
                    <span class="status-badge ${a.reminded ? 'status-pending' : 'status-unemployed'}">
                        ${a.reminded ? 'SMS Reminded' : 'Overdue (>6 mos)'}
                    </span>
                </td>
                <td class="text-right space-x-1">
                    <button onclick="sendSingleSmsReminder(${a.id})" class="btn ${a.reminded ? 'btn-secondary' : 'btn-primary'} text-xs py-1 px-2.5">
                        <i class="fa-solid fa-comment-sms"></i> ${a.reminded ? 'Resend SMS' : 'Send SMS'}
                    </button>
                    <button onclick="openUpdateEmploymentModal(${a.id})" class="btn btn-secondary text-xs py-1 px-2.5">
                        <i class="fa-solid fa-user-pen"></i> Update
                    </button>
                </td>
            </tr>
        `).join("");
    }

    function runSmsReminderSweep() {
        const smsMessage = "ST. AGNES ACADEMY OF CALOOCAN: Dear Alumni, please update your employment or education status through the Alumni Management System. Your response helps the school improve its graduate tracking program. Thank you.";
        const staleProfiles = detectStaleProfiles();
        let dispatchedCount = 0;

        if (!staleProfiles.length) {
            showToast("No outdated profiles found. All alumni are up to date!", "info");
            return;
        }

        const reminders = JSON.parse(localStorage.getItem("saaOutdatedReminders") || "{}");

        staleProfiles.forEach(a => {
            triggerNotification("SMS", a.contact, "Grad Tracking Update Reminder", smsMessage);
            reminders[a.id] = new Date().toISOString();
            dispatchedCount++;
        });

        localStorage.setItem("saaOutdatedReminders", JSON.stringify(reminders));
        renderOutdatedProfilesTable();
        showToast(`SMS Sweep Complete! Dispatched reminders to ${dispatchedCount} alumni contacts.`, "success");
    }

    function sendSingleSmsReminder(id) {
        const item = detectStaleProfiles().find(a => a.id === id);
        if (!item) return;

        const smsMessage = "ST. AGNES ACADEMY OF CALOOCAN: Dear Alumni, please update your employment or education status through the Alumni Management System. Your response helps the school improve its graduate tracking program. Thank you.";

        triggerNotification("SMS", item.contact, "Grad Tracking Update Reminder", smsMessage);

        const reminders = JSON.parse(localStorage.getItem("saaOutdatedReminders") || "{}");
        reminders[id] = new Date().toISOString();
        localStorage.setItem("saaOutdatedReminders", JSON.stringify(reminders));

        renderOutdatedProfilesTable();
        showToast(`SMS Reminder dispatched to ${item.name} (${item.contact}).`, "success");
    }

    /**
     * Pre-populate alumni dropdown and open employment update modal
     */
    function openUpdateEmploymentModal(targetAlumniId) {
        const select = document.getElementById("trackAlumniSelect");
        if (select) {
            select.innerHTML = alumniList.map(a => `
                <option value="${a.id}">${a.name} (${a.batch || 'Alumnus'} - ${a.program || 'SAA'})</option>
            `).join("");

            // Determine which alumnus to select
            if (targetAlumniId) {
                select.value = targetAlumniId;
            } else if (currentUser && currentUser.role === "alumni") {
                const match = alumniList.find(a => a.name.toLowerCase() === currentUser.name.toLowerCase() || (currentUser.studentId && a.studentId === currentUser.studentId));
                if (match) select.value = match.id;
            }

            // Lock select if current user is an alumni
            if (currentUser && currentUser.role === "alumni") {
                select.disabled = true;
            } else {
                select.disabled = false;
            }
        }

        onTrackAlumniSelectChange();
        document.getElementById("updateEmploymentModal").classList.add("active");
    }

    function closeUpdateEmploymentModal() {
        document.getElementById("updateEmploymentModal").classList.remove("active");
    }

    /**
     * Handles alumnus selection change in the modal
     */
    function onTrackAlumniSelectChange() {
        const select = document.getElementById("trackAlumniSelect");
        if (!select) return;
        const targetId = parseInt(select.value);
        const alumnus = alumniList.find(a => a.id === targetId);
        if (!alumnus) return;

        if (document.getElementById("trackEmpStatus")) document.getElementById("trackEmpStatus").value = alumnus.status || "Employed";
        if (document.getElementById("trackCompany")) document.getElementById("trackCompany").value = alumnus.company || "";
        if (document.getElementById("trackJobTitle")) document.getElementById("trackJobTitle").value = alumnus.title || "";
        if (document.getElementById("trackTimeFirst")) document.getElementById("trackTimeFirst").value = alumnus.timeToFirst || "< 1 Month";
        if (document.getElementById("trackRelevance")) document.getElementById("trackRelevance").value = alumnus.relevance || "Directly Related";
        if (document.getElementById("trackLocation")) document.getElementById("trackLocation").value = alumnus.location || "Local";

        onTrackEmpStatusChange();
    }

    /**
     * Dynamically adjusts form fields based on employment status
     */
    function onTrackEmpStatusChange() {
        const status = document.getElementById("trackEmpStatus").value;
        const companyInput = document.getElementById("trackCompany");
        const jobTitleInput = document.getElementById("trackJobTitle");
        const companyLabel = document.getElementById("trackCompanyLabel");
        const jobTitleLabel = document.getElementById("trackJobTitleLabel");
        const detailsRow = document.getElementById("trackingDetailsRow");

        if (status === "Unemployed") {
            if (companyLabel) companyLabel.textContent = "Company / Institution (Optional)";
            if (jobTitleLabel) jobTitleLabel.textContent = "Previous / Desired Position (Optional)";
            if (companyInput) {
                companyInput.required = false;
                companyInput.placeholder = "Not Applicable (Unemployed)";
                if (!companyInput.value) companyInput.value = "N/A";
            }
            if (jobTitleInput) {
                jobTitleInput.required = false;
                jobTitleInput.placeholder = "Not Applicable (Unemployed)";
                if (!jobTitleInput.value) jobTitleInput.value = "N/A";
            }
            if (detailsRow) detailsRow.classList.add("opacity-60");
        } else if (status === "Post-grad") {
            if (companyLabel) companyLabel.textContent = "Graduate School / University";
            if (jobTitleLabel) jobTitleLabel.textContent = "Master's / Doctoral Degree Program";
            if (companyInput) {
                companyInput.required = true;
                companyInput.placeholder = "e.g. Ateneo Graduate School of Business";
                if (companyInput.value === "N/A") companyInput.value = "";
            }
            if (jobTitleInput) {
                jobTitleInput.required = true;
                jobTitleInput.placeholder = "e.g. Master of Business Administration";
                if (jobTitleInput.value === "N/A") jobTitleInput.value = "";
            }
            if (detailsRow) detailsRow.classList.remove("opacity-60");
        } else {
            if (companyLabel) companyLabel.textContent = "Current Company / Institution Name";
            if (jobTitleLabel) jobTitleLabel.textContent = "Job Position / Title";
            if (companyInput) {
                companyInput.required = true;
                companyInput.placeholder = "e.g. Globe Telecom / St. Luke's Medical Center";
                if (companyInput.value === "N/A") companyInput.value = "";
            }
            if (jobTitleInput) {
                jobTitleInput.required = true;
                jobTitleInput.placeholder = "e.g. Senior Systems Analyst";
                if (jobTitleInput.value === "N/A") jobTitleInput.value = "";
            }
            if (detailsRow) detailsRow.classList.remove("opacity-60");
        }
    }

    /**
     * Submit validated employment update
     */
    function submitEmploymentUpdate(event) {
        event.preventDefault();
        const select = document.getElementById("trackAlumniSelect");
        const targetId = select ? parseInt(select.value) : null;
        const status = document.getElementById("trackEmpStatus").value;
        const company = document.getElementById("trackCompany").value.trim();
        const title = document.getElementById("trackJobTitle").value.trim();
        const timeToFirst = document.getElementById("trackTimeFirst") ? document.getElementById("trackTimeFirst").value : "< 1 Month";
        const relevance = document.getElementById("trackRelevance") ? document.getElementById("trackRelevance").value : "Directly Related";
        const location = document.getElementById("trackLocation") ? document.getElementById("trackLocation").value : "Local";
        const today = new Date().toISOString().split("T")[0];

        let targetAlumnus = alumniList.find(a => a.id === targetId);
        if (!targetAlumnus) {
            targetAlumnus = alumniList.find(a => currentUser && (a.name.toLowerCase() === currentUser.name.toLowerCase()));
        }
        const alumnusName = targetAlumnus ? targetAlumnus.name : (currentUser ? currentUser.name : "Maria Clara Santos");
        const alumnusId = targetAlumnus ? targetAlumnus.id : 1;

        // 1) Update the alumni record
        alumniList = alumniList.map(a => {
            if (a.id === alumnusId) {
                return {
                    ...a,
                    status: status,
                    company: company,
                    title: title,
                    timeToFirst: timeToFirst,
                    relevance: relevance,
                    location: location,
                    lastUpdated: today
                };
            }
            return a;
        });

        // 2) Log placement if employed or in post-grad
        if (status !== "Unemployed") {
            placementLogs.unshift({
                id: Date.now(),
                alumni: alumnusName,
                company: company,
                title: title,
                date: today
            });
        }

        // 3) Clear any SMS reminder flags for this alumnus
        const reminders = JSON.parse(localStorage.getItem("saaOutdatedReminders") || "{}");
        delete reminders[alumnusId];
        localStorage.setItem("saaOutdatedReminders", JSON.stringify(reminders));

        // 4) Persist and update all dashboards (cross-module: also refresh alumni DB + KPI cards)
        updateLocalStorage();
        if (typeof renderPlacementLogs === 'function') renderPlacementLogs();
        if (typeof renderAlumniTable === 'function') renderAlumniTable();
        if (typeof updateReports === 'function') updateReports();
        renderOutdatedProfilesTable();
        updateTrackingKPIs();
        renderTrackingCharts();
        closeUpdateEmploymentModal();

        // 5) Trigger notification
        triggerNotification(
            "EMAIL",
            targetAlumnus && targetAlumnus.email ? targetAlumnus.email : (currentUser ? currentUser.email : "alumni@stagnes.edu.ph"),
            "Graduate Employment Profile Updated - Verified",
            `Dear ${alumnusName}, your employment record has been verified and updated:\n• Status: ${status}\n• Organization: ${company}\n• Position: ${title}\n• Relevance: ${relevance}\n• Location: ${location}\nDate refreshed: ${today}.`
        );

        showToast(`✔ Validated & saved! Tracking records and analytics refreshed for ${alumnusName}.`, "success");
    }

    function exportGraduateTrackingReport() {
        let csv = "Alumnus,Batch Year,Program,Employment Status,Company,Job Title,Time to Hire,Field Relevance,Last Updated\n";
        alumniList.forEach(a => {
            csv += `"${a.name}","${a.batch}","${a.program || 'N/A'}","${a.status}","${a.company || 'N/A'}","${a.title || 'N/A'}","${a.timeToFirst || 'N/A'}","${a.relevance || 'N/A'}","${a.lastUpdated || 'N/A'}"\n`;
        });
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "SAA_Graduate_Tracking_Report_2026.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Graduate Tracking Report exported to CSV.", "success");
    }

    /* ------------------------------------------------------------------ *
     * CHED Graduate Tracer Study compliance report (Issue #7)
     * ------------------------------------------------------------------ */
    const CHED_TRACER_HEADERS = [
        "No.", "Full Name", "Sex", "Year Graduated", "Degree / Program",
        "Employment Status", "Occupation / Job Title", "Company / Employer",
        "Time to First Job", "Field of Study Relevance", "Location (Local/Abroad)",
        "Further / Higher Studies", "Remarks"
    ];

    function downloadCsvBlob(filename, csv) {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /** Local fallback CSV - mirrors the server-side CHED report columns. */
    function buildChedTracerCsvLocal() {
        const esc = (v) => {
            const s = (v == null ? "" : String(v));
            return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lines = [
            '"ST. AGNES ACADEMY OF CALOOCAN - GRADUATE TRACER STUDY REPORT"',
            '"Prepared in accordance with CHED graduate tracer study guidelines"',
            `"Date Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}"`,
            "",
            CHED_TRACER_HEADERS.map(esc).join(",")
        ];

        alumniList.slice()
            .sort((a, b) => String(a.batch).localeCompare(String(b.batch), undefined, { numeric: true }))
            .forEach((a, i) => {
                const further = ["Further Studies", "Post-grad", "Postgraduate"].includes(a.status) ? "Yes" : "No";
                lines.push([
                    String(i + 1),
                    a.name,
                    "Not Indic (optional)",
                    a.batch || "",
                    a.program || "",
                    a.status || "Not Indic",
                    a.status === "Unemployed" ? "—" : (a.title || "—"),
                    a.company || "—",
                    a.timeToFirst || "Not Indic",
                    a.relevance || "Not Indic",
                    a.location || "Local",
                    further,
                    `Student ID: ${a.studentId || 'N/A'} | Last updated: ${a.lastUpdated || "N/A"}`
                ].map(esc).join(","));
            });

        return "\uFEFF" + lines.join("\r\n");
    }

    /**
     * CHED Tracer Study export button handler.
     * Primary path downloads the server-generated CSV (Express + SQLite).
     * Falls back to a local copy when the API is unreachable.
     */
    async function exportChedTracerStudy() {
        const filename = `saa-tracer-study-${new Date().toISOString().split("T")[0]}.csv`;
        try {
            if (typeof SAA_API !== "undefined" && (await SAA_API.health())) {
                const token = sessionStorage.getItem("saaToken") || "";
                const res = await fetch(SAA_API.base + "/api/reports/tracer-study/download", {
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });
                if (res.ok) {
                    downloadCsvBlob(filename, await res.text());
                    showToast("CHED Tracer Study exported (server-generated report).", "success");
                    return;
                }
            }
        } catch (e) { /* offline or unreachable - fall through to the local copy */ }

        downloadCsvBlob(filename, buildChedTracerCsvLocal());
        showToast("CHED Tracer Study exported (local copy). Run the backend for the server report.", "success");
    }

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 5229-5374 */
/* ------------------------------------------------------------------------- */
    /* Verification Tool */
    function verifyAlumni() {
        const search = document.getElementById("verificationSearch").value.trim().toLowerCase();
        const result = document.getElementById("verificationResult");
        if (!search) {
            result.classList.add("hidden");
            return;
        }

        const match = alumniList.find(a => a.name.toLowerCase().includes(search) || (a.studentId && a.studentId.toLowerCase().includes(search)));
        result.classList.remove("hidden");

        if (match) {
            result.className = "mt-4 p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs";
            result.innerHTML = `
                <div class="flex flex-col sm:flex-row sm:items-center justify-between border-b border-emerald-200 pb-3 mb-3 gap-2">
                    <span class="status-badge status-verified">Official Record Authenticated</span>
                    <button onclick="openOfficialCertificate(${match.id})" class="btn btn-secondary text-xs py-1 px-3">
                        <i class="fa-solid fa-award text-amber-500"></i> Generate Official Certificate
                    </button>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 leading-relaxed">
                    <p><b>Full Name:</b> ${match.name}</p>
                    <p><b>Student / Alumni ID:</b> ${match.studentId || `SAA-${match.batch}-00${match.id}`}</p>
                    <p><b>Graduation Batch:</b> ${match.batch}</p>
                    <p><b>Degree / Track:</b> ${match.program}</p>
                    <p><b>Enrollment Status:</b> SAA Alumnus in Good Standing</p>
                </div>
            `;
            showToast("Alumni record verified successfully.", "success");
        } else {
            result.className = "mt-4 p-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs";
            result.innerHTML = `
                <div class="flex items-center gap-2">
                    <i class="fa-solid fa-circle-exclamation text-rose-500 text-base"></i>
                    <b>No matching official record found for "${search}". Please verify spelling or contact Registrar Office.</b>
                </div>
            `;
            showToast("No record found.", "warning");
        }
    }

    /* Registrar Workflow */
    function renderRequestApproval() {
        const box = document.getElementById("approvalRequestsList");
        if (!box) return;
        const pending = transcriptRequests.filter(r => r.status === "Pending");
        if (!pending.length) {
            box.innerHTML = `<div class="p-8 text-center text-slate-400 font-semibold border border-slate-100 rounded-xl">No pending requests at this time.</div>`;
            return;
        }
        box.innerHTML = pending.map(r => `
            <div class="p-4 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
                <div>
                    <p class="font-extrabold text-slate-800 text-sm">${r.name}</p>
                    <p class="text-xs text-slate-400">Transcript Request • ${r.purpose || "Official Record"} • ${r.date}</p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="updateRequestStatus(${r.id}, 'Approved')" class="btn btn-success text-xs py-1.5 px-3">Approve</button>
                    <button onclick="updateRequestStatus(${r.id}, 'Rejected')" class="btn btn-danger text-xs py-1.5 px-3">Reject</button>
                </div>
            </div>
        `).join("");
    }

    function renderDocumentPreparation() {
        const box = document.getElementById("documentPreparationList");
        if (!box) return;
        const approvedCount = transcriptRequests.filter(r => r.status === "Approved").length;
        box.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="app-card p-5 border-l-4 border-l-amber-500">
                    <p class="text-xs text-slate-400 font-bold uppercase">Approved for Print</p>
                    <p class="text-3xl font-extrabold text-slate-800 mt-2">${approvedCount}</p>
                    <p class="text-[11px] text-slate-400 mt-1">Pending seal & signatures</p>
                </div>
                <div class="app-card p-5 border-l-4 border-l-indigo-500">
                    <p class="text-xs text-slate-400 font-bold uppercase">In Quality Review</p>
                    <p class="text-3xl font-extrabold text-slate-800 mt-2">2</p>
                    <p class="text-[11px] text-slate-400 mt-1">Registrar verification</p>
                </div>
                <div class="app-card p-5 border-l-4 border-l-emerald-500">
                    <p class="text-xs text-slate-400 font-bold uppercase">Ready for Claiming</p>
                    <p class="text-3xl font-extrabold text-slate-800 mt-2">${transcriptRequests.filter(r => r.status === "Released").length}</p>
                    <p class="text-[11px] text-slate-400 mt-1">At registrar release counter</p>
                </div>
            </div>
        `;
    }

    function renderReleaseClaiming() {
        const box = document.getElementById("releaseRecordsList");
        if (!box) return;
        const ready = transcriptRequests.filter(r => r.status === "Approved");
        if (!ready.length) {
            box.innerHTML = `<div class="p-8 text-center text-slate-400 font-semibold border border-slate-100 rounded-xl">No approved documents currently awaiting pick-up.</div>`;
            return;
        }
        box.innerHTML = ready.map(r => `
            <div class="p-4 border border-slate-200 rounded-xl flex items-center justify-between bg-white">
                <div>
                    <p class="font-extrabold text-slate-800 text-sm">${r.name}</p>
                    <p class="text-xs text-slate-400">Document Type: Transcript of Records</p>
                </div>
                <button onclick="updateRequestStatus(${r.id}, 'Released')" class="btn btn-primary text-xs py-1.5 px-3">
                    <i class="fa-solid fa-box-open mr-1"></i> Mark Released / Claimed
                </button>
            </div>
        `).join("");
    }

    function renderRequestHistory() {
        const box = document.getElementById("requestHistoryList");
        if (!box) return;
        box.innerHTML = transcriptRequests.map(r => `
            <div class="p-4 border border-slate-100 rounded-xl flex items-center justify-between bg-slate-50/60">
                <div>
                    <p class="font-bold text-slate-800 text-xs">${r.name}</p>
                    <p class="text-[11px] text-slate-400">${r.purpose || "Official Record"} • Date: ${r.date}</p>
                </div>
                <span class="status-badge ${r.status === 'Released' ? 'status-released' : r.status === 'Approved' ? 'status-approved' : r.status === 'Rejected' ? 'status-rejected' : 'status-pending'}">${r.status}</span>
            </div>
        `).join("");
    }

    function updateReports() {
        const aCount = document.getElementById("reportAlumniCount");
        if (aCount) aCount.textContent = (alumniList.length + 5240).toLocaleString();

        const tCount = document.getElementById("reportTranscriptCount");
        if (tCount) tCount.textContent = transcriptRequests.length;

        const pCount = document.getElementById("reportPlacementCount");
        if (pCount) pCount.textContent = placementLogs.length;

        const eCount = document.getElementById("reportEventCount");
        if (eCount) eCount.textContent = eventsList.length;
    }

    function updateRegistrarReports() {
        const t = document.getElementById("registrarTranscriptCount");
        if (t) t.textContent = transcriptRequests.length;

        const p = document.getElementById("registrarPendingCount");
        if (p) p.textContent = transcriptRequests.filter(r => r.status === "Pending").length;
    }

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 5376-5476 */
/* ------------------------------------------------------------------------- */
    /* Charts */
    function renderGrowthChart() {
        const canvas = document.getElementById("growthChart");
        if (!canvas) return;
        if (growthChartInstance) growthChartInstance.destroy();

        growthChartInstance = new Chart(canvas.getContext("2d"), {
            type: "line",
            data: {
                labels: ["2019", "2020", "2021", "2022", "2023", "2024"],
                datasets: [{
                    label: "Registered Alumni",
                    data: [2100, 2650, 3200, 3950, 4600, 5246],
                    borderColor: "#b91c56",
                    backgroundColor: "rgba(185, 28, 86, 0.08)",
                    fill: true,
                    tension: 0.35,
                    borderWidth: 2.5,
                    pointBackgroundColor: "#b91c56",
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: "#f1f5f9" } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    function renderTrackingCharts() {
        setTimeout(() => {
            const pieCanvas = document.getElementById("employmentPieChart");
            const barCanvas = document.getElementById("industryBarChart");

            if (pieCanvas) {
                if (empChartInstance) empChartInstance.destroy();

                const empCount = alumniList.filter(a => a.status === "Employed").length;
                const unempCount = alumniList.filter(a => a.status === "Unemployed").length;
                const freeCount = alumniList.filter(a => a.status === "Freelance").length;
                // The tracker uses "Further Studies"; honour historical aliases too.
                const postCount = alumniList.filter(a => ["Further Studies", "Post-grad", "Postgraduate"].includes(a.status)).length;

                empChartInstance = new Chart(pieCanvas.getContext("2d"), {
                    type: "doughnut",
                    data: {
                        labels: ["Employed", "Unemployed", "Freelance", "Further Studies"],
                        datasets: [{
                            data: [empCount, unempCount, freeCount, postCount],
                            backgroundColor: ["#10b981", "#ef4444", "#3b82f6", "#a855f7"]
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false }
                });
            }

            if (barCanvas) {
                if (indChartInstance) indChartInstance.destroy();

                const programCounts = {};
                alumniList.forEach(a => {
                    const prog = a.program ? a.program.replace(/^BS\s+/, "") : "General";
                    programCounts[prog] = (programCounts[prog] || 0) + 1;
                });

                const labels = Object.keys(programCounts);
                const data = Object.values(programCounts);

                indChartInstance = new Chart(barCanvas.getContext("2d"), {
                    type: "bar",
                    data: {
                        labels: labels.length ? labels : ["Information Tech", "Business & Finance", "Education", "Healthcare"],
                        datasets: [{
                            label: "Total Alumni by Program",
                            data: data.length ? data : [4, 3, 2, 2],
                            backgroundColor: "#801235",
                            borderRadius: 6
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: { stepSize: 1, precision: 0 },
                                grid: { color: "#f1f5f9" }
                            },
                            x: { grid: { display: false } }
                        }
                    }
                });
            }
        }, 100);
    }


/* ------------------------------------------------------------------------- */
/* Source: index.html lines 5625-5650 */
/* ------------------------------------------------------------------------- */
    /* ------------------------------------------------------------------ *
     * AI Assistant Tools (OpenAI API) - Gmail auto-reply, survey summary
     * and dashboard insights. All calls are API-first with local fallback.
     * ------------------------------------------------------------------ */

    /** Shows which engine is active (OpenAI API vs built-in fallback). */
    async function refreshAiStatus() {
        const badge = document.getElementById("aiEngineBadge");
        if (!badge) return;

        try {
            const res = await fetch((typeof SAA_API !== "undefined" ? SAA_API.base : "") + "/api/health");
            const health = await res.json();
            const ai = health && health.ai;
            if (ai && ai.configured) {
                badge.className = "status-badge status-approved text-[10px]";
                badge.innerHTML = `<i class="fa-solid fa-bolt mr-1"></i> OpenAI API (${ai.model || "configured"})`;
            } else {
                badge.className = "status-badge status-pending text-[10px]";
                badge.innerHTML = '<i class="fa-solid fa-circle-info mr-1"></i> Built-in AI fallback - add OPENAI_API_KEY';
            }
        } catch (e) {
            badge.className = "status-badge status-rejected text-[10px]";
            badge.innerHTML = '<i class="fa-solid fa-plug-circle-xmark mr-1"></i> API server offline';
        }
    }

    /** Renders an AI result block with its provider label. */
    function showAiOutput(elementId, heading, text) {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.innerHTML = `<p class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">${heading}</p>${text.replace(/</g, "&lt;")}`;
        el.classList.remove("hidden");
    }

    /** Shared POST helper for the AI endpoints (returns null when offline). */
    async function aiPost(path, payload) {
        if (typeof SAA_API === "undefined") return null;
        if (!(await SAA_API.health())) return null;
        try {
            return await SAA_API.request(path, { method: "POST", body: JSON.stringify(payload || {}) });
        } catch (err) {
            showToast("AI request failed: " + (err.message || "unknown error"), "error");
            return null;
        }
    }

    /** Gmail Auto-Reply: inbound email -> OpenAI -> drafted reply (logged server-side). */
    async function runGmailAutoReply(event) {
        if (event) event.preventDefault();
        const from = document.getElementById("aiGmailFrom").value.trim();
        const subject = document.getElementById("aiGmailSubject").value.trim();
        const body = document.getElementById("aiGmailBody").value.trim();
        if (!from || !body) return;

        showAiOutput("aiGmailReply", "Generating reply...", "Please wait while the AI analyzes the inbound email.");

        const data = await aiPost("/api/ai/gmail-auto-reply", { from, subject, body });

        if (!data) {
            showAiOutput("aiGmailReply", "API server offline", "Start the server (npm start in /server) to use Gmail Auto-Reply.");
            return;
        }

        showAiOutput("aiGmailReply", `Draft reply - ${data.provider}`, data.reply);
        showToast(`Auto-reply drafted for ${from} and logged to the notification centre.`, "success");
    }

    /** AI summary of collected alumni survey/feedback responses. */
    async function runSurveySummary() {
        showAiOutput("aiSurveySummary", "Generating summary...", "Analyzing collected survey responses.");

        const data = await aiPost("/api/ai/summarize-survey", {});
        if (!data) {
            showAiOutput("aiSurveySummary", "API server offline", "Start the server (npm start in /server) to generate AI summaries.");
            return;
        }

        const meta = data.responses != null
            ? `Draft summary - ${data.provider} - ${data.responses} response(s)`
            : `Draft summary - ${data.provider}`;
        showAiOutput("aiSurveySummary", meta, data.summary);
        showToast("Survey summary generated.", "success");
    }

    /** AI narrative insights from live system metrics. */
    async function runDashboardInsights() {
        showAiOutput("aiDashboardInsights", "Generating insights...", "Reviewing live alumni metrics.");

        const data = await aiPost("/api/ai/dashboard-insights", {});
        if (!data) {
            showAiOutput("aiDashboardInsights", "API server offline", "Start the server (npm start in /server) to generate AI insights.");
            return;
        }

        showAiOutput("aiDashboardInsights", `Draft insights - ${data.provider}`, data.insights);
        showToast("Dashboard insights generated.", "success");
    }

    /* Initialization */
    window.addEventListener("DOMContentLoaded", () => {
        updateNotificationBadge();
        renderResumeUI();
        if (typeof renderOutdatedProfilesTable === 'function') renderOutdatedProfilesTable();
        if (typeof refreshAiStatus === 'function') refreshAiStatus();

        const remembered = localStorage.getItem("rememberedUsername");
        if (remembered) {
            document.getElementById("username").value = remembered;
            document.getElementById("remember").checked = true;
        }

        const savedUser = sessionStorage.getItem("currentUser");
        if (savedUser) {
            try {
                currentUser = JSON.parse(savedUser);
                const homePage = document.getElementById("homePage");
                if (homePage) homePage.classList.add("hidden");
                document.getElementById("loginPage").classList.add("hidden");
                document.getElementById("dashboardPage").classList.remove("hidden");
                applyUserRole();
            } catch (e) {
                sessionStorage.removeItem("currentUser");
            }
        }
    });
