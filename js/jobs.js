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
                    ? `<button type="button" onclick="editJobOpportunity(${Number(job.id)})" class="btn btn-secondary text-xs">Edit Listing</button>
                       <button type="button" onclick="setJobOpportunityStatus(${Number(job.id)}, '${job.status === "Archived" ? "Published" : "Archived"}')" class="btn btn-secondary text-xs">${job.status === "Archived" ? "Republish" : "Archive"}</button>
                       ${isAdminRole() ? `<button type="button" onclick="deleteJobOpportunity(${Number(job.id)})" class="btn btn-secondary text-xs text-rose-700">Delete</button>` : ""}`
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
        const isAdmin = isAdminRole();
        const activeCount = jobsList.filter((job) => job.status === "Published" && !isJobExpired(job)).length;
        const expiredCount = jobsList.filter(isJobExpired).length;
        const summary = document.getElementById("jobManagementSummary");
        if (summary) summary.classList.toggle("hidden", !isAdmin);
        const totalCountEl = document.getElementById("totalJobsCount");
        if (totalCountEl) totalCountEl.textContent = String(jobsList.length);
        const activeCountEl = document.getElementById("activeJobsCount");
        const inactiveCountEl = document.getElementById("inactiveJobsCount");
        if (activeCountEl) activeCountEl.textContent = String(activeCount);
        if (inactiveCountEl) inactiveCountEl.textContent = String(expiredCount);

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
            const expired = isJobExpired(job);
            const matchesSearch = !search || [job.title, job.company, job.location, job.industry].some((value) => String(value || "").toLowerCase().includes(search));
            const matchesStatus = !canManage || statusFilter === "all"
                || (statusFilter === "active" && job.status === "Published" && !expired)
                || (statusFilter === "expired" && expired)
                || (statusFilter === "draft" && job.status === "Draft")
                || (statusFilter === "archived" && job.status === "Archived");
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
                    ${isAdmin ? `<p class="text-[11px] text-slate-400 mt-2">Posted by ${escapeHtml(job.posted_by || job.created_by_name || "Legacy posting")}</p>` : ""}
                </div>
                <div class="flex flex-wrap gap-2 mt-4">
                    ${canManage
                        ? `<button type="button" onclick="editJobOpportunity(${Number(job.id)})" class="btn btn-secondary text-xs">Edit</button>
                           <button type="button" onclick="setJobOpportunityStatus(${Number(job.id)}, '${job.status === "Archived" ? "Published" : "Archived"}')" class="btn btn-secondary text-xs">${job.status === "Archived" ? "Republish" : "Archive"}</button>
                           ${isAdmin ? `<button type="button" onclick="deleteJobOpportunity(${Number(job.id)})" class="btn btn-secondary text-xs text-rose-700">Delete</button>` : ""}`
                        : jobApplicationAction(job)}
                </div>
            </div>`;
        }).join("");
    }

