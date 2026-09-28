/* jobs - Career Management - Job Opportunities */
/* Split from engagement.js lines 1-173 */

/* engagement.js - Events, reunions, donations, resume, notifications, newsletter, feedback and assistant chat. */

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 4018-4710 */
/* ------------------------------------------------------------------------- */
    let newEventImageData = "";
    let editingJobOpportunityId = 0;
    let newsletterStatusFilter = "All";
    let editingNewsletterId = 0;

    function canManageJobListings() {
        return isAdminRole() || isStaffRole();
    }

    /* The hiring phase is derived from the application window - never authored by hand. */
    const JOB_PHASE_BADGES = {
        "Hiring Now": "status-approved",
        Upcoming: "status-pending",
        Closed: "status-cancelled",
        Draft: "status-freelance",
        Archived: "status-rejected"
    };

    function jobPhase(job) {
        if (job.application_phase) return job.application_phase;
        const status = job.status || "Published";
        if (status !== "Published") return status;
        const today = new Date().toISOString().slice(0, 10);
        if (job.application_start && today < job.application_start) return "Upcoming";
        if (job.deadline && today > job.deadline) return "Closed";
        return "Hiring Now";
    }

    function jobPhaseBadge(job) {
        const phase = jobPhase(job);
        return `<span class="status-badge ${JOB_PHASE_BADGES[phase] || "status-cancelled"}">${escapeHtml(phase.toUpperCase())}</span>`;
    }

    function isJobExpired(job) {
        return jobPhase(job) === "Closed";
    }

    function formatJobDate(iso, style) {
        if (!iso) return "";
        const date = new Date(`${iso}T00:00:00`);
        if (Number.isNaN(date.getTime())) return iso;
        return `${date.toLocaleDateString("en-US", { month: style === "short" ? "short" : "long", day: "numeric" })}, ${date.getFullYear()}`;
    }

    /** "October 1–15, 2026" when the window sits inside one month; a full range otherwise. */
    function jobScheduleLabel(job) {
        const start = String(job.application_start || "");
        const deadline = String(job.deadline || "");
        if (!start && !deadline) return "Until filled";
        if (!start) return `Until ${formatJobDate(deadline)}`;
        if (!deadline) return `From ${formatJobDate(start)}`;
        const from = new Date(`${start}T00:00:00`);
        const to = new Date(`${deadline}T00:00:00`);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return `${start} – ${deadline}`;
        if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) {
            return `${from.toLocaleDateString("en-US", { month: "long" })} ${from.getDate()}–${to.getDate()}, ${to.getFullYear()}`;
        }
        return `${formatJobDate(start)} – ${formatJobDate(deadline)}`;
    }

    function jobTimeLabel(job) {
        const start = String(job.walk_in_time_start || "");
        const end = String(job.walk_in_time_end || "");
        if (!start && !end) return "";
        const to12h = (value) => {
            const parts = String(value).split(":");
            const hour = Number(parts[0]);
            if (!Number.isFinite(hour) || parts.length < 2) return value;
            const suffix = hour >= 12 ? "PM" : "AM";
            const display = hour % 12 === 0 ? 12 : hour % 12;
            return `${display}:${parts[1]} ${suffix}`;
        };
        if (start && end) return `${to12h(start)} – ${to12h(end)}`;
        return start ? `From ${to12h(start)}` : `Until ${to12h(end)}`;
    }

    /** Free-text lists (qualifications, what to bring) render as bullets, one item per line. */
    function jobBulletItems(value) {
        return String(value || "").split(/\r?\n|;/).map((line) => line.trim()).filter(Boolean);
    }

    function jobMethodLabel(method) {
        const labels = {
            "Walk-in": "Walk-in Application",
            Online: "Online Application",
            Link: "Online Application",
            Email: "Email Application",
            "Contact Employer": "Contact Employer",
            "Contact Information": "Contact Employer",
            Portal: "Apply through the Alumni Portal"
        };
        return labels[method] || "Application Details";
    }

    function jobDirectionsUrl(job) {
        const link = String(job.map_link || "").trim();
        if (link) return link;
        const address = [job.application_venue, job.application_address, job.location]
            .map((value) => String(value || "").trim()).filter(Boolean).join(", ");
        return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : "";
    }

    function jobIsWalkIn(job) {
        return job.application_method === "Walk-in";
    }

    function jobApplicationEmail(job) {
        const method = String(job.application_method || "");
        const details = String(job.application_details || "").trim();
        if (method === "Email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details)) return details;
        return "";
    }

    function jobOnlineLink(job) {
        const method = String(job.application_method || "");
        const details = String(job.application_details || "").trim();
        if ((method === "Online" || method === "Link") && /^https:\/\//i.test(details)) return details;
        return "";
    }

    /** A phone-like contact detail gets a label so a bare number never floats on the card. */
    /** The "How to Apply" block answers where to go and what to bring, per method. */
    function jobHowToApplyLines(job) {
        const lines = [`<p class="font-semibold text-slate-800">${escapeHtml(jobMethodLabel(job.application_method))}</p>`];
        if (jobIsWalkIn(job)) {
            const venue = [job.application_venue, job.application_address].map((value) => String(value || "").trim())
                .filter(Boolean).join(", ");
            if (venue) lines.push(`<p>📍 ${escapeHtml(venue)}</p>`);
            const bring = jobBulletItems(job.application_bring);
            if (bring.length) {
                lines.push("<p>Bring:</p>");
                lines.push(`<ul class="list-disc pl-5 space-y-0.5">${bring.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`);
            }
            return lines;
        }
        const email = jobApplicationEmail(job);
        if (email) {
            lines.push("<p>Send your resume to:</p>");
            lines.push(`<p class="font-semibold text-slate-800">${escapeHtml(email)}</p>`);
            lines.push(`<p class="text-[11px] text-slate-500">Subject: Application - ${escapeHtml(job.title || "")}</p>`);
            return lines;
        }
        const link = jobOnlineLink(job);
        if (link) {
            lines.push("<p>Apply online at:</p>");
            lines.push(`<p class="text-[11px] text-slate-500 break-all">${escapeHtml(link)}</p>`);
            return lines;
        }
        const contact = jobContactDetail(job);
        if (contact) {
            const labelled = /^[+()\d\s-]{7,}$/.test(contact) ? "Contact Number" : "Contact";
            lines.push(`<p>${labelled}: <span class="font-semibold text-slate-800">${escapeHtml(contact)}</span></p>`);
            return lines;
        }
        const details = String(job.application_details || "").trim();
        lines.push(details
            ? `<p>${escapeHtml(details)}</p>`
            : "<p class=\"text-slate-500\">Apply through the alumni portal and record your application.</p>");
        return lines;
    }

    function jobApplyButton(job) {
        return `<button type="button" onclick='applyJobOpportunity(${JSON.stringify(String(job.title || ""))}, ${JSON.stringify(String(job.company || ""))})' class="btn btn-primary text-xs">Apply / Record Application</button>`;
    }

    /** The primary card action follows the application method. */
    function jobPrimaryAction(job) {
        const email = jobApplicationEmail(job);
        if (email) {
            const subject = encodeURIComponent(`Application - ${String(job.title || "")}`);
            return `<a href="mailto:${encodeURIComponent(email)}?subject=${subject}" class="btn btn-primary text-xs">Send Email</a>`;
        }
        const link = jobOnlineLink(job);
        if (link) {
            return `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary text-xs">Apply Online ↗</a>`;
        }
        if (jobIsWalkIn(job) || ["Contact Employer", "Contact Information"].includes(job.application_method)) {
            const directions = jobDirectionsUrl(job);
            if (directions) {
                return `<a href="${escapeHtml(directions)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary text-xs">Get Directions</a>`;
            }
        }
        return jobApplyButton(job);
    }

    function refreshJobFilterOptions(selectId, field, label) {
        const select = document.getElementById(selectId);
        if (!select) return;
        const selected = select.value;
        const values = [...new Set(jobsList.map((job) => String(job[field] || "").trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));
        select.innerHTML = `<option value="">${label}</option>${values.map((value) =>
            `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
        ).join("")}`;
        if (values.includes(selected)) select.value = selected;
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
            const phaseEl = document.getElementById("jobDetailPhase");
            const meta = document.getElementById("jobDetailMeta");
            const infoList = document.getElementById("jobDetailInfoList");
            const locationEl = document.getElementById("jobDetailLocation");
            const locationActions = document.getElementById("jobDetailLocationActions");
            const scheduleEl = document.getElementById("jobDetailSchedule");
            const timeEl = document.getElementById("jobDetailWalkInTime");
            const body = document.getElementById("jobDetailDescription");
            const qualificationsSection = document.getElementById("jobDetailQualificationsSection");
            const qualificationsEl = document.getElementById("jobDetailQualifications");
            const howToEl = document.getElementById("jobDetailHowToApply");
            const actions = document.getElementById("jobDetailActions");

            if (title) title.textContent = job.title || "Job";
            if (company) company.textContent = job.company || "";
            if (phaseEl) {
                const phase = jobPhase(job);
                phaseEl.className = `status-badge ${JOB_PHASE_BADGES[phase] || "status-cancelled"}`;
                phaseEl.textContent = phase.toUpperCase();
            }
            if (meta) meta.textContent = [jobMethodLabel(job.application_method), job.location].filter(Boolean).join(" • ");

            if (infoList) {
                const info = [
                    ["Employment Type", job.employment_type],
                    ["Industry", job.industry],
                    ["Open To", job.open_to],
                    ["Preferred Strand", job.preferred_strand],
                    ["Location", job.location]
                ].filter(([, value]) => String(value || "").trim());
                infoList.innerHTML = info.map(([label, value]) =>
                    `<div><dt class="text-slate-400 font-semibold">${escapeHtml(label)}</dt><dd class="text-slate-700">${escapeHtml(value)}</dd></div>`
                ).join("");
            }

            if (locationEl) {
                locationEl.textContent = [job.application_venue, job.application_address, job.location]
                    .map((value) => String(value || "").trim()).filter(Boolean).join(", ") || "—";
            }
            if (locationActions) {
                const directions = jobDirectionsUrl(job);
                locationActions.innerHTML = directions
                    ? `<a href="${escapeHtml(directions)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary text-xs">Get Directions</a>`
                    : "";
            }

            if (scheduleEl) scheduleEl.textContent = `📅 ${jobScheduleLabel(job)}`;
            if (timeEl) {
                const time = jobTimeLabel(job);
                timeEl.textContent = time ? `🕘 ${time}` : "";
            }
            if (body) body.textContent = job.description || "";
            if (qualificationsSection && qualificationsEl) {
                const items = jobBulletItems(job.qualifications);
                qualificationsSection.classList.toggle("hidden", !items.length);
                qualificationsEl.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
            }
            if (howToEl) howToEl.innerHTML = jobHowToApplyLines(job).join("");
            if (actions) {
                actions.innerHTML = canManageJobListings()
                    ? `<button type="button" onclick="editJobOpportunity(${Number(job.id)})" class="btn btn-secondary text-xs">Edit Listing</button>
                       <button type="button" onclick="setJobOpportunityStatus(${Number(job.id)}, '${job.status === "Archived" ? "Published" : "Archived"}')" class="btn btn-secondary text-xs">${job.status === "Archived" ? "Republish" : "Archive"}</button>
                       ${isAdminRole() ? `<button type="button" onclick="deleteJobOpportunity(${Number(job.id)})" class="btn btn-secondary text-xs text-rose-700">Delete</button>` : ""}`
                    : jobAlumniActions(job);
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

    function jobAlumniActions(job) {
        const primary = jobPrimaryAction(job);
        const record = jobApplyButton(job);
        return primary === record ? primary : `${primary}${record}`;
    }

    /** Card = quick answers: hiring pa ba, kailan, saan, at ano ang dadalhin. */
    function jobCardHtml(job) {
        const time = jobTimeLabel(job);
        return `
            <div class="app-card app-card-hover p-5 flex flex-col justify-between" data-job-id="${job.id}">
                <div class="space-y-3">
                    <div class="flex justify-between items-start gap-2">
                        <button type="button" onclick="switchView('job-opportunities', { detailId: '${job.id}' })" class="text-left">
                            <h4 class="font-extrabold text-slate-800 text-sm hover:text-brand-magenta">${escapeHtml(job.title || "Job Opportunity")}</h4>
                        </button>
                        ${jobPhaseBadge(job)}
                    </div>
                    <p class="text-xs text-brand-magenta font-semibold">${escapeHtml(job.company || "")}</p>
                    <ul class="text-xs text-slate-500 space-y-1">
                        ${job.location ? `<li>📍 ${escapeHtml(job.location)}</li>` : ""}
                        ${job.employment_type ? `<li>💼 ${escapeHtml(job.employment_type)}</li>` : ""}
                        ${job.open_to ? `<li>🎓 Open to ${escapeHtml(job.open_to)}</li>` : ""}
                    </ul>
                    <div class="rounded-xl bg-slate-50/80 border border-slate-200/80 p-3">
                        <p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Hiring Schedule</p>
                        <p class="text-xs text-slate-700 mt-1">📅 ${escapeHtml(jobScheduleLabel(job))}</p>
                        ${time ? `<p class="text-xs text-slate-700">🕘 ${escapeHtml(time)}</p>` : ""}
                    </div>
                    <div class="rounded-xl bg-emerald-50/50 border border-emerald-200/70 p-3">
                        <p class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">How to Apply</p>
                        <div class="text-xs text-slate-600 mt-1 space-y-1">${jobHowToApplyLines(job).join("")}</div>
                    </div>
                    ${job.deadline ? `<p class="text-[11px] text-slate-400">Application Deadline: ${escapeHtml(formatJobDate(job.deadline))}</p>` : ""}
                    ${isAdminRole() ? `<p class="text-[11px] text-slate-400">Posted by ${escapeHtml(job.posted_by || job.created_by_name || "Legacy posting")}</p>` : ""}
                </div>
                <div class="flex flex-wrap gap-2 mt-4">
                    <button type="button" onclick="switchView('job-opportunities', { detailId: '${job.id}' })" class="btn btn-secondary text-xs">View Details</button>
                    ${canManageJobListings()
                        ? `<button type="button" onclick="editJobOpportunity(${Number(job.id)})" class="btn btn-secondary text-xs">Edit</button>
                           <button type="button" onclick="setJobOpportunityStatus(${Number(job.id)}, '${job.status === "Archived" ? "Published" : "Archived"}')" class="btn btn-secondary text-xs">${job.status === "Archived" ? "Republish" : "Archive"}</button>
                           ${isAdminRole() ? `<button type="button" onclick="deleteJobOpportunity(${Number(job.id)})" class="btn btn-secondary text-xs text-rose-700">Delete</button>` : ""}`
                        : jobAlumniActions(job)}
                </div>
            </div>`;
    }

    function renderJobsGrid() {
        const grid = document.getElementById("jobsGridContainer");
        if (!grid) return;
        const canManage = canManageJobListings();
        const isAdmin = isAdminRole();
        const hiringCount = jobsList.filter((job) => jobPhase(job) === "Hiring Now").length;
        const closedCount = jobsList.filter((job) => jobPhase(job) === "Closed").length;
        const summary = document.getElementById("jobManagementSummary");
        if (summary) summary.classList.toggle("hidden", !isAdmin);
        const totalCountEl = document.getElementById("totalJobsCount");
        if (totalCountEl) totalCountEl.textContent = String(jobsList.length);
        const activeCountEl = document.getElementById("activeJobsCount");
        const inactiveCountEl = document.getElementById("inactiveJobsCount");
        if (activeCountEl) activeCountEl.textContent = String(hiringCount);
        if (inactiveCountEl) inactiveCountEl.textContent = String(closedCount);

        refreshJobFilterOptions("jobsIndustryFilter", "industry", "All Industries");
        refreshJobFilterOptions("jobsEmploymentTypeFilter", "employment_type", "All Employment Types");
        refreshJobFilterOptions("jobsLocationFilter", "location", "All Locations");
        const search = String(document.getElementById("jobsSearchInput")?.value || "").trim().toLowerCase();
        const statusFilter = String(document.getElementById("jobsStatusFilter")?.value || "active");
        const industryFilter = String(document.getElementById("jobsIndustryFilter")?.value || "");
        const typeFilter = String(document.getElementById("jobsEmploymentTypeFilter")?.value || "");
        const locationFilter = String(document.getElementById("jobsLocationFilter")?.value || "");
        const statusSelect = document.getElementById("jobsStatusFilter");
        if (statusSelect) statusSelect.classList.toggle("hidden", !canManage);
        const filteredJobs = jobsList.filter((job) => {
            const phase = jobPhase(job);
            const matchesSearch = !search || [job.title, job.company, job.location, job.industry, job.open_to]
                .some((value) => String(value || "").toLowerCase().includes(search));
            /* Alumni always see every published listing; the phase badge tells them the rest. */
            const matchesStatus = !canManage || statusFilter === "all"
                || (statusFilter === "active" && phase === "Hiring Now")
                || (statusFilter === "upcoming" && phase === "Upcoming")
                || (statusFilter === "closed" && phase === "Closed")
                || (statusFilter === "draft" && phase === "Draft")
                || (statusFilter === "archived" && phase === "Archived");
            return matchesSearch && matchesStatus
                && (!industryFilter || job.industry === industryFilter)
                && (!typeFilter || job.employment_type === typeFilter)
                && (!locationFilter || job.location === locationFilter);
        });
        if (!filteredJobs.length) {
            const emptyMessage = jobsList.length ? "No job opportunities match these filters." : "No job opportunities yet.";
            grid.innerHTML = `<div class="col-span-full text-center py-10 text-slate-400 font-semibold">${emptyMessage}</div>`;
            return;
        }
        grid.innerHTML = filteredJobs.map(jobCardHtml).join("");
    }

