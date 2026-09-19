/* utils.js - Shared UI helpers: toasts, storage sync, DOM formatters. */

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 3088-3116 */
/* ------------------------------------------------------------------------- */

    /* Toast Notification System */
    function showToast(message, type = "info") {
        const container = document.getElementById("toastContainer");
        if (!container) return;

        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;

        const iconClass = type === "success" ? "fa-circle-check text-emerald-500" :
                          type === "error" ? "fa-circle-xmark text-rose-500" :
                          type === "warning" ? "fa-triangle-exclamation text-amber-500" :
                          "fa-circle-info text-blue-500";

        toast.innerHTML = `
            <i class="fa-solid ${iconClass} text-lg"></i>
            <div class="text-xs font-semibold text-slate-700 flex-grow">${message}</div>
            <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-slate-600 text-xs">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add("hide");
            setTimeout(() => toast.remove(), 250);
        }, 3500);
    }
