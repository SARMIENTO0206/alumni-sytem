/* reports.js - Graduate tracking, reports, charts, registrar workflow and app initialization. */

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 4712-5052 */
/* ------------------------------------------------------------------------- */
    /* Graduate Employment Tracking & Profile Freshness Engine */
    const PROFILE_FRESHNESS_MONTHS = 6;
    const TRACKING_INDUSTRIES = [
        "Education", "Information Technology", "Healthcare", "Business/Retail",
        "Hospitality", "Government/Public Service", "Manufacturing", "Others"
    ];
    let trackingReminderMonths = PROFILE_FRESHNESS_MONTHS;
    let activeTrackingFilters = { educationLevel: "", batch: "", strand: "" };

    function trackingAlumni() {
        let rows = alumniList || [];
        if (activeTrackingFilters.educationLevel) {
            rows = rows.filter((a) => (a.educationLevel || "") === activeTrackingFilters.educationLevel);
        }
        if (activeTrackingFilters.batch) {
            rows = rows.filter((a) => String(a.batch || "") === activeTrackingFilters.batch);
        }
        if (activeTrackingFilters.strand) {
            rows = rows.filter((a) => (a.strand || "") === activeTrackingFilters.strand);
        }
        return rows;
    }

    function normalizeTrackingStatus(status) {
        if (["Freelance", "Self-employed"].includes(status)) return "Self-employed";
        if (["Unemployed", "Seeking Employment"].includes(status)) return "Seeking Employment";
        if (["Further Studies", "Post-grad", "Postgraduate"].includes(status)) return "Further Studies";
        if (status === "Technical/Vocational Training") return "Further Studies";
        if (status === "Not Currently Seeking") return "Not Currently Seeking";
        if (status === "Employed") return "Employed";
        return "No Data";
    }

    function isTrackingStale(alumnus) {
        if (!alumnus.lastUpdated) return true;
        const updated = new Date(alumnus.lastUpdated);
        if (Number.isNaN(updated.getTime())) return true;
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - trackingReminderMonths);
        return updated < cutoff;
    }

    function populateTrackingFilters() {
        const rows = alumniList || [];
        const batch = document.getElementById("trackingBatchFilter");
        const strand = document.getElementById("trackingStrandFilter");
        if (batch) {
            const selected = batch.value;
            const years = [...new Set(rows.map((a) => String(a.batch || "").trim()).filter(Boolean))].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
            batch.replaceChildren(new Option("All Years", ""));
            years.forEach((year) => batch.add(new Option(year, year)));
            batch.value = selected;
        }
        if (strand) {
            const selected = strand.value;
            const values = [...new Set(rows.map((a) => String(a.strand || "").trim()).filter(Boolean))].sort();
            strand.replaceChildren(new Option("All Strands", ""));
            values.forEach((value) => strand.add(new Option(value, value)));
            strand.value = selected;
        }
        updateTrackingStrandFilter();
    }

    function updateTrackingStrandFilter() {
        const level = document.getElementById("trackingEducationLevelFilter")?.value || "";
        const wrap = document.getElementById("trackingStrandFilterWrap");
        const strand = document.getElementById("trackingStrandFilter");
        const disabled = level !== "SHS";
        if (wrap) wrap.classList.toggle("opacity-50", disabled);
        if (strand) {
            strand.disabled = disabled;
            if (disabled) strand.value = "";
        }
    }

    function applyTrackingFilters() {
        const level = document.getElementById("trackingEducationLevelFilter")?.value || "";
        const batch = document.getElementById("trackingBatchFilter")?.value || "";
        const strand = level === "SHS" ? (document.getElementById("trackingStrandFilter")?.value || "") : "";
        activeTrackingFilters = { educationLevel: level, batch, strand };
        updateTrackingKPIs();
        renderTrackingCharts();
        renderTrackingRecordsTable();
        renderOutdatedProfilesTable();
    }

    async function loadTrackingSettings() {
        if (!currentUser || !["admin", "staff", "registrar"].includes(currentUser.role)) return;
        try {
            const data = await SAA_API.request("/api/tracking/settings");
            trackingReminderMonths = Number(data.reminderMonths) || PROFILE_FRESHNESS_MONTHS;
            const input = document.getElementById("trackingReminderMonths");
            if (input) input.value = String(trackingReminderMonths);
            updateTrackingKPIs();
            renderOutdatedProfilesTable();
        } catch (err) {
            showToast(err.message || "Unable to load graduate tracking settings.", "error");
        }
    }

    /**
     * Dynamically detect stale alumni profiles that have not been updated
     * within the configured reminder period.
     */
    function detectStaleProfiles() {
        return trackingAlumni()
            .filter(isTrackingStale)
            .map(a => ({
                id: a.id,
                name: a.name,
                batch: a.batch,
                lastUpdated: a.lastUpdated || "Never",
                contact: a.contact || a.phone || "",
                status: "Needs Update"
            }));
    }

    /**
     * Refresh outcome counts for the currently selected graduate filters.
     */
    function updateTrackingKPIs() {
        const rows = trackingAlumni();
        const total = rows.length;
        if (!total) {
            const kpiEmp = document.getElementById("kpiEmployedRate");
            if (kpiEmp) kpiEmp.textContent = "0";
            ["kpiCurrentlyEmployed", "kpiFurtherStudies", "kpiSeekingEmployment"].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.textContent = "0";
            });
            const kpiFresh = document.getElementById("kpiProfileFreshness");
            if (kpiFresh) kpiFresh.textContent = "0%";
            const kpiCountEl = document.getElementById("kpiOutdatedCount");
            if (kpiCountEl) kpiCountEl.textContent = "No alumni records yet";
            return;
        }

        const employedCount = rows.filter((a) => ["Employed", "Self-employed", "Freelance"].includes(a.status)).length;
        const studiesCount = rows.filter((a) => ["Further Studies", "Post-grad", "Postgraduate", "Technical/Vocational Training"].includes(a.status)).length;
        const seekingCount = rows.filter((a) => ["Unemployed", "Seeking Employment"].includes(a.status)).length;
        const kpiEmp = document.getElementById("kpiEmployedRate");
        if (kpiEmp) kpiEmp.textContent = String(total);
        const employedEl = document.getElementById("kpiCurrentlyEmployed");
        if (employedEl) employedEl.textContent = String(employedCount);
        const studiesEl = document.getElementById("kpiFurtherStudies");
        if (studiesEl) studiesEl.textContent = String(studiesCount);
        const seekingEl = document.getElementById("kpiSeekingEmployment");
        if (seekingEl) seekingEl.textContent = String(seekingCount);

        // 3. Profile Freshness
        const stale = detectStaleProfiles();
        const freshCount = total - stale.length;
        const pct = Math.max(0, Math.round((freshCount / total) * 100));
        const kpiFresh = document.getElementById("kpiProfileFreshness");
        const kpiCountEl = document.getElementById("kpiOutdatedCount");
        if (kpiFresh) kpiFresh.textContent = pct + "%";
        if (kpiCountEl) {
            kpiCountEl.textContent = stale.length + " needing update (" + trackingReminderMonths + " months)";
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
                    <span class="status-badge status-pending">Needs update (${trackingReminderMonths}+ months)</span>
                </td>
                <td class="text-right space-x-1">
                    <span class="text-xs text-slate-400">Eligible for reminder</span>
                </td>
            </tr>
        `).join("");
    }

    async function runSmsReminderSweep() {
        try {
            const { staleProfiles } = await SAA_API.request("/api/tracking/stale-profiles");
            const count = staleProfiles.length;
            if (!count) {
                showToast("No profiles currently need an update reminder.", "info");
                return;
            }
            const confirmed = window.confirm(`Send profile update reminders?\n\n${count} alumni across all levels and batches have not updated their graduate information within the configured ${trackingReminderMonths}-month period. Dashboard filters do not limit this send.\n\nSend ${count} reminders?`);
            if (!confirmed) return;
            const data = await SAA_API.request("/api/tracking/reminders/sweep", { method: "POST" });
            if (SAA_API.refreshAllData) await SAA_API.refreshAllData();
            renderOutdatedProfilesTable();
            showToast(`Reminder requests recorded for ${data.dispatchedCount || 0} alumni. SMS delivery depends on provider configuration.`, "info");
        } catch (err) {
            showToast(err.message || "Unable to send tracking reminders.", "error");
        }
    }

    async function saveTrackingReminderSettings() {
        const input = document.getElementById("trackingReminderMonths");
        const months = Number(input?.value);
        const message = document.getElementById("trackingReminderSettingsMessage");
        if (!Number.isInteger(months) || months < 1 || months > 36) {
            showToast("Reminder period must be from 1 to 36 months.", "error");
            return;
        }
        try {
            const result = await SAA_API.request("/api/tracking/settings", {
                method: "PUT",
                body: JSON.stringify({ reminderMonths: months })
            });
            trackingReminderMonths = result.reminderMonths;
            if (message) message.textContent = "Saved";
            updateTrackingKPIs();
            renderOutdatedProfilesTable();
            showToast("Graduate tracking reminder period saved.", "success");
        } catch (err) {
            showToast(err.message || "Unable to save the reminder period.", "error");
        }
    }

    /**
     * Pre-populate alumni dropdown and open employment update modal
     */
    function openUpdateEmploymentModal(targetAlumniId) {
        if (!currentUser || currentUser.role !== "alumni") {
            showToast("Only alumni can update their own graduate tracking status.", "error");
            return;
        }
        const select = document.getElementById("trackAlumniSelect");
        if (select) {
            select.innerHTML = alumniList.map(a => `
                <option value="${a.id}">${a.name} (${a.batch || 'Alumnus'} - ${a.program || 'SAA'})</option>
            `).join("");

            // Determine which alumnus to select
            if (targetAlumniId) {
                select.value = targetAlumniId;
            } else if (currentUser && currentUser.role === "alumni") {
                const match = alumniList.find(a => Number(a.id) === Number(currentUser.alumniId))
                    || alumniList.find(a => currentUser.studentId && a.studentId === currentUser.studentId)
                    || alumniList.find(a => a.name.toLowerCase() === currentUser.name.toLowerCase());
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

        if (document.getElementById("trackEmpStatus")) document.getElementById("trackEmpStatus").value = alumnus.status || "";
        if (document.getElementById("trackCompany")) document.getElementById("trackCompany").value = alumnus.company || "";
        if (document.getElementById("trackJobTitle")) document.getElementById("trackJobTitle").value = alumnus.title || "";
        if (document.getElementById("trackIndustry")) document.getElementById("trackIndustry").value = alumnus.industry || "";
        if (document.getElementById("trackEmploymentType")) document.getElementById("trackEmploymentType").value = alumnus.employmentType || "";
        if (document.getElementById("trackLocation")) document.getElementById("trackLocation").value = alumnus.location || "Local";
        if (document.getElementById("trackEduSchool")) document.getElementById("trackEduSchool").value = alumnus.educationSchool || "";
        if (document.getElementById("trackEduProgram")) document.getElementById("trackEduProgram").value = alumnus.educationProgram || "";
        if (document.getElementById("trackEduStatus")) document.getElementById("trackEduStatus").value = alumnus.educationStatus || "";
        if (document.getElementById("trackEduYear")) document.getElementById("trackEduYear").value = alumnus.educationYear || "";

        onTrackEmpStatusChange();
    }

    /**
     * Dynamically adjusts form fields based on employment status
     */
    function onTrackEmpStatusChange() {
        const status = document.getElementById("trackEmpStatus").value;
        const employed = status === "Employed" || status === "Self-employed";
        const studying = status === "Further Studies" || status === "Technical/Vocational Training";
        const workFields = document.getElementById("trackingEmploymentFields");
        const educationFields = document.getElementById("trackingEducationFields");
        if (workFields) workFields.classList.toggle("hidden", !employed);
        if (educationFields) educationFields.classList.toggle("hidden", !studying);
        const company = document.getElementById("trackCompany");
        const title = document.getElementById("trackJobTitle");
        const school = document.getElementById("trackEduSchool");
        const program = document.getElementById("trackEduProgram");
        if (company) company.required = employed;
        if (title) title.required = employed;
        if (school) school.required = studying;
        if (program) program.required = studying;
    }

    /**
     * Submit validated employment update
     */
    async function submitEmploymentUpdate(event) {
        event.preventDefault();
        const select = document.getElementById("trackAlumniSelect");
        const targetId = select ? parseInt(select.value) : null;
        const status = document.getElementById("trackEmpStatus").value;
        const company = document.getElementById("trackCompany").value.trim();
        const title = document.getElementById("trackJobTitle").value.trim();
        const industry = document.getElementById("trackIndustry")?.value || "";
        const employmentType = document.getElementById("trackEmploymentType")?.value || "";
        const location = document.getElementById("trackLocation") ? document.getElementById("trackLocation").value : "Local";
        if (!status) {
            showToast("Select your current education or employment status.", "error");
            document.getElementById("trackEmpStatus").focus();
            return;
        }

        let targetAlumnus = alumniList.find(a => a.id === targetId);
        if (!targetAlumnus) {
            targetAlumnus = alumniList.find(a => currentUser && (a.name.toLowerCase() === currentUser.name.toLowerCase()));
        }
        const alumnusId = targetAlumnus ? targetAlumnus.id : null;
        if (!alumnusId) {
            showToast("Select an alumni record first.", "error");
            return;
        }

        try {
            await SAA_API.request(`/api/tracking/${alumnusId}/employment`, {
                method: "PUT",
                body: JSON.stringify({
                    status, company, title, industry, employmentType, location,
                    educationSchool: (document.getElementById("trackEduSchool") || {}).value || "",
                    educationProgram: (document.getElementById("trackEduProgram") || {}).value || "",
                    educationStatus: (document.getElementById("trackEduStatus") || {}).value || "",
                    educationYear: (document.getElementById("trackEduYear") || {}).value || ""
                })
            });
            await SAA_API.refreshAllData();
            if (typeof renderPlacementLogs === "function") renderPlacementLogs();
            if (typeof renderAlumniTable === "function") renderAlumniTable();
            if (typeof updateReports === "function") updateReports();
            renderOutdatedProfilesTable();
            updateTrackingKPIs();
            renderTrackingCharts();
            closeUpdateEmploymentModal();
            showToast("Employment information saved.", "success");
        } catch (err) {
            showToast(err.message || "Unable to save graduate tracking information.", "error");
        }
    }

    function exportGraduateTrackingReport() {
        const rows = trackingAlumni();
        const headers = ["Alumnus", "Education Level", "Batch Year", "SHS Strand", "Current Status", "Industry", "Employment Type", "School / Provider", "Course / Training", "Review Status", "Last Updated"];
        const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
        let csv = headers.map(escapeCsv).join(",") + "\n";
        rows.forEach(a => {
            csv += [
                a.name, a.educationLevel || "Unknown", a.batch, a.strand, a.status || "No Data",
                a.industry, a.employmentType, a.educationSchool, a.educationProgram,
                a.trackingReviewStatus || "Pending", a.lastUpdated || ""
            ].map(escapeCsv).join(",") + "\n";
        });
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "SAA_Graduate_Tracking_Report.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Graduate Tracking Report exported (${rows.length} records).`, "success");
    }

    function renderTrackingRecordsTable() {
        const body = document.getElementById("trackingRecordsTableBody");
        if (!body) return;
        const rows = trackingAlumni();
        if (!rows.length) {
            body.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400">No graduate records match these filters.</td></tr>`;
            return;
        }
        body.innerHTML = rows.map((a) => {
            const reviewStatus = a.trackingReviewStatus || "Pending";
            const badge = reviewStatus === "Verified" ? "status-approved" : reviewStatus === "Needs Follow-up" ? "status-pending" : "status-unemployed";
            const identity = [a.educationLevel || "Unknown", a.batch || "—"].join(" • ");
            const detail = a.industry || a.strand || "—";
            const pathwayDetail = a.company
                ? [a.title, a.company].filter(Boolean).join(" • ")
                : [a.educationSchool, a.educationProgram].filter(Boolean).join(" • ");
            return `<tr>
                <td class="font-bold text-slate-800">${escapeHtml(a.name)}<p class="text-[10px] text-slate-500 font-normal">${escapeHtml(a.studentId || "No student ID linked")}</p></td>
                <td>${escapeHtml(identity)}</td>
                <td>${escapeHtml(a.status || "No Data")}${pathwayDetail ? `<p class="text-[10px] text-slate-500 mt-1">${escapeHtml(pathwayDetail)}</p>` : ""}</td>
                <td>${escapeHtml(detail)}</td>
                <td><span class="status-badge ${badge}">${escapeHtml(reviewStatus)}</span>${a.trackingReviewNote ? `<p class="text-[10px] text-slate-500 mt-1">${escapeHtml(a.trackingReviewNote)}</p>` : ""}</td>
                <td class="text-right whitespace-nowrap">
                    <button type="button" onclick="reviewTrackingRecord(${Number(a.id)}, 'Verified')" class="btn btn-secondary text-xs py-1 px-2">Verify</button>
                    <button type="button" onclick="reviewTrackingRecord(${Number(a.id)}, 'Needs Follow-up')" class="btn btn-secondary text-xs py-1 px-2">Follow up</button>
                </td>
            </tr>`;
        }).join("");
    }

    async function reviewTrackingRecord(id, status) {
        const note = status === "Needs Follow-up" ? window.prompt("Add a note for the alumnus or internal follow-up:", "") : "";
        if (status === "Needs Follow-up" && note === null) return;
        try {
            await SAA_API.request(`/api/tracking/${id}/review`, {
                method: "PUT",
                body: JSON.stringify({ status, note: note || "" })
            });
            await SAA_API.refreshAllData();
            renderTrackingRecordsTable();
            showToast(`Graduate record marked ${status.toLowerCase()}.`, "success");
        } catch (err) {
            showToast(err.message || "Unable to update graduate record review status.", "error");
        }
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
                    <p><b>Student / Alumni ID:</b> ${match.studentId || "—"}</p>
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
        const pending = transcriptRequests.filter(r => ["Pending", "For Correction"].includes(r.status));
        if (!pending.length) {
            box.innerHTML = `<div class="p-8 text-center text-slate-400 font-semibold border border-slate-100 rounded-xl">No pending requests at this time.</div>`;
            return;
        }
        box.innerHTML = pending.map(r => `
            <div class="p-4 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
                <div>
                    <p class="font-extrabold text-slate-800 text-sm">${r.name}</p>
                    <p class="text-xs text-slate-400">Transcript Request • ${r.purpose || "Official Record"} • ${r.date} • ${r.status}</p>
                </div>
                <div class="flex items-center gap-2">
                    ${r.status === "For Correction"
                        ? `<span class="text-xs text-amber-700 font-bold">Waiting for alumni correction</span>`
                        : `<button onclick="updateRequestStatus(${r.id}, 'Approved')" class="btn btn-success text-xs py-1.5 px-3">Approve</button>
                           <button onclick="updateRequestStatus(${r.id}, 'For Correction')" class="btn btn-secondary text-xs py-1.5 px-3">Return</button>
                           <button onclick="updateRequestStatus(${r.id}, 'Rejected')" class="btn btn-danger text-xs py-1.5 px-3">Reject</button>`}
                    <button type="button" onclick="openTranscriptDetails(${r.id})" class="text-xs font-bold text-[#801235]">View</button>
                </div>
            </div>
        `).join("");
    }

    function renderDocumentPreparation() {
        const box = document.getElementById("documentPreparationList");
        if (!box) return;
        const approvedCount = transcriptRequests.filter(r => r.status === "Approved").length;
        const pendingCount = transcriptRequests.filter(r => r.status === "Pending").length;
        const processingCount = transcriptRequests.filter(r => r.status === "Processing").length;
        box.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="app-card p-5 border-l-4 border-l-amber-500">
                    <p class="text-xs text-slate-400 font-bold uppercase">Approved for Print</p>
                    <p class="text-3xl font-extrabold text-slate-800 mt-2">${approvedCount}</p>
                    <p class="text-[11px] text-slate-400 mt-1">Pending seal & signatures</p>
                </div>
                <div class="app-card p-5 border-l-4 border-l-indigo-500">
                    <p class="text-xs text-slate-400 font-bold uppercase">Registrar Review</p>
                    <p class="text-3xl font-extrabold text-slate-800 mt-2">${pendingCount}</p>
                    <p class="text-[11px] text-slate-400 mt-1">Waiting for validation</p>
                </div>
                <div class="app-card p-5 border-l-4 border-l-emerald-500">
                    <p class="text-xs text-slate-400 font-bold uppercase">Processing</p>
                    <p class="text-3xl font-extrabold text-slate-800 mt-2">${processingCount}</p>
                    <p class="text-[11px] text-slate-400 mt-1">Document preparation</p>
                </div>
            </div>
            <div class="mt-4 space-y-2">
                ${transcriptRequests.filter((r) => r.status === "Approved").map((r) => `
                    <div class="p-3 border border-slate-100 rounded-xl flex items-center justify-between">
                        <p class="text-sm font-bold">${r.name} • ${r.purpose || "Transcript"}</p>
                        <button type="button" onclick="updateRequestStatus(${r.id}, 'Processing')" class="btn btn-primary text-xs">Start Processing</button>
                    </div>
                `).join("")}
            </div>
        `;
    }

    function renderReleaseClaiming() {
        const box = document.getElementById("releaseRecordsList");
        if (!box) return;
        const ready = transcriptRequests.filter(r => r.status === "Ready for Release" || r.status === "Processing");
        if (!ready.length) {
            box.innerHTML = `<div class="p-8 text-center text-slate-400 font-semibold border border-slate-100 rounded-xl">No documents currently awaiting pick-up.</div>`;
            return;
        }
        box.innerHTML = ready.map(r => `
            <div class="p-4 border border-slate-200 rounded-xl flex items-center justify-between bg-white">
                <div>
                    <p class="font-extrabold text-slate-800 text-sm">${r.name}</p>
                    <p class="text-xs text-slate-400">${r.status} • ${r.claimWindow || r.delivery || "Registrar window"}</p>
                </div>
                ${r.status === "Processing"
                    ? `<button onclick="updateRequestStatus(${r.id}, 'Ready for Release')" class="btn btn-secondary text-xs py-1.5 px-3">Set Release / Claim Info</button>`
                    : `<button onclick="updateRequestStatus(${r.id}, 'Released')" class="btn btn-primary text-xs py-1.5 px-3">
                    <i class="fa-solid fa-box-open mr-1"></i> Mark Released / Claimed
                </button>`}
            </div>
        `).join("");
    }

    function renderRequestHistory() {
        const box = document.getElementById("requestHistoryList");
        if (!box) return;
        if (!transcriptRequests.length) {
            box.innerHTML = `<div class="p-8 text-center text-slate-400 font-semibold border border-slate-100 rounded-xl">No transcript requests yet.</div>`;
            return;
        }
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
        if (aCount) aCount.textContent = String(alumniList.length);

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

        const reprintsEl = document.getElementById("registrarReprintCount");
        if (reprintsEl) reprintsEl.textContent = String(reprintRequests.length);

        const fulfilled = transcriptRequests.filter(r => r.status === "Released").length;
        const rateEl = document.getElementById("registrarFulfillmentRate");
        if (rateEl) {
            rateEl.textContent = transcriptRequests.length
                ? Math.round((fulfilled / transcriptRequests.length) * 100) + "%"
                : "0%";
        }
    }

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 5376-5476 */
/* ------------------------------------------------------------------------- */
    /* Charts */
    function renderGrowthChart() {
        const canvas = document.getElementById("growthChart");
        if (!canvas) return;
        if (growthChartInstance) growthChartInstance.destroy();

        const byBatch = {};
        alumniList.forEach(a => {
            const batch = String(a.batch || "Unknown");
            byBatch[batch] = (byBatch[batch] || 0) + 1;
        });
        const labels = Object.keys(byBatch).sort();
        const data = labels.map(k => byBatch[k]);
        const trend = document.querySelector("#growthChart")?.closest(".app-card")?.querySelector(".status-badge");
        if (trend) trend.textContent = alumniList.length ? `${alumniList.length} record${alumniList.length === 1 ? "" : "s"}` : "No records yet";

        growthChartInstance = new Chart(canvas.getContext("2d"), {
            type: "line",
            data: {
                labels: labels.length ? labels : ["No data"],
                datasets: [{
                    label: "Registered Alumni",
                    data: labels.length ? data : [0],
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
        if (!currentUser || currentUser.role !== "admin") {
            [empChartInstance, indChartInstance, pathwayChartInstance].forEach((chart) => {
                if (chart) chart.destroy();
            });
            empChartInstance = null;
            indChartInstance = null;
            pathwayChartInstance = null;
            return;
        }
        setTimeout(() => {
            const pieCanvas = document.getElementById("employmentPieChart");
            const barCanvas = document.getElementById("industryBarChart");
            const pathwayCanvas = document.getElementById("postShsPathwaysChart");
            const pathwaySection = document.getElementById("postShsPathwaysSection");
            const rows = trackingAlumni();
            const showPathways = activeTrackingFilters.educationLevel !== "JHS";
            if (pathwaySection) pathwaySection.classList.toggle("hidden", !showPathways);

            if (pieCanvas) {
                if (empChartInstance) empChartInstance.destroy();

                const outcomeLabels = ["Employed", "Self-employed", "Unemployed / Seeking Work", "Further Studies", "Not Currently Seeking", "No Data"];
                const outcomeCounts = rows.reduce((counts, alumnus) => {
                    const status = normalizeTrackingStatus(alumnus.status);
                    const label = status === "Seeking Employment" ? "Unemployed / Seeking Work" : status;
                    counts[label] += 1;
                    return counts;
                }, Object.fromEntries(outcomeLabels.map((label) => [label, 0])));

                empChartInstance = new Chart(pieCanvas.getContext("2d"), {
                    type: "doughnut",
                    data: {
                        labels: outcomeLabels,
                        datasets: [{
                            data: outcomeLabels.map((label) => outcomeCounts[label]),
                            backgroundColor: ["#10b981", "#3b82f6", "#ef4444", "#a855f7", "#64748b", "#cbd5e1"]
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false }
                });
            }

            if (barCanvas) {
                if (indChartInstance) indChartInstance.destroy();

                const industryLabels = [...TRACKING_INDUSTRIES, "Not Reported"];
                const industryCounts = Object.fromEntries(industryLabels.map((industry) => [industry, 0]));
                rows.filter((a) => ["Employed", "Self-employed", "Freelance"].includes(a.status)).forEach((a) => {
                    const category = TRACKING_INDUSTRIES.includes(a.industry) ? a.industry : "Not Reported";
                    industryCounts[category] += 1;
                });

                indChartInstance = new Chart(barCanvas.getContext("2d"), {
                    type: "bar",
                    data: {
                        labels: industryLabels,
                        datasets: [{
                            label: "Alumni by self-reported industry",
                            data: industryLabels.map((industry) => industryCounts[industry]),
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

            if (pathwayCanvas) {
                if (pathwayChartInstance) pathwayChartInstance.destroy();
                pathwayChartInstance = null;
                if (!showPathways) return;
                const shsAlumni = rows.filter((a) => a.educationLevel === "SHS");
                const pathwayLabels = [
                    "College / University", "Employed", "Technical / Vocational",
                    "Self-employed", "Seeking Employment", "Not Currently Seeking", "No Updated Information"
                ];
                const pathwayCounts = Object.fromEntries(pathwayLabels.map((label) => [label, 0]));
                shsAlumni.forEach((a) => {
                    const status = a.status || "";
                    const educationText = `${a.educationProgram || ""} ${a.educationSchool || ""}`.toLowerCase();
                    let pathway = "No Updated Information";
                    if (status === "Technical/Vocational Training" || /technical|vocational|tesda|tvet/.test(educationText)) pathway = "Technical / Vocational";
                    else if (["Further Studies", "Post-grad", "Postgraduate"].includes(status)) pathway = "College / University";
                    else if (status === "Employed") pathway = "Employed";
                    else if (["Self-employed", "Freelance"].includes(status)) pathway = "Self-employed";
                    else if (["Unemployed", "Seeking Employment"].includes(status)) pathway = "Seeking Employment";
                    else if (status === "Not Currently Seeking") pathway = "Not Currently Seeking";
                    pathwayCounts[pathway] += 1;
                });
                const pathwayData = pathwayLabels.map((label) => shsAlumni.length
                    ? Math.round((pathwayCounts[label] / shsAlumni.length) * 100)
                    : 0);
                pathwayChartInstance = new Chart(pathwayCanvas.getContext("2d"), {
                    type: "bar",
                    data: {
                        labels: pathwayLabels,
                        datasets: [{
                            label: "Share of SHS Alumni (%)",
                            data: pathwayData,
                            backgroundColor: ["#801235", "#10b981", "#0ea5e9", "#3b82f6", "#f59e0b", "#64748b", "#cbd5e1"],
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
                                max: 100,
                                ticks: { callback: (value) => `${value}%` },
                                grid: { color: "#f1f5f9" }
                            },
                            x: { grid: { display: false } }
                        }
                    }
                });
            }
        }, 100);
    }

    function renderMyTrackingSummary() {
        const summary = document.getElementById("myTrackingSummary");
        if (!summary || !currentUser || currentUser.role !== "alumni") return;
        const alumnus = (alumniList || []).find((a) => Number(a.id) === Number(currentUser.alumniId))
            || (alumniList || []).find((a) => currentUser.studentId && a.studentId === currentUser.studentId)
            || (alumniList || []).find((a) => a.name.toLowerCase() === String(currentUser.name || "").toLowerCase());
        if (!alumnus || !alumnus.status) {
            summary.textContent = "You have not shared your current education or employment status yet.";
            return;
        }
        const details = alumnus.company
            ? ` ${alumnus.title ? `as ${alumnus.title} ` : ""}at ${alumnus.company}.`
            : alumnus.educationSchool
                ? ` at ${alumnus.educationSchool}${alumnus.educationProgram ? `, studying ${alumnus.educationProgram}` : ""}.`
                : ".";
        summary.textContent = `Your status: ${alumnus.status}${details} Last updated: ${alumnus.lastUpdated || "Not recorded"}.`;
    }

    function applyTrackingRoleView() {
        const role = currentUser?.role || "";
        const viewTitle = document.getElementById("currentViewTitle");
        document.querySelectorAll("[data-tracking-role]").forEach((element) => {
            const scope = element.getAttribute("data-tracking-role");
            const visible = scope === "admin"
                ? role === "admin"
                : scope === "staff"
                    ? ["admin", "staff", "registrar"].includes(role)
                    : scope === "registrar"
                        ? ["staff", "registrar"].includes(role)
                        : scope === "alumni" && role === "alumni";
            element.classList.toggle("hidden", !visible);
        });
        const title = document.getElementById("trackingPageHeading");
        const description = document.getElementById("trackingPageDescription");
        const alumniSelect = document.getElementById("trackAlumniSelectContainer");
        if (alumniSelect) alumniSelect.classList.toggle("hidden", role === "alumni");
        if (role === "alumni") {
            if (viewTitle) viewTitle.textContent = "My Graduate Status";
            if (title) title.textContent = "My Graduate Tracking";
            if (description) description.textContent = "Update your own education and employment information.";
            renderMyTrackingSummary();
        } else if (role === "staff" || role === "registrar") {
            if (viewTitle) viewTitle.textContent = "Graduate Record Review";
            if (title) title.textContent = "Graduate Record Review";
            if (description) description.textContent = "Review and verify education and employment information reported by alumni.";
        } else {
            if (viewTitle) viewTitle.textContent = "Graduate Tracking Analytics";
            if (title) title.textContent = "Graduate Tracking Analytics";
            if (description) description.textContent = "Monitor JHS and SHS education pathways and employment outcomes.";
        }
        const educationFilter = document.getElementById("trackingEducationLevelFilter");
        if (educationFilter && !educationFilter.dataset.listenerAttached) {
            educationFilter.addEventListener("change", updateTrackingStrandFilter);
            educationFilter.dataset.listenerAttached = "true";
        }
        populateTrackingFilters();
        renderTrackingRecordsTable();
        renderMyTrackingSummary();
        if (role === "admin" || role === "staff" || role === "registrar") loadTrackingSettings();
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

    function applyLiveDataToUi() {
        if (typeof updateStatCounters === "function") updateStatCounters();
        if (typeof renderAlumniTable === "function") renderAlumniTable();
        if (typeof updateReports === "function") updateReports();
        if (typeof updateRegistrarReports === "function") updateRegistrarReports();
        if (typeof renderDashboardUpcomingEvents === "function") renderDashboardUpcomingEvents();
        if (typeof renderDashboardActivity === "function") renderDashboardActivity();
        if (typeof renderEventsGrid === "function") renderEventsGrid();
        if (typeof renderReunionsGrid === "function") renderReunionsGrid();
        if (typeof renderJobsGrid === "function") renderJobsGrid();
        if (typeof renderNewsletterArchive === "function") renderNewsletterArchive();
        if (typeof renderDonorProgress === "function") renderDonorProgress();
        if (typeof updateTrackingKPIs === "function") updateTrackingKPIs();
        if (typeof populateTrackingFilters === "function") populateTrackingFilters();
        if (currentAppView === "tracking") {
            if (typeof renderTrackingRecordsTable === "function") renderTrackingRecordsTable();
            if (typeof renderMyTrackingSummary === "function") renderMyTrackingSummary();
            if (typeof renderTrackingCharts === "function") renderTrackingCharts();
            if (typeof renderOutdatedProfilesTable === "function") renderOutdatedProfilesTable();
        }
        if (typeof renderPlacementLogs === "function") renderPlacementLogs();
        if (typeof renderTranscriptRequests === "function") renderTranscriptRequests();
        if (typeof renderReprintRequests === "function") renderReprintRequests();
        if (typeof renderRequestApproval === "function") renderRequestApproval();
        if (typeof renderDocumentPreparation === "function") renderDocumentPreparation();
        if (typeof renderReleaseClaiming === "function") renderReleaseClaiming();
        if (typeof renderRequestHistory === "function") renderRequestHistory();
        if (typeof renderAcademicRecords === "function") renderAcademicRecords();
        if (typeof updateNotificationBadge === "function") updateNotificationBadge();
        if (typeof renderGrowthChart === "function") renderGrowthChart();
    }

    function loadPublicHomepageStats() {
        const base = (typeof SAA_API !== "undefined" ? SAA_API.base : "") || "";
        fetch(base + "/api/public/stats")
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!data) return;
                const alumniEl = document.getElementById("homeStatAlumni");
                const eventsEl = document.getElementById("homeStatEvents");
                const jobsEl = document.getElementById("homeStatJobs");
                if (alumniEl) alumniEl.textContent = String(data.alumni || 0);
                if (eventsEl) eventsEl.textContent = String(data.events || 0);
                if (jobsEl) jobsEl.textContent = String(data.jobs || 0);
            })
            .catch(() => { /* homepage stays at 0 when the API is offline */ });
    }

    /* Initialization */
    window.addEventListener("DOMContentLoaded", () => {
        loadPublicHomepageStats();
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
                if (typeof SAA_API !== "undefined" && SAA_API.refreshAllData) {
                    SAA_API.refreshAllData().then(() => {
                        if (typeof updateStatCounters === "function") updateStatCounters();
                        if (typeof renderAlumniTable === "function") renderAlumniTable();
                        if (typeof updateReports === "function") updateReports();
                    });
                }
            } catch (e) {
                sessionStorage.removeItem("currentUser");
            }
        }
    });
