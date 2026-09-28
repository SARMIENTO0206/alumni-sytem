/* reunions - Batch Reunions - Planning, Reminders */
/* Split from engagement.js lines 456-823 */

    /* Reunions */
    let reunionTargetRequest = 0;
    let reunionTargetCounts = { eligible: 0, withEmail: 0, withMobile: 0 };
    let editingReunionId = 0;

    function isReunionRegistered(reunion) {
        return (reunion.attendees || []).some((attendee) =>
            String(attendee.name || "").toLowerCase() === String(currentUser?.name || "").toLowerCase()
        );
    }

    function formatReunionDate(value) {
        if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "";
        const [year, month, day] = value.split("-").map(Number);
        return new Date(year, month - 1, day).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric"
        });
    }

    function renderReunionsGrid() {
        const grid = document.getElementById("reunionsGrid");
        if (!grid) return;
        grid.innerHTML = "";

        const isAdmin = ["admin", "staff"].includes(currentUser?.role);
        const currentBatch = currentUser?.batch;

        if (!reunionsList.length) {
            grid.innerHTML = `<div class="col-span-full text-center py-10 text-slate-400 font-semibold">No batch reunions yet.</div>`;
            return;
        }

        reunionsList.forEach(r => {
            const card = document.createElement("div");
            card.className = "app-card p-5 border-l-4 border-l-brand-magenta flex flex-col justify-between";
            const attendees = r.attendees || [];
            const presentCount = attendees.filter(a => a.present).length;
            const batchYear = r.batchYear || (r.batch || "").match(/\d{4}/)?.[0] || "";
            const sameLevel = !r.educationLevel || currentUser?.educationLevel === r.educationLevel;
            const sameStrand = !r.strand || (r.strand === "TVL"
                ? currentUser?.track === "TVL"
                : currentUser?.strand === r.strand);
            const isMyBatch = currentBatch && batchYear && currentBatch == batchYear && sameLevel && sameStrand;
            const isDraft = r.status === "Draft";
            const isRsvpOpen = r.rsvpEnabled &&
                (!r.rsvpDeadline || r.rsvpDeadline >= new Date().toISOString().slice(0, 10));
            const registered = isReunionRegistered(r);

            card.innerHTML = `
                <div>
                    <span class="status-badge ${isDraft ? 'status-freelance' : 'status-postgrad'} mb-2">${isDraft ? "Draft" : "Batch Reunion"}</span>
                    <h4 class="font-extrabold text-slate-800 text-sm">${r.title || r.batch}</h4>
                    <p class="text-xs text-slate-400 mt-1">${r.educationLevel === "JHS" ? "Junior High School" : r.educationLevel === "SHS" ? "Senior High School" : ""}${batchYear ? ` · Batch ${batchYear}` : ""}${r.strand ? ` · ${r.strand}` : ""}</p>
                    <p class="text-xs text-slate-500 mt-2"><b>Date:</b> ${formatReunionDate(r.date)}${r.startTime ? ` · ${r.startTime}${r.endTime ? `–${r.endTime}` : ""}` : ""}</p>
                    <p class="text-xs text-slate-500 mt-1"><b>Venue:</b> ${r.venue}</p>
                    ${r.description ? `<p class="text-xs text-slate-500 mt-2 whitespace-pre-wrap">${r.description}</p>` : ""}
                    ${r.coordinatorName || r.coordinatorContact ? `<p class="text-xs text-slate-400 mt-2"><b>Coordinator:</b> ${r.coordinatorName || ""}${r.coordinatorContact ? ` · ${r.coordinatorContact}` : ""}</p>` : ""}
                    ${r.rsvpEnabled && r.rsvpDeadline ? `<p class="text-xs text-slate-400 mt-1"><b>RSVP by:</b> ${formatReunionDate(r.rsvpDeadline)}</p>` : ""}

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
                        ${isDraft ? `
                            <button onclick="openAddReunionModal(${r.id})" class="btn btn-secondary text-xs flex-1">
                                <i class="fa-solid fa-pen-to-square"></i> Edit Draft
                            </button>
                        ` : `
                            <button onclick="exportReunionReport(${r.id})" class="btn btn-secondary text-xs flex-1">
                                <i class="fa-solid fa-file-csv text-emerald-600"></i> Report
                            </button>
                            <button onclick="sendReunionReminders(${r.id})" class="btn btn-secondary text-xs flex-1" title="Send reminders to confirmed alumni">
                                <i class="fa-solid fa-bell text-amber-500"></i> Remind
                            </button>
                        `}
                    ` : (isDraft ? "" : (isMyBatch && isRsvpOpen ? `
                        <button onclick="confirmReunionAttendance(${r.id})" class="btn ${registered ? 'btn-secondary text-slate-500' : 'btn-primary'} w-full text-xs">
                            <i class="fa-solid ${registered ? 'fa-check' : 'fa-calendar-check'} mr-1"></i>
                            ${registered ? 'Attendance Confirmed' : 'Confirm Attendance'}
                        </button>
                    ` : `
                        <span class="text-[10px] text-slate-400 italic w-full text-center py-1">${isMyBatch ? (r.rsvpDeadline && r.rsvpDeadline < new Date().toISOString().slice(0, 10) ? "RSVP deadline has passed." : "RSVP is disabled for this reunion.") : "This reunion is for another batch."}</span>
                    `))}
                    ${isAdmin ? `<span class="text-[10px] text-slate-400 self-center">${presentCount}/${attendees.length} present</span>` : ''}
                </div>
            `;
            grid.appendChild(card);
        });
    }

    /* Reunion Modal Functions */
    async function openAddReunionModal(id = 0) {
        const form = document.querySelector("#addReunionModal form");
        form.reset();
        editingReunionId = Number(id) || 0;
        const reunion = editingReunionId
            ? reunionsList.find((item) => Number(item.id) === editingReunionId)
            : null;
        document.getElementById("reunionModalTitle").textContent = reunion ? "Edit Reunion Draft" : "Create Batch Reunion";
        if (reunion) {
            document.getElementById("reunionEducationLevel").value = reunion.educationLevel || "";
            document.getElementById("reunionLabel").value = reunion.title || "";
            document.getElementById("reunionDate").value = reunion.date || "";
            document.getElementById("reunionStartTime").value = reunion.startTime || "";
            document.getElementById("reunionEndTime").value = reunion.endTime || "";
            document.getElementById("reunionVenue").value = reunion.venue || "";
            document.getElementById("reunionDescription").value = reunion.description || "";
            document.getElementById("reunionCoordinatorName").value = reunion.coordinatorName || "";
            document.getElementById("reunionCoordinatorContact").value = reunion.coordinatorContact || "";
            document.getElementById("sendReunionEmail").checked = reunion.sendEmail;
            document.getElementById("sendReunionSms").checked = reunion.sendSms;
        }
        document.getElementById("addReunionModal").classList.add("active");
        await updateReunionTargetOptions(reunion?.batchYear || "", reunion?.strand || "");
    }

    function closeAddReunionModal() {
        document.getElementById("addReunionModal").classList.remove("active");
    }

    async function updateReunionTargetOptions(selectedBatchYear = "", selectedStrand = "") {
        const educationLevel = document.getElementById("reunionEducationLevel").value;
        const batchSelect = document.getElementById("reunionBatch");
        const strandField = document.getElementById("reunionStrandField");
        const strandSelect = document.getElementById("reunionStrand");
        strandField.hidden = educationLevel !== "SHS";
        if (educationLevel !== "SHS") strandSelect.value = "";
        batchSelect.replaceChildren(new Option(educationLevel ? "Loading batches..." : "Select level first...", ""));
        batchSelect.disabled = true;
        reunionTargetCounts = { eligible: 0, withEmail: 0, withMobile: 0 };
        updateReunionSummaryText();
        if (!educationLevel) return;

        const requestId = ++reunionTargetRequest;
        try {
            const data = await SAA_API.request(`/api/reunions/target-options?educationLevel=${encodeURIComponent(educationLevel)}`);
            if (requestId !== reunionTargetRequest) return;
            batchSelect.replaceChildren(new Option(
                data.years.length ? "Select graduation batch..." : "No verified batches available",
                ""
            ));
            data.years.forEach((year) => batchSelect.add(new Option(`Batch ${year}`, year)));
            batchSelect.disabled = !data.years.length;
            strandSelect.replaceChildren(new Option("All Strands", ""));
            (data.strands || []).forEach((strand) => strandSelect.add(new Option(strand, strand)));
            batchSelect.value = data.years.includes(String(selectedBatchYear)) ? String(selectedBatchYear) : "";
            strandSelect.value = (data.strands || []).includes(selectedStrand) ? selectedStrand : "";
            if (data.years.length) await updateReunionTargetPreview();
        } catch (err) {
            batchSelect.replaceChildren(new Option("Unable to load batches", ""));
            showToast(err.message || "Unable to load verified batch years.", "error");
        }
    }

    function updateReunionSummaryText() {
        const educationLevel = document.getElementById("reunionEducationLevel").value;
        const batchYear = document.getElementById("reunionBatch").value;
        const strand = document.getElementById("reunionStrand").value;
        const levelLabel = educationLevel === "JHS" ? "Junior High School" : educationLevel === "SHS" ? "Senior High School" : "";
        document.getElementById("reunionTargetSummary").textContent = batchYear
            ? `${levelLabel} · Batch ${batchYear}${strand ? ` · ${strand}` : " · All Strands"}`
            : "Choose an educational level and batch to preview recipients.";
        document.getElementById("reunionRecipientCounts").textContent =
            `Eligible alumni: ${reunionTargetCounts.eligible} · With email: ${reunionTargetCounts.withEmail} · With mobile: ${reunionTargetCounts.withMobile}`;
    }

    async function updateReunionTargetPreview() {
        const educationLevel = document.getElementById("reunionEducationLevel").value;
        const batchYear = document.getElementById("reunionBatch").value;
        const strand = document.getElementById("reunionStrand").value;
        const requestId = ++reunionTargetRequest;
        reunionTargetCounts = { eligible: 0, withEmail: 0, withMobile: 0 };
        updateReunionSummaryText();
        if (!educationLevel || !batchYear) return;

        try {
            const query = new URLSearchParams({ educationLevel, batchYear, strand });
            const data = await SAA_API.request(`/api/reunions/target-options?${query}`);
            if (requestId !== reunionTargetRequest) return;
            reunionTargetCounts = data.counts;
            updateReunionSummaryText();
        } catch (err) {
            if (requestId === reunionTargetRequest) {
                updateReunionSummaryText();
                showToast(err.message || "Unable to preview reunion recipients.", "error");
            }
        }
    }

    function validateReunionTimes() {
        const startTime = document.getElementById("reunionStartTime");
        const endTime = document.getElementById("reunionEndTime");
        endTime.setCustomValidity(
            startTime.value && endTime.value && endTime.value <= startTime.value
                ? "End time must be later than the start time."
                : ""
        );
    }

    async function saveNewReunion(event) {
        event.preventDefault();
        const action = event.submitter?.value || "send";
        const form = event.currentTarget;
        if (action === "send") {
            validateReunionTimes();
            if (!form.reportValidity()) return;
            const sendEmail = document.getElementById("sendReunionEmail").checked;
            const sendSms = document.getElementById("sendReunionSms").checked;
            if (!sendEmail && !sendSms) {
                showToast("Select at least one invitation channel.", "warning");
                return;
            }
            if (!reunionTargetCounts.eligible) {
                showToast("No verified alumni match the selected target batch.", "warning");
                return;
            }
            const levelLabel = document.getElementById("reunionEducationLevel").selectedOptions[0].textContent;
            const batchYear = document.getElementById("reunionBatch").value;
            const strand = document.getElementById("reunionStrand").value;
            const audienceLabel = `${levelLabel} Batch ${batchYear}${strand ? ` ${strand}` : ""}`;
            const selectedChannels = [
                sendEmail ? `Email to ${reunionTargetCounts.withEmail}` : "",
                sendSms ? `SMS to ${reunionTargetCounts.withMobile}` : ""
            ].filter(Boolean).join(" · ");
            if (!confirm(`Send reunion invitations?\n\nInvitations will be sent to ${reunionTargetCounts.eligible} eligible ${audienceLabel} alumni.\n${selectedChannels}\n\nContinue?`)) return;
        }

        const title = document.getElementById("reunionLabel").value.trim();
        const date = document.getElementById("reunionDate").value;
        const startTime = document.getElementById("reunionStartTime").value;
        const endTime = document.getElementById("reunionEndTime").value;
        const batchYear = document.getElementById("reunionBatch").value;
        try {
            const data = await SAA_API.request("/api/reunions", {
                method: "POST",
                body: JSON.stringify({
                    title,
                    educationLevel: document.getElementById("reunionEducationLevel").value,
                    batchYear,
                    strand: document.getElementById("reunionStrand").value,
                    date,
                    startTime,
                    endTime,
                    venue: document.getElementById("reunionVenue").value.trim(),
                    description: document.getElementById("reunionDescription").value.trim(),
                    reunionId: editingReunionId,
                    coordinatorName: document.getElementById("reunionCoordinatorName").value.trim(),
                    coordinatorContact: document.getElementById("reunionCoordinatorContact").value.trim(),
                    sendInvitations: action === "send",
                    sendEmail: document.getElementById("sendReunionEmail").checked,
                    sendSms: document.getElementById("sendReunionSms").checked
                })
            });
            await SAA_API.refreshAllData();
            renderReunionsGrid();
            closeAddReunionModal();
            form.reset();
            reunionTargetCounts = { eligible: 0, withEmail: 0, withMobile: 0 };
            updateReunionSummaryText();
            const invitations = data.invitations;
            showToast(action === "draft"
                ? `"${title || "Reunion"}" saved as a draft.`
                : `"${title}" created. Invitations sent to ${invitations?.eligible || 0} alumni. Email: ${invitations?.emailSent || 0}, SMS: ${invitations?.smsSent || 0}.`,
            "success");
        } catch (err) {
            showToast(err.message || "Unable to create reunion.", "error");
        }
    }

    /* Alumni Confirms Attendance */
    async function confirmReunionAttendance(id) {
        try {
            await SAA_API.request(`/api/reunions/${id}/rsvp`, { method: "POST" });
            await SAA_API.refreshAllData();
            renderReunionsGrid();
            showToast("Attendance updated.", "success");
        } catch (err) {
            showToast(err.message || "Unable to update reunion attendance.", "error");
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
            SAA_API.request("/api/reunions/" + id + "/attendance", {
                method: "PUT",
                body: JSON.stringify({ name, present: a.present })
            }).then(() => SAA_API.refreshAllData()).then(() => renderReunionsGrid()).catch(() => renderReunionsGrid());
            showToast(`${name} marked ${a.present ? 'PRESENT' : 'ABSENT'}. ${presentCount}/${r.attendees.length} present.`, "info");
        }
    }

    /* Reunion Reminders */
    async function sendReunionReminders(id) {
        const r = reunionsList.find(x => x.id === id);
        if (!r) return;
        const confirmed = (r.attendees || []).filter(a => a.confirmed);
        if (!confirmed.length) {
            showToast(`No confirmed alumni yet for ${r.batch}.`, "warning");
            return;
        }
        for (const a of confirmed) {
            if (a.email) await triggerNotification("EMAIL", a.email, `Reminder: ${r.batch} Reunion`, `Dear ${a.name}, don't forget the ${r.batch} reunion on ${r.date} at ${r.venue}!`);
            if (a.contact) await triggerNotification("SMS", a.contact, `SAA Reunion Reminder`, `SAA: Reminder for ${r.batch} on ${r.date} at ${r.venue}. See you!`);
        }
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
        csv += "Alumni Name,Status,Attendance\n";

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

