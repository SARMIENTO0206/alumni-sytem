/* engagement.js - Events, reunions, donations, resume, notifications, newsletter, feedback and assistant chat. */

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 4018-4710 */
/* ------------------------------------------------------------------------- */
    /* Events */
    function renderEventsGrid() {
        const grid = document.getElementById("eventCardsGrid");
        if (!grid) return;
        grid.innerHTML = "";

        eventsList.forEach(ev => {
            const card = document.createElement("div");
            card.className = "app-card app-card-hover p-6 flex flex-col justify-between";
            const isAdmin = currentUser?.role === "admin";
            card.innerHTML = `
                <div>
                    <div class="flex items-center justify-between mb-3">
                        <span class="status-badge ${ev.status === 'Completed' ? 'status-approved' : 'status-freelance'} text-[10px]">${ev.status || 'Alumni Event'}</span>
                        <span class="text-xs text-slate-400 font-semibold"><i class="fa-solid fa-users text-pink-500 mr-1"></i> ${ev.rsvps} RSVPs</span>
                    </div>
                    <h4 class="font-extrabold text-slate-800 text-base">${ev.title}</h4>
                    <p class="text-xs text-slate-500 font-medium mt-2">
                        <i class="fa-regular fa-clock text-brand-magenta mr-1"></i> ${ev.date}
                    </p>
                    <p class="text-xs text-slate-400 font-medium mt-1">
                        <i class="fa-solid fa-location-dot text-indigo-500 mr-1"></i> ${ev.location}
                    </p>
                    ${ev.attendees && ev.attendees.length ? `
                        <div class="mt-3 pt-3 border-t border-slate-100">
                            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2"><i class="fa-solid fa-clipboard-check text-emerald-500 mr-1"></i> Registered Alumni</p>
                            <div class="space-y-1.5">
                                ${ev.attendees.map(a => `
                                    <div class="flex items-center justify-between text-[11px]">
                                        <span class="text-slate-700 font-semibold">${a.name}</span>
                                        <label class="flex items-center gap-1 cursor-pointer">
                                            <input type="checkbox" ${a.present ? 'checked' : ''} onclick="markAttended(${ev.id}, '${a.name.replace(/'/g, "\\'")}')" class="h-3.5 w-3.5 text-emerald-600 rounded border-slate-300 cursor-pointer">
                                            <span class="text-[9px] font-bold ${a.present ? 'text-emerald-600' : 'text-slate-400'}">${a.present ? 'PRESENT' : 'ABSENT'}</span>
                                        </label>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
                ${isAdmin ? `
                    <div class="flex gap-2 mt-4">
                        <button onclick="toggleEventRSVP(${ev.id})" class="btn ${ev.registered ? 'btn-secondary text-slate-500' : 'btn-primary'} w-full text-xs">
                            <i class="fa-solid ${ev.registered ? 'fa-check' : 'fa-calendar-plus'} mr-1"></i>
                            ${ev.registered ? 'Registered' : 'Register'}
                        </button>
                        <button onclick="sendPreEventReminder(${ev.id})" class="btn btn-secondary text-xs flex-shrink-0" title="Send reminder to all registered alumni">
                            <i class="fa-solid fa-bell text-amber-500"></i>
                        </button>
                    </div>
                ` : `
                    <button onclick="toggleEventRSVP(${ev.id})" class="btn ${ev.registered ? 'btn-secondary text-slate-500' : 'btn-primary'} w-full text-xs mt-5">
                        <i class="fa-solid ${ev.registered ? 'fa-check' : 'fa-calendar-plus'} mr-1"></i>
                        ${ev.registered ? 'RSVP Confirmed (Registered)' : 'Confirm RSVP Attendance'}
                    </button>
                `}
            `;
            grid.appendChild(card);
        });
    }

    function toggleEventRSVP(id) {
        eventsList = eventsList.map(e => {
            if (e.id === id) {
                const registered = !e.registered;
                const rsvps = registered ? e.rsvps + 1 : e.rsvps - 1;
                const name = currentUser ? currentUser.name : "Maria Clara Santos";
                const email = currentUser ? (currentUser.email || "alumni@stagnes.edu.ph") : "alumni@stagnes.edu.ph";
                const contact = currentUser ? (currentUser.contact || "+63 917 888 9999") : "+63 917 888 9999";

                if (registered) {
                    // Add alumni to attendees list
                    const attendees = e.attendees || [];
                    attendees.push({ name, email, present: false });
                    
                    // Send confirmation notifications
                    triggerNotification(
                        "EMAIL",
                        email,
                        `RSVP Confirmed - ${e.title}`,
                        `Dear ${name},\n\nThank you for confirming your attendance to ${e.title}!\n\n📅 Date: ${e.date}\n📍 Venue: ${e.location}\n\nWe look forward to seeing you there!\n- St. Agnes Academy Alumni Office`
                    );
                    triggerNotification(
                        "SMS",
                        contact,
                        `SAA Event RSVP Confirmed`,
                        `SAA Alumni: You are registered for ${e.title} on ${e.date} at ${e.location}. See you there!`
                    );
                    showToast(`✔ RSVP Confirmed for ${e.title}! Confirmation sent to ${email}`, "success");
                } else {
                    showToast(`RSVP cancelled for ${e.title}.`, "info");
                }

                return { ...e, registered, rsvps, attendees: registered ? attendees : (e.attendees || []).filter(a => a.name !== name) };
            }
            return e;
        });
        updateLocalStorage();
        renderEventsGrid();
    }

    /* Event Creation Modal (replaces prompt) */
    function openAddEventModal() {
        document.getElementById("addEventModal").classList.add("active");
    }

    function closeAddEventModal() {
        document.getElementById("addEventModal").classList.remove("active");
    }

    function saveNewEvent(event) {
        event.preventDefault();
        const title = document.getElementById("newEventTitle").value.trim();
        const date = document.getElementById("newEventDate").value.trim();
        const location = document.getElementById("newEventLocation").value.trim();
        const description = document.getElementById("newEventDescription").value.trim() || "Join us for this special alumni event!";
        const sendEmail = document.getElementById("sendEmailInvite").checked;
        const sendSms = document.getElementById("sendSmsInvite").checked;

        const newEvent = {
            id: Date.now(),
            title,
            date,
            location,
            description,
            rsvps: 0,
            registered: false,
            status: "Published",
            attendees: []
        };

        eventsList.unshift(newEvent);
        updateLocalStorage();
        renderEventsGrid();
        closeAddEventModal();
        event.target.reset();

        // Auto-send Gmail/SMS invitations
        if (sendEmail) {
            triggerNotification(
                "EMAIL",
                "all-alumni@stagnes.edu.ph",
                `New Event Invitation: ${title}`,
                `Dear Agnesian Alumni,\n\nYou are cordially invited to:\n\n📌 ${title}\n📅 ${date}\n📍 ${location}\n\n${description}\n\nRSVP through the Alumni Management System!\n- St. Agnes Academy Alumni Office`
            );
        }
        if (sendSms) {
            triggerNotification(
                "SMS",
                "All Alumni Contacts",
                `SAA Event Invitation`,
                `SAA Alumni: You're invited to ${title} on ${date} at ${location}. Register now in the Alumni System!`
            );
        }

        showToast(`🎉 "${title}" published! ${sendEmail ? 'Gmail' : ''}${sendEmail && sendSms ? ' & ' : ''}${sendSms ? 'SMS' : ''} invitations sent.`, "success");
    }

    /* Pre-Event Reminder */
    function sendPreEventReminder(id) {
        const ev = eventsList.find(e => e.id === id);
        if (!ev) return;

        const attendees = ev.attendees || [];
        if (!attendees.length) {
            showToast(`No registered alumni yet for "${ev.title}".`, "warning");
            return;
        }

        attendees.forEach(a => {
            triggerNotification(
                "EMAIL",
                a.email,
                `Event Reminder: ${ev.title}`,
                `Dear ${a.name},\n\nThis is a friendly reminder that ${ev.title} is coming up!\n\n📅 Date: ${ev.date}\n📍 Venue: ${ev.location}\n\nWe hope to see you there!\n- St. Agnes Academy Alumni Office`
            );
            triggerNotification(
                "SMS",
                a.contact || "+63 917 888 9999",
                `SAA Event Reminder`,
                `SAA: Don't forget ${ev.title} on ${ev.date} at ${ev.location}. See you there!`
            );
        });

        showToast(`📢 Reminders sent to ${attendees.length} registered alumni for "${ev.title}".`, "success");
    }

    /* Attendance Monitoring */
    function markAttended(eventId, name) {
        const ev = eventsList.find(e => e.id === eventId);
        if (!ev || !ev.attendees) return;

        const attendee = ev.attendees.find(a => a.name === name);
        if (attendee) {
            attendee.present = !attendee.present;
            const presentCount = ev.attendees.filter(a => a.present).length;
            updateLocalStorage();
            renderEventsGrid();
            showToast(`${name} marked as ${attendee.present ? 'PRESENT' : 'ABSENT'}. ${presentCount}/${ev.attendees.length} present.`, "info");
        }
    }

    /* Reunions */
    function renderReunionsGrid() {
        const grid = document.getElementById("reunionsGrid");
        if (!grid) return;
        grid.innerHTML = "";

        const isAdmin = currentUser?.role === "admin";
        const currentBatch = currentUser?.batch;

        reunionsList.forEach(r => {
            const card = document.createElement("div");
            card.className = "app-card p-5 border-l-4 border-l-brand-magenta flex flex-col justify-between";
            const attendees = r.attendees || [];
            const presentCount = attendees.filter(a => a.present).length;
            const batchYear = (r.batch || "").match(/\d{4}/)?.[0] || "";
            const isMyBatch = currentBatch && batchYear && currentBatch == batchYear;

            card.innerHTML = `
                <div>
                    <span class="status-badge status-postgrad mb-2">Batch Reunion</span>
                    <h4 class="font-extrabold text-slate-800 text-sm">${r.batch}</h4>
                    <p class="text-xs text-slate-500 mt-2"><b>Date:</b> ${r.date}</p>
                    <p class="text-xs text-slate-500 mt-1"><b>Venue:</b> ${r.venue}</p>
                    <p class="text-xs text-slate-400 mt-2"><b>Coordinator:</b> ${r.coordinators}</p>

                    <!-- Confirmed Attendees -->
                    ${attendees.length ? `
                        <div class="mt-3 pt-3 border-t border-slate-100">
                            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                <i class="fa-solid fa-clipboard-check text-emerald-500 mr-1"></i> 
                                Confirmations: ${attendees.filter(a => a.confirmed).length}/${attendees.length}
                            </p>
                            ${attendees.map(a => `
                                <div class="flex items-center justify-between py-0.5 text-[11px]">
                                    <span class="text-slate-600 font-medium">${a.name}</span>
                                    ${isAdmin ? `
                                        <label class="flex items-center gap-1 cursor-pointer">
                                            <input type="checkbox" ${a.present ? 'checked' : ''} onclick="markReunionAttended(${r.id}, '${a.name.replace(/'/g, "\\'")}')" class="h-3.5 w-3.5 text-emerald-600 rounded border-slate-300 cursor-pointer">
                                            <span class="text-[9px] font-bold ${a.present ? 'text-emerald-600' : 'text-slate-400'}">${a.present ? 'PRESENT' : 'ABSENT'}</span>
                                        </label>
                                    ` : `<span class="text-[9px] font-bold text-emerald-600">${a.confirmed ? '✓ CONFIRMED' : ''}</span>`}
                                </div>
                            `).join('')}
                        </div>
                    ` : '<p class="text-[11px] text-slate-400 mt-2 italic">No confirmations yet.</p>'}
                </div>

                <div class="mt-4 flex gap-2">
                    ${isAdmin ? `
                        <button onclick="exportReunionReport(${r.id})" class="btn btn-secondary text-xs flex-1">
                            <i class="fa-solid fa-file-csv text-emerald-600"></i> Report
                        </button>
                        <button onclick="sendReunionReminders(${r.id})" class="btn btn-secondary text-xs flex-1" title="Send reminders to confirmed alumni">
                            <i class="fa-solid fa-bell text-amber-500"></i> Remind
                        </button>
                    ` : (isMyBatch ? `
                        <button onclick="confirmReunionAttendance(${r.id})" class="btn ${r.confirmed ? 'btn-secondary text-slate-500' : 'btn-primary'} w-full text-xs">
                            <i class="fa-solid ${r.confirmed ? 'fa-check' : 'fa-calendar-check'} mr-1"></i>
                            ${r.confirmed ? 'Attendance Confirmed' : 'Confirm Attendance'}
                        </button>
                    ` : `
                        <span class="text-[10px] text-slate-400 italic w-full text-center py-1">This reunion is for another batch year.</span>
                    `)}
                    ${isAdmin ? `<span class="text-[10px] text-slate-400 self-center">${presentCount}/${attendees.length} present</span>` : ''}
                </div>
            `;
            grid.appendChild(card);
        });
    }

    /* Reunion Modal Functions */
    function openAddReunionModal() {
        document.getElementById("addReunionModal").classList.add("active");
    }

    function closeAddReunionModal() {
        document.getElementById("addReunionModal").classList.remove("active");
    }

    function saveNewReunion(event) {
        event.preventDefault();
        const batch = document.getElementById("reunionBatch").value;
        const label = document.getElementById("reunionLabel").value.trim();
        const date = document.getElementById("reunionDate").value.trim();
        const venue = document.getElementById("reunionVenue").value.trim();
        const coordinator = document.getElementById("reunionCoordinator").value.trim();
        const sendEmail = document.getElementById("sendReunionEmail").checked;
        const sendSms = document.getElementById("sendReunionSms").checked;

        const newReunion = {
            id: Date.now(),
            batch: `${label} (${batch})`,
            batchYear: batch,
            date,
            venue,
            coordinators: coordinator,
            confirmed: false,
            attendees: []
        };

        reunionsList.unshift(newReunion);
        localStorage.setItem("reunionsList", JSON.stringify(reunionsList));
        renderReunionsGrid();
        closeAddReunionModal();
        event.target.reset();

        // Find alumni from target batch
        const batchAlumni = alumniList.filter(a => String(a.batch) === batch);
        const count = batchAlumni.length || 5;

        // Send batch-specific Gmail invitations
        if (sendEmail) {
            triggerNotification(
                "EMAIL",
                `batch-${batch}@stagnes.edu.ph`,
                `Reunion Invitation: ${label}`,
                `Dear Batch ${batch} Alumni,\n\nYou are cordially invited to:\n\n🎓 ${label}\n📅 ${date}\n📍 ${venue}\nCoordinator: ${coordinator}\n\nPlease confirm your attendance through the Alumni Management System!\n- St. Agnes Academy Alumni Office`
            );
        }
        // Send batch-specific SMS invitations
        if (sendSms) {
            triggerNotification(
                "SMS",
                `Batch ${batch} Alumni (+63 contacts)`,
                `SAA Reunion Invitation`,
                `SAA: Batch ${batch}! You're invited to ${label} on ${date} at ${venue}. Confirm in the Alumni System!`
            );
        }

        showToast(`🎓 "${label}" created! Invitations sent to ${count} alumni from Batch ${batch}.`, "success");
    }

    /* Alumni Confirms Attendance */
    function confirmReunionAttendance(id) {
        const r = reunionsList.find(x => x.id === id);
        if (!r) return;

        const name = currentUser ? currentUser.name : "Maria Clara Santos";
        const email = currentUser ? (currentUser.email || "alumni@stagnes.edu.ph") : "alumni@stagnes.edu.ph";
        const contact = currentUser ? (currentUser.contact || "+63 917 888 9999") : "+63 917 888 9999";
        const alreadyConfirmed = r.confirmed;
        const attendees = r.attendees || [];

        if (!alreadyConfirmed) {
            attendees.push({ name, email, contact, confirmed: true, present: false });
        }

        r.confirmed = !alreadyConfirmed;
        r.attendees = alreadyConfirmed ? attendees.filter(a => a.name !== name) : attendees;
        localStorage.setItem("reunionsList", JSON.stringify(reunionsList));
        renderReunionsGrid();

        if (!alreadyConfirmed) {
            triggerNotification(
                "EMAIL",
                email,
                `Reunion Attendance Confirmed - ${r.batch}`,
                `Dear ${name},\n\nThank you for confirming your attendance to the ${r.batch} reunion!\n\n📅 Date: ${r.date}\n📍 Venue: ${r.venue}\n\nWe look forward to seeing you there!\n- St. Agnes Academy Alumni Office`
            );
            triggerNotification(
                "SMS",
                contact,
                `SAA Reunion Confirmed`,
                `SAA: Your attendance for ${r.batch} on ${r.date} at ${r.venue} is confirmed. See you there!`
            );
            showToast(`✔ Attendance confirmed for ${r.batch}! Confirmation sent.`, "success");
        } else {
            showToast(`Attendance cancelled for ${r.batch}.`, "info");
        }
    }

    /* Admin Marks Present */
    function markReunionAttended(id, name) {
        const r = reunionsList.find(x => x.id === id);
        if (!r || !r.attendees) return;

        const a = r.attendees.find(x => x.name === name);
        if (a) {
            a.present = !a.present;
            const presentCount = r.attendees.filter(x => x.present).length;
            localStorage.setItem("reunionsList", JSON.stringify(reunionsList));
            renderReunionsGrid();
            showToast(`${name} marked ${a.present ? 'PRESENT' : 'ABSENT'}. ${presentCount}/${r.attendees.length} present.`, "info");
        }
    }

    /* Reunion Reminders */
    function sendReunionReminders(id) {
        const r = reunionsList.find(x => x.id === id);
        if (!r) return;
        const confirmed = (r.attendees || []).filter(a => a.confirmed);
        if (!confirmed.length) {
            showToast(`No confirmed alumni yet for ${r.batch}.`, "warning");
            return;
        }
        confirmed.forEach(a => {
            triggerNotification("EMAIL", a.email, `Reminder: ${r.batch} Reunion`, `Dear ${a.name}, don't forget the ${r.batch} reunion on ${r.date} at ${r.venue}!`);
            triggerNotification("SMS", a.contact || "+63 917 888 9999", `SAA Reunion Reminder`, `SAA: Reminder for ${r.batch} on ${r.date} at ${r.venue}. See you!`);
        });
        showToast(`📢 Reminders sent to ${confirmed.length} confirmed alumni.`, "success");
    }

    /* Generate Attendance Report (CSV) */
    function exportReunionReport(id) {
        const r = reunionsList.find(x => x.id === id);
        if (!r) return;

        let csv = "Batch Reunion Attendance Report\n";
        csv += `Reunion,${r.batch}\n`;
        csv += `Date,${r.date}\n`;
        csv += `Venue,${r.venue}\n`;
        csv += `Coordinator,${r.coordinators}\n\n`;
        csv += "Alumnus Name,Status,Attendance\n";

        (r.attendees || []).forEach(a => {
            csv += `"${a.name}","${a.confirmed ? 'CONFIRMED' : 'PENDING'}","${a.present ? 'PRESENT' : 'ABSENT'}"\n`;
        });

        const presentCount = (r.attendees || []).filter(a => a.present).length;
        csv += `\nTotal Confirmed,${(r.attendees || []).filter(a => a.confirmed).length}\n`;
        csv += `Total Present,${presentCount}\n`;
        csv += `Attendance Rate,${(r.attendees || []).length ? Math.round((presentCount / r.attendees.length) * 100) : 0}%\n`;

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `SAA_Reunion_Report_${r.batch.replace(/\s/g, '_')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Reunion attendance report exported for ${r.batch}.`, "success");
    }

    /* Donations */
    function setDonationAmount(val) {
        document.getElementById("donorAmount").value = val;
    }

    function submitDonation(event) {
        event.preventDefault();
        const name = document.getElementById("donorName").value.trim();
        const amount = document.getElementById("donorAmount").value;

        openPaymentGateway(amount, "Alumni Foundation Donation", `Pledge Contribution by ${name}`, (ref) => {
            showToast(`Thank you, ${name}! Your donation pledge of ₱${Number(amount).toLocaleString()} (${ref}) has been received with gratitude.`, "success");
            event.target.reset();
        });
    }

    /* Digital Payment Gateway Engine */
    let pendingPaymentCallback = null;

    function openPaymentGateway(amount, purpose, detail, callback) {
        document.getElementById("paymentAmountText").textContent = `₱${Number(amount).toFixed(2)}`;
        document.getElementById("paymentPurposeText").textContent = purpose || "Official Fee Payment";
        document.getElementById("paymentDetailText").textContent = detail || "SAA Official Transaction";
        pendingPaymentCallback = callback;
        document.getElementById("paymentGatewayModal").classList.add("active");
    }

    function closePaymentGatewayModal() {
        document.getElementById("paymentGatewayModal").classList.remove("active");
        pendingPaymentCallback = null;
    }

    function switchPaymentFields(method) {
        document.getElementById("paymentEWalletFields").classList.toggle("hidden", !(method === "GCash" || method === "Maya"));
        document.getElementById("paymentCardFields").classList.toggle("hidden", method !== "Card");
        document.getElementById("paymentPaypalFields").classList.toggle("hidden", method !== "PayPal");
    }

    function submitPayment(event) {
        event.preventDefault();
        const method = document.querySelector('input[name="paymentMethod"]:checked')?.value || "GCash";
        const amount = document.getElementById("paymentAmountText").textContent;
        const refNum = `${method.toUpperCase()}-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        const payer = currentUser ? currentUser.name : "Maria Clara Santos";

        document.getElementById("receiptRef").textContent = refNum;
        document.getElementById("receiptMethod").textContent = method;
        document.getElementById("receiptPayer").textContent = payer;
        document.getElementById("receiptAmount").textContent = amount;

        closePaymentGatewayModal();
        document.getElementById("paymentReceiptModal").classList.add("active");

        // Trigger Automated Email Receipt Notification
        triggerNotification(
            "EMAIL",
            currentUser ? (currentUser.email || "alumni@stagnes.edu.ph") : "alumni@stagnes.edu.ph",
            `Official Payment Receipt - ${refNum}`,
            `Thank you! Your payment of ${amount} via ${method} has been received and verified for reference ${refNum}.`
        );

        if (pendingPaymentCallback && typeof pendingPaymentCallback === 'function') {
            pendingPaymentCallback(refNum);
            pendingPaymentCallback = null;
        }
    }

    function closePaymentReceiptModal() {
        document.getElementById("paymentReceiptModal").classList.remove("active");
    }

    /* Resume & Document Upload Engine */
    let currentAttachedResume = JSON.parse(localStorage.getItem("attachedResume")) || {
        name: "Maria_Santos_Resume_2026.pdf",
        size: "1.2 MB",
        date: "2026-08-15"
    };

    function triggerResumeUpload() {
        const fileInput = document.getElementById("resumeFileInput");
        if (fileInput) fileInput.click();
    }

    function handleResumeSelected(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            showToast("File size is too large. Max allowed limit is 5MB.", "error");
            return;
        }

        const sizeMB = (file.size / (1024 * 1024)).toFixed(1) + " MB";
        const uploadDate = new Date().toISOString().split("T")[0];

        currentAttachedResume = {
            name: file.name,
            size: sizeMB,
            date: uploadDate
        };

        localStorage.setItem("attachedResume", JSON.stringify(currentAttachedResume));
        renderResumeUI();
        showToast(`Resume "${file.name}" uploaded successfully!`, "success");
    }

    function renderResumeUI() {
        const emptyState = document.getElementById("resumeEmptyState");
        const attachedState = document.getElementById("resumeAttachedState");
        const fileNameEl = document.getElementById("resumeFileName");
        const fileMetaEl = document.getElementById("resumeFileMeta");
        const jobResumeEl = document.getElementById("jobResumeAttachedName");

        if (currentAttachedResume && currentAttachedResume.name) {
            if (emptyState) emptyState.classList.add("hidden");
            if (attachedState) attachedState.classList.remove("hidden");
            if (fileNameEl) fileNameEl.textContent = currentAttachedResume.name;
            if (fileMetaEl) fileMetaEl.textContent = `Uploaded on ${currentAttachedResume.date} • ${currentAttachedResume.size}`;
            if (jobResumeEl) jobResumeEl.textContent = currentAttachedResume.name;
        } else {
            if (emptyState) emptyState.classList.remove("hidden");
            if (attachedState) attachedState.classList.add("hidden");
            if (jobResumeEl) jobResumeEl.textContent = "No Profile Resume Attached";
        }
    }

    function downloadAttachedResume() {
        if (!currentAttachedResume || !currentAttachedResume.name) return;
        showToast(`Downloading "${currentAttachedResume.name}"...`, "info");
    }

    function removeAttachedResume() {
        if (!confirm("Are you sure you want to remove your attached resume?")) return;
        currentAttachedResume = null;
        localStorage.removeItem("attachedResume");
        renderResumeUI();
        showToast("Resume attachment removed.", "info");
    }

    function applyJobOpportunity(jobTitle, company) {
        openJobApplyModal(jobTitle, company);
    }

    function openJobApplyModal(jobTitle, company) {
        document.getElementById("jobApplyTitle").value = jobTitle;
        document.getElementById("jobApplyCompany").value = company;
        document.getElementById("jobApplyModalTitle").textContent = `Apply: ${jobTitle}`;
        document.getElementById("jobApplicantName").value = currentUser ? currentUser.name : "Maria Clara Santos";
        document.getElementById("jobApplicantEmail").value = currentUser ? (currentUser.email || "alumni@stagnes.edu.ph") : "alumni@stagnes.edu.ph";
        renderResumeUI();
        document.getElementById("jobApplyModal").classList.add("active");
    }

    function closeJobApplyModal() {
        document.getElementById("jobApplyModal").classList.remove("active");
    }

    function submitJobApplication(event) {
        event.preventDefault();
        const title = document.getElementById("jobApplyTitle").value;
        const company = document.getElementById("jobApplyCompany").value;
        const name = document.getElementById("jobApplicantName").value;
        const email = document.getElementById("jobApplicantEmail").value;
        const resume = currentAttachedResume ? currentAttachedResume.name : "Standard Profile Application";

        closeJobApplyModal();
        showToast(`Application submitted for "${title}" at ${company}!`, "success");

        triggerNotification(
            "EMAIL",
            email,
            `Application Confirmation - ${title}`,
            `Dear ${name}, your job application with resume (${resume}) for ${title} at ${company} has been received.`
        );
    }

    /* Automated Email & SMS Notifications Engine */
    let notificationsList = JSON.parse(localStorage.getItem("saaNotifications")) || [
        {
            id: 1,
            channel: "SMS",
            recipient: "+63 917 888 9999",
            subject: "Transcript Approved",
            message: "Good news! Your TOR request has been approved by the Registrar Office. Claiming window 2.",
            date: "2026-09-03 14:00",
            status: "DELIVERED"
        },
        {
            id: 2,
            channel: "EMAIL",
            recipient: "alumni@stagnes.edu.ph",
            subject: "RSVP Confirmed - Grand Homecoming 2024",
            message: "Thank you for confirming your RSVP for Agnesian Grand Homecoming 2024. See you on June 15!",
            date: "2026-09-03 12:30",
            status: "DELIVERED"
        }
    ];

    function triggerNotification(channel, recipient, subject, message) {
        const newNotif = {
            id: Date.now(),
            channel: channel,
            recipient: recipient || (channel === "SMS" ? "+63 917 888 9999" : "alumni@stagnes.edu.ph"),
            subject: subject,
            message: message,
            date: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
            status: "DELIVERED"
        };

        notificationsList.unshift(newNotif);
        localStorage.setItem("saaNotifications", JSON.stringify(notificationsList));
        updateNotificationBadge();

        // Mirror the notification server-side (fire-and-forget; ignored when the API is offline).
        if (typeof SAA_API !== "undefined") {
            SAA_API.logNotification({ channel, recipient: newNotif.recipient, subject, message });
        }

        showToast(`[${channel} ALERT] ${subject}`, "info");
    }

    function updateNotificationBadge() {
        const badge = document.getElementById("notificationBadgeCount");
        if (badge) badge.textContent = notificationsList.length;
    }

    function renderNotificationLogs() {
        const list = document.getElementById("notificationLogsList");
        if (!list) return;

        if (!notificationsList.length) {
            list.innerHTML = `<div class="p-6 text-center text-slate-400 font-semibold border border-slate-100 rounded-xl">No notification logs recorded yet.</div>`;
            return;
        }

        list.innerHTML = notificationsList.map(n => `
            <div class="p-3.5 border border-slate-200/80 rounded-xl bg-white space-y-1">
                <div class="flex items-center justify-between">
                    <span class="inline-flex items-center gap-1 font-bold text-xs ${n.channel === 'EMAIL' ? 'text-indigo-600' : 'text-emerald-600'}">
                        <i class="fa-solid ${n.channel === 'EMAIL' ? 'fa-envelope' : 'fa-comment-sms'}"></i>
                        ${n.channel} ALERT
                    </span>
                    <span class="text-[10px] text-slate-400 font-medium">${n.date}</span>
                </div>
                <p class="font-extrabold text-slate-800 text-xs">${n.subject}</p>
                <p class="text-[11px] text-slate-600 leading-relaxed">${n.message}</p>
                <div class="pt-1.5 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100">
                    <span>Recipient: <b class="text-slate-700">${n.recipient}</b></span>
                    <span class="status-badge status-approved text-[9px]">DELIVERED</span>
                </div>
            </div>
        `).join("");
    }

    function openNotificationCenterModal() {
        renderNotificationLogs();
        document.getElementById("notificationCenterModal").classList.add("active");
    }

    function closeNotificationCenterModal() {
        document.getElementById("notificationCenterModal").classList.remove("active");
    }

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 5054-5137 */
/* ------------------------------------------------------------------------- */
    /* Newsletter & Broadcast System */
    let newsletterArchive = JSON.parse(localStorage.getItem("saaNewsletters")) || [
        {
            id: 1,
            title: "Agnesian Chronicles: Silver Jubilee & Alumni Legacy Edition",
            date: "September 2026",
            snippet: "Celebrating 25 years of educational excellence, campus developments, and outstanding alumni leadership awards across healthcare, technology, and governance.",
            reads: "1,420 Alumni Read",
            author: "Alumni Relations Office"
        },
        {
            id: 2,
            title: "Career Accelerator 2026: Industry Partnerships & Mentorship",
            date: "July 2026",
            snippet: "Connecting our recent graduates with top multinational hiring partners, internships, and career development workshops in Caloocan & Metro Manila.",
            reads: "890 Alumni Read",
            author: "Career Placement Center"
        }
    ];

    function openNewsletterComposer() {
        const composer = document.getElementById("newsletterComposer");
        if (composer) composer.classList.remove("hidden");
    }

    function closeNewsletterComposer() {
        const composer = document.getElementById("newsletterComposer");
        if (composer) composer.classList.add("hidden");
    }

    function renderNewsletterArchive() {
        const list = document.getElementById("newsletterArchiveList");
        if (!list) return;

        list.innerHTML = newsletterArchive.map(n => `
            <div class="p-4 rounded-xl border border-slate-200/80 bg-white hover:border-[#801235]/40 transition shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="status-badge status-approved text-[10px]">${n.date}</span>
                        <span class="text-[10px] text-slate-400 font-medium"><i class="fa-solid fa-eye text-slate-400 mr-0.5"></i> ${n.reads}</span>
                    </div>
                    <h5 class="font-extrabold text-slate-800 text-sm hover:text-[#801235] transition cursor-pointer">${n.title}</h5>
                    <p class="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">${n.snippet}</p>
                    <p class="text-[10px] text-slate-400 mt-1.5 font-semibold">Published by: <span class="text-slate-600">${n.author}</span></p>
                </div>
                <div class="flex sm:flex-col gap-2 flex-shrink-0">
                    <button onclick="showToast('Reading: ${n.title.replace(/'/g, "\\'")}', 'info')" class="btn btn-secondary text-xs py-1 px-3">
                        <i class="fa-solid fa-book-open"></i> Read
                    </button>
                </div>
            </div>
        `).join("");
    }

    function sendNewsletter(event) {
        event.preventDefault();
        const subject = document.getElementById("newsletterSubject").value.trim();
        const body = document.getElementById("newsletterBody").value.trim();
        const sendSms = document.getElementById("sendNewsletterSMS") ? document.getElementById("sendNewsletterSMS").checked : true;
        const sendEmail = document.getElementById("sendNewsletterEmail") ? document.getElementById("sendNewsletterEmail").checked : true;

        newsletterArchive.unshift({
            id: Date.now(),
            title: subject,
            date: "September 2026",
            snippet: body.substring(0, 160) + (body.length > 160 ? "..." : ""),
            reads: "1 Alumni Read",
            author: currentUser ? currentUser.name : "Alumni Relations Office"
        });

        localStorage.setItem("saaNewsletters", JSON.stringify(newsletterArchive));
        renderNewsletterArchive();
        closeNewsletterComposer();

        if (sendEmail) {
            triggerNotification("EMAIL", "alumni-all@stagnes.edu.ph", subject, `New Agnesian Newsletter: "${subject}" has been published. Read the latest campus updates in your alumni portal.`);
        }
        if (sendSms) {
            triggerNotification("SMS", "+63 917 123 4567", subject, `ST. AGNES ACADEMY: New newsletter published: "${subject}". Check your portal for details.`);
        }

        showToast(`Newsletter "${subject}" broadcast successfully!`, "success");
        event.target.reset();
    }

    /**
     * AI Compose for the Newsletter Composer (OpenAI API via /api/ai/compose-announcement).
     * Falls back to a pre-formatted institutional template when the API is offline.
     */
    async function aiComposeNewsletter() {
        const subjectInput = document.getElementById("newsletterSubject");
        const bodyInput = document.getElementById("newsletterBody");
        const btn = document.getElementById("aiComposeBtn");
        if (!subjectInput || !bodyInput) return;

        const topic = (subjectInput.value || "").trim() || "Upcoming School Activities & Alumni Engagement";

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="fa-solid fa-spinner fa-spin"></span> <span>Drafting...</span>';
        }

        try {
            let draftSubject = null;
            let content = null;

            if (typeof SAA_API !== "undefined" && (await SAA_API.health())) {
                const data = await SAA_API.request("/api/ai/compose-announcement", {
                    method: "POST",
                    body: JSON.stringify({ topic, channel: "Newsletter" })
                });
                if (data && data.content) {
                    draftSubject = data.subject || `[SAA Update] ${topic}`;
                    content = data.content;
                }
            }

            if (content === null) {
                // Local fallback template matching the OBE/CHED manuscript format.
                draftSubject = `[SAA Update] ${topic}`;
                content = `ST. AGNES ACADEMY OF CALOOCAN INC. NOTICE: Warm greetings! In line with our upcoming school activities and alumni engagement initiatives regarding "${topic}", we invite all Agnesian graduates to participate. Please check your Alumni Portal for full schedules. Caritas et Scientia.`;
            }

            subjectInput.value = draftSubject;
            bodyInput.value = content;
            showToast("AI-drafted announcement is ready. Review before publishing.", "success");
        } catch (err) {
            showToast("AI compose failed: " + (err.message || "unknown error"), "error");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles text-amber-500 mr-1"></i> AI Compose';
            }
        }
    }

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 5212-5227 */
/* ------------------------------------------------------------------------- */
    function submitSurvey(event) {
        event.preventDefault();
        openFeedbackConfirmationModal();
        event.target.reset();
    }

    function openFeedbackConfirmationModal() {
        const modal = document.getElementById("feedbackConfirmationModal");
        if (modal) modal.classList.add("active");
        showToast("Thank you for your feedback! Your response has been recorded.", "success");
    }

    function closeFeedbackConfirmationModal() {
        const modal = document.getElementById("feedbackConfirmationModal");
        if (modal) modal.classList.remove("active");
    }

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 5477-5564 */
/* ------------------------------------------------------------------------- */
    /* AI Chatbot */
    function toggleChatWindow() {
        document.getElementById("chatWindow").classList.toggle("hidden");
    }

    function closeChat() {
        document.getElementById("chatWindow").classList.add("hidden");
    }

    function sendQuickPrompt(text) {
        document.getElementById("chatInput").value = text;
        handleChatSubmit(new Event("submit"));
    }

    function handleChatSubmit(event) {
        if (event) event.preventDefault();
        const input = document.getElementById("chatInput");
        const msg = input.value.trim();
        if (!msg) return;

        appendChatBubble(msg, "user");
        input.value = "";

        // Show typing indicator
        const messages = document.getElementById("chatMessages");
        const typingEl = document.createElement("div");
        typingEl.id = "typingBubble";
        typingEl.className = "chat-bubble-assistant flex items-center";
        typingEl.innerHTML = `<span class="typing-dots"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>`;
        messages.appendChild(typingEl);
        messages.scrollTop = messages.scrollHeight;

        const finishReply = (reply) => {
            const typing = document.getElementById("typingBubble");
            if (typing) typing.remove();
            appendChatBubble(reply, "assistant");
        };

        /* Agnesian AI Assistant: prefer the backend (OpenAI API when keyed, else its built-in fallback). */
        const askAssistant = async () => {
            try {
                if (typeof SAA_API !== "undefined" && (await SAA_API.health())) {
                    const data = await SAA_API.request("/api/ai/assistant", {
                        method: "POST",
                        body: JSON.stringify({ query: msg })
                    });
                    if (data && data.response) return data.response;
                }
            } catch (e) { /* offline / unreachable - fall back to the local rule-based reply */ }
            return getAssistantResponse(msg);
        };

        // Keep the typing dots visible briefly while the API answers.
        const minDelay = new Promise(r => setTimeout(r, 600));
        Promise.all([askAssistant(), minDelay]).then(([reply]) => finishReply(reply));
    }

    function appendChatBubble(text, sender) {
        const container = document.getElementById("chatMessages");
        const div = document.createElement("div");
        div.className = sender === "user" ? "flex justify-end" : "flex justify-start";

        const bubble = document.createElement("div");
        bubble.className = sender === "user" ? "chat-bubble-user" : "chat-bubble-assistant";
        bubble.innerHTML = text;

        div.appendChild(bubble);
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    function getAssistantResponse(query) {
        const q = query.toLowerCase();

        if (q.includes("count") || q.includes("total") || q.includes("how many")) {
            return `There are currently <strong>${(alumniList.length + 5240).toLocaleString()}</strong> registered alumni records in the St. Agnes Academy database.`;
        }
        if (q.includes("photo") || q.includes("picture") || q.includes("avatar") || q.includes("upload")) {
            return `You can upload and update your profile photo anytime by going to <strong>My Profile</strong> and clicking your avatar!`;
        }
        if (q.includes("id") || q.includes("digital id") || q.includes("card")) {
            return `Alumni can access their <strong>Digital Alumni ID Card</strong> with dynamic QR verification in the <em>Digital Alumni ID</em> module!`;
        }
        if (q.includes("transcript") || q.includes("record")) {
            const pending = transcriptRequests.filter(r => r.status === "Pending").length;
            return `There are <strong>${pending} pending</strong> transcript requests. You can submit or track your requests in the <em>Transcript Request Portal</em>.`;
        }
        if (q.includes("event") || q.includes("homecoming")) {
            return `The next grand event is the <strong>Agnesian Grand Homecoming 2024</strong> on June 15, 2024 at the SAA Main Campus Grounds!`;
        }
        if (q.includes("reunion")) {
            return `We currently have <strong>${reunionsList.length}</strong> upcoming batch reunions scheduled, including Batch 2014 Decennial Reunion.`;
        }
        if (q.includes("verify") || q.includes("verification")) {
            return `Registrars can verify alumni records and generate Official Authentication Certificates in the <strong>Alumni Record Verification</strong> module.`;
        }
        if (q.includes("job") || q.includes("career")) {
            return `Alumni can browse job vacancies and apply directly on the <strong>Job Opportunities Board</strong>!`;
        }
        if (q.includes("hello") || q.includes("hi") || q.includes("hey")) {
            return `Hello! How can I assist you with your St. Agnes Academy alumni records, transcripts, or events today?`;
        }

        return `I can help you look up <strong>Alumni Counts</strong>, <strong>Profile Photos</strong>, <strong>Digital ID Cards</strong>, <strong>Transcript Requests</strong>, <strong>Upcoming Events</strong>, and <strong>Job Postings</strong>.`;
    }

