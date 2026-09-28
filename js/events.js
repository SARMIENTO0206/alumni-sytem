/* events - Alumni Events - RSVP, Reminders, Attendance */
/* Split from engagement.js lines 174-455 */

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
                body: JSON.stringify({ title, date, location, description, imageData: newEventImageData, eventDate })
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

    /* Automated event reminder flow (T-3 / T-1) */
    async function runEventReminderSweep() {
        try {
            const data = await SAA_API.request("/api/events/reminders/run", { method: "POST" });
            if (SAA_API.refreshAllData) await SAA_API.refreshAllData();
            if (typeof renderEventsGrid === "function") renderEventsGrid();
            if (!data.reminders) {
                showToast(`No reminder stage is due right now. Stages are checked ${(data.offsets || []).join(" and ")} days before the event across ${data.eventsChecked || 0} event(s).`, "info");
                return;
            }
            const smsNote = data.smsConfigured
                ? `${data.smsAccepted} SMS accepted${data.smsFailed ? `, ${data.smsFailed} failed` : ""}.`
                : "No SMS provider is configured, so recipients received the portal reminder only.";
            showToast(`Automated reminders sent for ${data.reminders} event stage(s), ${data.recipients} recipient(s). ${smsNote}`, data.smsFailed ? "info" : "success");
        } catch (err) {
            showToast(err.message || "Unable to run the automated event reminders.", "error");
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

