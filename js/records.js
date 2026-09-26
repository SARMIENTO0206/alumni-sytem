/* records.js - Alumni database, document requests, transcripts, reprints, placements and academic records. */

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 3613-4017 */
/* ------------------------------------------------------------------------- */

    /* Alumni Table Renderer */
    function renderAlumniTable() {
        const body = document.getElementById("alumniTableBody");
        if (!body) return;
        body.innerHTML = "";

        if (!alumniList.length) {
            body.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-400 font-semibold">No alumni records yet. Add your first alumni record to get started.</td></tr>`;
            updateStatCounters();
            return;
        }

        alumniList.forEach(item => {
            const tr = document.createElement("tr");
            const statusClass = item.status === "Employed" ? "status-employed" :
                                item.status === "Unemployed" ? "status-unemployed" :
                                item.status === "Freelance" ? "status-freelance" : "status-postgrad";

            tr.innerHTML = `
                <td class="font-extrabold text-slate-800">
                    <button type="button" onclick="openAlumniDetails(${item.id})" class="text-left hover:text-brand-magenta hover:underline">
                        <div>${item.name}</div>
                        <div class="text-[10px] text-slate-400 font-mono">${item.studentId || "—"}</div>
                    </button>
                </td>
                <td class="font-semibold text-slate-600">${item.batch}</td>
                <td class="text-slate-500">${item.program}</td>
                <td><span class="status-badge ${statusClass}">${item.status}</span></td>
                <td class="text-right">
                    <button type="button" onclick="openAlumniDetails(${item.id})" class="text-xs text-slate-600 hover:underline font-bold mr-3">
                        <i class="fa-solid fa-eye"></i> View
                    </button>
                    ${currentUser?.role === "admin" ? `
                        <button onclick="openOfficialCertificate(${item.id})" class="text-xs text-amber-600 hover:underline font-bold mr-3" title="Generate Official Certificate">
                            <i class="fa-solid fa-award"></i> Certificate
                        </button>
                        <button onclick="editAlumniModal(${item.id})" class="text-xs text-brand-magenta hover:underline font-bold mr-3">
                            <i class="fa-solid fa-pen-to-square"></i> Edit
                        </button>
                        <button onclick="deleteAlumni(${item.id})" class="text-xs text-rose-600 hover:underline font-bold">
                            <i class="fa-solid fa-trash"></i> Delete
                        </button>
                    ` : `<button onclick="openOfficialCertificate(${item.id})" class="text-xs text-brand-magenta font-bold hover:underline">View Certificate</button>`}
                </td>
            `;
            body.appendChild(tr);
        });

        updateStatCounters();
    }

    function openAlumniDetails(id) {
        switchView("database", { detailId: id });
    }

    function showAlumniDetails(id, silent) {
        const item = alumniList.find((a) => String(a.id) === String(id));
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
        const actions = document.getElementById("alumniDetailActions");
        if (actions) {
            const adminBtns = currentUser?.role === "admin"
                ? `<button type="button" onclick="editAlumniModal(${item.id})" class="btn btn-primary text-xs">Edit Record</button>
                   <button type="button" onclick="openOfficialCertificate(${item.id})" class="btn btn-secondary text-xs">Certificate</button>`
                : `<button type="button" onclick="openOfficialCertificate(${item.id})" class="btn btn-secondary text-xs">View Certificate</button>`;
            actions.innerHTML = adminBtns;
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
            const bits = [item.delivery, item.claimWindow, item.claimNotes, item.releasedAt ? `Released ${item.releasedAt}` : ""].filter(Boolean);
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
                html += `<button type="button" onclick="updateRequestStatus(${item.id}, 'Approved')" class="btn btn-success text-xs">Approve</button>`;
                html += `<button type="button" onclick="updateRequestStatus(${item.id}, 'Rejected')" class="btn btn-danger text-xs">Reject</button>`;
                html += `<button type="button" onclick="updateRequestStatus(${item.id}, 'For Correction')" class="btn btn-secondary text-xs">Return for Correction</button>`;
            }
            if (isProcessor && item.status === "Approved") html += `<button type="button" onclick="updateRequestStatus(${item.id}, 'Processing')" class="btn btn-primary text-xs">Start Processing</button>`;
            if (isProcessor && item.status === "Processing") html += `<button type="button" onclick="updateRequestStatus(${item.id}, 'Ready for Release')" class="btn btn-primary text-xs">Ready for Release</button>`;
            if (isProcessor && item.status === "Ready for Release") html += `<button type="button" onclick="updateRequestStatus(${item.id}, 'Released')" class="btn btn-primary text-xs">Mark Released / Claimed</button>`;
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
        try {
            if (typeof SAA_API !== "undefined" && (await SAA_API.health())) {
                const params = new URLSearchParams();
                if (query) params.set("q", query);
                if (filter) params.set("status", filter);
                const data = await SAA_API.request(`/api/alumni?${params.toString()}`);
                alumniList = data.alumni || [];
                const body = document.getElementById("alumniTableBody");
                if (body) {
                    body.innerHTML = "";
                    renderAlumniTable();
                }
                return;
            }
        } catch (err) {
            showToast("Unable to search alumni records.", "error");
        }
        document.querySelectorAll("#alumniTableBody tr").forEach(row => {
            const text = row.innerText.toLowerCase();
            const matchesQuery = text.includes(query.toLowerCase());
            const matchesFilter = filter === "" || text.includes(filter.toLowerCase());
            row.style.display = (matchesQuery && matchesFilter) ? "" : "none";
        });
    }

    function sortTable(columnIndex) {
        currentSortDirection = !currentSortDirection;
        alumniList.sort((a, b) => {
            let valA = columnIndex === 0 ? a.name.toLowerCase() : parseInt(a.batch);
            let valB = columnIndex === 0 ? b.name.toLowerCase() : parseInt(b.batch);
            if (valA < valB) return currentSortDirection ? -1 : 1;
            if (valA > valB) return currentSortDirection ? 1 : -1;
            return 0;
        });
        renderAlumniTable();
        showToast("Sorted table records.", "info");
    }

    function exportToCSV() {
        let csv = "ID,Student ID,Name,Batch Year,Program/Course,Employment Status\n";
        alumniList.forEach(item => {
            csv += `"${item.id}","${item.studentId || ''}","${item.name}","${item.batch}","${item.program}","${item.status}"\n`;
        });
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
        if (currentUser?.role !== "admin") return;
        document.getElementById("alumniModalTitle").textContent = "Add New Alumnus";
        document.getElementById("editAlumniId").value = "";
        document.getElementById("newAlumniName").value = "";
        document.getElementById("newAlumniBatch").value = new Date().getFullYear();
        document.getElementById("newAlumniProgram").value = "";
        document.getElementById("newAlumniEmployment").value = "Employed";
        document.getElementById("addAlumniModal").classList.add("active");
    }

    function editAlumniModal(id) {
        if (currentUser?.role !== "admin") return;
        const item = alumniList.find(a => a.id === id);
        if (!item) return;

        document.getElementById("alumniModalTitle").textContent = "Edit Alumnus Record";
        document.getElementById("editAlumniId").value = item.id;
        document.getElementById("newAlumniName").value = item.name;
        document.getElementById("newAlumniBatch").value = item.batch;
        document.getElementById("newAlumniProgram").value = item.program;
        document.getElementById("newAlumniEmployment").value = item.status;
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
        const program = document.getElementById("newAlumniProgram").value.trim();
        const status = document.getElementById("newAlumniEmployment").value;
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
                    body: JSON.stringify({ name, batch, program, status })
                });
                showToast(`Updated record for ${name}.`, "success");
            } else {
                await SAA_API.request("/api/alumni", {
                    method: "POST",
                    body: JSON.stringify({ name, batch, program, status })
                });
                showToast(`Added new alumnus: ${name}`, "success");
            }
            await SAA_API.refreshAllData();
            renderAlumniTable();
            closeAddAlumniModal();
        } catch (err) {
            showToast(err.message || "Unable to save alumni record. Please try again.", "error");
        }
    }

    async function deleteAlumni(id) {
        if (currentUser?.role !== "admin") return;
        if (!confirm("Are you sure you want to permanently delete this alumni record?")) return;
        try {
            if (typeof SAA_API === "undefined" || !(await SAA_API.health())) {
                showToast("Unable to delete alumni record. The server is offline.", "error");
                return;
            }
            await SAA_API.request(`/api/alumni/${id}`, { method: "DELETE" });
            await SAA_API.refreshAllData();
            renderAlumniTable();
            showToast("Alumni record deleted.", "info");
        } catch (err) {
            showToast(err.message || "Unable to delete alumni record.", "error");
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
        if (heading) heading.textContent = isAlumni ? "My Academic Record Requests" : isRegistrar ? "Transcript & Academic Record Requests" : "Document Requests Overview";
        if (description) description.textContent = isAlumni
            ? "Submit academic record requests and track their review and release status."
            : isRegistrar
                ? "Review, verify, process, and release alumni academic record requests."
                : "Monitor academic record request status. Processing controls are reserved for Registrar staff.";
        const allRequests = [].concat(transcriptRequests || [], reprintRequests || []);
        const setCount = (id, count) => {
            const element = document.getElementById(id);
            if (element) element.textContent = String(count);
        };
        setCount("documentPendingCount", allRequests.filter((request) => ["Pending", "For Correction"].includes(request.status)).length);
        setCount("documentProcessingCount", allRequests.filter((request) => ["Approved", "Processing"].includes(request.status)).length);
        setCount("documentReadyCount", allRequests.filter((request) => request.status === "Ready for Release").length);
        setCount("documentCompletedCount", allRequests.filter((request) => ["Released", "Completed"].includes(request.status)).length);

        if (!transcriptRequests.length) {
            body.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-400 font-semibold">No transcript requests yet.</td></tr>`;
            return;
        }

        transcriptRequests.forEach(item => {
            const tr = document.createElement("tr");
            const statusClass = item.status === "Approved" ? "status-approved" :
                                item.status === "Rejected" ? "status-rejected" :
                                item.status === "Released" ? "status-released" : "status-pending";

            const canProcess = isRegistrar;
            const cancelBtn = isAlumni && item.canCancel
                ? `<button type="button" onclick="cancelDocumentRequest('transcript', ${item.id})" class="text-xs text-rose-600 font-semibold hover:underline ml-2">Cancel</button>`
                : "";

            tr.innerHTML = `
                <td class="font-extrabold text-slate-800">
                    <div>${item.name}</div>
                    <button type="button" onclick="openTranscriptDetails(${item.id})" class="text-[10px] text-[#801235] font-bold hover:underline mr-2">
                        <i class="fa-solid fa-eye mr-0.5"></i> View Details
                    </button>
                    <button type="button" onclick="openClaimStub(${item.id})" class="text-[10px] text-[#801235] font-bold hover:underline">
                        <i class="fa-solid fa-receipt mr-0.5"></i> View Claim Stub
                    </button>
                </td>
                <td class="text-slate-500">${item.date}</td>
                <td class="text-slate-600 font-medium">${item.type || "Academic Record"}</td>
                <td><span class="status-badge ${statusClass}">${item.status}</span></td>
                <td class="text-right">
                    ${canProcess && ["Pending", "For Correction", "Approved", "Processing", "Ready for Release"].includes(item.status)
                        ? `<button type="button" onclick="openTranscriptDetails(${item.id})" class="text-xs text-brand-magenta font-semibold hover:underline">View / Process</button>`
                        : `<button type="button" onclick="openTranscriptDetails(${item.id})" class="text-xs text-brand-magenta font-semibold hover:underline">View Details</button>`}
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
            if (typeof renderRequestApproval === "function") renderRequestApproval();
            if (typeof renderDocumentPreparation === "function") renderDocumentPreparation();
            if (typeof renderReleaseClaiming === "function") renderReleaseClaiming();
            if (typeof renderRequestHistory === "function") renderRequestHistory();
            if (type === "transcript" && typeof showTranscriptDetails === "function") showTranscriptDetails(id, true);
            if (type === "reprint" && typeof showReprintDetails === "function") showReprintDetails(id, true);
            showToast(`Request marked as ${newStatus}. The alumni will be notified.`, "success");
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
        const heading = document.querySelector("#view-reprint h3");
        const description = document.querySelector("#view-reprint h3 + p");
        if (requestButton) requestButton.classList.toggle("hidden", !isAlumni);
        document.getElementById("documentRequestOverview")?.classList.toggle("hidden", isAlumni);
        const allRequests = [].concat(transcriptRequests || [], reprintRequests || []);
        const setCount = (id, count) => {
            const element = document.getElementById(id);
            if (element) element.textContent = String(count);
        };
        setCount("documentPendingCount", allRequests.filter((request) => ["Pending", "For Correction"].includes(request.status)).length);
        setCount("documentProcessingCount", allRequests.filter((request) => ["Approved", "Processing"].includes(request.status)).length);
        setCount("documentReadyCount", allRequests.filter((request) => request.status === "Ready for Release").length);
        setCount("documentCompletedCount", allRequests.filter((request) => ["Released", "Completed"].includes(request.status)).length);
        if (heading) heading.textContent = isAlumni
            ? "My Certificate & Diploma Reprint Requests"
            : isRegistrar
                ? "Certificate & Diploma Reprint Requests"
                : "Certificate Reprint Overview";
        if (description) description.textContent = isAlumni
            ? "Request eligible certificate reprints and follow their review and release status."
            : isRegistrar
                ? "Review and process alumni certificate and diploma reprint requests."
                : "Monitor certificate reprint request status. Processing controls are reserved for Registrar staff.";
        if (!reprintRequests.length) {
            body.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-slate-400 font-semibold">No certificate reprint requests yet.</td></tr>`;
            return;
        }

        reprintRequests.forEach(item => {
            const tr = document.createElement("tr");
            const statusClass = item.status === "Approved" ? "status-approved" : "status-pending";
            const canProcess = isRegistrar;

            tr.innerHTML = `
                <td class="font-extrabold text-slate-800"><button type="button" class="hover:text-brand-magenta" onclick="openReprintDetails(${item.id})">${item.name}</button></td>
                <td class="text-slate-600">${item.type}</td>
                <td><span class="status-badge ${statusClass}">${item.status}</span></td>
                <td class="text-right">
                    ${canProcess && ["Pending", "For Correction", "Approved", "Processing", "Ready for Release"].includes(item.status)
                        ? `<button type="button" onclick="openReprintDetails(${item.id})" class="text-xs text-brand-magenta font-semibold hover:underline">View / Process</button>`
                        : `<button type="button" onclick="openReprintDetails(${item.id})" class="text-xs text-brand-magenta font-semibold hover:underline">View Details</button>`}
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
        document.getElementById("reprintDetailType").textContent = item.type || "—";
        document.getElementById("reprintDetailStatus").textContent = item.status || "—";
        const actions = document.getElementById("reprintDetailActions");
        const role = typeof normalizeRole === "function" ? normalizeRole(currentUser?.role) : currentUser?.role;
        const isAlumni = role === "alumni";
        const isRegistrar = role === "staff" || role === "registrar";
        if (actions) {
            actions.replaceChildren();
            const details = document.createElement("div");
            details.className = "w-full space-y-2 text-xs text-slate-600";
            const info = document.createElement("p");
            info.textContent = [
                `Alumni: ${item.name || "—"}`,
                `Educational Level: ${item.educationLevel || "—"}`,
                `Batch: ${item.batch || "—"}`,
                `Strand: ${item.strand || "—"}`,
                `Student ID: ${item.studentId || "—"}`,
                `Reason: ${item.reason || "—"}`,
                `Copies: ${Number(item.copies || 1)}`
            ].join(" · ");
            details.appendChild(info);
            if (item.requestNotes) {
                const notes = document.createElement("p");
                notes.className = "whitespace-pre-wrap";
                notes.textContent = `Additional Details: ${item.requestNotes}`;
                details.appendChild(notes);
            }
            if (item.remarks) {
                const remarks = document.createElement("p");
                remarks.className = "whitespace-pre-wrap";
                remarks.textContent = `Registrar remarks: ${item.remarks}`;
                details.appendChild(remarks);
            }
            actions.appendChild(details);
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
                addAction("Approve", "btn btn-success text-xs", () => updateRequestStatus(item.id, "Approved", "reprint"));
                addAction("Request Information", "btn btn-secondary text-xs", () => updateRequestStatus(item.id, "For Correction", "reprint"));
                addAction("Reject", "btn btn-danger text-xs", () => updateRequestStatus(item.id, "Rejected", "reprint"));
            } else if (isRegistrar && item.status === "For Correction") {
                addAction("Return to Pending", "btn btn-secondary text-xs", () => updateRequestStatus(item.id, "Pending", "reprint"));
                addAction("Reject", "btn btn-danger text-xs", () => updateRequestStatus(item.id, "Rejected", "reprint"));
            } else if (isRegistrar && item.status === "Approved") {
                addAction("Start Processing", "btn btn-primary text-xs", () => updateRequestStatus(item.id, "Processing", "reprint"));
            } else if (isRegistrar && item.status === "Processing") {
                addAction("Ready for Release", "btn btn-primary text-xs", () => updateRequestStatus(item.id, "Ready for Release", "reprint"));
            } else if (isRegistrar && item.status === "Ready for Release") {
                addAction("Mark Released", "btn btn-primary text-xs", () => updateRequestStatus(item.id, "Released", "reprint"));
            }
        }
        if (!silent) switchView("reprint", { detailId: item.id });
    }

    async function approveReprint(id) {
        await updateRequestStatus(id, "Approved", "reprint");
    }

    /* Placements */
    function renderPlacementLogs() {
        const body = document.getElementById("placementTableBody");
        if (!body) return;
        body.innerHTML = "";

        if (!placementLogs.length) {
            body.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-slate-400 font-semibold">No job placement records yet.</td></tr>`;
            return;
        }

        placementLogs.forEach(p => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="font-extrabold text-slate-800">${p.alumni}</td>
                <td class="text-slate-600 font-semibold">${p.company}</td>
                <td class="text-slate-500">${p.title}</td>
                <td class="text-slate-400">${p.date}</td>
            `;
            body.appendChild(tr);
        });
    }

    function openAddJobModal() {
        document.getElementById("addJobModal").classList.add("active");
    }

    function closeAddJobModal() {
        document.getElementById("addJobModal").classList.remove("active");
    }

    async function saveJobPlacement(event) {
        event.preventDefault();
        const alumni = document.getElementById("jobAlumniName").value.trim();
        const company = document.getElementById("jobCompany").value.trim();
        const title = document.getElementById("jobTitle").value.trim();
        try {
            await SAA_API.request("/api/placements", {
                method: "POST",
                body: JSON.stringify({ alumni, company, title })
            });
            await SAA_API.refreshAllData();
            renderPlacementLogs();
            closeAddJobModal();
            event.target.reset();
            showToast(`Job placement recorded for ${alumni}.`, "success");
        } catch (err) {
            showToast(err.message || "Unable to save placement record.", "error");
        }
    }


/* ------------------------------------------------------------------------- */
/* Source: index.html lines 5139-5210 */
/* ------------------------------------------------------------------------- */
    function academicRecordsSource() {
        return alumniList.map(a => ({
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
                    <button onclick="openRequestDocModal('Official Transcript of Records')" class="btn btn-secondary text-xs py-1 px-2.5">
                        <i class="fa-solid fa-file-signature"></i> Process Document
                    </button>
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
