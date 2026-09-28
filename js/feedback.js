/* feedback - Surveys and Feedback Module */
/* Split from engagement.js lines 2082-2488 */

    let feedbackResponses = [];
    let selectedFeedbackResponseId = null;

    function feedbackStatusBadgeClass(status) {
        if (status === "Resolved") return "status-approved";
        if (status === "Under Review") return "status-freelance";
        return "status-pending";
    }

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
            cell.colSpan = 6;
            cell.className = "py-8 text-center text-slate-400";
            cell.textContent = "No survey responses match these filters.";
            return;
        }

        rows.forEach((response) => {
            const row = body.insertRow();
            const date = row.insertCell();
            date.className = "py-3 pr-4 text-slate-500 whitespace-nowrap";
            date.textContent = response.createdAt ? new Date(response.createdAt).toLocaleDateString() : "—";

            const name = row.insertCell();
            name.className = "py-3 pr-4 font-semibold text-slate-700";
            name.textContent = response.name || "Alumni";
            if (response.contactRequested && response.status !== "Resolved") {
                const flag = document.createElement("i");
                flag.className = "fa-solid fa-triangle-exclamation text-amber-500 ml-1.5";
                flag.title = "Alumni requested a response";
                name.appendChild(flag);
            }

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
            badge.className = `status-badge ${feedbackStatusBadgeClass(responseStatus)}`;
            badge.textContent = responseStatus;
            statusCell.appendChild(badge);

            const action = row.insertCell();
            action.className = "py-3";
            const button = document.createElement("button");
            button.type = "button";
            button.className = "text-xs font-bold text-brand-magenta hover:underline";
            button.textContent = "View";
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
            ["Submitted By", response.isAnonymous ? "Anonymous" : (response.name || "Alumni")],
            ["Educational Level", response.isAnonymous ? "—" : educationLevel],
            ["Batch", response.isAnonymous ? "—" : (response.batch || "—")],
            ["Category", response.category || "Other"],
            ["Overall Satisfaction", `${"★".repeat(Math.max(0, Math.min(5, Number(response.rating) || 0)))} ${Number(response.rating) || 0}/5`],
            ["Recommendation Score", Number(response.recommendationRating) > 0 || response.recommendationRating === 0
                ? `${response.recommendationRating}/10`
                : "Not provided"],
            ["Suggestions for Improvement", response.improvement || "—"],
            ["Additional Comments", response.message || "—"],
            ["Requested Contact", response.contactRequested ? "Yes" : "No"],
            ["Reference No.", response.referenceNo || "—"],
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
        const banner = document.getElementById("feedbackContactBanner");
        if (status) status.value = response.status || "New";
        if (note) note.value = response.internalNote || "";
        if (banner) banner.classList.toggle("hidden", !(response.contactRequested && response.status !== "Resolved"));
        panel.classList.remove("hidden");
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function closeFeedbackDetails() {
        document.getElementById("feedbackDetailPanel")?.classList.add("hidden");
        selectedFeedbackResponseId = null;
    }

    async function persistFeedbackStatus(status, internalNote) {
        if (!selectedFeedbackResponseId) return;
        try {
            const data = await SAA_API.request(`/api/feedback/${selectedFeedbackResponseId}`, {
                method: "PUT",
                body: JSON.stringify({ status, internalNote })
            });
            feedbackResponses = feedbackResponses.map((item) =>
                String(item.id) === String(selectedFeedbackResponseId)
                    ? Object.assign({}, item, data.feedback)
                    : item
            );
            renderFeedbackStats();
            renderFeedbackResponseRows();
            showFeedbackDetails(selectedFeedbackResponseId);
            showToast("Feedback updated.", "success");
        } catch (err) {
            showToast(err.message || "Unable to save the feedback review.", "error");
        }
    }

    async function saveFeedbackReview(event) {
        event.preventDefault();
        await persistFeedbackStatus(
            document.getElementById("feedbackReviewStatus").value,
            document.getElementById("feedbackInternalNote").value.trim()
        );
    }

    async function markFeedbackResolved() {
        await persistFeedbackStatus("Resolved", document.getElementById("feedbackInternalNote").value.trim());
    }

    function feedbackStatCard(label, value, valueClass) {
        const article = document.createElement("article");
        article.className = "app-card p-5";
        const p1 = document.createElement("p");
        p1.className = "text-[10px] uppercase tracking-wider font-bold text-slate-400";
        p1.textContent = label;
        const p2 = document.createElement("p");
        p2.className = `text-2xl font-extrabold mt-1 ${valueClass || "text-slate-800"}`;
        p2.textContent = value;
        article.append(p1, p2);
        return article;
    }

    function renderFeedbackStats() {
        const grid = document.getElementById("feedbackStatsGrid");
        const analyticsSection = document.getElementById("feedbackAnalyticsSection");
        if (!grid) return;
        const isAdmin = currentUser?.role === "admin";
        grid.replaceChildren();

        if (isAdmin) {
            const total = feedbackResponses.length;
            const avgRating = total
                ? feedbackResponses.reduce((sum, item) => sum + Number(item.rating || 0), 0) / total
                : 0;
            const unresolved = feedbackResponses.filter((item) => item.status !== "Resolved").length;
            grid.append(
                feedbackStatCard("Total Feedback", String(total)),
                feedbackStatCard("Avg. Rating", total ? `${avgRating.toFixed(1)}/5` : "—"),
                feedbackStatCard("Unresolved", String(unresolved), "text-brand-magenta")
            );

            if (analyticsSection) {
                analyticsSection.classList.remove("hidden");
                const satisfactionBars = document.getElementById("feedbackSatisfactionBars");
                if (satisfactionBars) {
                    satisfactionBars.replaceChildren();
                    for (let stars = 5; stars >= 1; stars--) {
                        const count = feedbackResponses.filter((item) => Number(item.rating) === stars).length;
                        const pct = total ? Math.round((count / total) * 100) : 0;
                        const row = document.createElement("div");
                        row.className = "flex items-center gap-2 text-xs";
                        row.innerHTML = `<span class="w-16 shrink-0 font-semibold text-amber-600">${"★".repeat(stars)}</span>
                            <div class="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-brand-magenta rounded-full" style="width:${pct}%"></div></div>
                            <span class="w-10 text-right font-bold text-slate-600">${pct}%</span>`;
                        satisfactionBars.appendChild(row);
                    }
                }
                const categoryBars = document.getElementById("feedbackCategoryBars");
                if (categoryBars) {
                    categoryBars.replaceChildren();
                    const counts = {};
                    feedbackResponses.forEach((item) => {
                        const key = item.category || "Other";
                        counts[key] = (counts[key] || 0) + 1;
                    });
                    const maxCount = Math.max(1, ...Object.values(counts));
                    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([label, count]) => {
                        const pct = Math.round((count / maxCount) * 100);
                        const row = document.createElement("div");
                        row.className = "flex items-center gap-2 text-xs";
                        row.innerHTML = `<span class="w-32 shrink-0 truncate text-slate-600 font-semibold">${label}</span>
                            <div class="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-purple-500 rounded-full" style="width:${pct}%"></div></div>
                            <span class="w-8 text-right font-bold text-slate-600">${count}</span>`;
                        categoryBars.appendChild(row);
                    });
                    if (!Object.keys(counts).length) {
                        categoryBars.innerHTML = '<p class="text-xs text-slate-400 text-center py-2">No feedback yet.</p>';
                    }
                }
            }
        } else {
            if (analyticsSection) analyticsSection.classList.add("hidden");
            const countByStatus = (status) => feedbackResponses.filter((item) => (item.status || "New") === status).length;
            grid.append(
                feedbackStatCard("Total", String(feedbackResponses.length)),
                feedbackStatCard("New", String(countByStatus("New"))),
                feedbackStatCard("Under Review", String(countByStatus("Under Review")), "text-blue-600"),
                feedbackStatCard("Resolved", String(countByStatus("Resolved")), "text-emerald-600")
            );
        }
    }

    function renderMyFeedbackHistory() {
        const section = document.getElementById("myFeedbackHistorySection");
        const list = document.getElementById("myFeedbackHistoryList");
        if (!section || !list) return;
        section.classList.remove("hidden");
        list.replaceChildren();
        if (!feedbackResponses.length) {
            list.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">No feedback submitted yet.</p>';
            return;
        }
        [...feedbackResponses].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).forEach((item) => {
            const card = document.createElement("div");
            card.className = "flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-slate-200/80 bg-slate-50";
            const badgeClass = feedbackStatusBadgeClass(item.status || "New");
            card.innerHTML = `<div>
                    <p class="text-xs font-bold text-slate-700">${item.category || "Other"}</p>
                    <p class="text-[11px] text-slate-400">${item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "—"} • ${"★".repeat(Math.max(0, Math.min(5, Number(item.rating) || 0)))} • Ref: ${item.referenceNo || "—"}</p>
                </div>
                <span class="status-badge ${badgeClass}">${item.status || "New"}</span>`;
            list.appendChild(card);
        });
    }

    async function renderFeedbackPage() {
        const isAlumni = currentUser?.role === "alumni";
        const isAdmin = currentUser?.role === "admin";
        const formPanel = document.getElementById("alumniSurveyFormPanel");
        const historySection = document.getElementById("myFeedbackHistorySection");
        const reviewPanel = document.getElementById("feedbackReviewPanel");
        const title = document.getElementById("feedbackReviewTitle");
        const description = document.getElementById("feedbackReviewDescription");
        if (formPanel) formPanel.classList.toggle("hidden", !isAlumni);
        if (historySection) historySection.classList.toggle("hidden", !isAlumni);
        if (reviewPanel) reviewPanel.classList.toggle("hidden", isAlumni);
        if (!isAlumni && title) title.textContent = isAdmin ? "Feedback & Survey Analytics" : "Feedback Management";
        if (!isAlumni && description) {
            description.textContent = isAdmin
                ? "Oversight of all alumni feedback. Registrar handles day-to-day responses; use this view to monitor trends."
                : "Review and process every alumni feedback submission through New \u2192 Under Review \u2192 Resolved.";
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
            if (isAlumni) {
                renderMyFeedbackHistory();
            } else {
                renderFeedbackStats();
                setFeedbackFilterOptions("feedbackCategoryFilter", feedbackResponses.map((item) => item.category), "All Categories");
                setFeedbackFilterOptions("feedbackBatchFilter", feedbackResponses.map((item) => item.batch), "All Batches");
                renderFeedbackResponseRows();
            }
        } catch (err) {
            showToast(err.message || "Unable to load survey responses.", "error");
        }
    }

    function handleFeedbackContactMeToggle() {
        const contactMe = document.getElementById("surveyContactMe");
        const anonymous = document.getElementById("surveyAnonymous");
        const hint = document.getElementById("surveyAnonymousHint");
        if (!contactMe || !anonymous) return;
        if (contactMe.checked) {
            anonymous.checked = false;
            anonymous.disabled = true;
            if (hint) hint.classList.remove("hidden");
        } else {
            anonymous.disabled = false;
            if (hint) hint.classList.add("hidden");
        }
    }

    function handleFeedbackAnonymousToggle() {
        const contactMe = document.getElementById("surveyContactMe");
        const anonymous = document.getElementById("surveyAnonymous");
        if (!contactMe || !anonymous) return;
        if (anonymous.checked && contactMe.checked) {
            contactMe.checked = false;
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
        const isAnonymous = document.getElementById("surveyAnonymous").checked;
        try {
            const data = await SAA_API.request("/api/feedback", {
                method: "POST",
                body: JSON.stringify({
                    rating: Number(rating),
                    recommendationRating: Number(recommendationRating),
                    category,
                    message,
                    improvement,
                    contactRequested,
                    isAnonymous
                })
            });
            openFeedbackConfirmationModal(data.feedback?.referenceNo);
            event.target.reset();
            document.getElementById("surveyAnonymous").disabled = false;
            renderFeedbackPage();
        } catch (err) {
            showToast(err.message || "Unable to save survey response.", "error");
        }
    }

    function openFeedbackConfirmationModal(referenceNo) {
        const modal = document.getElementById("feedbackConfirmationModal");
        const refEl = document.getElementById("feedbackReferenceNo");
        if (refEl) refEl.textContent = referenceNo || "—";
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
