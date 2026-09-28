/* chat - AI Chatbot Support + Dashboard Upcoming Events */
/* Split from engagement.js lines 2489-2816 */

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
            document.getElementById("newJobStatus").value = job.status || "Published";
            document.getElementById("newJobNotifyInApp").checked = Number(job.notify_in_app ?? 1) === 1;
            document.getElementById("newJobNotifyEmail").checked = Number(job.notify_email || 0) === 1;
        }
        updateJobApplicationInput();
        document.getElementById("addJobOpportunityModal").classList.add("active");
    }

    function updateJobApplicationInput() {
        const method = document.getElementById("newJobApplicationMethod")?.value || "";
        const details = document.getElementById("newJobApplicationDetails");
        if (!details) return;
        details.required = method !== "" && method !== "Portal";
        details.type = method === "Email" ? "email" : "text";
        details.placeholder = method === "Link" ? "https://example.com/apply"
            : method === "Email" ? "careers@example.com"
                : method === "Contact Information" ? "Phone number or contact instructions"
                    : "Application details";
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

    async function deleteJobOpportunity(jobId) {
        const job = jobsList.find((item) => Number(item.id) === Number(jobId));
        if (!job || !isAdminRole()) return;
        if (!window.confirm(`Permanently delete "${job.title}"? This cannot be undone.`)) return;
        try {
            await SAA_API.request(`/api/jobs/${jobId}`, { method: "DELETE" });
            await SAA_API.refreshAllData();
            renderJobsGrid();
            showToast("Job opportunity deleted.", "success");
        } catch (err) {
            showToast(err.message || "Unable to delete job opportunity.", "error");
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
            status: document.getElementById("newJobStatus").value,
            notify_in_app: document.getElementById("newJobNotifyInApp").checked,
            notify_email: document.getElementById("newJobNotifyEmail").checked
        };
        try {
            const saved = await SAA_API.request(id ? `/api/jobs/${id}` : "/api/jobs", {
                method: id ? "PUT" : "POST",
                body: JSON.stringify(payload)
            });
            await SAA_API.refreshAllData();
            renderJobsGrid();
            closeAddJobOpportunityModal();
            event.target.reset();
            editingJobOpportunityId = 0;
            const deliveryFailed = (saved.notificationResult || []).some((item) =>
                item.status === "not_configured" || item.status === "failed" || item.email_status === "not_configured" || item.email_status === "failed" || item.email_status === "skipped"
            );
            const notificationMessage = saved.notificationError
                ? ` The job was saved, but notifications failed: ${saved.notificationError}`
                : saved.notificationRequested && deliveryFailed
                    ? " The job was saved, but one or more notifications could not be delivered."
                : "";
            showToast((id ? "Job opportunity updated." : "Job opportunity saved.") + notificationMessage, notificationMessage ? "warning" : "success");
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
