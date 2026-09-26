/* engagement.js - Events, reunions, donations, resume, notifications, newsletter, feedback and assistant chat. */

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 4018-4710 */
/* ------------------------------------------------------------------------- */
    let newEventImageData = "";
    let editingJobOpportunityId = 0;

    function canManageJobListings() {
        return isAdminRole() || isStaffRole();
    }

    function isJobExpired(job) {
        return job.status === "Published" && !!job.deadline && job.deadline < new Date().toISOString().slice(0, 10);
    }

    function jobApplicationAction(job) {
        const details = String(job.application_details || "").trim();
        if (job.application_method === "Link" && /^https:\/\//i.test(details)) {
            return `<a href="${escapeHtml(details)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary text-xs">Apply</a>`;
        }
        if (job.application_method === "Email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details)) {
            return `<a href="mailto:${encodeURIComponent(details)}" class="btn btn-primary text-xs">Apply by Email</a>`;
        }
        if (job.application_method === "Portal" || !job.application_method) {
            return `<button type="button" onclick='applyJobOpportunity(${JSON.stringify(String(job.title || ""))}, ${JSON.stringify(String(job.company || ""))})' class="btn btn-primary text-xs">Apply</button>`;
        }
        return `<span class="text-xs text-slate-500">${escapeHtml(details || "See application instructions for employer contact details.")}</span>`;
    }

    async function showJobDetails(id, silent) {
        let job = (jobsList || []).find((j) => String(j.id) === String(id));
        if (!job && typeof SAA_API !== "undefined") {
            try {
                const data = await SAA_API.request(`/api/jobs/${id}`);
                job = data.job;
                if (job && !(jobsList || []).some((j) => String(j.id) === String(job.id))) jobsList.unshift(job);
            } catch (err) {
                showToast(err.message || "Unable to open this job.", "error");
                return;
            }
        }
        const list = document.getElementById("jobsListPanel");
        const panel = document.getElementById("jobDetailPanel");
        if (!job) return;
        if (panel) {
            if (list) list.classList.add("hidden");
            panel.classList.remove("hidden");
            const title = document.getElementById("jobDetailTitle");
            const company = document.getElementById("jobDetailCompany");
            const meta = document.getElementById("jobDetailMeta");
            const body = document.getElementById("jobDetailDescription");
            const actions = document.getElementById("jobDetailActions");
            if (title) title.textContent = job.title || "Job";
            if (company) company.textContent = job.company || "";
            if (meta) {
                meta.textContent = [job.location, job.industry, job.employment_type, job.deadline ? `Apply by ${job.deadline}` : ""].filter(Boolean).join(" • ");
            }
            if (body) {
                body.textContent = [
                    job.description || "",
                    job.qualifications ? `Qualifications: ${job.qualifications}` : "",
                    job.application_method === "Contact Information" && job.application_details ? `Application contact: ${job.application_details}` : ""
                ].filter(Boolean).join("\n\n");
            }
            if (actions) {
                actions.innerHTML = `${canManageJobListings()
                    ? `<button type="button" onclick="editJobOpportunity(${Number(job.id)})" class="btn btn-secondary text-xs">Edit Listing</button>`
                    : jobApplicationAction(job)}`;
            }
        } else {
            renderJobsGrid();
            const grid = document.getElementById("jobsGridContainer");
            if (grid) {
                const card = grid.querySelector(`[data-job-id="${id}"]`);
                if (card) {
                    card.classList.add("ring-2", "ring-[#801235]");
                    card.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }
        }
        if (!silent) switchView("job-opportunities", { detailId: id });
    }

    function renderJobsGrid() {
        const grid = document.getElementById("jobsGridContainer");
        if (!grid) return;
        const canManage = canManageJobListings();
        const activeCount = jobsList.filter((job) => job.status === "Published" && !isJobExpired(job)).length;
        const inactiveCount = jobsList.filter((job) => job.status === "Archived" || isJobExpired(job)).length;
        const summary = document.getElementById("jobManagementSummary");
        if (summary) summary.classList.toggle("hidden", !canManage);
        const activeCountEl = document.getElementById("activeJobsCount");
        const inactiveCountEl = document.getElementById("inactiveJobsCount");
        if (activeCountEl) activeCountEl.textContent = String(activeCount);
        if (inactiveCountEl) inactiveCountEl.textContent = String(inactiveCount);

        const search = String(document.getElementById("jobsSearchInput")?.value || "").trim().toLowerCase();
        const statusFilter = String(document.getElementById("jobsStatusFilter")?.value || "active");
        const filteredJobs = jobsList.filter((job) => {
            const expired = isJobExpired(job);
            const matchesSearch = !search || [job.title, job.company, job.location, job.industry].some((value) => String(value || "").toLowerCase().includes(search));
            const matchesStatus = statusFilter === "all"
                || (statusFilter === "active" && job.status === "Published" && !expired)
                || (statusFilter === "expired" && expired)
                || (statusFilter === "draft" && job.status === "Draft")
                || (statusFilter === "archived" && job.status === "Archived");
            return matchesSearch && matchesStatus;
        });
        if (!filteredJobs.length) {
            const emptyMessage = jobsList.length ? "No job opportunities match these filters." : "No job opportunities yet.";
            grid.innerHTML = `<div class="col-span-full text-center py-10 text-slate-400 font-semibold">${emptyMessage}</div>`;
            return;
        }
        grid.innerHTML = filteredJobs.map(job => {
            const expired = isJobExpired(job);
            const status = expired ? "Expired" : (job.status || "Published");
            return `
            <div class="app-card app-card-hover p-5 flex flex-col justify-between" data-job-id="${job.id}">
                <div>
                    <div class="flex justify-between items-start gap-2">
                    <button type="button" onclick="switchView('job-opportunities', { detailId: '${job.id}' })" class="text-left">
                    <h4 class="font-extrabold text-slate-800 text-sm hover:text-brand-magenta">${escapeHtml(job.title || "Job Opportunity")}</h4>
                    </button>
                    <span class="status-badge">${escapeHtml(status)}</span>
                    </div>
                    <p class="text-xs text-brand-magenta font-semibold mt-0.5">${escapeHtml(job.company || "")}</p>
                    <p class="text-xs text-slate-400 mt-2">${escapeHtml([job.location, job.industry, job.employment_type].filter(Boolean).join(" • "))}</p>
                    <p class="text-xs text-slate-500 mt-3">${escapeHtml(job.description || "")}</p>
                    ${job.deadline ? `<p class="text-[11px] text-slate-400 mt-2">Deadline: ${escapeHtml(job.deadline)}</p>` : ""}
                </div>
                <div class="flex flex-wrap gap-2 mt-4">
                    ${canManage
                        ? `<button type="button" onclick="editJobOpportunity(${Number(job.id)})" class="btn btn-secondary text-xs">Edit</button>
                           <button type="button" onclick="setJobOpportunityStatus(${Number(job.id)}, '${job.status === "Archived" ? "Published" : "Archived"}')" class="btn btn-secondary text-xs">${job.status === "Archived" ? "Republish" : "Archive"}</button>`
                        : jobApplicationAction(job)}
                </div>
            </div>`;
        }).join("");
    }

    /* Events */
    function renderEventsGrid() {
        const grid = document.getElementById("eventCardsGrid");
        if (!grid) return;
        grid.innerHTML = "";

        if (!eventsList.length) {
            grid.innerHTML = `<div class="col-span-full text-center py-10 text-slate-400 font-semibold">No events yet. Create an event to get started.</div>`;
            return;
        }

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
                    <button type="button" onclick="openEventDetails(${ev.id})" class="text-left w-full">
                        <h4 class="font-extrabold text-slate-800 text-base hover:text-brand-magenta">${ev.title}</h4>
                    </button>
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
            if (ev.imageUrl) {
                const image = document.createElement("img");
                image.src = ev.imageUrl;
                image.alt = `${ev.title || "Event"} image`;
                image.loading = "lazy";
                image.className = "mb-4 max-h-48 w-full rounded-xl border border-slate-200 object-cover";
                card.prepend(image);
            }
            grid.appendChild(card);
        });
    }

    function openEventDetails(id) {
        switchView("events", { detailId: id });
    }

    async function showEventDetails(id, silent) {
        let ev = eventsList.find((e) => String(e.id) === String(id));
        if (!ev && typeof SAA_API !== "undefined") {
            try {
                const data = await SAA_API.request(`/api/events/${id}`);
                ev = data.event;
                if (ev && !eventsList.some((e) => String(e.id) === String(ev.id))) eventsList.unshift(ev);
            } catch (err) {
                showToast(err.message || "Unable to open this event.", "error");
                return;
            }
        }
        const list = document.getElementById("eventsListPanel");
        const panel = document.getElementById("eventDetailPanel");
        if (!ev || !panel) return;
        if (list) list.classList.add("hidden");
        panel.classList.remove("hidden");
        document.getElementById("eventDetailTitle").textContent = ev.title || "Event";
        document.getElementById("eventDetailMeta").textContent = `${ev.date || ""} • ${ev.rsvps || 0} RSVPs`;
        document.getElementById("eventDetailLocation").textContent = ev.location || "";
        const image = document.getElementById("eventDetailImage");
        if (image) {
            image.src = ev.imageUrl || "";
            image.alt = `${ev.title || "Event"} image`;
            image.classList.toggle("hidden", !ev.imageUrl);
        }
        const description = document.getElementById("eventDetailDescription");
        if (description) {
            description.textContent = ev.description || "";
            description.classList.toggle("hidden", !ev.description);
        }
        const actions = document.getElementById("eventDetailActions");
        if (actions) {
            actions.innerHTML = `
                <button type="button" onclick="toggleEventRSVP(${ev.id})" class="btn ${ev.registered ? 'btn-secondary' : 'btn-primary'} text-xs">
                    ${ev.registered ? "Registered" : "Confirm RSVP Attendance"}
                </button>
            `;
        }
        if (!silent) switchView("events", { detailId: ev.id });
    }

    async function toggleEventRSVP(id) {
        try {
            const data = await SAA_API.request(`/api/events/${id}/rsvp`, { method: "POST" });
            await SAA_API.refreshAllData();
            renderEventsGrid();
            if (currentDetailId && typeof showEventDetails === "function") showEventDetails(currentDetailId, true);
            const registered = data && data.event && (data.event.attendees || []).some(a => currentUser && a.name === currentUser.name);
            showToast(registered ? "RSVP confirmed." : "RSVP cancelled.", registered ? "success" : "info");
        } catch (err) {
            showToast(err.message || "Unable to update event registration.", "error");
        }
    }

    /* Event Creation Modal (replaces prompt) */
    function openAddEventModal() {
        document.getElementById("addEventModal").classList.add("active");
    }

    function closeAddEventModal() {
        document.getElementById("addEventModal").classList.remove("active");
    }

    function previewNewEventImage(input) {
        const file = input.files && input.files[0];
        const preview = document.getElementById("newEventImagePreview");
        newEventImageData = "";
        preview.removeAttribute("src");
        preview.classList.add("hidden");
        if (!file) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            input.value = "";
            showToast("Choose a JPG, PNG, or WebP image.", "error");
            return;
        }
        if (file.size > 1024 * 1024) {
            input.value = "";
            showToast("Event images must be 1 MB or smaller.", "error");
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result !== "string") {
                showToast("Unable to preview this image.", "error");
                return;
            }
            newEventImageData = reader.result;
            preview.src = reader.result;
            preview.classList.remove("hidden");
        };
        reader.onerror = () => showToast("Unable to read this image.", "error");
        reader.readAsDataURL(file);
    }

    function clearNewEventImagePreview() {
        newEventImageData = "";
        const preview = document.getElementById("newEventImagePreview");
        preview.removeAttribute("src");
        preview.classList.add("hidden");
    }

    function validateEventTimeFields() {
        const startTime = document.getElementById("newEventStartTime");
        const endTime = document.getElementById("newEventEndTime");
        endTime.setCustomValidity(
            startTime.value && endTime.value && endTime.value <= startTime.value
                ? "End time must be later than start time."
                : ""
        );
    }

    async function saveNewEvent(event) {
        event.preventDefault();
        const title = document.getElementById("newEventTitle").value.trim();
        const eventDate = document.getElementById("newEventDate").value;
        const startTime = document.getElementById("newEventStartTime").value;
        const endTime = document.getElementById("newEventEndTime").value;
        const location = document.getElementById("newEventLocation").value.trim();
        const description = document.getElementById("newEventDescription").value.trim();
        const formatDate = (value) => {
            const [year, month, day] = value.split("-").map(Number);
            return new Date(year, month - 1, day).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric"
            });
        };
        const formatTime = (value) => {
            const [hour, minute] = value.split(":").map(Number);
            return new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit"
            });
        };
        const date = `${formatDate(eventDate)} • ${formatTime(startTime)} – ${formatTime(endTime)}`;

        try {
            await SAA_API.request("/api/events", {
                method: "POST",
                body: JSON.stringify({ title, date, location, description, imageData: newEventImageData })
            });
            await SAA_API.refreshAllData();
            renderEventsGrid();
            closeAddEventModal();
            event.target.reset();
            clearNewEventImagePreview();
            validateEventTimeFields();
            showToast(`"${title}" published.`, "success");
        } catch (err) {
            showToast(err.message || "Unable to create event.", "error");
        }
    }

    /* Pre-Event Reminder */
    async function sendPreEventReminder(id) {
        try {
            const data = await SAA_API.request(`/api/events/${id}/remind`, { method: "POST" });
            if (SAA_API.refreshAllData) await SAA_API.refreshAllData();
            showToast(`Event reminder recorded for ${data.reminders || 0} registrant(s). Delivery status depends on SMTP/SMS configuration.`, "info");
        } catch (err) {
            showToast(err.message || "Unable to send event reminders.", "error");
        }
    }

    /* Attendance Monitoring */
    function markAttended(eventId, name) {
        const ev = eventsList.find(e => e.id === eventId);
        if (!ev || !ev.attendees) return;

        const attendee = ev.attendees.find(a => a.name === name);
        if (attendee) {
            attendee.present = !attendee.present;
            const presentCount = ev.attendees.filter(a => a.present).length;
            SAA_API.request("/api/events/" + eventId + "/attendance", {
                method: "PUT",
                body: JSON.stringify({ name, present: attendee.present })
            }).then(() => SAA_API.refreshAllData()).then(() => renderEventsGrid()).catch(() => renderEventsGrid());
            showToast(`${name} marked as ${attendee.present ? 'PRESENT' : 'ABSENT'}. ${presentCount}/${ev.attendees.length} present.`, "info");
        }
    }

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
    let currentDonationCampaign = null;
    let currentDonationMetrics = null;
    let campaignFormDirty = false;

    function donationCurrency(value) {
        return `₱${Number(value || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
    }

    function donationDate(value) {
        if (!value) return "—";
        const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-PH", {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    function donationStatusLabel(status) {
        if (status === "paid") return "Verified";
        if (status === "pending" || status === "awaiting_payment" || status === "processing") return "Pending";
        return "Recorded";
    }

    function donationRowsForCampaign() {
        if (!currentDonationCampaign) return [];
        return (donationsList || []).filter((donation) =>
            donation.campaign === currentDonationCampaign.title || donation.campaign === "Alumni Foundation"
        );
    }

    function renderDonationRecords() {
        const body = document.getElementById("donationRecordsBody");
        if (!body) return;
        const query = (document.getElementById("donationSearch")?.value || "").trim().toLowerCase();
        const levelFilter = document.getElementById("donationLevelFilter")?.value || "";
        const statusFilter = document.getElementById("donationStatusFilter")?.value || "";
        const role = currentUser?.role;
        const isRegistrar = role === "staff" || role === "registrar";
        let records = donationRowsForCampaign();
        if (role === "alumni") records = records.filter((donation) => Number(donation.userId) === Number(currentUser?.id));
        if (query) {
            records = records.filter((donation) =>
                [donation.donor, donation.internalDonor, donation.studentId, donation.batch]
                    .some((value) => String(value || "").toLowerCase().includes(query))
            );
        }
        if (levelFilter) records = records.filter((donation) => donation.educationLevel === levelFilter);
        if (statusFilter && isRegistrar) {
            records = records.filter((donation) =>
                statusFilter === "matched" ? donation.identityMatched : !donation.identityMatched
            );
        } else if (statusFilter) {
            records = records.filter((donation) => {
                const status = donationStatusLabel(donation.paymentStatus).toLowerCase();
                return status === statusFilter;
            });
        }

        body.replaceChildren();
        if (!records.length) {
            const row = body.insertRow();
            const cell = row.insertCell();
            cell.colSpan = 6;
            cell.className = "py-8 text-center text-slate-400";
            cell.textContent = "No donation records match these filters.";
            return;
        }

        records.forEach((donation) => {
            const row = body.insertRow();
            const donor = row.insertCell();
            donor.className = "py-3 pr-4 font-semibold text-slate-700";
            donor.textContent = isRegistrar
                ? (donation.internalDonor || donation.donor || "Donor")
                : (donation.donor || "Donor");

            const batch = row.insertCell();
            batch.className = "py-3 pr-4 text-slate-500";
            const level = donation.educationLevel || "";
            batch.textContent = [level, donation.batch ? `Batch ${donation.batch}` : ""].filter(Boolean).join(" · ") || "—";

            const amount = row.insertCell();
            amount.className = "py-3 pr-4 font-bold text-slate-700";
            amount.textContent = donationCurrency(donation.amount);

            const date = row.insertCell();
            date.className = "py-3 pr-4 text-slate-500";
            date.textContent = donationDate(donation.date);

            const status = row.insertCell();
            status.className = "py-3 pr-4";
            const badge = document.createElement("span");
            const statusLabel = isRegistrar
                ? (donation.identityMatched ? "Matched" : "Needs review")
                : donationStatusLabel(donation.paymentStatus);
            badge.className = `status-badge ${statusLabel === "Verified" || statusLabel === "Matched" ? "status-approved" : statusLabel === "Pending" || statusLabel === "Needs review" ? "status-freelance" : "status-postgrad"}`;
            badge.textContent = statusLabel;
            status.appendChild(badge);

            const action = row.insertCell();
            action.className = "py-3";
            const button = document.createElement("button");
            button.type = "button";
            button.className = "text-xs font-bold text-brand-magenta hover:underline";
            button.textContent = role === "staff" || role === "registrar" ? "View Record" : "View Details";
            button.addEventListener("click", () => showDonationDetails(donation));
            action.appendChild(button);
        });
    }

    function showDonationDetails(donation) {
        const panel = document.getElementById("donationRecordDetails");
        if (!panel) return;
        const isRegistrar = currentUser?.role === "staff" || currentUser?.role === "registrar";
        const statusHeader = document.getElementById("donationStatusHeader");
        if (statusHeader) statusHeader.textContent = isRegistrar ? "Alumni Match" : "Payment Status";
        const values = isRegistrar
            ? [
                ["Donor", donation.internalDonor || donation.donor || "Donor"],
                ["Student ID", donation.studentId || "Not linked"],
                ["Level / batch", [donation.educationLevel, donation.batch ? `Batch ${donation.batch}` : ""].filter(Boolean).join(" · ") || "—"],
                ["Alumni identity", donation.identityMatched ? "Linked alumni record found" : "No linked alumni record"]
            ]
            : [
                ["Donor", donation.internalDonor || donation.donor || "Donor"],
                ["Public display", donation.anonymous ? "Anonymous" : (donation.internalDonor || donation.donor || "Donor")],
                ["Student ID", donation.studentId || "Not linked"],
                ["Alumni identity", donation.identityMatched ? "Linked alumni record found" : "No linked alumni record"],
                ["Amount", donationCurrency(donation.amount)],
                ["Payment status", donationStatusLabel(donation.paymentStatus)],
                ["Reference", donation.paymentRef || "—"],
                ["Dedication", donation.dedication || "—"],
                ["Date", donationDate(donation.date)]
            ];
        panel.replaceChildren();
        const heading = document.createElement("h4");
        heading.className = "font-extrabold text-slate-800 text-sm mb-3";
        heading.textContent = "Donation Record Details";
        panel.appendChild(heading);
        const list = document.createElement("dl");
        list.className = "grid sm:grid-cols-2 gap-3 text-xs";
        values.forEach(([label, value]) => {
            const item = document.createElement("div");
            const term = document.createElement("dt");
            term.className = "text-slate-400";
            term.textContent = label;
            const description = document.createElement("dd");
            description.className = "mt-0.5 font-semibold text-slate-700";
            description.textContent = value;
            item.append(term, description);
            list.appendChild(item);
        });
        const close = document.createElement("button");
        close.type = "button";
        close.className = "btn btn-secondary text-xs mt-4";
        close.textContent = "Close";
        close.addEventListener("click", () => panel.classList.add("hidden"));
        panel.append(list, close);
        panel.classList.remove("hidden");
    }

    async function saveDonationCampaign(event) {
        event.preventDefault();
        const campaign = {
            title: document.getElementById("donorCampaignTitleInput").value.trim(),
            description: document.getElementById("donorCampaignDescriptionInput").value.trim(),
            goal: Number(document.getElementById("donorCampaignGoal").value),
            status: document.getElementById("donorCampaignStatus").value,
            startDate: document.getElementById("donorCampaignStart").value,
            endDate: document.getElementById("donorCampaignEnd").value
        };
        try {
            const data = await SAA_API.request("/api/donation-campaign", {
                method: "PUT",
                body: JSON.stringify(campaign)
            });
            currentDonationCampaign = data.campaign;
            currentDonationMetrics = null;
            campaignFormDirty = false;
            await renderDonorProgress();
            showToast("Donation campaign updated.", "success");
        } catch (err) {
            showToast(err.message || "Unable to update the donation campaign.", "error");
        }
    }

    function closeDonationCampaign() {
        const status = document.getElementById("donorCampaignStatus");
        if (status) status.value = "Closed";
        const form = document.getElementById("donorCampaignForm");
        if (form) form.requestSubmit();
    }

    function exportDonationReport() {
        const records = donationRowsForCampaign();
        if (!records.length) {
            showToast("There are no donation records to export.", "warning");
            return;
        }
        const csvCell = (value) => {
            let text = String(value == null ? "" : value);
            if (/^[=+\-@]/.test(text)) text = `'${text}`;
            return `"${text.replace(/"/g, '""')}"`;
        };
        const lines = [
            ["Donor", "Student ID", "Level", "Batch", "Amount PHP", "Date", "Payment Status", "Reference"].map(csvCell).join(","),
            ...records.map((donation) => [
                donation.anonymous ? "Anonymous" : donation.internalDonor || donation.donor,
                donation.studentId,
                donation.educationLevel,
                donation.batch,
                donation.amount,
                donation.date,
                donationStatusLabel(donation.paymentStatus),
                donation.paymentRef
            ].map(csvCell).join(","))
        ];
        const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "SAA_Donation_Report.csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast("Donation report exported.", "success");
    }

    function renderDonorCampaign() {
        if (!currentDonationCampaign) return;
        const campaign = currentDonationCampaign;
        const title = document.getElementById("donorCampaignTitle");
        const description = document.getElementById("donorCampaignDescription");
        const status = document.getElementById("donorCampaignStatusBadge");
        const dates = document.getElementById("donorCampaignDates");
        if (title) title.textContent = campaign.title;
        if (description) description.textContent = campaign.description || "";
        if (status) {
            status.textContent = `${String(campaign.status || "Draft").toUpperCase()} CAMPAIGN`;
            status.className = `status-badge ${campaign.status === "Active" ? "status-employed" : campaign.status === "Closed" ? "status-unemployed" : "status-postgrad"}`;
        }
        if (dates) dates.textContent = `${donationDate(campaign.startDate)} – ${donationDate(campaign.endDate)}`;
        const goal = Number(campaign.goal || 0);
        const paidDonations = donationRowsForCampaign().filter((donation) => donation.paymentStatus === "paid");
        const raised = currentDonationMetrics
            ? Number(currentDonationMetrics.raised || 0)
            : paidDonations.reduce((sum, donation) => sum + Number(donation.amount || 0), 0);
        const donors = new Set(paidDonations.map((donation) => donation.userId
            ? `user:${donation.userId}`
            : `name:${String(donation.internalDonor || donation.donor || "").toLowerCase()}`));
        const donorCount = currentDonationMetrics ? Number(currentDonationMetrics.donors || 0) : donors.size;
        const percentage = goal > 0 ? raised / goal * 100 : 0;
        const percentageLabel = `${percentage.toFixed(2).replace(/\.?0+$/, "")}%`;
        const goalEl = document.getElementById("donorGoalValue");
        const raisedEl = document.getElementById("donorRaisedValue");
        const progress = document.getElementById("donorProgressValue");
        const bar = document.getElementById("donorProgressBar");
        const progressbar = bar?.parentElement;
        const count = document.getElementById("donorCountLabel");
        const average = document.getElementById("donorAverageValue");
        const remaining = document.getElementById("donorRemainingValue");
        if (goalEl) goalEl.textContent = donationCurrency(goal);
        if (raisedEl) raisedEl.textContent = donationCurrency(raised);
        if (progress) progress.textContent = percentageLabel;
        if (bar) bar.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
        if (progressbar) progressbar.setAttribute("aria-valuenow", String(Math.min(100, percentage)));
        if (count) count.textContent = String(donorCount);
        if (average) average.textContent = donationCurrency(donorCount ? raised / donorCount : 0);
        if (remaining) remaining.textContent = donationCurrency(Math.max(0, goal - raised));

        const adminForm = document.getElementById("donorCampaignManagement");
        if (adminForm) {
            const fields = [
                "donorCampaignStatus",
                "donorCampaignTitleInput",
                "donorCampaignDescriptionInput",
                "donorCampaignGoal",
                "donorCampaignStart",
                "donorCampaignEnd"
            ].map((id) => document.getElementById(id));
            fields.forEach((field) => {
                if (field) {
                    field.oninput = () => { campaignFormDirty = true; };
                    field.onchange = () => { campaignFormDirty = true; };
                }
            });
            if (!campaignFormDirty) {
                document.getElementById("donorCampaignStatus").value = campaign.status || "Draft";
                document.getElementById("donorCampaignTitleInput").value = campaign.title || "";
                document.getElementById("donorCampaignDescriptionInput").value = campaign.description || "";
                document.getElementById("donorCampaignGoal").value = campaign.goal || "";
                document.getElementById("donorCampaignStart").value = campaign.startDate || "";
                document.getElementById("donorCampaignEnd").value = campaign.endDate || "";
            }
        }

        const canContribute = campaign.status === "Active" &&
            new Date(`${campaign.startDate}T00:00:00`).getTime() <= new Date(new Date().toDateString()).getTime() &&
            new Date(`${campaign.endDate}T23:59:59`).getTime() >= Date.now();
        const contributionForm = document.getElementById("donorContributionForm");
        const checkoutButton = document.getElementById("donorCheckoutButton");
        if (contributionForm) {
            contributionForm.querySelectorAll("input, button[type='button'], button[type='submit']").forEach((control) => {
                control.disabled = !canContribute;
            });
            const contributionNote = document.getElementById("donorContributionNote");
            if (contributionNote) {
                contributionNote.textContent = canContribute
                    ? "Your contribution supports this campaign."
                    : "This campaign is not currently accepting contributions.";
            }
        }
        if (checkoutButton) checkoutButton.title = canContribute ? "Continue to secure QR Ph payment" : "Campaign is not accepting donations";
    }

    async function renderDonorProgress() {
        const role = currentUser?.role;
        const isAdmin = role === "admin";
        const isAlumni = role === "alumni";
        const isRegistrar = role === "staff" || role === "registrar";
        const statusHeader = document.getElementById("donationStatusHeader");
        const statusFilterLabel = document.getElementById("donationStatusFilterLabel");
        if (statusHeader) statusHeader.textContent = isRegistrar ? "Alumni Match" : "Payment Status";
        if (statusFilterLabel) statusFilterLabel.textContent = isRegistrar ? "Filter by alumni match" : "Filter by payment status";
        document.getElementById("donorCampaignManagement")?.classList.toggle("hidden", !isAdmin);
        document.getElementById("alumniDonationPanel")?.classList.toggle("hidden", !isAlumni);
        document.getElementById("registrarDonationNotice")?.classList.toggle("hidden", !isRegistrar);
        document.getElementById("exportDonationReportButton")?.classList.toggle("hidden", !isAdmin);
        const recordsDescription = document.getElementById("donationRecordsDescription");
        const search = document.getElementById("donationSearch");
        const levelFilter = document.getElementById("donationLevelFilter");
        const statusFilter = document.getElementById("donationStatusFilter");
        if (search) search.oninput = renderDonationRecords;
        if (levelFilter) levelFilter.onchange = renderDonationRecords;
        if (statusFilter) {
            statusFilter.onchange = renderDonationRecords;
            const isRegistrar = role === "staff" || role === "registrar";
            const previousStatus = statusFilter.value;
            const options = isRegistrar
                ? [["", "All Records"], ["matched", "Matched"], ["unmatched", "Needs Review"]]
                : [["", "All Payment Statuses"], ["verified", "Verified"], ["pending", "Pending"], ["recorded", "Recorded"]];
            statusFilter.replaceChildren(...options.map(([value, label]) => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                return option;
            }));
            if (options.some(([value]) => value === previousStatus)) statusFilter.value = previousStatus;
        }
        if (recordsDescription) {
            recordsDescription.textContent = isAlumni
                ? "Your contribution history. Payments are marked verified only after provider confirmation."
                : isRegistrar
                    ? "Read-only alumni identity matching. Financial payment details are restricted to campaign administrators."
                    : "Confirmed campaign contributions. Pending payments are listed separately and do not count toward funds raised.";
        }
        const managementTitle = document.getElementById("donationRecordsTitle");
        if (managementTitle && isAlumni) managementTitle.textContent = "My Contributions";

        if (isAlumni) {
            const name = document.getElementById("donorAccountName");
            const batch = document.getElementById("donorAccountBatch");
            if (name) name.textContent = currentUser.name || "Alumni";
            if (batch) {
                const level = currentUser.educationLevel || "";
                const year = currentUser.batch || "";
                batch.textContent = [level, year ? `Batch ${year}` : ""].filter(Boolean).join(" · ") || "Alumni record not linked";
            }
        }

        try {
            const campaignData = await SAA_API.request("/api/donation-campaign");
            currentDonationCampaign = campaignData.campaign;
            currentDonationMetrics = campaignData.metrics || null;
            renderDonorCampaign();
            renderDonationRecords();
        } catch (err) {
            showToast(err.message || "Unable to load donation campaign records.", "error");
        }
    }

    function setDonationAmount(val) {
        const amount = document.getElementById("donorAmount");
        if (amount) amount.value = val;
    }

    function submitDonation(event) {
        event.preventDefault();
        const amount = Number(document.getElementById("donorAmount").value);
        const campaign = currentDonationCampaign;
        if (currentUser?.role !== "alumni") {
            showToast("Only alumni accounts can make a campaign contribution.", "error");
            return;
        }
        if (!campaign || campaign.status !== "Active" || !Number.isFinite(amount) || amount < 1 || amount > 500000) {
            showToast("Choose an active campaign and enter an amount between ₱1 and ₱500,000.", "error");
            return;
        }
        openPaymentGateway({
            amount,
            purpose: campaign.title,
            detail: `Contribution by ${currentUser.name || "Alumni"}`,
            relatedType: "donation",
            campaign: campaign.title,
            donor: currentUser.name || "",
            dedication: document.getElementById("donorNote").value.trim(),
            anonymous: document.getElementById("donorAnonymous").checked
        });
    }

    /* PayMongo QR Ph — the browser never marks a payment paid. */
    let pendingCheckout = null;
    let paymentReturnTimer = null;
    let qrCountdownTimer = null;

    function qrStatusCopy(status) {
        if (status === "paid") return { title: "PAID", message: "Payment confirmed successfully." };
        if (status === "processing") return { title: "PROCESSING", message: "Your payment is being processed. Please wait." };
        if (status === "expired") return { title: "EXPIRED", message: "This payment QR has expired. Generate a new payment QR to try again." };
        if (status === "failed") return { title: "FAILED", message: "The payment could not be completed. Please try again." };
        if (status === "cancelled") return { title: "CANCELLED", message: "The payment was cancelled. You can generate a new QR to try again." };
        return { title: "WAITING FOR PAYMENT", message: "Waiting for payment. Scan the QR code using your preferred banking or e-wallet app." };
    }

    function formatExpiry(iso) {
        if (!iso) return "—";
        const ms = new Date(iso).getTime() - Date.now();
        if (ms <= 0) return "00:00";
        const mins = Math.floor(ms / 60000);
        const secs = Math.floor((ms % 60000) / 1000);
        return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    function applyQrPage(payment) {
        if (!payment) return;
        const incoming = Object.assign({}, payment);
        if (!incoming.qrImage && lastVerifiedPayment && lastVerifiedPayment.qrImage && String(lastVerifiedPayment.id) === String(incoming.id)) {
            incoming.qrImage = lastVerifiedPayment.qrImage;
        }
        lastVerifiedPayment = Object.assign({}, lastVerifiedPayment || {}, incoming);
        payment = lastVerifiedPayment;
        const copy = qrStatusCopy(payment.status);
        const amount = `₱${Number(payment.amount || 0).toFixed(2)}`;
        const purposeEl = document.getElementById("qrPagePurpose");
        const subtitleEl = document.getElementById("qrPageSubtitle");
        const requestEl = document.getElementById("qrPageRequestId");
        const amountEl = document.getElementById("qrPageAmount");
        const amountRepeatEl = document.getElementById("qrPageAmountRepeat");
        const methodEl = document.getElementById("qrPageMethod");
        const statusEl = document.getElementById("qrPageStatus");
        const messageEl = document.getElementById("qrPageMessage");
        const refEl = document.getElementById("qrPageRef");
        const expiryEl = document.getElementById("qrPageExpiry");
        if (purposeEl) purposeEl.textContent = payment.purpose || "Donation";
        if (subtitleEl) subtitleEl.textContent = payment.description || "";
        if (requestEl) requestEl.textContent = payment.requestCode || "—";
        if (amountEl) amountEl.textContent = amount;
        if (amountRepeatEl) amountRepeatEl.textContent = amount;
        if (methodEl) methodEl.textContent = "QR Ph";
        if (statusEl) statusEl.textContent = copy.title;
        if (refEl) refEl.textContent = payment.referenceId || payment.gatewayIntentId || payment.id || "—";
        if (expiryEl) expiryEl.textContent = formatExpiry(payment.qrExpiresAt);
        const img = document.getElementById("qrPageImage");
        const empty = document.getElementById("qrPageEmpty");
        const generated = document.getElementById("qrPageGenerated");
        const qrActive = payment.status !== "paid" && payment.status !== "expired" && payment.status !== "failed" && payment.status !== "cancelled";
        const paymongoQr = payment.qrSource === "paymongo" && payment.qrImage;
        if (messageEl) {
            messageEl.textContent = (qrActive && !paymongoQr)
                ? "PayMongo is not configured, so this QR identifies the request only. Add PAYMONGO_SECRET_KEY in server/.env to display a GCash-payable QR Ph code."
                : copy.message;
        }
        if (qrActive && (payment.qrImage || payment.id)) {
            if (empty) empty.classList.add("hidden");
            if (payment.qrImage && img) {
                img.src = payment.qrImage;
                img.classList.remove("hidden");
                if (generated) generated.classList.add("hidden");
            } else {
                if (img) {
                    img.removeAttribute("src");
                    img.classList.add("hidden");
                }
                drawPaymentQr(payment);
            }
        } else {
            if (img) {
                img.removeAttribute("src");
                img.classList.add("hidden");
            }
            if (generated) {
                generated.classList.add("hidden");
                generated.innerHTML = "";
            }
            if (empty) {
                empty.classList.remove("hidden");
                empty.textContent = payment.status === "paid"
                    ? "Payment confirmed. The QR is no longer needed."
                    : "This QR is no longer active.";
            }
        }
        const regen = document.getElementById("qrRegenBtn");
        const receipt = document.getElementById("qrReceiptBtn");
        if (regen) regen.classList.toggle("hidden", payment.status === "paid");
        if (receipt) receipt.classList.toggle("hidden", payment.status !== "paid");
    }

    function drawPaymentQr(payment) {
        const box = document.getElementById("qrPageGenerated");
        if (!box) return;
        const payload = payment.qrPayload || [
            payment.requestCode || `PAY-${payment.id}`,
            `PHP ${Number(payment.amount || 0).toFixed(2)}`,
            payment.referenceId || payment.gatewayIntentId || `payment-${payment.id}`
        ].join(" | ");
        if (box.getAttribute("data-payload") === payload && box.querySelector("canvas, img, table")) {
            box.classList.remove("hidden");
            return;
        }
        box.innerHTML = "";
        box.classList.remove("hidden");
        box.setAttribute("data-payload", payload);
        const size = 280;
        const holder = document.createElement("div");
        holder.style.width = size + "px";
        holder.style.height = size + "px";
        box.appendChild(holder);
        if (typeof QRCode === "undefined") {
            holder.innerHTML = `<p class="text-xs text-slate-500 px-3">${payload}</p>`;
            return;
        }
        new QRCode(holder, {
            text: payload,
            width: size,
            height: size,
            colorDark: "#1e293b",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
    }

    async function startQrPayment(options) {
        const data = await SAA_API.request("/api/payments/checkout", {
            method: "POST",
            body: JSON.stringify({
                relatedType: options.relatedType,
                relatedId: options.relatedId,
                amount: options.relatedType === "donation" ? options.amount : undefined,
                campaign: options.campaign || "",
                donor: options.donor || (currentUser && currentUser.name) || "",
                dedication: options.dedication || "",
                anonymous: Boolean(options.anonymous)
            })
        });
        if (data.error && !data.payment) throw new Error(data.error);
        if (data.error) showToast(data.error, "warning");
        lastVerifiedPayment = data.payment;
        switchView("payment", { detailId: String(data.payment.id) });
        return data.payment;
    }

    function openPaymentGateway(options) {
        pendingCheckout = options || {};
        startQrPayment(pendingCheckout).catch((err) => {
            showToast(err.message || "Unable to start QR payment.", "error");
        });
    }

    function closePaymentGatewayModal() {
        const modal = document.getElementById("paymentGatewayModal");
        if (modal) modal.classList.remove("active");
        pendingCheckout = null;
    }

    function switchPaymentFields() { /* QR Ph only */ }

    function submitPayment(event) {
        event.preventDefault();
        if (!pendingCheckout) return;
        startQrPayment(pendingCheckout).finally(closePaymentGatewayModal);
    }

    async function renderPaymentQrPage() {
        const id = Number(currentDetailId);
        if (!id) {
            document.getElementById("qrPageMessage").textContent = "No payment was selected.";
            return;
        }
        if (paymentReturnTimer) clearInterval(paymentReturnTimer);
        if (qrCountdownTimer) clearInterval(qrCountdownTimer);
        const refresh = async () => {
            const data = await SAA_API.request(`/api/payments/${id}/status`);
            applyQrPage(data.payment);
            if (data.status === "paid" || data.payment.status === "paid") {
                clearInterval(paymentReturnTimer);
                paymentReturnTimer = null;
                if (typeof SAA_API.refreshAllData === "function") {
                    SAA_API.refreshAllData().then(() => {
                        if (typeof renderDonorProgress === "function") renderDonorProgress();
                    });
                }
            }
            if (["expired", "failed", "cancelled"].includes(data.payment.status)) {
                clearInterval(paymentReturnTimer);
                paymentReturnTimer = null;
            }
        };
        try {
            const first = await SAA_API.request(`/api/payments/${id}`);
            applyQrPage(first.payment);
            await refresh();
        } catch (err) {
            document.getElementById("qrPageMessage").textContent = err.message || "Unable to load this payment.";
            return;
        }
        paymentReturnTimer = setInterval(() => refresh().catch(() => {}), 3000);
        qrCountdownTimer = setInterval(() => {
            if (lastVerifiedPayment && lastVerifiedPayment.qrExpiresAt) {
                document.getElementById("qrPageExpiry").textContent = formatExpiry(lastVerifiedPayment.qrExpiresAt);
            }
        }, 1000);
    }

    function renderPaymentReturnPage() {
        renderPaymentQrPage();
    }

    async function checkQrPaymentStatus() {
        if (!currentDetailId) return;
        try {
            const data = await SAA_API.request(`/api/payments/${currentDetailId}/status`);
            applyQrPage(data.payment);
            if (data.payment.status === "paid") showToast("Payment confirmed successfully.", "success");
            else showToast(`Current status: ${data.payment.status}`, "info");
        } catch (err) {
            showToast(err.message || "Unable to check payment status.", "error");
        }
    }

    async function regeneratePaymentQr() {
        if (!currentDetailId) return;
        try {
            const data = await SAA_API.request(`/api/payments/${currentDetailId}/qr`, { method: "POST" });
            lastVerifiedPayment = data.payment;
            if (data.error) showToast(data.error, "warning");
            switchView("payment", { detailId: String(data.payment.id), replace: true });
        } catch (err) {
            showToast(err.message || "Unable to generate a new QR.", "error");
        }
    }

    function openPaymentReceiptView(id) {
        const paymentId = id || (lastVerifiedPayment && lastVerifiedPayment.id) || currentDetailId;
        if (!paymentId) return;
        switchView("payment-receipt", { detailId: String(paymentId) });
    }

    async function renderPaymentReceiptPage() {
        const body = document.getElementById("paymentReceiptBody");
        const printBtn = document.getElementById("receiptPrintOfficialBtn");
        const dlBtn = document.getElementById("receiptDownloadBtn");
        if (printBtn) printBtn.disabled = true;
        if (dlBtn) dlBtn.disabled = true;
        if (!currentDetailId) {
            body.innerHTML = `<p class="text-center text-slate-400">No receipt selected.</p>`;
            return;
        }
        try {
            const data = await SAA_API.request(`/api/payments/${currentDetailId}/receipt`);
            const p = data.receipt || data.payment;
            lastVerifiedPayment = p;
            body.innerHTML = `
                <div class="flex justify-between"><span class="text-slate-500">Payment Status</span><span class="font-extrabold">${String(p.status || "").toUpperCase()}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Transaction Reference</span><button type="button" class="font-mono font-bold text-[#801235]" onclick="openPaymentReceiptView(${p.id})">${p.referenceId || "—"}</button></div>
                <div class="flex justify-between"><span class="text-slate-500">Payment ID</span><span class="font-mono">${p.gatewayPaymentId || p.id}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Request ID</span><span class="font-extrabold">${p.requestCode || "—"}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Payment For</span><span>${p.purpose || p.description || "—"}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Paid By</span><span>${p.paidBy || "—"}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Alumni ID</span><span>${p.alumniId || p.studentId || "—"}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Email</span><span>${p.email || "—"}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Mobile Number</span><span>${p.contact || "—"}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Payment Method</span><span>QR Ph</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Institution</span><span>${p.institution || "St. Agnes Academy of Caloocan"}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Amount</span><span class="font-extrabold text-[#801235]">₱${Number(p.amount || 0).toFixed(2)}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Date & Time</span><span>${p.paidAt ? new Date(p.paidAt).toLocaleString() : "—"}</span></div>
                <p class="text-center text-xs text-emerald-700 font-bold pt-3">Payment confirmed successfully.</p>
                <p class="text-center text-[11px] text-slate-400">This is a payment confirmation, not an official BIR tax receipt.</p>
            `;
            if (printBtn) printBtn.disabled = false;
            if (dlBtn) dlBtn.disabled = false;
        } catch (err) {
            body.innerHTML = `<p class="text-center text-rose-600 text-sm">${err.message || "Receipt is available only after confirmed payment."}</p>`;
        }
    }

    async function printServerReceipt() {
        if (!currentDetailId) return;
        const token = sessionStorage.getItem("saaToken");
        const res = await fetch(`${SAA_API.base}/api/payments/${currentDetailId}/receipt.html`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!res.ok) {
            showToast("Receipt is available only after confirmed payment.", "error");
            return;
        }
        const html = await res.text();
        const win = window.open("", "_blank");
        if (!win) return;
        win.document.write(html);
        win.document.close();
        win.print();
    }

    async function downloadServerReceipt() {
        if (!currentDetailId) return;
        const token = sessionStorage.getItem("saaToken");
        const res = await fetch(`${SAA_API.base}/api/payments/${currentDetailId}/receipt.pdf`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!res.ok) {
            showToast("Receipt is available only after confirmed payment.", "error");
            return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `payment-receipt-${currentDetailId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function closePaymentReceiptModal() {
        const modal = document.getElementById("paymentReceiptModal");
        if (modal) modal.classList.remove("active");
    }

    function printPaymentConfirmation() {
        printServerReceipt();
    }

    /* Resume & Document Upload Engine */
    let currentAttachedResume = JSON.parse(localStorage.getItem("attachedResume") || "null");

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
        document.getElementById("jobApplicantName").value = currentUser ? currentUser.name : "";
        document.getElementById("jobApplicantEmail").value = currentUser ? (currentUser.email || "") : "";
        renderResumeUI();
        document.getElementById("jobApplyModal").classList.add("active");
    }

    function closeJobApplyModal() {
        document.getElementById("jobApplyModal").classList.remove("active");
    }

    async function submitJobApplication(event) {
        event.preventDefault();
        const title = document.getElementById("jobApplyTitle").value;
        const company = document.getElementById("jobApplyCompany").value;
        const name = document.getElementById("jobApplicantName").value;
        const email = document.getElementById("jobApplicantEmail").value;
        const resume = currentAttachedResume ? currentAttachedResume.name : "";
        const job = jobsList.find((j) => j.title === title && j.company === company);

        try {
            await SAA_API.request(`/api/jobs/${job ? job.id : "0"}/apply`, {
                method: "POST",
                body: JSON.stringify({ name, email, resumeName: resume, title, company })
            });
            closeJobApplyModal();
            if (SAA_API.refreshAllData) await SAA_API.refreshAllData();
            showToast(`Application submitted for "${title}" at ${company}.`, "success");
        } catch (err) {
            showToast(err.message || "Unable to submit job application.", "error");
        }
    }

    /* Automated Email & SMS Notifications Engine */

    async function triggerNotification(channel, recipient, subject, message) {
        const target = recipient || (currentUser && (currentUser.email || currentUser.contact)) || "";
        if (!target) {
            showToast("No recipient email or mobile number is available.", "error");
            return;
        }
        try {
            const data = await SAA_API.request("/api/notifications", {
                method: "POST",
                body: JSON.stringify({ channel, recipient: target, subject, message })
            });
            if (SAA_API.refreshAllData) await SAA_API.refreshAllData();
            const status = data.deliveryStatus || "";
            if (status === "accepted") showToast(`${channel} accepted by the provider.`, "success");
            else if (status === "not_configured") showToast(channel === "SMS" ? "SMS provider is not configured." : "SMTP is not configured. The message was recorded but not sent.", "error");
            else showToast(`${channel} status: ${status || "recorded"}.`, "info");
        } catch (err) {
            showToast(err.message || "Unable to send the notification.", "error");
        }
    }

    function updateNotificationBadge() {
        const badge = document.getElementById("notificationBadgeCount");
        const unread = Number(window.notificationUnreadCount || (notificationsList || []).filter((n) => !n.isRead).length);
        if (badge) {
            badge.textContent = String(unread);
            badge.classList.toggle("hidden", unread <= 0);
        }
        const unreadLabel = document.getElementById("notificationsUnreadLabel");
        if (unreadLabel) unreadLabel.textContent = String(unread);
    }

    function renderNotificationLogs() {
        const list = document.getElementById("notificationLogsList");
        if (!list) return;
        updateNotificationBadge();

        if (!notificationsList.length) {
            list.innerHTML = `<div class="p-6 text-center text-slate-400 font-semibold border border-slate-100 rounded-xl">No notifications yet.</div>`;
            return;
        }

        list.innerHTML = notificationsList.map(n => `
            <button type="button" onclick="openNotificationRecord(${n.id})" class="w-full text-left p-3.5 border ${n.isRead ? "border-slate-200/80 bg-white" : "border-[#801235]/30 bg-rose-50"} rounded-xl space-y-1">
                <div class="flex items-center justify-between">
                    <span class="inline-flex items-center gap-1 font-bold text-xs text-[#801235]">
                        ${n.isRead ? "" : `<span class="w-2 h-2 rounded-full bg-[#801235]"></span>`}
                        ${n.notificationType || n.channel || "SYSTEM"}
                    </span>
                    <span class="text-[10px] text-slate-400 font-medium">${n.date}</span>
                </div>
                <p class="font-extrabold text-slate-800 text-xs">${n.subject}</p>
                <p class="text-[11px] text-slate-600 leading-relaxed">${n.message}</p>
                <div class="pt-1.5 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100">
                    <span>${n.isRead ? "Read" : "Unread"}</span>
                    <span>${n.emailStatus || n.smsStatus || ""}</span>
                </div>
            </button>
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
        const items = newslettersList || [];
        if (!items.length) {
            list.innerHTML = `<div class="p-6 text-center text-slate-400 font-semibold border border-slate-100 rounded-xl">No newsletters published yet.</div>`;
            return;
        }

        list.innerHTML = items.map(n => {
            const title = n.subject || n.title || "Newsletter";
            const snippet = (n.body || n.snippet || "").substring(0, 160);
            const date = n.sentAt || n.date || "";
            const safeTitle = String(title).replace(/'/g, "\\'");
            return `
            <div class="p-4 rounded-xl border border-slate-200/80 bg-white hover:border-[#801235]/40 transition shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="status-badge status-approved text-[10px]">${date || "Published"}</span>
                    </div>
                    <h5 class="font-extrabold text-slate-800 text-sm hover:text-[#801235] transition cursor-pointer">${title}</h5>
                    <p class="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">${snippet}</p>
                </div>
                <div class="flex sm:flex-col gap-2 flex-shrink-0">
                    <button onclick="showToast('Reading: ${safeTitle}', 'info')" class="btn btn-secondary text-xs py-1 px-3">
                        <i class="fa-solid fa-book-open"></i> Read
                    </button>
                </div>
            </div>`;
        }).join("");
    }

    async function sendNewsletter(event) {
        event.preventDefault();
        const subject = document.getElementById("newsletterSubject").value.trim();
        const body = document.getElementById("newsletterBody").value.trim();
        const sendSms = document.getElementById("sendNewsletterSMS") ? document.getElementById("sendNewsletterSMS").checked : true;
        const sendEmail = document.getElementById("sendNewsletterEmail") ? document.getElementById("sendNewsletterEmail").checked : true;

        try {
            await SAA_API.request("/api/newsletters", {
                method: "POST",
                body: JSON.stringify({ subject, body })
            });
            await SAA_API.refreshAllData();
            renderNewsletterArchive();
            closeNewsletterComposer();
            if (sendEmail) {
                triggerNotification("EMAIL", currentUser && currentUser.email ? currentUser.email : "", subject, "New newsletter published: " + subject);
            }
            if (sendSms && currentUser && currentUser.contact) {
                triggerNotification("SMS", currentUser.contact, subject, "New newsletter published: " + subject);
            }
            showToast("Newsletter \"" + subject + "\" published.", "success");
            event.target.reset();
        } catch (err) {
            showToast(err.message || "Unable to publish newsletter.", "error");
        }
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
    let feedbackResponses = [];
    let selectedFeedbackResponseId = null;

    function renderFeedbackResponseRows() {
        const body = document.getElementById("feedbackResponsesBody");
        if (!body) return;
        const search = (document.getElementById("feedbackSearch")?.value || "").trim().toLowerCase();
        const category = document.getElementById("feedbackCategoryFilter")?.value || "";
        const batch = document.getElementById("feedbackBatchFilter")?.value || "";
        const status = document.getElementById("feedbackStatusFilter")?.value || "";
        const rows = feedbackResponses.filter((response) => {
            const matchesSearch = !search || [response.name, response.category, response.message]
                .some((value) => String(value || "").toLowerCase().includes(search));
            return matchesSearch &&
                (!category || response.category === category) &&
                (!batch || response.batch === batch) &&
                (!status || response.status === status);
        });

        body.replaceChildren();
        if (!rows.length) {
            const row = body.insertRow();
            const cell = row.insertCell();
            cell.colSpan = 5;
            cell.className = "py-8 text-center text-slate-400";
            cell.textContent = "No survey responses match these filters.";
            return;
        }

        rows.forEach((response) => {
            const row = body.insertRow();
            const name = row.insertCell();
            name.className = "py-3 pr-4 font-semibold text-slate-700";
            name.textContent = response.name || "Alumni";

            const topic = row.insertCell();
            topic.className = "py-3 pr-4 text-slate-500";
            topic.textContent = response.category || "Other";

            const rating = row.insertCell();
            rating.className = "py-3 pr-4 whitespace-nowrap";
            rating.textContent = `${"★".repeat(Math.max(0, Math.min(5, Number(response.rating) || 0)))}${"☆".repeat(Math.max(0, 5 - (Number(response.rating) || 0)))} ${Number(response.rating) || 0}/5`;
            rating.setAttribute("aria-label", `Rating ${Number(response.rating) || 0} out of 5`);

            const statusCell = row.insertCell();
            statusCell.className = "py-3 pr-4";
            const badge = document.createElement("span");
            const responseStatus = response.status || "New";
            badge.className = `status-badge ${responseStatus === "Reviewed" ? "status-approved" : responseStatus === "Follow-up" ? "status-freelance" : "status-postgrad"}`;
            badge.textContent = responseStatus;
            statusCell.appendChild(badge);

            const action = row.insertCell();
            action.className = "py-3";
            const button = document.createElement("button");
            button.type = "button";
            button.className = "text-xs font-bold text-brand-magenta hover:underline";
            button.textContent = "View Details";
            button.addEventListener("click", () => showFeedbackDetails(response.id));
            action.appendChild(button);
        });
    }

    function setFeedbackFilterOptions(selectId, values, allLabel) {
        const select = document.getElementById(selectId);
        if (!select) return;
        const previous = select.value;
        select.replaceChildren();
        const all = document.createElement("option");
        all.value = "";
        all.textContent = allLabel;
        select.appendChild(all);
        [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b))).forEach((value) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });
        if ([...select.options].some((option) => option.value === previous)) select.value = previous;
    }

    function showFeedbackDetails(id) {
        const response = feedbackResponses.find((item) => String(item.id) === String(id));
        const panel = document.getElementById("feedbackDetailPanel");
        const fields = document.getElementById("feedbackDetailFields");
        if (!response || !panel || !fields) return;
        selectedFeedbackResponseId = response.id;
        const educationLevel = response.educationLevel === "SHS"
            ? "Senior High School"
            : response.educationLevel === "JHS"
                ? "Junior High School"
                : response.educationLevel || "—";
        const details = [
            ["Alumni", response.name || "Alumni"],
            ["Educational Level", educationLevel],
            ["Batch", response.batch || "—"],
            ["Category", response.category || "Other"],
            ["Overall Satisfaction", `${"★".repeat(Math.max(0, Math.min(5, Number(response.rating) || 0)))} ${Number(response.rating) || 0}/5`],
            ["Recommendation Score", Number(response.recommendationRating) > 0 || response.recommendationRating === 0
                ? `${response.recommendationRating}/10`
                : "Not provided"],
            ["Suggested Improvement", response.improvement || "—"],
            ["Additional Feedback", response.message || "—"],
            ["Requested Contact", response.contactRequested ? "Yes" : "No"],
            ["Submitted", response.createdAt ? new Date(response.createdAt).toLocaleString() : "—"]
        ];
        fields.replaceChildren();
        details.forEach(([label, value]) => {
            const item = document.createElement("div");
            const term = document.createElement("dt");
            term.className = "text-slate-400";
            term.textContent = label;
            const description = document.createElement("dd");
            description.className = "mt-1 font-semibold text-slate-700 whitespace-pre-wrap break-words";
            description.textContent = String(value);
            item.append(term, description);
            fields.appendChild(item);
        });
        const status = document.getElementById("feedbackReviewStatus");
        const note = document.getElementById("feedbackInternalNote");
        if (status) status.value = response.status || "New";
        if (note) note.value = response.internalNote || "";
        panel.classList.remove("hidden");
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function closeFeedbackDetails() {
        document.getElementById("feedbackDetailPanel")?.classList.add("hidden");
        selectedFeedbackResponseId = null;
    }

    async function saveFeedbackReview(event) {
        event.preventDefault();
        if (!selectedFeedbackResponseId) return;
        try {
            const data = await SAA_API.request(`/api/feedback/${selectedFeedbackResponseId}`, {
                method: "PUT",
                body: JSON.stringify({
                    status: document.getElementById("feedbackReviewStatus").value,
                    internalNote: document.getElementById("feedbackInternalNote").value.trim()
                })
            });
            feedbackResponses = feedbackResponses.map((item) =>
                String(item.id) === String(selectedFeedbackResponseId)
                    ? Object.assign({}, item, data.feedback)
                    : item
            );
            const followUp = document.getElementById("feedbackFollowUpCount");
            if (followUp) followUp.textContent = String(feedbackResponses.filter((item) => item.status === "Follow-up").length);
            renderFeedbackResponseRows();
            showFeedbackDetails(selectedFeedbackResponseId);
            showToast("Feedback review saved.", "success");
        } catch (err) {
            showToast(err.message || "Unable to save the feedback review.", "error");
        }
    }

    async function renderFeedbackPage() {
        const isAlumni = currentUser?.role === "alumni";
        const isAdmin = currentUser?.role === "admin";
        const formPanel = document.getElementById("alumniSurveyFormPanel");
        const reviewPanel = document.getElementById("feedbackReviewPanel");
        const title = document.getElementById("feedbackReviewTitle");
        const description = document.getElementById("feedbackReviewDescription");
        if (formPanel) formPanel.classList.toggle("hidden", !isAlumni);
        if (reviewPanel) reviewPanel.classList.toggle("hidden", isAlumni);
        if (!isAlumni && title) title.textContent = isAdmin ? "Survey & Feedback Management" : "Survey & Feedback Responses";
        if (!isAlumni && description) {
            description.textContent = isAdmin
                ? "Review all alumni feedback. Category routing keeps Registrar responses focused on alumni and document services."
                : "Review feedback routed to the Registrar team. System and event feedback is handled by the appropriate administrators.";
        }

        const search = document.getElementById("feedbackSearch");
        const category = document.getElementById("feedbackCategoryFilter");
        const batch = document.getElementById("feedbackBatchFilter");
        const status = document.getElementById("feedbackStatusFilter");
        if (search) search.oninput = renderFeedbackResponseRows;
        if (category) category.onchange = renderFeedbackResponseRows;
        if (batch) batch.onchange = renderFeedbackResponseRows;
        if (status) status.onchange = renderFeedbackResponseRows;

        try {
            const data = await SAA_API.request("/api/feedback");
            feedbackResponses = data.feedback || [];
            if (!isAlumni) {
                const total = document.getElementById("feedbackTotalResponses");
                const average = document.getElementById("feedbackAverageRating");
                const followUp = document.getElementById("feedbackFollowUpCount");
                const averageRating = feedbackResponses.length
                    ? feedbackResponses.reduce((sum, item) => sum + Number(item.rating || 0), 0) / feedbackResponses.length
                    : 0;
                if (total) total.textContent = String(feedbackResponses.length);
                if (average) average.textContent = feedbackResponses.length ? `${averageRating.toFixed(1)} / 5` : "—";
                if (followUp) followUp.textContent = String(feedbackResponses.filter((item) => item.status === "Follow-up").length);
                setFeedbackFilterOptions("feedbackCategoryFilter", feedbackResponses.map((item) => item.category), "All Categories");
                setFeedbackFilterOptions("feedbackBatchFilter", feedbackResponses.map((item) => item.batch), "All Batches");
                renderFeedbackResponseRows();
            }
        } catch (err) {
            showToast(err.message || "Unable to load survey responses.", "error");
        }
    }

    async function submitSurvey(event) {
        event.preventDefault();
        if (currentUser?.role !== "alumni") {
            showToast("Only alumni accounts can submit feedback.", "error");
            return;
        }
        const category = document.getElementById("surveyCategory").value;
        const rating = document.querySelector('input[name="rating"]:checked')?.value;
        const recommendationRating = document.querySelector('input[name="recommendRating"]:checked')?.value;
        const message = document.getElementById("surveyFeedback").value.trim();
        const improvement = document.getElementById("surveyImprovement").value.trim();
        const contactRequested = document.getElementById("surveyContactMe").checked;
        try {
            await SAA_API.request("/api/feedback", {
                method: "POST",
                body: JSON.stringify({
                    rating: Number(rating),
                    recommendationRating: Number(recommendationRating),
                    category,
                    message,
                    improvement,
                    contactRequested
                })
            });
            openFeedbackConfirmationModal();
            event.target.reset();
        } catch (err) {
            showToast(err.message || "Unable to save survey response.", "error");
        }
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
    let chatConversationId = null;

    function toggleChatWindow() {
        const win = document.getElementById("chatWindow");
        win.classList.toggle("hidden");
        if (!win.classList.contains("hidden")) {
            refreshChatEngineLabel();
            refreshChatHistorySelect();
        }
    }

    function closeChat() {
        document.getElementById("chatWindow").classList.add("hidden");
    }

    function resetChatMessages(intro) {
        const box = document.getElementById("chatMessages");
        if (!box) return;
        box.innerHTML = `<div class="chat-bubble-assistant">${intro || "Hello. Ask about document requests, status, jobs, events, tracking, or settings. I will remember this conversation."}</div>`;
    }

    async function startNewChatConversation() {
        chatConversationId = null;
        try {
            if (typeof SAA_API !== "undefined" && (await SAA_API.health())) {
                const data = await SAA_API.request("/api/ai/conversations", { method: "POST", body: JSON.stringify({}) });
                chatConversationId = data.conversation && data.conversation.id;
            }
        } catch (e) { /* offline */ }
        resetChatMessages();
        refreshChatHistorySelect();
    }

    async function clearChatConversation() {
        if (chatConversationId && typeof SAA_API !== "undefined") {
            try {
                await SAA_API.request(`/api/ai/conversations/${chatConversationId}`, { method: "DELETE" });
            } catch (e) { /* offline */ }
        }
        resetChatMessages("Conversation cleared. You can continue here or start a new one.");
    }

    async function loadChatConversation(id) {
        if (!id) return;
        try {
            const data = await SAA_API.request(`/api/ai/conversations/${id}`);
            chatConversationId = data.conversation.id;
            const box = document.getElementById("chatMessages");
            box.innerHTML = "";
            (data.messages || []).forEach((m) => appendChatBubble(m.content, m.role === "assistant" ? "assistant" : "user"));
            if (!(data.messages || []).length) resetChatMessages();
        } catch (e) {
            showToast(e.message || "Unable to open that conversation.", "error");
        }
    }

    async function refreshChatHistorySelect() {
        const select = document.getElementById("chatHistorySelect");
        if (!select || typeof SAA_API === "undefined") return;
        try {
            const data = await SAA_API.request("/api/ai/conversations");
            const current = chatConversationId ? String(chatConversationId) : "";
            select.innerHTML = `<option value="">Current conversation</option>` +
                (data.conversations || []).map((c) => `<option value="${c.id}" ${String(c.id) === current ? "selected" : ""}>${escapeChat(c.title || ("Conversation #" + c.id))}</option>`).join("");
        } catch (e) { /* history is optional */ }
    }

    async function refreshChatEngineLabel() {
        const el = document.getElementById("chatEngineLabel");
        if (!el) return;
        try {
            const health = await fetch((window.SAA_API && SAA_API.base ? SAA_API.base : "") + "/api/health").then((r) => r.json());
            el.textContent = (health.ai && health.ai.configured)
                ? `OpenAI connected (${health.ai.model})`
                : "Built-in conversational assistant";
        } catch (e) {
            el.textContent = "Built-in conversational assistant";
        }
    }

    function escapeChat(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

        const askAssistant = async () => {
            try {
                if (typeof SAA_API !== "undefined" && (await SAA_API.health())) {
                    const data = await SAA_API.request("/api/ai/assistant", {
                        method: "POST",
                        body: JSON.stringify({ query: msg, conversationId: chatConversationId })
                    });
                    if (data && data.conversationId) chatConversationId = data.conversationId;
                    refreshChatHistorySelect();
                    if (data && data.response) return data.response;
                }
            } catch (e) { /* offline */ }
            return getAssistantResponse(msg);
        };

        const minDelay = new Promise(r => setTimeout(r, 400));
        Promise.all([askAssistant(), minDelay]).then(([reply]) => finishReply(reply));
    }

    function appendChatBubble(text, sender) {
        const container = document.getElementById("chatMessages");
        const wrap = document.createElement("div");
        wrap.className = sender === "user" ? "flex justify-end" : "flex justify-start";
        const bubble = document.createElement("div");
        bubble.className = sender === "user" ? "chat-bubble-user" : "chat-bubble-assistant";
        if (sender === "user") bubble.textContent = text;
        else bubble.innerHTML = String(text || "").replace(/\n/g, "<br>");
        wrap.appendChild(bubble);
        container.appendChild(wrap);
        container.scrollTop = container.scrollHeight;
    }

    function getAssistantResponse(query) {
        const q = query.toLowerCase();
        if (q.includes("saan") || q.includes("where") || q.includes("ano kailangan") || q.includes("processing")) {
            return `If you mean a transcript request, open Document Requests > Transcript Requests. Certificate reprints are under Document Requests > Certificate Reprints. Processing means staff is already working on the request.`;
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
            const nextEvent = eventsList[0];
            if (!nextEvent) return `There are currently <strong>0 events</strong> on record. An administrator can create an event from Alumni Events.`;
            return `The latest event on record is <strong>${nextEvent.title}</strong>${nextEvent.date ? ` (${nextEvent.date})` : ""}${nextEvent.location ? ` at ${nextEvent.location}` : ""}.`;
        }
        if (q.includes("reunion")) {
            return `There are currently <strong>${reunionsList.length}</strong> batch reunions on record.`;
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

    function openAddJobOpportunityModal(jobId) {
        const form = document.querySelector("#addJobOpportunityModal form");
        if (!form) return;
        form.reset();
        editingJobOpportunityId = Number(jobId) || 0;
        document.getElementById("editingJobOpportunityId").value = String(editingJobOpportunityId || "");
        const job = jobsList.find((item) => Number(item.id) === editingJobOpportunityId);
        document.querySelector("#addJobOpportunityModal h3").textContent = job ? "Edit Job Opportunity" : "Post Job Opportunity";
        if (job) {
            document.getElementById("newJobTitle").value = job.title || "";
            document.getElementById("newJobCompany").value = job.company || "";
            document.getElementById("newJobLocation").value = job.location || "";
            document.getElementById("newJobIndustry").value = job.industry || "";
            document.getElementById("newJobEmploymentType").value = job.employment_type || "";
            document.getElementById("newJobDescription").value = job.description || "";
            document.getElementById("newJobQualifications").value = job.qualifications || "";
            document.getElementById("newJobApplicationMethod").value = job.application_method || "Portal";
            document.getElementById("newJobApplicationDetails").value = job.application_details || "";
            document.getElementById("newJobDeadline").value = job.deadline || "";
            document.getElementById("newJobTargetLevel").value = job.target_education_level || "All Alumni";
            document.getElementById("newJobTargetBatch").value = job.target_batch || "";
            document.getElementById("newJobTargetStrand").value = job.target_strand || "";
            document.getElementById("newJobStatus").value = job.status || "Published";
        }
        toggleJobTargetStrand();
        document.getElementById("addJobOpportunityModal").classList.add("active");
    }

    function toggleJobTargetStrand() {
        const level = document.getElementById("newJobTargetLevel")?.value;
        const strand = document.getElementById("newJobTargetStrand");
        if (!strand) return;
        strand.disabled = level !== "SHS";
        if (strand.disabled) strand.value = "";
    }

    function editJobOpportunity(jobId) {
        openAddJobOpportunityModal(jobId);
    }

    function closeAddJobOpportunityModal() {
        document.getElementById("addJobOpportunityModal").classList.remove("active");
    }

    async function setJobOpportunityStatus(jobId, status) {
        const job = jobsList.find((item) => Number(item.id) === Number(jobId));
        if (!job) return;
        try {
            await SAA_API.request(`/api/jobs/${jobId}`, {
                method: "PUT",
                body: JSON.stringify({ status })
            });
            await SAA_API.refreshAllData();
            renderJobsGrid();
            showToast(status === "Archived" ? "Job opportunity archived." : "Job opportunity republished.", "success");
        } catch (err) {
            showToast(err.message || "Unable to update job opportunity.", "error");
        }
    }

    async function saveNewJobOpportunity(event) {
        event.preventDefault();
        const id = Number(document.getElementById("editingJobOpportunityId").value) || 0;
        const payload = {
            title: document.getElementById("newJobTitle").value.trim(),
            company: document.getElementById("newJobCompany").value.trim(),
            location: document.getElementById("newJobLocation").value.trim(),
            industry: document.getElementById("newJobIndustry").value.trim(),
            employment_type: document.getElementById("newJobEmploymentType").value,
            description: document.getElementById("newJobDescription").value.trim(),
            qualifications: document.getElementById("newJobQualifications").value.trim(),
            application_method: document.getElementById("newJobApplicationMethod").value,
            application_details: document.getElementById("newJobApplicationDetails").value.trim(),
            deadline: document.getElementById("newJobDeadline").value,
            target_education_level: document.getElementById("newJobTargetLevel").value,
            target_batch: document.getElementById("newJobTargetBatch").value.trim(),
            target_strand: document.getElementById("newJobTargetLevel").value === "SHS"
                ? document.getElementById("newJobTargetStrand").value.trim()
                : "",
            status: document.getElementById("newJobStatus").value
        };
        try {
            await SAA_API.request(id ? `/api/jobs/${id}` : "/api/jobs", {
                method: id ? "PUT" : "POST",
                body: JSON.stringify(payload)
            });
            await SAA_API.refreshAllData();
            renderJobsGrid();
            closeAddJobOpportunityModal();
            event.target.reset();
            editingJobOpportunityId = 0;
            showToast(id ? "Job opportunity updated." : "Job opportunity saved.", "success");
        } catch (err) {
            showToast(err.message || "Unable to publish job opportunity.", "error");
        }
    }

    function renderDashboardUpcomingEvents() {
        const box = document.getElementById("dashboardUpcomingEvents");
        if (!box) return;
        if (!eventsList.length) {
            box.innerHTML = '<p class="text-xs text-slate-400 font-medium py-6 text-center">No upcoming events yet.</p>';
            return;
        }
        box.innerHTML = eventsList.slice(0, 4).map((ev) => {
            const dateBits = String(ev.date || "").split(/[\s,•]+/).filter(Boolean);
            const month = (dateBits[0] || "EVT").slice(0, 3);
            const day = dateBits[1] || "";
            return `
            <button type="button" onclick="openDashboardModule('events')" class="flex items-center p-3.5 border border-slate-100 rounded-xl bg-slate-50/60 hover:bg-pink-50/40 transition w-full text-left">
                <div class="bg-pink-100 text-brand-magenta font-extrabold rounded-lg p-2.5 text-center min-w-[52px]">
                    <p class="text-[10px] uppercase tracking-wider">${month}</p>
                    <p class="text-lg leading-tight">${day || "—"}</p>
                </div>
                <div class="ml-4 min-w-0">
                    <h4 class="font-bold text-slate-800 text-xs sm:text-sm truncate">${ev.title || "Event"}</h4>
                    <p class="text-[11px] text-slate-400 font-medium mt-0.5">
                        <i class="fa-regular fa-clock mr-1"></i> ${ev.date || ""} ${ev.location ? "| " + ev.location : ""}
                    </p>
                </div>
            </button>`;
        }).join("");
    }
