/* newsletter - Newsletter Composer, AI Compose, Approval Flow */
/* Split from engagement.js lines 1746-2081 */

    function canManageNewsletters() {
        return isAdminRole() || isStaffRole();
    }

    function setNewsletterFilter(status) {
        newsletterStatusFilter = status;
        renderNewsletterArchive();
    }

    function openNewsletterComposer(newsletterId = 0) {
        if (!canManageNewsletters()) return;
        const composer = document.getElementById("newsletterComposer");
        const form = document.getElementById("newsletterForm");
        const title = document.getElementById("newsletterTitle");
        const subject = document.getElementById("newsletterSubject");
        const body = document.getElementById("newsletterBody");
        const inApp = document.getElementById("sendNewsletterInApp");
        const email = document.getElementById("sendNewsletterEmail");
        const sms = document.getElementById("sendNewsletterSMS");
        const selected = (newslettersList || []).find((item) => Number(item.id) === Number(newsletterId));
        if (!composer || !form || !title || !subject || !body) return;
        editingNewsletterId = selected ? Number(selected.id) : 0;
        form.reset();
        form.dataset.newsletterId = String(editingNewsletterId);
        document.getElementById("newsletterComposerTitle").textContent = selected ? "Edit Newsletter Draft" : "Create Newsletter";
        title.value = selected?.title || "";
        subject.value = selected?.subject || "";
        body.value = selected?.body || "";
        if (inApp) inApp.checked = selected ? selected.sendInApp : true;
        if (email) email.checked = selected ? selected.sendEmail : true;
        if (sms) sms.checked = selected ? selected.sendSms : false;
        composer.classList.remove("hidden");
    }

    function closeNewsletterComposer() {
        const composer = document.getElementById("newsletterComposer");
        if (composer) composer.classList.add("hidden");
        editingNewsletterId = 0;
    }

    function renderNewsletterArchive() {
        const list = document.getElementById("newsletterArchiveList");
        if (!list) return;
        const staffView = canManageNewsletters();
        const pageTitle = document.getElementById("newsletterPageTitle");
        const listTitle = document.getElementById("newsletterListTitle");
        if (pageTitle) pageTitle.textContent = staffView ? "Newsletter Management" : "Alumni Newsletter";
        if (listTitle) listTitle.innerHTML = `<i class="fa-solid fa-layer-group text-[#801235] mr-1"></i> ${staffView ? "Newsletters" : "Published Editions"}`;
        const tabBar = document.getElementById("newsletterStatusTabs");
        if (tabBar) tabBar.classList.toggle("hidden", !staffView);
        document.querySelectorAll("[data-newsletter-filter]").forEach((button) => {
            button.classList.toggle("btn-primary", button.dataset.newsletterFilter === newsletterStatusFilter);
            button.classList.toggle("btn-secondary", button.dataset.newsletterFilter !== newsletterStatusFilter);
        });
        const items = (newslettersList || []).filter((item) => {
            if (!staffView) return item.status === "Published";
            if (newsletterStatusFilter === "All") return true;
            if (newsletterStatusFilter === "Draft") return item.status === "Draft" || item.status === "Changes Requested";
            return item.status === newsletterStatusFilter;
        });
        if (!items.length) {
            const emptyText = staffView
                ? (newsletterStatusFilter === "All" ? "No newsletters have been created yet." : `No ${escapeHtml(newsletterStatusFilter.toLowerCase())} newsletters.`)
                : "No newsletters published yet.";
            list.innerHTML = `<div class="p-6 text-center text-slate-400 font-semibold border border-slate-100 rounded-xl">${emptyText}</div>`;
            return;
        }

        list.innerHTML = items.map(n => {
            const title = escapeHtml(n.title || n.subject || "Newsletter");
            const subject = escapeHtml(n.subject || "");
            const snippet = escapeHtml((n.body || n.snippet || "").substring(0, 160));
            const rawDate = n.sentAt || n.submittedAt || "";
            const date = rawDate ? escapeHtml(new Date(rawDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })) : "";
            const status = escapeHtml(n.status || "Published");
            const statusClass = n.status === "Published" ? "status-approved" : n.status === "Changes Requested" ? "status-rejected" : "status-pending";
            const author = staffView && n.createdByName
                ? `<p class="text-[11px] text-slate-400 mt-1">Created by ${escapeHtml(n.createdByName)}</p>` : "";
            const note = n.status === "Changes Requested" && n.reviewNote
                ? `<p class="text-xs text-amber-700 mt-2"><strong>Admin note:</strong> ${escapeHtml(n.reviewNote)}</p>` : "";
            let actions = `<button type="button" onclick="openNewsletterRead(${Number(n.id)})" class="btn btn-secondary text-xs py-1 px-3"><i class="fa-solid fa-book-open"></i> Read</button>`;
            if (n.status === "Draft" || n.status === "Changes Requested") {
                const ownDraft = isAdminRole() || Number(n.createdBy) === Number(currentUser?.id);
                if (staffView && ownDraft) {
                    actions = `
                        <button type="button" onclick="openNewsletterComposer(${Number(n.id)})" class="btn btn-secondary text-xs py-1 px-3">Edit</button>
                        <button type="button" onclick="submitNewsletterForApproval(${Number(n.id)})" class="btn btn-primary text-xs py-1 px-3">Submit for Approval</button>`;
                } else if (staffView) actions = `<span class="text-xs text-slate-400">Awaiting author edits</span>`;
            } else if (n.status === "For Approval") {
                if (isAdminRole()) {
                    actions = `
                        <button type="button" onclick="openNewsletterRead(${Number(n.id)})" class="btn btn-secondary text-xs py-1 px-3">Preview</button>
                        <button type="button" onclick="reviewNewsletter(${Number(n.id)}, 'approve')" class="btn btn-primary text-xs py-1 px-3">Approve & Publish</button>
                        <button type="button" onclick="reviewNewsletter(${Number(n.id)}, 'return')" class="btn btn-secondary text-xs py-1 px-3">Return for Editing</button>`;
                } else {
                    actions = `<button type="button" onclick="openNewsletterRead(${Number(n.id)})" class="btn btn-secondary text-xs py-1 px-3">Preview</button>`;
                }
            } else if (n.status === "Published") {
                actions = `
                    <button type="button" onclick="openNewsletterRead(${Number(n.id)})" class="btn btn-secondary text-xs py-1 px-3">Read</button>
                    ${staffView ? `<button type="button" onclick="showNewsletterDeliveryReport(${Number(n.id)})" class="btn btn-secondary text-xs py-1 px-3">Delivery Report</button>` : ""}
                    ${isAdminRole() ? `<button type="button" onclick="archiveNewsletter(${Number(n.id)})" class="btn btn-secondary text-xs py-1 px-3">Archive</button>` : ""}`;
            }
            return `
            <div class="p-4 rounded-xl border border-slate-200/80 bg-white hover:border-[#801235]/40 transition shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="status-badge ${statusClass} text-[10px]">${status}</span>
                        <span class="text-[10px] text-slate-400">${date}</span>
                    </div>
                    <h5 class="font-extrabold text-slate-800 text-sm">${title}</h5>
                    <p class="text-xs font-semibold text-slate-600 mt-1">${subject}</p>
                    <p class="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">${snippet}</p>
                    ${author}${note}
                </div>
                <div class="flex flex-wrap sm:flex-col gap-2 flex-shrink-0">
                    ${actions}
                </div>
            </div>`;
        }).join("");
    }

    function openNewsletterRead(newsletterId) {
        const newsletter = (newslettersList || []).find((item) => Number(item.id) === Number(newsletterId));
        if (!newsletter) return;
        document.getElementById("newsletterReadTitle").textContent = newsletter.title || newsletter.subject || "Newsletter";
        document.getElementById("newsletterReadSubject").textContent = newsletter.subject || "";
        document.getElementById("newsletterReadDate").textContent = newsletter.sentAt || newsletter.status || "Newsletter";
        document.getElementById("newsletterReadBody").textContent = newsletter.body || "";
        document.getElementById("newsletterReadModal").classList.remove("hidden");
    }

    function closeNewsletterRead() {
        document.getElementById("newsletterReadModal")?.classList.add("hidden");
    }

    async function submitNewsletterForApproval(newsletterId = editingNewsletterId) {
        if (newsletterId) {
            try {
                await SAA_API.request(`/api/newsletters/${newsletterId}/submit`, { method: "POST" });
                await SAA_API.refreshAllData();
                renderNewsletterArchive();
                showToast("Newsletter submitted to Admin for approval.", "success");
            } catch (err) {
                showToast(err.message || "Unable to submit newsletter.", "error");
            }
            return;
        }
        document.querySelector("#newsletterForm button[value='submit']")?.click();
    }

    async function sendNewsletter(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const newsletterId = Number(form.dataset.newsletterId || 0);
        const action = event.submitter?.value || "draft";
        const title = document.getElementById("newsletterTitle").value.trim();
        const subject = document.getElementById("newsletterSubject").value.trim();
        const body = document.getElementById("newsletterBody").value.trim();
        const sendInApp = document.getElementById("sendNewsletterInApp").checked;
        const sendSms = document.getElementById("sendNewsletterSMS") ? document.getElementById("sendNewsletterSMS").checked : true;
        const sendEmail = document.getElementById("sendNewsletterEmail") ? document.getElementById("sendNewsletterEmail").checked : true;
        if (!sendInApp && !sendEmail && !sendSms) {
            showToast("Select at least one notification channel.", "error");
            return;
        }
        const payload = { title, subject, body, sendInApp, sendEmail, sendSms };

        try {
            const response = await SAA_API.request(newsletterId ? `/api/newsletters/${newsletterId}` : "/api/newsletters", {
                method: newsletterId ? "PUT" : "POST",
                body: JSON.stringify(payload)
            });
            const savedId = Number(response.newsletter?.id || newsletterId);
            if (action === "submit") {
                await SAA_API.request(`/api/newsletters/${savedId}/submit`, { method: "POST" });
            }
            await SAA_API.refreshAllData();
            renderNewsletterArchive();
            closeNewsletterComposer();
            showToast(action === "submit" ? "Newsletter submitted for Admin approval." : "Newsletter draft saved.", "success");
            form.reset();
        } catch (err) {
            showToast(err.message || "Unable to save newsletter.", "error");
        }
    }

    async function reviewNewsletter(newsletterId, action) {
        try {
            let result;
            if (action === "approve") {
                result = await SAA_API.request(`/api/newsletters/${newsletterId}/approve`, { method: "POST" });
            } else {
                const note = window.prompt("What should the author change before resubmitting?");
                if (note === null) return;
                if (!note.trim()) {
                    showToast("Add a note explaining the requested edits.", "error");
                    return;
                }
                result = await SAA_API.request(`/api/newsletters/${newsletterId}/return`, {
                    method: "POST",
                    body: JSON.stringify({ note })
                });
            }
            await SAA_API.refreshAllData();
            renderNewsletterArchive();
            if (action === "approve") {
                const delivery = result.delivery || {};
                const warnings = delivery.error || delivery.failed ? " Some delivery channels need attention; check the delivery report." : "";
                showToast(`Newsletter published to ${delivery.audience || 0} alumni.${warnings}`, warnings ? "warning" : "success");
            } else {
                showToast("Newsletter returned to its author with your note.", "success");
            }
        } catch (err) {
            showToast(err.message || "Unable to review newsletter.", "error");
        }
    }

    async function archiveNewsletter(newsletterId) {
        if (!window.confirm("Archive this published newsletter? Alumni will no longer see it in the archive.")) return;
        try {
            await SAA_API.request(`/api/newsletters/${newsletterId}/archive`, { method: "POST" });
            await SAA_API.refreshAllData();
            renderNewsletterArchive();
            showToast("Newsletter archived.", "success");
        } catch (err) {
            showToast(err.message || "Unable to archive newsletter.", "error");
        }
    }

    function showNewsletterDeliveryReport(newsletterId) {
        const item = (newslettersList || []).find((newsletter) => Number(newsletter.id) === Number(newsletterId));
        if (!item) return;
        showToast(`Audience: ${item.inAppDelivered} in-app · ${item.emailSent} emails accepted · ${item.smsSent} SMS accepted · ${item.deliveryFailed || 0} failures.`, "info");
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

    /**
     * AI Generate for the SMS Composer (OpenAI API via /api/ai/compose-announcement).
     * Drafts an SMS-length message; staff still reviews/edits before sending.
     */
    async function aiComposeSms() {
        const topicInput = document.getElementById("smsAiTopic");
        const messageInput = document.getElementById("smsMessage");
        const btn = document.getElementById("smsAiComposeBtn");
        if (!messageInput) return;

        const topic = (topicInput?.value || "").trim() || "Alumni Update";

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="fa-solid fa-spinner fa-spin"></span> <span>Drafting...</span>';
        }

        try {
            let content = null;

            if (typeof SAA_API !== "undefined" && (await SAA_API.health())) {
                const data = await SAA_API.request("/api/ai/compose-announcement", {
                    method: "POST",
                    body: JSON.stringify({ topic, channel: "SMS" })
                });
                if (data && data.content) content = data.content;
            }

            if (content === null) {
                // Local fallback template kept within SMS length constraints.
                content = `St. Agnes Academy: ${topic}. For details, check the Alumni Portal.`;
            }

            messageInput.value = content.slice(0, 160);
            if (typeof updateSmsCharacterCount === "function") updateSmsCharacterCount();
            showToast("AI-drafted SMS is ready. Review before sending.", "success");
        } catch (err) {
            showToast("AI compose failed: " + (err.message || "unknown error"), "error");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles text-amber-500 mr-1"></i> Generate Message';
            }
        }
    }

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 5212-5227 */
/* ------------------------------------------------------------------------- */
