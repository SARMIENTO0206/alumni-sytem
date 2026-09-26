/* config.js - Global application state. Module lists start empty and are filled from the API. */

    /* Kept only as a mutable profile cache. Login uses server-side bcrypt accounts. */
    let accounts = {};

    let alumniList = [];
    let transcriptRequests = [];
    let eventsList = [];
    let reprintRequests = [];
    let reunionsList = [];
    let donationsList = [];
    let newslettersList = [];
    let feedbackList = [];
    let jobsList = [];
    let announcementsList = [];
    let notificationsList = [];
    let applicationsList = [];
    let lastVerifiedPayment = null;

    let currentUser = null;
    let currentSortDirection = true;
    let growthChartInstance = null;
    let empChartInstance = null;
    let indChartInstance = null;
    let pathwayChartInstance = null;

    function updateLocalStorage() {
        /* Records are stored in the database via the API. Do not persist demo copies. */
    }
