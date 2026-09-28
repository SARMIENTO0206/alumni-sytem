/* resume - Resume Management, Job Applications */
/* Split from engagement.js lines 1562-1666 */

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

