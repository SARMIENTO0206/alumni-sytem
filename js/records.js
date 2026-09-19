/* records.js - Alumni database, document requests, transcripts, reprints, placements and academic records. */

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 3613-4017 */
/* ------------------------------------------------------------------------- */

    /* Alumni Table Renderer */
    function renderAlumniTable() {
        const body = document.getElementById("alumniTableBody");
        if (!body) return;
        body.innerHTML = "";

        alumniList.forEach(item => {
            const tr = document.createElement("tr");
            const statusClass = item.status === "Employed" ? "status-employed" :
                                item.status === "Unemployed" ? "status-unemployed" :
                                item.status === "Freelance" ? "status-freelance" : "status-postgrad";

            tr.innerHTML = `
                <td class="font-extrabold text-slate-800">
                    <div>${item.name}</div>
                    <div class="text-[10px] text-slate-400 font-mono">${item.studentId || `SAA-${item.batch}-00${item.id}`}</div>
                </td>
                <td class="font-semibold text-slate-600">${item.batch}</td>
                <td class="text-slate-500">${item.program}</td>
                <td><span class="status-badge ${statusClass}">${item.status}</span></td>
                <td class="text-right">
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

    function searchAlumniTable() {
        const query = document.getElementById("dbSearch")?.value.toLowerCase() || "";
        const filter = document.getElementById("filterStatus")?.value || "";

        document.querySelectorAll("#alumniTableBody tr").forEach(row => {
            const text = row.innerText.toLowerCase();
            const matchesQuery = text.includes(query);
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

    function saveAlumniRecord(event) {
        event.preventDefault();
        const editId = document.getElementById("editAlumniId").value;
        const name = document.getElementById("newAlumniName").value.trim();
        const batch = document.getElementById("newAlumniBatch").value;
        const program = document.getElementById("newAlumniProgram").value.trim();
        const status = document.getElementById("newAlumniEmployment").value;

        if (editId) {
            alumniList = alumniList.map(a => a.id == editId ? { ...a, name, batch, program, status } : a);
            showToast(`Updated record for ${name}.`, "success");
        } else {
            const studentId = `SAA-${batch}-${Math.floor(1000 + Math.random() * 9000)}`;
            alumniList.unshift({ id: Date.now(), name, batch, program, status, studentId });
            showToast(`Added new alumnus: ${name}`, "success");
        }

        updateLocalStorage();
        renderAlumniTable();
        closeAddAlumniModal();
    }

    function deleteAlumni(id) {
        if (currentUser?.role !== "admin") return;
        if (!confirm("Are you sure you want to permanently delete this alumni record?")) return;

        alumniList = alumniList.filter(a => a.id !== id);
        updateLocalStorage();
        renderAlumniTable();
        showToast("Alumni record deleted.", "info");
    }

    /* Document Requests */
    function openRequestDocModal(docType) {
        document.getElementById("requestDocModalTitle").textContent = `Request ${docType}`;
        document.getElementById("docType").value = docType;

        const emailEl = document.getElementById("docEmail");
        const contactEl = document.getElementById("docContact");

        if (emailEl) emailEl.value = currentUser ? (currentUser.email || "alumni@stagnes.edu.ph") : "alumni@stagnes.edu.ph";
        if (contactEl) contactEl.value = currentUser ? (currentUser.contact || "+63 917 888 9999") : "+63 917 888 9999";

        document.getElementById("requestDocModal").classList.add("active");
    }

    function closeRequestDocModal() {
        document.getElementById("requestDocModal").classList.remove("active");
    }

    function submitDocumentRequest(event) {
        event.preventDefault();
        const type = document.getElementById("docType").value;
        const purpose = document.getElementById("docPurpose").value;
        const delivery = document.getElementById("docDelivery") ? document.getElementById("docDelivery").value : "Pick-up at Registrar Window";
        const email = document.getElementById("docEmail") ? document.getElementById("docEmail").value : (currentUser?.email || "alumni@stagnes.edu.ph");
        const contact = document.getElementById("docContact") ? document.getElementById("docContact").value : "+63 917 888 9999";

        const processSubmission = (payRef) => {
            const newReq = {
                id: Date.now(),
                name: currentUser ? currentUser.name : "Maria Clara Santos",
                email: email,
                contact: contact,
                date: new Date().toISOString().split("T")[0],
                purpose: purpose,
                status: "Pending",
                type: type,
                delivery: delivery,
                paymentRef: payRef || "N/A"
            };

            transcriptRequests.unshift(newReq);
            updateLocalStorage();
            renderTranscriptRequests();
            closeRequestDocModal();

            triggerNotification(
                "EMAIL",
                email,
                `Request Confirmation - ${type}`,
                `Your official request for ${type} (${purpose}) has been submitted to the Registrar. Notifications will be sent to ${email}.`
            );

            triggerNotification(
                "SMS",
                contact,
                `SAA Registrar Alert`,
                `Request #${newReq.id.toString().slice(-4)} submitted for ${type}. Delivery: ${delivery}.`
            );

            showToast(`Request for ${type} submitted. Email confirmation sent to ${email}`, "success");
        };

        if (delivery.includes("Courier")) {
            closeRequestDocModal();
            openPaymentGateway(150, "Courier Shipping & Delivery Fee", `${type} Courier Delivery`, (ref) => {
                processSubmission(ref);
            });
        } else {
            processSubmission(null);
        }
    }

    function renderTranscriptRequests() {
        const body = document.getElementById("transcriptTableBody");
        if (!body) return;
        body.innerHTML = "";

        transcriptRequests.forEach(item => {
            const tr = document.createElement("tr");
            const statusClass = item.status === "Approved" ? "status-approved" :
                                item.status === "Rejected" ? "status-rejected" :
                                item.status === "Released" ? "status-released" : "status-pending";

            const canProcess = ["admin", "registrar"].includes(currentUser?.role);

            tr.innerHTML = `
                <td class="font-extrabold text-slate-800">
                    <div>${item.name}</div>
                    <button onclick="openClaimStub(${item.id})" class="text-[10px] text-[#801235] font-bold hover:underline">
                        <i class="fa-solid fa-receipt mr-0.5"></i> View Claim Stub
                    </button>
                </td>
                <td class="text-slate-500">${item.date}</td>
                <td class="text-slate-600 font-medium">${item.purpose || "Official Record"}</td>
                <td><span class="status-badge ${statusClass}">${item.status}</span></td>
                <td class="text-right">
                    ${(canProcess && item.status === "Pending") ? `
                        <button onclick="updateRequestStatus(${item.id}, 'Approved')" class="btn btn-success text-xs px-2.5 py-1 mr-1">Approve</button>
                        <button onclick="updateRequestStatus(${item.id}, 'Rejected')" class="btn btn-danger text-xs px-2.5 py-1">Reject</button>
                    ` : `<span class="text-xs text-slate-400 font-semibold">${item.status}</span>`}
                </td>
            `;
            body.appendChild(tr);
        });
    }

    function updateRequestStatus(id, newStatus) {
        transcriptRequests = transcriptRequests.map(r => r.id === id ? { ...r, status: newStatus } : r);
        updateLocalStorage();
        renderTranscriptRequests();
        if (typeof updateReports === 'function') updateReports();
        if (typeof updateRegistrarReports === 'function') updateRegistrarReports();

        // Also refresh the active Registrar workflow views so the list is not stale.
        if (typeof renderRequestApproval === 'function') renderRequestApproval();
        if (typeof renderDocumentPreparation === 'function') renderDocumentPreparation();
        if (typeof renderReleaseClaiming === 'function') renderReleaseClaiming();
        if (typeof renderRequestHistory === 'function') renderRequestHistory();

        const req = transcriptRequests.find(r => r.id === id);
        const name = req ? req.name : "Alumnus";
        const recipientEmail = req && req.email ? req.email : "alumni@stagnes.edu.ph";
        const recipientContact = req && req.contact ? req.contact : "+63 917 888 9999";

        // Trigger Automated Notifications (sent to the actual requester, not a generic address)
        triggerNotification(
            "EMAIL",
            recipientEmail,
            `Document Request #${id} Status Update: ${newStatus}`,
            `Dear ${name}, your document request status has been updated to "${newStatus}" by the University Registrar.`
        );
        triggerNotification(
            "SMS",
            recipientContact,
            `SAA Registrar Alert`,
            `SAA Registrar Notice: Request #${id} status is now ${newStatus}.`
        );

        showToast(`Request #${id} marked as ${newStatus}. Notification dispatched to ${name}.`, "success");
    }

    /* Official Certificate Modal */
    function openOfficialCertificate(alumniId) {
        const match = alumniList.find(a => a.id === alumniId) || alumniList[0];
        if (!match) return;

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
        const req = transcriptRequests.find(r => r.id === reqId) || transcriptRequests[0];
        if (!req) return;

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

        reprintRequests.forEach(item => {
            const tr = document.createElement("tr");
            const statusClass = item.status === "Approved" ? "status-approved" : "status-pending";
            const canProcess = ["admin", "registrar"].includes(currentUser?.role);

            tr.innerHTML = `
                <td class="font-extrabold text-slate-800">${item.name}</td>
                <td class="text-slate-600">${item.type}</td>
                <td><span class="status-badge ${statusClass}">${item.status}</span></td>
                <td class="text-right">
                    ${(canProcess && item.status === "Pending") ? `
                        <button onclick="approveReprint(${item.id})" class="btn btn-success text-xs px-2.5 py-1">Approve Reprint</button>
                    ` : `<span class="text-xs text-slate-400">Processed</span>`}
                </td>
            `;
            body.appendChild(tr);
        });
    }

    function approveReprint(id) {
        reprintRequests = reprintRequests.map(r => r.id === id ? { ...r, status: "Approved" } : r);
        renderReprintRequests();
        showToast("Certificate reprint request approved.", "success");
    }

    /* Placements */
    function renderPlacementLogs() {
        const body = document.getElementById("placementTableBody");
        if (!body) return;
        body.innerHTML = "";

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

    function saveJobPlacement(event) {
        event.preventDefault();
        const alumni = document.getElementById("jobAlumniName").value.trim();
        const company = document.getElementById("jobCompany").value.trim();
        const title = document.getElementById("jobTitle").value.trim();

        placementLogs.unshift({
            id: Date.now(),
            alumni,
            company,
            title,
            date: new Date().toISOString().split("T")[0]
        });

        updateLocalStorage();
        renderPlacementLogs();
        closeAddJobModal();
        event.target.reset();
        showToast(`Job placement recorded for ${alumni}.`, "success");
    }


/* ------------------------------------------------------------------------- */
/* Source: index.html lines 5139-5210 */
/* ------------------------------------------------------------------------- */
    /* Academic Records Master (Registrar) */
    let defaultAcademicRecords = [
        { studentId: "SAA-2024-0089", name: "Maria Clara D. Santos", program: "BS Information Technology", batch: "2024", gwa: "1.24", honors: "Magna Cum Laude", status: "Transcript Released" },
        { studentId: "SAA-2018-0412", name: "Juan Miguel R. Reyes", program: "BS Business Administration", batch: "2018", gwa: "1.45", honors: "Cum Laude", status: "Pending Verification" },
        { studentId: "SAA-2020-0931", name: "Angela K. Mendoza", program: "BS Computer Science", batch: "2020", gwa: "1.18", honors: "Summa Cum Laude", status: "Archived Complete" },
        { studentId: "SAA-2021-0155", name: "Joseph P. Aquino", program: "BS Education", batch: "2021", gwa: "1.65", honors: "Academic Distinction", status: "Certified Official" },
        { studentId: "SAA-2015-0819", name: "Isabella C. De Leon", program: "BS Nursing", batch: "2015", gwa: "1.52", honors: "Dean's Lister", status: "Archived Complete" },
        { studentId: "SAA-2023-0188", name: "Christian Gabriel Perez", program: "BS Accountancy", batch: "2023", gwa: "1.30", honors: "Magna Cum Laude", status: "Transcript In-Process" }
    ];

    function renderAcademicRecords(recordsToRender) {
        const body = document.getElementById("academicRecordsTableBody");
        if (!body) return;
        const data = recordsToRender || defaultAcademicRecords;

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
        if (!q) {
            renderAcademicRecords();
            return;
        }
        const filtered = defaultAcademicRecords.filter(r => 
            r.studentId.toLowerCase().includes(q) ||
            r.name.toLowerCase().includes(q) ||
            r.program.toLowerCase().includes(q) ||
            r.batch.includes(q)
        );
        renderAcademicRecords(filtered);
    }

    function exportAcademicRecordsCSV() {
        let csv = "Student ID,Full Name,Degree Program,Batch,GWA,Honors,Status\n";
        defaultAcademicRecords.forEach(r => {
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
        showToast("Academic Records Master exported to CSV.", "success");
    }

