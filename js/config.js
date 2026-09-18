/* config.js - Global application state, seed data and demo accounts (loaded first). */

/* ------------------------------------------------------------------------- */
/* Source: index.html lines 2990-3087 */
/* ------------------------------------------------------------------------- */
    /* User Accounts - DEMO-ONLY fallback when the API server is offline.
     * NOTE: Primary authentication is handled by the backend (Express + SQLite),
     * where passwords are hashed with bcrypt. These demo credentials are never
     * persisted to localStorage. */
    let accounts = {
        admin: {
            username: "admin",
            password: "admin123",
            role: "admin",
            name: "Administrator",
            title: "System Administrator",
            avatar: "AD",
            studentId: "SAA-ADMIN-01",
            batch: "2015",
            program: "Administration",
            photoUrl: ""
        },
        alumni: {
            username: "alumni",
            password: "alumni123",
            role: "alumni",
            name: "Maria Clara Santos",
            title: "Alumna (Batch 2024)",
            avatar: "MS",
            studentId: "SAA-2024-0089",
            batch: "2024",
            program: "BS Information Technology",
            photoUrl: ""
        },
        registrar: {
            username: "registrar",
            password: "registrar123",
            role: "registrar",
            name: "Registrar Office",
            title: "School Registrar",
            avatar: "RO",
            studentId: "SAA-REG-01",
            batch: "2010",
            program: "Registrar Records",
            photoUrl: ""
        }
    };

    /* Seed Data */
    const defaultAlumni = [
        { id: 1, name: "Maria Clara D. Santos", batch: "2024", program: "BS Information Technology", status: "Employed", company: "TechSolutions Inc.", title: "Software Engineer", contact: "+63 917 123 4567", relevance: "Directly Related", timeToFirst: "< 1 Month", location: "Local", studentId: "SAA-2024-0089", lastUpdated: "2026-08-20" },
        { id: 2, name: "Juan Miguel R. Reyes", batch: "2018", program: "BS Business Administration", status: "Employed", company: "Global Finance Ltd.", title: "Financial Analyst", contact: "+63 918 987 6543", relevance: "Directly Related", timeToFirst: "1-3 Months", location: "Local", studentId: "SAA-2018-0412", lastUpdated: "2025-02-10" },
        { id: 3, name: "Angela K. Mendoza", batch: "2020", program: "BS Computer Science", status: "Employed", company: "Ayala Land Inc.", title: "Data Analyst", contact: "+63 922 456 7890", relevance: "Directly Related", timeToFirst: "< 1 Month", location: "Local", studentId: "SAA-2020-0931", lastUpdated: "2024-11-05" },
        { id: 4, name: "Joseph P. Aquino", batch: "2021", program: "BS Education", status: "Unemployed", company: "", title: "", contact: "+63 919 234 5678", relevance: "Not Related", timeToFirst: "> 1 Year", location: "Local", studentId: "SAA-2021-0155", lastUpdated: "2026-07-30" },
        { id: 5, name: "Isabella C. De Leon", batch: "2015", program: "BS Nursing", status: "Freelance", company: "CarePlus Services", title: "Consultant", contact: "+63 927 345 6789", relevance: "Directly Related", timeToFirst: "3-6 Months", location: "Local", studentId: "SAA-2015-0819", lastUpdated: "2026-08-01" },
        { id: 6, name: "Christian Gabriel Perez", batch: "2023", program: "BS Accountancy", status: "Employed", company: "KPMG Philippines", title: "Junior Auditor", contact: "+63 939 456 7891", relevance: "Directly Related", timeToFirst: "< 1 Month", location: "Local", studentId: "SAA-2023-0188", lastUpdated: "2026-08-25" }
    ];

    const defaultTranscriptRequests = [
        { id: 1, name: "Juan Miguel R. Reyes", date: "2024-05-10", purpose: "Employment", status: "Pending" },
        { id: 2, name: "Joseph P. Aquino", date: "2024-05-09", purpose: "Graduate Studies", status: "Approved" },
        { id: 3, name: "Isabella C. De Leon", date: "2024-05-08", purpose: "PRC Board Exam", status: "Rejected" },
        { id: 4, name: "Maria Clara D. Santos", date: "2024-05-14", purpose: "Passport / Visa", status: "Released" }
    ];

    const defaultPlacementLogs = [
        { id: 1, alumni: "Maria Clara D. Santos", company: "TechSolutions Inc.", title: "Software Engineer", date: "2024-05-12" },
        { id: 2, alumni: "Angela K. Mendoza", company: "FinanceHub Global", title: "Data Analyst", date: "2024-05-11" },
        { id: 3, alumni: "Christian Gabriel Perez", company: "KPMG Philippines", title: "Junior Auditor", date: "2024-05-03" }
    ];

    const defaultEventsList = [
        { id: 1, title: "Agnesian Grand Homecoming 2024", date: "June 15, 2024 • 9:00 AM", location: "SAA Main Grounds", rsvps: 58, registered: false },
        { id: 2, title: "Batch 2014 Decennial Reunion", date: "July 20, 2024 • 6:00 PM", location: "SAA Multi-purpose Hall", rsvps: 34, registered: false },
        { id: 3, title: "Alumni Career Leadership Summit", date: "August 10, 2024 • 1:00 PM", location: "SAA Auditorium", rsvps: 22, registered: false }
    ];

    let alumniList = JSON.parse(localStorage.getItem("alumniList")) || defaultAlumni;
    let transcriptRequests = JSON.parse(localStorage.getItem("transcriptRequests")) || defaultTranscriptRequests;
    let placementLogs = JSON.parse(localStorage.getItem("placementLogs")) || defaultPlacementLogs;
    let eventsList = JSON.parse(localStorage.getItem("eventsList")) || defaultEventsList;

    let reprintRequests = [
        { id: 1, name: "Maria Clara D. Santos", type: "Official Diploma Copy", status: "Pending" },
        { id: 2, name: "Angela K. Mendoza", type: "Certificate of Graduation", status: "Approved" }
    ];

    let reunionsList = [
        { id: 1, batch: "Batch 2014 (10th Year)", date: "July 20, 2024", venue: "SAA Multi-purpose Hall", coordinators: "Clarissa Santos (+63 917 123 4567)" },
        { id: 2, batch: "Batch 2019 (5th Year)", date: "October 12, 2024", venue: "Grand Ballroom Manila", coordinators: "Kenji Lopez (+63 920 987 6543)" }
    ];

    let currentUser = null;
    let currentSortDirection = true;
    let growthChartInstance = null;
    let empChartInstance = null;
    let indChartInstance = null;

    /* Local Storage Sync */
    function updateLocalStorage() {
        localStorage.setItem("alumniList", JSON.stringify(alumniList));
        localStorage.setItem("transcriptRequests", JSON.stringify(transcriptRequests));
        localStorage.setItem("placementLogs", JSON.stringify(placementLogs));
        localStorage.setItem("eventsList", JSON.stringify(eventsList));
    }
