/* donations - Donor Campaigns, Payments, Receipts */
/* Split from engagement.js lines 824-1561 */

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
        const statusFilter = document.getElementById("donationStatusFilter");
        if (search) search.oninput = renderDonationRecords;
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
