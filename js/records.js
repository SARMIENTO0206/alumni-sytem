/* records.js - Alumni database, document requests, transcripts, reprints, placements and academic records. */

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 3613-4017 */
/* ------------------------------------------------------------------------- */

    /* Alumni Table Renderer */
    let alumniTableRows = null;

    function alumniRecordStatus(item) {
        return item.archivedAt ? "Archived" : (item.verificationStatus || "Verified");
    }

    function alumniRecordActions(item) {
        const staff = isStaffRole();
        const admin = isAdminRole();
        const recordStatus = alumniRecordStatus(item);
        const editAction = staff && recordStatus !== "Archived"
            ? `<button type="button" onclick="editAlumniModal(${Number(item.id)})" class="text-xs text-brand-magenta hover:underline font-bold">Edit</button>`
            : "";
        const verifyAction = staff && recordStatus === "Pending Verification"
            ? `<button type="button" onclick="verifyAlumniRecord(${Number(item.id)})" class="text-xs text-emerald-700 hover:underline font-bold">Verify</button>`
            : "";
        const archiveAction = admin
            ? recordStatus === "Archived"
                ? `<button type="button" onclick="restoreAlumniRecord(${Number(item.id)})" class="text-xs text-emerald-700 hover:underline font-bold">Restore</button>`
                : `<button type="button" onclick="archiveAlumniRecord(${Number(item.id)})" class="text-xs text-rose-700 hover:underline font-bold">Archive</button>`
            : "";
        /* Permanent removal stays Admin-only and only for records already archived. */
        const deleteAction = admin && recordStatus === "Archived"
            ? `<button type="button" onclick="deleteAlumniRecordPermanently(${Number(item.id)})" class="text-xs text-rose-700 hover:underline font-bold">Delete</button>`
            : "";
        const documentAction = staff && recordStatus !== "Archived"
            ? `<button type="button" onclick="viewAlumniAcademicRecord(${Number(item.id)})" class="text-xs text-slate-600 hover:underline font-bold">Academic Record</button>`
            : "";

        return `
            <div class="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                <button type="button" onclick="openAlumniDetails(${Number(item.id)})" class="text-xs text-slate-600 hover:underline font-bold">View</button>
                ${documentAction}
                ${editAction}
                ${verifyAction}
                ${archiveAction}
                ${deleteAction}
            </div>`;
    }

    function renderAlumniTable(records = alumniList) {
        const body = document.getElementById("alumniTableBody");
        if (!body) return;
        alumniTableRows = records;
        body.innerHTML = "";
        const recordStatusFilter = document.getElementById("filterRecordStatus");
        const staff = isStaffRole();
        const addButton = document.getElementById("addAlumniRecordButton");
        if (addButton) addButton.classList.toggle("hidden", !staff);
        const description = document.getElementById("alumniDatabaseDescription");
        if (description) {
            description.textContent = staff
                ? "Maintain alumni records, confirm official school information, and review academic records."
                : "Monitor official alumni records, review documents, and manage archived records.";
        }
        if (recordStatusFilter) {
            const admin = isAdminRole();
            recordStatusFilter.querySelector('option[value="All"]')?.classList.toggle("hidden", !admin);
            recordStatusFilter.querySelector('option[value="Archived"]')?.classList.toggle("hidden", !admin);
        }

        if (!records.length) {
            body.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400 font-semibold">No alumni records match these filters.</td></tr>`;
            updateStatCounters();
            return;
        }

        records.forEach(item => {
            const tr = document.createElement("tr");
            const statusClass = ["Employed", "Self-employed"].includes(item.status) ? "status-employed" :
                                ["Unemployed", "Seeking Employment"].includes(item.status) ? "status-unemployed" :
                                item.status === "No Data" ? "status-pending" : "status-postgrad";
            const recordStatus = alumniRecordStatus(item);
            const recordStatusClass = recordStatus === "Verified" ? "status-approved" :
                recordStatus === "Archived" ? "status-rejected" : "status-pending";

            tr.innerHTML = `
                <td class="font-extrabold text-slate-800">
                    <button type="button" onclick="openAlumniDetails(${Number(item.id)})" class="text-left hover:text-brand-magenta hover:underline">
                        <div>${escapeHtml(item.name || "Alumni")}</div>
                        <div class="text-[10px] text-slate-400 font-mono">${escapeHtml(item.studentId || "—")}</div>
                    </button>
                </td>
                <td class="font-semibold text-slate-600">${escapeHtml(item.batch || "—")}</td>
                <td class="text-slate-500">${escapeHtml(item.program || "—")}</td>
                <td><span class="status-badge ${statusClass}">${escapeHtml(item.status || "No Data")}</span></td>
                <td><span class="status-badge ${recordStatusClass}">${escapeHtml(recordStatus)}</span></td>
                <td class="text-right">${alumniRecordActions(item)}</td>
            `;
            body.appendChild(tr);
        });

        updateStatCounters();
    }

    function openAlumniDetails(id) {
        switchView("database", { detailId: id });
    }

    async function showAlumniDetails(id, silent) {
        let item = alumniList.find((a) => String(a.id) === String(id)) ||
            (alumniTableRows || []).find((a) => String(a.id) === String(id));
        if (!item && typeof SAA_API !== "undefined") {
            try {
                const data = await SAA_API.request(`/api/alumni/${id}`);
                item = data.alumni;
            } catch (err) {
                showToast(err.message || "Unable to load this alumni record.", "error");
                return;
            }
        }
        const list = document.getElementById("alumniListPanel");
        const panel = document.getElementById("alumniDetailPanel");
        if (!item || !panel) return;
        if (list) list.classList.add("hidden");
        panel.classList.remove("hidden");
        document.getElementById("alumniDetailName").textContent = item.name || "Alumni";
        document.getElementById("alumniDetailStudentId").textContent = item.studentId || "";
        document.getElementById("alumniDetailBatch").textContent = item.batch || "—";
        document.getElementById("alumniDetailProgram").textContent = item.program || "—";
        document.getElementById("alumniDetailCompany").textContent = item.company || "—";
        document.getElementById("alumniDetailTitle").textContent = item.title || item.jobTitle || "—";
        const statusEl = document.getElementById("alumniDetailStatus");
        if (statusEl) statusEl.textContent = item.status || "—";
        const recordStatus = alumniRecordStatus(item);
        const recordStatusEl = document.getElementById("alumniDetailRecordStatus");
        if (recordStatusEl) {
            recordStatusEl.textContent = recordStatus;
            recordStatusEl.className = `status-badge ${recordStatus === "Verified" ? "status-approved" : recordStatus === "Archived" ? "status-rejected" : "status-pending"} mt-2`;
        }
        const actions = document.getElementById("alumniDetailActions");
        if (actions) {
            actions.innerHTML = alumniRecordActions(item);
        }
        if (!silent) switchView("database", { detailId: item.id });
    }

    function openTranscriptDetails(id) {
        switchView("transcript", { detailId: id });
    }

    async function showTranscriptDetails(id, silent) {
        let item = transcriptRequests.find((r) => String(r.id) === String(id));
        let history = [];
        let attachments = item && item.attachments ? item.attachments : [];
        if (typeof SAA_API !== "undefined") {
            try {
                const data = await SAA_API.request(`/api/transcripts/${id}`);
                item = data.request || item;
                history = data.history || [];
                attachments = data.attachments || attachments;
                if (item && !transcriptRequests.some((r) => String(r.id) === String(item.id))) transcriptRequests.unshift(item);
            } catch (err) {
                if (!item) {
                    showToast(err.message || "You cannot open this transcript request.", "error");
                    return;
                }
            }
        }
        const list = document.getElementById("transcriptListPanel");
        const panel = document.getElementById("transcriptDetailPanel");
        if (!item || !panel) return;
        if (list) list.classList.add("hidden");
        panel.classList.remove("hidden");
        document.getElementById("transcriptDetailName").textContent = item.name || "Request";
        document.getElementById("transcriptDetailDate").textContent = item.date || "—";
        document.getElementById("transcriptDetailStatus").textContent = item.status || "—";
        const codeEl = document.getElementById("transcriptDetailCode");
        if (codeEl) codeEl.textContent = documentRequestCode("transcript", item);
        const workflowEl = document.getElementById("transcriptDetailWorkflow");
        if (workflowEl) workflowEl.innerHTML = documentWorkflowHtml(item.status);
        const detailLines = [
            `Alumni: ${item.name || "—"}`,
            `Educational Level: ${item.educationLevel || "—"}`,
            `Batch: ${item.batch || "—"}`,
            `Strand: ${item.strand || "—"}`,
            `Student ID: ${item.studentId || "—"}`,
            `Document: ${item.type || "Academic Record"}`,
            `Purpose: ${item.purpose || "—"}`,
            `Copies: ${Number(item.copies || 1)}`,
            `Delivery: ${item.delivery || "—"}`,
            item.requestNotes ? `Additional Notes: ${item.requestNotes}` : ""
        ].filter(Boolean);
        document.getElementById("transcriptDetailPurpose").textContent = detailLines.join("\n");
        const remarksEl = document.getElementById("transcriptDetailRemarks");
        if (remarksEl) remarksEl.textContent = item.remarks || item.correctionNotes || "—";
        const claimEl = document.getElementById("transcriptDetailClaim");
        if (claimEl) {
            const completedAt = item.completedAt || item.releasedAt;
            const bits = [item.delivery, item.claimWindow, item.claimNotes, completedAt ? `Completed ${completedAt}` : ""].filter(Boolean);
            claimEl.textContent = bits.join(" • ") || "Not set yet.";
        }
        const attBox = document.getElementById("transcriptDetailAttachments");
        if (attBox) {
            attBox.innerHTML = attachments.length
                ? `<p class="text-[10px] font-bold text-slate-400 uppercase">Supporting documents</p>` + attachments.map((f) =>
                    `<a class="block text-xs text-[#801235] font-bold" href="${f.dataUri}" download="${f.fileName}">${f.fileName}</a>`
                ).join("")
                : `<p class="text-xs text-slate-400">No supporting documents uploaded.</p>`;
        }
        const histBox = document.getElementById("transcriptDetailHistory");
        if (histBox) {
            histBox.innerHTML = history.length
                ? `<p class="text-[10px] font-bold text-slate-400 uppercase">Request history</p>` + history.map((h) =>
                    `<p>${h.createdAt || ""} • ${h.action}${h.remarks ? " — " + h.remarks : ""}</p>`
                ).join("")
                : "";
        }
        const role = typeof normalizeRole === "function" ? normalizeRole(currentUser?.role) : currentUser?.role;
        const isProcessor = ["staff", "registrar"].includes(role);
        const isOwnerAlumni = role === "alumni";
        const actions = document.getElementById("transcriptDetailActions");
        if (actions) {
            let html = "";
            html += `<button type="button" onclick="openClaimStub(${item.id})" class="btn btn-secondary text-xs">View Claim Stub</button>`;
            if (isOwnerAlumni && item.canCancel) html += `<button type="button" onclick="cancelDocumentRequest('transcript', ${item.id})" class="btn btn-danger text-xs">Cancel Request</button>`;
            if (isProcessor && item.status === "Pending") {
                html += `<button type="button" onclick="updateRequestStatus(${item.id}, 'Approved')" class="btn btn-success text-xs">Approve Request</button>`;
                html += `<button type="button" onclick="updateRequestStatus(${item.id}, 'Rejected')" class="btn btn-danger text-xs">Reject Request</button>`;
                html += `<button type="button" onclick="updateRequestStatus(${item.id}, 'For Correction')" class="btn btn-secondary text-xs">Return for Correction</button>`;
            }
            if (isProcessor && item.status === "Approved") html += `<button type="button" onclick="updateRequestStatus(${item.id}, 'Processing')" class="btn btn-primary text-xs">Start Processing</button>`;
            if (isProcessor && item.status === "Processing") html += `<button type="button" onclick="updateRequestStatus(${item.id}, 'Ready for Release')" class="btn btn-primary text-xs">Mark as Ready</button>`;
            if (isProcessor && item.status === "Ready for Release") html += `<button type="button" onclick="updateRequestStatus(${item.id}, 'Completed')" class="btn btn-primary text-xs"><i class="fa-solid fa-box-open mr-1"></i>Mark as Claimed</button>`;
            if (isProcessor && documentStatusBucket(item.status) === "Completed") html += `<span class="text-xs font-semibold text-emerald-700 self-center">Document claimed — request completed.</span>`;
            actions.innerHTML = html;
        }
        const forms = document.getElementById("transcriptDetailForms");
        if (forms) {
            if (isOwnerAlumni && item.status === "For Correction") {
                forms.innerHTML = `
                    <div class="p-3 rounded-xl border border-amber-200 bg-amber-50 space-y-2">
                        <p class="text-xs font-bold text-amber-800">The Registrar asked for a correction.</p>
                        <textarea id="correctionNotes" class="form-textarea text-xs" rows="3" placeholder="Describe the updated information"></textarea>
                        <input type="file" id="correctionFiles" accept=".pdf,.png,.jpg,.jpeg" multiple class="form-input text-xs">
                        <button type="button" onclick="submitCorrectionResponse('transcript', ${item.id})" class="btn btn-primary text-xs">Submit Correction</button>
                    </div>`;
            } else {
                forms.innerHTML = "";
            }
        }
        if (!silent) switchView("transcript", { detailId: item.id });
    }

    async function searchAlumniTable() {
        const query = document.getElementById("dbSearch")?.value || "";
        const filter = document.getElementById("filterStatus")?.value || "";
        const recordStatus = document.getElementById("filterRecordStatus")?.value || "";
        try {
            if (typeof SAA_API !== "undefined" && (await SAA_API.health())) {
                const params = new URLSearchParams();
                if (query) params.set("q", query);
                if (filter) params.set("status", filter);
                if (recordStatus) params.set("recordStatus", recordStatus);
                const data = await SAA_API.request(`/api/alumni?${params.toString()}`);
                renderAlumniTable(data.alumni || []);
                return;
            }
        } catch (err) {
            showToast("Unable to search alumni records.", "error");
        }
        const filtered = (alumniTableRows || alumniList).filter((item) =>
            (!query || [item.name, item.studentId, item.program, item.batch].join(" ").toLowerCase().includes(query.toLowerCase())) &&
            (!filter || item.status === filter) &&
            (!recordStatus || (recordStatus === "All" ||
                (recordStatus === "Archived" ? alumniRecordStatus(item) === "Archived" :
                    (alumniRecordStatus(item) === recordStatus && recordStatus !== "Archived"))))
        );
        renderAlumniTable(filtered);
    }

    function sortTable(columnIndex) {
        currentSortDirection = !currentSortDirection;
        const rows = [...(alumniTableRows || alumniList)];
        rows.sort((a, b) => {
            let valA = columnIndex === 0 ? a.name.toLowerCase() : parseInt(a.batch);
            let valB = columnIndex === 0 ? b.name.toLowerCase() : parseInt(b.batch);
            if (valA < valB) return currentSortDirection ? -1 : 1;
            if (valA > valB) return currentSortDirection ? 1 : -1;
            return 0;
        });
        renderAlumniTable(rows);
        showToast("Sorted table records.", "info");
    }

    function exportToCSV() {
        const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
        const rows = [
            ["ID", "Student ID", "Name", "Batch Year", "Program/Course", "Employment Status", "Record Status"],
            ...alumniList.map((item) => [
                item.id,
                item.studentId,
                item.name,
                item.batch,
                item.program,
                item.status,
                alumniRecordStatus(item)
            ])
        ];
        const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "SAA_Alumni_Records.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Exported records to CSV.", "success");
    }

    /* Add/Edit Alumni */
    function openAddAlumniModal() {
        if (!isStaffRole()) return;
        document.getElementById("alumniModalTitle").textContent = "Add New Alumni";
        document.getElementById("editAlumniId").value = "";
        document.getElementById("newAlumniName").value = "";
        document.getElementById("newAlumniBatch").value = new Date().getFullYear();
        const idField = document.getElementById("newAlumniStudentId");
        idField.value = "";
        idField.readOnly = false;
        idField.classList.remove("bg-slate-50");
        const idHint = document.getElementById("newAlumniIdHint");
        if (idHint) idHint.textContent = "The official Alumni ID (SAA-YYYY-NNNN) is issued by the system when this record is verified.";
        document.getElementById("newAlumniProgram").value = "";
        document.getElementById("newAlumniEmployment").value = "No Data";
        document.getElementById("alumniVerificationNotice").classList.remove("hidden");
        document.getElementById("addAlumniModal").classList.add("active");
    }

    function editAlumniModal(id) {
        if (!isStaffRole()) return;
        const item = (alumniTableRows || []).find(a => Number(a.id) === Number(id)) ||
            alumniList.find(a => Number(a.id) === Number(id));
        if (!item) return;

        document.getElementById("alumniModalTitle").textContent = "Edit Alumni Record";
        document.getElementById("editAlumniId").value = item.id;
        document.getElementById("newAlumniName").value = item.name;
        document.getElementById("newAlumniBatch").value = item.batch;
        /* The Alumni ID is locked once the record is verified. */
        const idField = document.getElementById("newAlumniStudentId");
        const idLocked = item.verificationStatus === "Verified";
        idField.value = item.studentId || "";
        idField.readOnly = idLocked;
        idField.classList.toggle("bg-slate-50", idLocked);
        const idHint = document.getElementById("newAlumniIdHint");
        if (idHint) {
            idHint.textContent = idLocked
                ? "Official Alumni ID issued by the system. It can no longer be edited."
                : "The official Alumni ID (SAA-YYYY-NNNN) is issued by the system when this record is verified.";
        }
        document.getElementById("newAlumniProgram").value = item.program;
        document.getElementById("newAlumniEmployment").value = item.status;
        document.getElementById("alumniVerificationNotice").classList.add("hidden");
        document.getElementById("addAlumniModal").classList.add("active");
    }

    function closeAddAlumniModal() {
        document.getElementById("addAlumniModal").classList.remove("active");
    }

    async function saveAlumniRecord(event) {
        event.preventDefault();
        const editId = document.getElementById("editAlumniId").value;
        const name = document.getElementById("newAlumniName").value.trim();
        const batch = document.getElementById("newAlumniBatch").value;
        const idField = document.getElementById("newAlumniStudentId");
        const studentId = idField.value.trim();
        const program = document.getElementById("newAlumniProgram").value.trim();
        const status = document.getElementById("newAlumniEmployment").value;
        const payload = { name, batch, program, status };
        /* The Alumni ID is only sent while it is still editable (unverified records). */
        if (!idField.readOnly) payload.studentId = studentId;
        if (!name) {
            showToast("Name is required.", "error");
            return;
        }

        try {
            if (typeof SAA_API === "undefined" || !(await SAA_API.health())) {
                showToast("Unable to save alumni record. The server is offline.", "error");
                return;
            }
            if (editId) {
                await SAA_API.request(`/api/alumni/${editId}`, {
                    method: "PUT",
                    body: JSON.stringify(payload)
                });
                showToast(`Updated record for ${name}.`, "success");
            } else {
                await SAA_API.request("/api/alumni", {
                    method: "POST",
                    body: JSON.stringify(payload)
                });
                showToast(`Added ${name}. Verify the school record before account activation.`, "success");
            }
            await SAA_API.refreshAllData();
            await searchAlumniTable();
            closeAddAlumniModal();
        } catch (err) {
            showToast(err.message || "Unable to save alumni record. Please try again.", "error");
        }
    }

    function viewAlumniAcademicRecord(id) {
        const item = (alumniTableRows || []).find((a) => Number(a.id) === Number(id)) ||
            alumniList.find((a) => Number(a.id) === Number(id));
        if (!item) return;
        switchView("academic-records");
        const search = document.getElementById("academicRecordsSearch");
        if (search) {
            search.value = item.studentId || item.name || "";
            filterAcademicRecords();
        }
    }

    /* ---------------- Academic record correction requests (Registrar) ---------------- */

    async function loadRecordCorrections() {
        const box = document.getElementById("recordCorrectionList");
        if (!box) return;
        if (!isStaffRole()) {
            box.innerHTML = `<p class="text-xs text-slate-400">Registrar access required.</p>`;
            return;
        }
        try {
            const data = await SAA_API.request("/api/alumni/corrections");
            const rows = (data.corrections || []).filter((row) => row.status === "Pending");
            if (!rows.length) {
                box.innerHTML = `<p class="text-xs text-slate-400">No pending correction requests.</p>`;
                return;
            }
            box.innerHTML = rows.map((row) => `
                <div class="p-4 rounded-xl border border-amber-200 bg-amber-50/60">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <div class="min-w-0">
                            <p class="text-xs font-extrabold text-slate-800">${escapeHtml(row.alumniName || "Alumni")}</p>
                            <p class="text-[11px] text-slate-500">${escapeHtml(row.alumniCode || "No Alumni ID yet")} • ${escapeHtml(row.field)}</p>
                            <p class="text-[11px] text-slate-600 mt-1">${escapeHtml(row.message)}</p>
                            <p class="text-[10px] text-slate-400 mt-1">Requested ${escapeHtml(row.createdAt || "")}</p>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            <button type="button" class="btn btn-secondary text-[11px] py-1 px-2.5" onclick="editAlumniModal(${Number(row.alumniId)})">Open Record</button>
                            <button type="button" class="btn btn-primary text-[11px] py-1 px-2.5" onclick="resolveRecordCorrection(${Number(row.id)}, 'Resolved')">Mark Resolved</button>
                            <button type="button" class="btn btn-secondary text-[11px] py-1 px-2.5 text-rose-700" onclick="resolveRecordCorrection(${Number(row.id)}, 'Declined')">Decline</button>
                        </div>
                    </div>
                </div>
            `).join("");
        } catch (err) {
            box.innerHTML = `<p class="text-xs text-rose-600">${escapeHtml(err.message)}</p>`;
        }
    }

    /** Closes a correction request; the Registrar edits the record itself in the database view. */
    async function resolveRecordCorrection(id, outcome) {
        const isDeclined = outcome === "Declined";
        const note = window.prompt(
            isDeclined
                ? "Why is this correction declined? The alumnus will see this note."
                : "Optional note for the alumnus (for example what was updated):"
        ) || "";
        if (isDeclined && !note.trim()) {
            showToast("A short reason is required to decline a correction request.", "error");
            return;
        }
        try {
            await SAA_API.request(`/api/alumni/corrections/${id}/resolve`, {
                method: "POST",
                body: JSON.stringify({ status: outcome, note: note.trim() })
            });
            showToast(`Correction request marked ${outcome.toLowerCase()}.`, "success");
            loadRecordCorrections();
        } catch (err) {
            showToast(err.message || "Unable to update the correction request.", "error");
        }
    }

    async function verifyAlumniRecord(id) {
        if (!isStaffRole()) return;
        try {
            if (typeof SAA_API === "undefined" || !(await SAA_API.health())) {
                showToast("Unable to verify alumni record. The server is offline.", "error");
                return;
            }
            await SAA_API.request(`/api/alumni/${id}/verify`, { method: "POST" });
            await SAA_API.refreshAllData();
            await searchAlumniTable();
            await showAlumniDetails(id, true);
            showToast("School record verified.", "success");
        } catch (err) {
            showToast(err.message || "Unable to verify alumni record.", "error");
        }
    }

    async function archiveAlumniRecord(id) {
        if (!isAdminRole()) return;
        if (!confirm("Archive this alumni record? The record and history will be kept, and the linked account will be deactivated.")) return;
        try {
            if (typeof SAA_API === "undefined" || !(await SAA_API.health())) {
                showToast("Unable to archive alumni record. The server is offline.", "error");
                return;
            }
            await SAA_API.request(`/api/alumni/${id}/archive`, { method: "POST" });
            await SAA_API.refreshAllData();
            switchView("database");
            await searchAlumniTable();
            showToast("Alumni record archived and linked account deactivated.", "success");
        } catch (err) {
            showToast(err.message || "Unable to archive alumni record.", "error");
        }
    }

    /** Admin-only permanent removal of an already archived record. */
    async function deleteAlumniRecordPermanently(id) {
        if (!isAdminRole()) return;
        const item = (alumniTableRows || []).find((a) => Number(a.id) === Number(id))
            || alumniList.find((a) => Number(a.id) === Number(id));
        const label = item ? `${item.name}${item.studentId ? ` (${item.studentId})` : ""}` : `record #${id}`;
        if (!confirm(`Permanently delete ${label}?\n\nThis cannot be undone. Document requests, payments and notifications stay in the audit trail but are unlinked from this record.`)) return;
        try {
            if (typeof SAA_API === "undefined" || !(await SAA_API.health())) {
                showToast("Unable to delete alumni record. The server is offline.", "error");
                return;
            }
            await SAA_API.request(`/api/alumni/${id}`, { method: "DELETE" });
            await SAA_API.refreshAllData();
            await searchAlumniTable();
            showToast("Alumni record permanently deleted.", "success");
        } catch (err) {
            showToast(err.message || "Unable to delete the alumni record.", "error");
        }
    }

    async function restoreAlumniRecord(id) {
        if (!isAdminRole()) return;
        if (!confirm("Restore this alumni record and restore the linked account's previous status?")) return;
        try {
            if (typeof SAA_API === "undefined" || !(await SAA_API.health())) {
                showToast("Unable to restore alumni record. The server is offline.", "error");
                return;
            }
            await SAA_API.request(`/api/alumni/${id}/restore`, { method: "POST" });
            await SAA_API.refreshAllData();
            switchView("database");
            await searchAlumniTable();
            showToast("Alumni record restored.", "success");
        } catch (err) {
            showToast(err.message || "Unable to restore alumni record.", "error");
        }
    }

    /* Document Requests */
    function openRequestDocModal(docType) {
        if (currentUser?.role !== "alumni") {
            showToast("Only alumni can submit document requests. Registrar staff process requests; administrators can monitor them.", "warning");
            return;
        }
        document.getElementById("requestDocModalTitle").textContent = `Request ${docType}`;
        const typeSelect = document.getElementById("docType");
        const isReprint = String(docType || "").toLowerCase().includes("reprint");
        typeSelect.value = isReprint ? "Diploma Reprint" : "Transcript of Records";
        document.getElementById("docPurpose").value = "";
        document.getElementById("docReprintReason").value = "";
        document.getElementById("docRequestNotes").value = "";
        document.getElementById("docAttachments").value = "";
        toggleReprintRequestFields();

        const emailEl = document.getElementById("docEmail");
        const contactEl = document.getElementById("docContact");

        if (emailEl) emailEl.value = currentUser ? (currentUser.email || "") : "";
        if (contactEl) contactEl.value = currentUser ? (currentUser.contact || "") : "";

        document.getElementById("requestDocModal").classList.add("active");
    }

    function toggleReprintRequestFields() {
        const type = document.getElementById("docType")?.value || "";
        const isReprint = type.toLowerCase().includes("reprint");
        document.getElementById("reprintReasonField")?.classList.toggle("hidden", !isReprint);
        document.getElementById("docPurposeField")?.classList.toggle("hidden", isReprint);
        document.getElementById("docDeliveryField")?.classList.toggle("hidden", isReprint);
        const purpose = document.getElementById("docPurpose");
        if (purpose) purpose.required = !isReprint;
        const reason = document.getElementById("docReprintReason");
        if (reason) reason.required = isReprint;
    }

    function closeRequestDocModal() {
        document.getElementById("requestDocModal").classList.remove("active");
    }

    function readFilesAsAttachments(input) {
        const files = input && input.files ? Array.from(input.files).slice(0, 3) : [];
        return Promise.all(files.map((file) => new Promise((resolve, reject) => {
            if (file.size > 1024 * 1024) {
                reject(new Error(`${file.name} is larger than 1 MB.`));
                return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve({
                fileName: file.name,
                mimeType: file.type,
                dataUri: reader.result
            });
            reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`));
            reader.readAsDataURL(file);
        })));
    }

    function submitDocumentRequest(event) {
        event.preventDefault();
        const type = document.getElementById("docType").value;
        const purpose = document.getElementById("docPurpose").value;
        const delivery = document.getElementById("docDelivery") ? document.getElementById("docDelivery").value : "Pick-up at Registrar Window";
        const email = document.getElementById("docEmail") ? document.getElementById("docEmail").value : (currentUser?.email || "");
        const contact = document.getElementById("docContact") ? document.getElementById("docContact").value : (currentUser?.contact || "");
        const copies = document.getElementById("docCopies") ? document.getElementById("docCopies").value : 1;
        const reprintReason = document.getElementById("docReprintReason")?.value || "";
        const requestNotes = document.getElementById("docRequestNotes")?.value.trim() || "";

        const payload = {
            name: currentUser ? currentUser.name : "",
            email: email,
            contact: contact,
            purpose: purpose,
            type: type,
            delivery: delivery,
            copies,
            reason: reprintReason,
            requestNotes
        };
        const isReprint = type && String(type).toLowerCase().includes("reprint");
        if (!payload.name || (!isReprint && !purpose)) {
            showToast(isReprint ? "Your account name is required." : "Name and purpose are required.", "error");
            return;
        }
        (async () => {
            try {
                if (typeof SAA_API === "undefined" || !(await SAA_API.health())) {
                    showToast("Unable to submit the request. The server is offline.", "error");
                    return;
                }
                payload.attachments = await readFilesAsAttachments(document.getElementById("docAttachments"));
                const path = isReprint ? "/api/reprints" : "/api/transcripts";
                const created = await SAA_API.request(path, { method: "POST", body: JSON.stringify(payload) });
                await SAA_API.refreshAllData();
                renderTranscriptRequests();
                renderReprintRequests();
                closeRequestDocModal();
                const record = created.request || created.reprint;
                showToast(`Request submitted. Status is ${record.status}. The Registrar will review your request.`, "success");
            } catch (err) {
                showToast(err.message || "Unable to submit the request. Please try again.", "error");
            }
        })();
    }

    /* -------------------------------------------------------------------------
       ONE document-request workflow for both request pages.
       Pending -> Processing (Approved) -> Ready for Release -> Completed.
       Cancelled and Rejected are terminal states and never count as Completed.
       The Registrar works the whole flow from the request page itself, so the
       former Approval Queue and Release & Claiming pages are status filters.
       ------------------------------------------------------------------------- */
    const DOCUMENT_STATUS_BUCKETS = {
        Pending: ["Pending", "For Correction"],
        Processing: ["Approved", "Processing"],
        Ready: ["Ready for Release"],
        Completed: ["Completed", "Released"],
        Closed: ["Rejected", "Cancelled"]
    };

    const DOCUMENT_FILTERS = ["All", "Pending", "Processing", "Ready", "Completed", "Closed"];

    const DOCUMENT_FILTER_LABELS = {
        All: "All",
        Pending: "Pending",
        Processing: "Processing",
        Ready: "Ready",
        Completed: "Completed",
        Closed: "Cancelled / Rejected"
    };

    const DOCUMENT_WORKFLOW_STEPS = [
        { key: "Pending", label: "Pending" },
        { key: "Processing", label: "Processing" },
        { key: "Ready", label: "Ready for Release" },
        { key: "Completed", label: "Completed" }
    ];

    const documentRequestFilters = { transcript: "All", reprint: "All" };

    function documentStatusBucket(status) {
        const value = String(status || "");
        const entry = Object.entries(DOCUMENT_STATUS_BUCKETS).find(([, list]) => list.includes(value));
        return entry ? entry[0] : "Pending";
    }

    function documentStatusClass(status) {
        switch (documentStatusBucket(status)) {
            case "Completed": return "status-completed";
            case "Ready": return "status-ready";
            case "Processing": return "status-processing";
            case "Closed": return String(status) === "Cancelled" ? "status-cancelled" : "status-rejected";
            default: return "status-pending";
        }
    }

    function documentRequestCode(kind, item) {
        const prefix = kind === "reprint" ? "RPT" : "REQ";
        const year = String(item?.date || "").slice(0, 4) || String(new Date().getFullYear());
        return `${prefix}-${year}-${String(item?.id ?? 0).padStart(4, "0")}`;
    }

    /* Read-only progress strip shown on the request detail panel. */
    function documentWorkflowHtml(status) {
        const bucket = documentStatusBucket(status);
        if (bucket === "Closed") {
            const label = String(status) === "Cancelled" ? "Cancelled" : "Rejected";
            const tone = String(status) === "Cancelled" ? "status-cancelled" : "status-rejected";
            return `<p class="text-xs text-slate-500 font-semibold">Workflow closed — <span class="status-badge ${tone}">${label}</span> requests are not counted as Completed.</p>`;
        }
        const currentIndex = DOCUMENT_WORKFLOW_STEPS.findIndex((step) => step.key === bucket);
        return DOCUMENT_WORKFLOW_STEPS.map((step, index) => {
            const reached = index <= currentIndex;
            const chip = `<span class="px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wide ${reached ? "bg-[#801235] text-white border-[#801235]" : "bg-slate-50 text-slate-400 border-slate-200"}">${index + 1}. ${step.label}${step.key === bucket ? " • current" : ""}</span>`;
            return index ? `<i class="fa-solid fa-arrow-right text-slate-300 text-[10px]"></i>${chip}` : chip;
        }).join("");
    }

    function renderDocumentRequestCounters(kind, rows) {
        const prefix = kind === "reprint" ? "reprint" : "document";
        ["Pending", "Processing", "Ready", "Completed"].forEach((key) => {
            const element = document.getElementById(`${prefix}${key}Count`);
            if (element) element.textContent = String(rows.filter((row) => documentStatusBucket(row.status) === key).length);
        });
    }

    function renderDocumentRequestTabs(kind, rows) {
        const container = document.getElementById(kind === "reprint" ? "reprintRequestTabs" : "documentRequestTabs");
        if (!container) return;
        const active = documentRequestFilters[kind] || "All";
        documentRequestFilters[kind] = active;
        container.innerHTML = DOCUMENT_FILTERS.map((key) => {
            const count = key === "All" ? rows.length : rows.filter((row) => documentStatusBucket(row.status) === key).length;
            return `<button type="button" onclick="setDocumentRequestFilter('${kind}', '${key}')" class="btn ${key === active ? "btn-primary" : "btn-secondary"} text-xs py-1.5 px-3">${DOCUMENT_FILTER_LABELS[key]} <span class="font-extrabold">${count}</span></button>`;
        }).join("");
    }

    /* Used by the status cards, the filter tabs and the retired page routes. */
    function setDocumentRequestFilter(kind, filter) {
        const target = kind === "reprint" ? "reprint" : "transcript";
        documentRequestFilters[target] = DOCUMENT_FILTERS.includes(filter) ? filter : "All";
        if (target === "reprint") renderReprintRequests();
        else renderTranscriptRequests();
    }

    function visibleDocumentRequests(kind, rows) {
        const active = documentRequestFilters[kind] || "All";
        if (active === "All") return rows;
        return rows.filter((row) => documentStatusBucket(row.status) === active);
    }

    function documentRequestActionLabel(kind, item, canProcess) {
        const bucket = documentStatusBucket(item.status);
        /* Finished or closed requests are read-only in the table. */
        if (bucket === "Completed" || bucket === "Closed") return "View";
        if (!canProcess) return "View Details";
        if (bucket === "Pending") return "Review";
        if (bucket === "Ready") return "Release";
        return "View";
    }

    function renderTranscriptRequests() {
        const body = document.getElementById("transcriptTableBody");
        if (!body) return;
        body.innerHTML = "";
        const role = typeof normalizeRole === "function" ? normalizeRole(currentUser?.role) : currentUser?.role;
        const isAlumni = role === "alumni";
        const isRegistrar = role === "staff" || role === "registrar";
        const requestButton = document.getElementById("transcriptRequestButton");
        const heading = document.querySelector("#transcriptListPanel h3");
        const description = document.querySelector("#transcriptListPanel h3 + p");
        if (requestButton) requestButton.classList.toggle("hidden", !isAlumni);
        document.getElementById("documentRequestOverview")?.classList.toggle("hidden", isAlumni);
        document.getElementById("documentRequestTabs")?.classList.toggle("hidden", isAlumni);
        if (heading) heading.textContent = isAlumni ? "My Academic Record Requests" : isRegistrar ? "Transcript & Academic Record Requests" : "Document Requests Overview";
        if (description) description.textContent = isAlumni
            ? "Submit academic record requests and track their review and release status."
            : isRegistrar
                ? "Review, process, mark as ready, then confirm the claim to complete each academic record request."
                : "Monitor academic record request status. Processing controls are reserved for Registrar staff.";

        const rows = transcriptRequests || [];
        renderDocumentRequestCounters("transcript", rows);
        if (!isAlumni) renderDocumentRequestTabs("transcript", rows);

        if (!rows.length) {
            body.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-400 font-semibold">No transcript requests yet.</td></tr>`;
            return;
        }

        const visible = isAlumni ? rows : visibleDocumentRequests("transcript", rows);
        if (!visible.length) {
            body.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-400 font-semibold">No ${DOCUMENT_FILTER_LABELS[documentRequestFilters.transcript] || "matching"} academic record requests.</td></tr>`;
            return;
        }

        visible.forEach(item => {
            const tr = document.createElement("tr");
            const statusClass = documentStatusClass(item.status);
            const canProcess = isRegistrar;
            const cancelBtn = isAlumni && item.canCancel
                ? `<button type="button" onclick="cancelDocumentRequest('transcript', ${item.id})" class="text-xs text-rose-600 font-semibold hover:underline ml-2">Cancel</button>`
                : "";

            tr.innerHTML = `
                <td class="font-extrabold text-slate-800">
                    <div>${item.name}</div>
                    <p class="text-[10px] font-mono text-slate-400">${documentRequestCode("transcript", item)}</p>
                    <button type="button" onclick="openTranscriptDetails(${item.id})" class="text-[10px] text-[#801235] font-bold hover:underline mr-2">
                        <i class="fa-solid fa-eye mr-0.5"></i> View Details
                    </button>
                    <button type="button" onclick="openClaimStub(${item.id})" class="text-[10px] text-[#801235] font-bold hover:underline">
                        <i class="fa-solid fa-receipt mr-0.5"></i> View Claim Stub
                    </button>
                </td>
                <td class="text-slate-500">${item.date || "—"}</td>
                <td class="text-slate-600 font-medium">${item.type || "Academic Record"}</td>
                <td><span class="status-badge ${statusClass}">${item.status}</span></td>
                <td class="text-right">
                    <button type="button" onclick="openTranscriptDetails(${item.id})" class="text-xs text-brand-magenta font-semibold hover:underline">${documentRequestActionLabel("transcript", item, canProcess)}</button>
                    ${cancelBtn}
                </td>
            `;
            body.appendChild(tr);
        });
    }

    async function updateRequestStatus(id, newStatus, kind) {
        const type = kind || "transcript";
        try {
            if (typeof SAA_API === "undefined" || !(await SAA_API.health())) {
                showToast("Unable to update request status. The server is offline.", "error");
                return;
            }
            let remarks = "";
            if (newStatus === "Rejected") {
                remarks = prompt("Reason for rejection (required):") || "";
                if (!remarks.trim()) {
                    showToast("A rejection reason is required.", "error");
                    return;
                }
            }
            if (newStatus === "For Correction") {
                remarks = prompt("What additional information or correction is needed?") || "";
                if (!remarks.trim()) {
                    showToast("Describe the missing information.", "error");
                    return;
                }
            }
            let claimWindow = "";
            let claimNotes = "";
            if (newStatus === "Ready for Release") {
                claimWindow = prompt("Release / claim window (example: Registrar window, Mon–Fri 8AM–4PM):") || "Registrar window";
                claimNotes = prompt("Claim instructions for the alumni:") || "";
            }
            const path = type === "reprint" ? `/api/reprints/${id}/status` : `/api/transcripts/${id}/status`;
            await SAA_API.request(path, {
                method: "PUT",
                body: JSON.stringify({ status: newStatus, remarks, claimWindow, claimNotes })
            });
            await SAA_API.refreshAllData();
            renderTranscriptRequests();
            renderReprintRequests();
            if (typeof updateReports === "function") updateReports();
            if (typeof updateRegistrarReports === "function") updateRegistrarReports();
            if (typeof renderRequestHistory === "function") renderRequestHistory();
            if (typeof renderRequestStatusView === "function") renderRequestStatusView();
            if (type === "transcript" && typeof showTranscriptDetails === "function") showTranscriptDetails(id, true);
            if (type === "reprint" && typeof showReprintDetails === "function") showReprintDetails(id, true);
            if (newStatus === "Completed") {
                showToast("Request marked as Completed. The document has been claimed.", "success");
            } else if (newStatus === "Ready for Release") {
                showToast("Request is Ready for Release. The alumni has been notified.", "success");
            } else {
                showToast(`Request marked as ${newStatus}. The alumni will be notified.`, "success");
            }
        } catch (err) {
            showToast(err.message || "Unable to update request status.", "error");
        }
    }

    async function cancelDocumentRequest(kind, id) {
        if (!confirm("Cancel this request? The record will be kept as Cancelled, not deleted.")) return;
        try {
            const path = kind === "reprint" ? `/api/reprints/${id}/cancel` : `/api/transcripts/${id}/cancel`;
            await SAA_API.request(path, { method: "POST", body: JSON.stringify({ remarks: "Cancelled by alumni." }) });
            await SAA_API.refreshAllData();
            renderTranscriptRequests();
            renderReprintRequests();
            showToast("Request cancelled. The record remains in request history.", "info");
        } catch (err) {
            showToast(err.message || "Unable to cancel this request.", "error");
        }
    }

    async function submitCorrectionResponse(kind, id) {
        try {
            const notes = (document.getElementById("correctionNotes") || {}).value || "";
            const attachments = await readFilesAsAttachments(document.getElementById("correctionFiles"));
            await SAA_API.request(`/api/transcripts/${id}/correction-response`, {
                method: "POST",
                body: JSON.stringify({ notes, attachments })
            });
            await SAA_API.refreshAllData();
            showTranscriptDetails(id, true);
            showToast("Correction submitted. Status is Pending for Registrar review.", "success");
        } catch (err) {
            showToast(err.message || "Unable to submit the correction.", "error");
        }
    }

    /* Official Certificate Modal */
    function openOfficialCertificate(alumniId) {
        const match = alumniList.find(a => a.id === alumniId);
        if (!match) {
            showToast("No alumni record selected.", "warning");
            return;
        }

        document.getElementById("certAlumniName").textContent = match.name;
        document.getElementById("certAlumniProgram").textContent = match.program;
        document.getElementById("certAlumniBatch").textContent = match.batch;
        document.getElementById("certSerial").textContent = `SAA-CERT-${match.batch}-${Math.floor(1000 + Math.random() * 9000)}`;
        document.getElementById("certDateIssued").textContent = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        document.getElementById("officialCertModal").classList.add("active");
    }

    function closeOfficialCertModal() {
        document.getElementById("officialCertModal").classList.remove("active");
    }

    /* Official Claim Stub Modal */
    function openClaimStub(reqId) {
        const req = transcriptRequests.find(r => r.id === reqId);
        if (!req) {
            showToast("No transcript request selected.", "warning");
            return;
        }

        document.getElementById("stubRef").textContent = `SAA-REQ-${new Date().getFullYear()}-${req.id.toString().slice(-4)}`;
        document.getElementById("stubName").textContent = req.name;
        document.getElementById("stubDocType").textContent = req.type || "Transcript of Records (TOR)";
        document.getElementById("stubPurpose").textContent = req.purpose || "Official Records";
        document.getElementById("stubStatus").textContent = req.status.toUpperCase();

        const qrContainer = document.getElementById("stubQRCode");
        if (qrContainer && typeof QRCode !== 'undefined') {
            qrContainer.innerHTML = "";
            new QRCode(qrContainer, {
                text: `https://stagnes.edu.ph/claim?ref=${req.id}&name=${encodeURIComponent(req.name)}`,
                width: 48,
                height: 48,
                colorDark: "#4a0422",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.L
            });
        }

        document.getElementById("claimStubModal").classList.add("active");
    }

    function closeClaimStubModal() {
        document.getElementById("claimStubModal").classList.remove("active");
    }

    /* Certificate Reprint */
    function renderReprintRequests() {
        const body = document.getElementById("reprintTableBody");
        if (!body) return;
        body.innerHTML = "";
        const role = typeof normalizeRole === "function" ? normalizeRole(currentUser?.role) : currentUser?.role;
        const isAlumni = role === "alumni";
        const isRegistrar = role === "staff" || role === "registrar";
        const requestButton = document.getElementById("reprintRequestButton");
        const heading = document.querySelector("#reprintListPanel h3");
        const description = document.querySelector("#reprintListPanel h3 + p");
        if (requestButton) requestButton.classList.toggle("hidden", !isAlumni);
        document.getElementById("reprintRequestOverview")?.classList.toggle("hidden", isAlumni);
        document.getElementById("reprintRequestTabs")?.classList.toggle("hidden", isAlumni);
        if (heading) heading.textContent = isAlumni
            ? "My Certificate & Diploma Reprint Requests"
            : isRegistrar
                ? "Certificate & Diploma Reprint Requests"
                : "Certificate Reprint Overview";
        if (description) description.textContent = isAlumni
            ? "Request eligible certificate reprints and follow their review and release status."
            : isRegistrar
                ? "Review, process, mark as ready, then confirm the claim to complete each certificate reprint request."
                : "Monitor certificate reprint request status. Processing controls are reserved for Registrar staff.";

        const rows = reprintRequests || [];
        renderDocumentRequestCounters("reprint", rows);
        if (!isAlumni) renderDocumentRequestTabs("reprint", rows);

        if (!rows.length) {
            body.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-400 font-semibold">No certificate reprint requests yet.</td></tr>`;
            return;
        }

        const visible = isAlumni ? rows : visibleDocumentRequests("reprint", rows);
        if (!visible.length) {
            body.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-400 font-semibold">No ${DOCUMENT_FILTER_LABELS[documentRequestFilters.reprint] || "matching"} certificate reprint requests.</td></tr>`;
            return;
        }

        visible.forEach(item => {
            const tr = document.createElement("tr");
            const statusClass = documentStatusClass(item.status);
            const canProcess = isRegistrar;

            tr.innerHTML = `
                <td class="font-extrabold text-slate-800">
                    <button type="button" class="hover:text-brand-magenta" onclick="openReprintDetails(${item.id})">${item.name}</button>
                    <p class="text-[10px] font-mono text-slate-400">${documentRequestCode("reprint", item)}</p>
                </td>
                <td class="text-slate-600">${item.type || "—"}</td>
                <td class="text-slate-500">${item.date || "—"}</td>
                <td><span class="status-badge ${statusClass}">${item.status}</span></td>
                <td class="text-right">
                    <button type="button" onclick="openReprintDetails(${item.id})" class="text-xs text-brand-magenta font-semibold hover:underline">${documentRequestActionLabel("reprint", item, canProcess)}</button>
                    ${isAlumni && item.canCancel ? `<button type="button" onclick="cancelDocumentRequest('reprint', ${item.id})" class="text-xs text-rose-600 font-semibold hover:underline ml-2">Cancel</button>` : ""}
                </td>
            `;
            body.appendChild(tr);
        });
    }

    function openReprintDetails(id) {
        switchView("reprint", { detailId: id });
    }

    async function showReprintDetails(id, silent) {
        let item = reprintRequests.find((r) => String(r.id) === String(id));
        if (!item && typeof SAA_API !== "undefined") {
            try {
                const data = await SAA_API.request(`/api/reprints/${id}`);
                item = data.reprint;
                if (item && !reprintRequests.some((r) => String(r.id) === String(item.id))) reprintRequests.unshift(item);
            } catch (err) {
                showToast(err.message || "You cannot open this reprint request.", "error");
                return;
            }
        }
        const list = document.getElementById("reprintListPanel");
        const panel = document.getElementById("reprintDetailPanel");
        if (!item || !panel) return;
        if (list) list.classList.add("hidden");
        panel.classList.remove("hidden");
        document.getElementById("reprintDetailName").textContent = item.name || "Request";
        const codeEl = document.getElementById("reprintDetailCode");
        if (codeEl) codeEl.textContent = documentRequestCode("reprint", item);
        const requestedEl = document.getElementById("reprintDetailRequested");
        if (requestedEl) requestedEl.textContent = item.date || "—";
        document.getElementById("reprintDetailType").textContent = item.type || "—";
        document.getElementById("reprintDetailStatus").textContent = item.status || "—";
        const workflowEl = document.getElementById("reprintDetailWorkflow");
        if (workflowEl) workflowEl.innerHTML = documentWorkflowHtml(item.status);
        const infoEl = document.getElementById("reprintDetailInfo");
        if (infoEl) {
            const completedAt = item.completedAt || item.releasedAt;
            infoEl.textContent = [
                `Alumni: ${item.name || "—"}`,
                `Educational Level: ${item.educationLevel || "—"}`,
                `Batch: ${item.batch || "—"}`,
                `Strand: ${item.strand || "—"}`,
                `Student ID: ${item.studentId || "—"}`,
                `Reason: ${item.reason || "—"}`,
                `Copies: ${Number(item.copies || 1)}`,
                item.requestNotes ? `Additional Details: ${item.requestNotes}` : "",
                item.remarks ? `Registrar remarks: ${item.remarks}` : "",
                `Release / claim: ${[item.claimWindow, item.claimNotes].filter(Boolean).join(" • ") || "Not set yet."}`,
                completedAt ? `Completed: ${completedAt}` : ""
            ].filter(Boolean).join("\n");
        }
        const actions = document.getElementById("reprintDetailActions");
        const role = typeof normalizeRole === "function" ? normalizeRole(currentUser?.role) : currentUser?.role;
        const isAlumni = role === "alumni";
        const isRegistrar = role === "staff" || role === "registrar";
        if (actions) {
            actions.replaceChildren();
            const addAction = (label, className, callback) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = className;
                button.textContent = label;
                button.addEventListener("click", callback);
                actions.appendChild(button);
            };
            if (isAlumni && item.canCancel) {
                addAction("Cancel Request", "btn btn-danger text-xs", () => cancelDocumentRequest("reprint", item.id));
            }
            if (isRegistrar && item.status === "Pending") {
                addAction("Approve Request", "btn btn-success text-xs", () => updateRequestStatus(item.id, "Approved", "reprint"));
                addAction("Return for Correction", "btn btn-secondary text-xs", () => updateRequestStatus(item.id, "For Correction", "reprint"));
                addAction("Reject Request", "btn btn-danger text-xs", () => updateRequestStatus(item.id, "Rejected", "reprint"));
            } else if (isRegistrar && item.status === "For Correction") {
                addAction("Return to Pending", "btn btn-secondary text-xs", () => updateRequestStatus(item.id, "Pending", "reprint"));
                addAction("Reject Request", "btn btn-danger text-xs", () => updateRequestStatus(item.id, "Rejected", "reprint"));
            } else if (isRegistrar && item.status === "Approved") {
                addAction("Start Processing", "btn btn-primary text-xs", () => updateRequestStatus(item.id, "Processing", "reprint"));
            } else if (isRegistrar && item.status === "Processing") {
                addAction("Mark as Ready", "btn btn-primary text-xs", () => updateRequestStatus(item.id, "Ready for Release", "reprint"));
            } else if (isRegistrar && item.status === "Ready for Release") {
                addAction("Mark as Claimed", "btn btn-primary text-xs", () => updateRequestStatus(item.id, "Completed", "reprint"));
            } else if (isRegistrar && documentStatusBucket(item.status) === "Completed") {
                const note = document.createElement("p");
                note.className = "text-xs font-semibold text-emerald-700 self-center";
                note.textContent = "Document claimed — request completed.";
                actions.appendChild(note);
            }
        }
        if (!silent) switchView("reprint", { detailId: item.id });
    }

    /* Alumni employment records are sourced from the graduate tracking profile. */
    function renderPlacementLogs() {
        const body = document.getElementById("placementTableBody");
        if (!body) return;
        body.innerHTML = "";

        const employmentRecords = alumniList.filter((alumnus) =>
            ["Employed", "Self-employed"].includes(alumnus.status)
        );
        if (!employmentRecords.length) {
            body.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400 font-semibold">No alumni employment information has been reported yet.</td></tr>`;
            return;
        }

        employmentRecords.forEach((alumnus) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="font-extrabold text-slate-800">${escapeHtml(alumnus.name || "Alumni")}</td>
                <td class="text-slate-600">${escapeHtml([alumnus.program || alumnus.educationLevel, alumnus.batch].filter(Boolean).join(" • ") || "—")}</td>
                <td class="text-slate-600 font-semibold">${escapeHtml(alumnus.company || "—")}</td>
                <td class="text-slate-500">${escapeHtml(alumnus.title || "—")}</td>
                <td><span class="status-badge">${escapeHtml(alumnus.status)}</span></td>
                <td class="text-slate-400">${escapeHtml(alumnus.lastUpdated || "Not updated")}</td>
                <td><button type="button" onclick="openAlumniDetails(${Number(alumnus.id)})" class="text-xs text-brand-magenta font-bold hover:underline">View</button></td>
            `;
            body.appendChild(tr);
        });
    }

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 5139-5210 */
/* ------------------------------------------------------------------------- */
    function academicRecordsSource() {
        return alumniList.map(a => ({
            id: a.id,
            studentId: a.studentId || "",
            name: a.name,
            program: a.program || "",
            batch: a.batch || "",
            gwa: a.gwa || "—",
            honors: a.honors || "—",
            status: a.status || "Active"
        }));
    }

    function renderAcademicRecords(recordsToRender) {
        const body = document.getElementById("academicRecordsTableBody");
        if (!body) return;
        const data = recordsToRender || academicRecordsSource();
        if (!data.length) {
            body.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400 font-semibold">No academic records yet. Add alumni records first.</td></tr>`;
            return;
        }

        body.innerHTML = data.map(r => `
            <tr>
                <td class="font-mono text-xs font-bold text-[#801235]">${r.studentId}</td>
                <td class="font-bold text-slate-800">${r.name}</td>
                <td class="text-slate-600 text-xs">${r.program}</td>
                <td class="text-slate-500 font-semibold">${r.batch}</td>
                <td>
                    <span class="inline-flex items-center text-xs font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        <i class="fa-solid fa-award text-amber-600 mr-1"></i> ${r.honors} (${r.gwa})
                    </span>
                </td>
                <td>
                    <span class="status-badge status-approved text-xs">${r.status}</span>
                </td>
                <td class="text-right">
                    ${isAlumniRole()
                        ? `<button type="button" onclick="openRequestDocModal('Official Transcript of Records')" class="btn btn-secondary text-xs py-1 px-2.5"><i class="fa-solid fa-file-signature"></i> Request Document</button>`
                        : `<button type="button" onclick="openAlumniDetails(${Number(r.id)})" class="btn btn-secondary text-xs py-1 px-2.5">View Alumni Record</button>`}
                </td>
            </tr>
        `).join("");
    }

    function filterAcademicRecords() {
        const input = document.getElementById("academicRecordsSearch");
        if (!input) return;
        const q = input.value.trim().toLowerCase();
        const source = academicRecordsSource();
        if (!q) {
            renderAcademicRecords(source);
            return;
        }
        const filtered = source.filter(r =>
            String(r.studentId).toLowerCase().includes(q) ||
            String(r.name).toLowerCase().includes(q) ||
            String(r.program).toLowerCase().includes(q) ||
            String(r.batch).includes(q)
        );
        renderAcademicRecords(filtered);
    }

    function exportAcademicRecordsCSV() {
        const source = academicRecordsSource();
        let csv = "Student ID,Full Name,Degree Program,Batch,GWA,Honors,Status\n";
        source.forEach(r => {
            csv += `"${r.studentId}","${r.name}","${r.program}","${r.batch}","${r.gwa}","${r.honors}","${r.status}"\n`;
        });
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "SAA_Academic_Records_Master.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(source.length ? "Academic records exported to CSV." : "No academic records to export yet.", source.length ? "success" : "info");
    }
