// --- CONFIGURATION ---
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzNWG5QOqG72Hroid3BZ3yQGSp4lVw-yhYlXwy5P_B7vDvFUlTUFZchQc6rh84hwrU/exec';
let currentPass = '';
let allTenants = [];
let lineChart, doughnutChart;

// --- UI UTILITIES ---
function showToast(msg, type = "info") {
    const t = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    const txt = document.getElementById('toastMsg');
    
    txt.innerText = msg;
    
    if (type === "success") { t.className = "fixed top-6 right-6 z-[300] px-6 py-4 rounded-2xl text-sm font-black text-white shadow-2xl transition-all transform flex items-center gap-3 border border-emerald-500/30 bg-emerald-600"; icon.className = "fas fa-check-circle text-lg"; }
    else if (type === "error") { t.className = "fixed top-6 right-6 z-[300] px-6 py-4 rounded-2xl text-sm font-black text-white shadow-2xl transition-all transform flex items-center gap-3 border border-red-500/30 bg-red-600"; icon.className = "fas fa-exclamation-triangle text-lg"; }
    else if (type === "warning") { t.className = "fixed top-6 right-6 z-[300] px-6 py-4 rounded-2xl text-sm font-black text-white shadow-2xl transition-all transform flex items-center gap-3 border border-orange-500/30 bg-orange-500"; icon.className = "fas fa-circle-notch fa-spin text-lg"; }
    
    // Animate in
    setTimeout(() => { t.classList.remove('translate-x-full', 'opacity-0'); }, 10);
    
    // Auto hide
    setTimeout(() => {
        t.classList.add('translate-x-full', 'opacity-0');
    }, 4000);
}

// --- AUTHENTICATION ---
async function login() {
    const pass = document.getElementById('masterPassInput').value;
    if(!pass) return;
    
    const btn = document.getElementById('loginBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<div class="loader"></div> <span class="ml-2">Verifying...</span>`;
    btn.disabled = true;

    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getSuperAdminData&password=${encodeURIComponent(pass)}`);
        const data = await response.json();

        if(data.status === "success") {
            currentPass = pass;
            document.getElementById('loginScreen').classList.add('hidden', 'opacity-0');
            document.getElementById('dashboardScreen').classList.remove('hidden');
            document.getElementById('dashboardScreen').classList.add('animate-fade-in');
            
            allTenants = data.tenants;
            renderDashboard(data);
            initCharts(data);
            showToast("Secure connection established.", "success");
        } else {
            document.getElementById('loginError').classList.remove('hidden');
        }
    } catch (e) {
        showToast("Failed to reach server. Check connection.", "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function logout() {
    currentPass = '';
    document.getElementById('masterPassInput').value = '';
    document.getElementById('dashboardScreen').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden', 'opacity-0');
    showToast("Terminal Locked.", "info");
}

// --- DATA FETCHING & RENDERING ---
async function fetchData() {
    const icon = document.getElementById('refreshIcon');
    if(icon) icon.classList.add('fa-spin');
    showToast("Syncing network telemetry...", "warning");
    
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getSuperAdminData&password=${encodeURIComponent(currentPass)}`);
        const data = await response.json();
        if(data.status === "success") {
            allTenants = data.tenants;
            renderDashboard(data);
            updateCharts(data);
            showToast("Telemetry sync complete.", "success");
        }
    } catch (e) { 
        showToast("Sync failed.", "error"); 
    } finally {
        if(icon) icon.classList.remove('fa-spin');
    }
}

function renderDashboard(data) {
    // Metrics
    document.getElementById('statTotal').innerText = data.stats.total;
    document.getElementById('statActive').innerText = data.stats.active;
    document.getElementById('statSuspended').innerText = data.stats.suspended;
    
    // Simulate MRR (Monthly Recurring Revenue) based on $20/month per active ISP
    const mrr = data.stats.active * 20; 
    document.getElementById('statMRR').innerText = `$${mrr}`;

    renderTable(allTenants);
}

function renderTable(tenantsData) {
    const tbody = document.getElementById('tenantTableBody');
    if(tenantsData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-12 text-slate-500 italic">No network nodes detected.</td></tr>`;
        return;
    }

    tbody.innerHTML = tenantsData.map(t => {
        const isActive = t.status === "Active";
        
        // Status Badge
        const statusBadge = isActive 
            ? `<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded text-[10px] uppercase tracking-widest font-bold"><i class="fas fa-circle text-[8px] mr-1"></i> Active</span>`
            : `<span class="bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-1 rounded text-[10px] uppercase tracking-widest font-bold"><i class="fas fa-lock text-[8px] mr-1"></i> Suspended</span>`;
        
        // Simulated Router Health (Randomized based on ID for visual effect)
        const isHealthy = isActive && (t.id.charCodeAt(t.id.length-1) % 5 !== 0); // 80% healthy if active
        let healthHtml = '';
        if (!isActive) {
            healthHtml = `<span class="text-slate-500 text-xs"><i class="fas fa-unlink mr-1"></i> Offline</span>`;
        } else if (isHealthy) {
            const ping = Math.floor(Math.random() * 30) + 10;
            healthHtml = `<span class="text-emerald-400 text-xs"><i class="fas fa-wifi mr-1 animate-pulse"></i> Online (${ping}ms)</span>`;
        } else {
            healthHtml = `<span class="text-orange-400 text-xs"><i class="fas fa-exclamation-triangle mr-1"></i> Warning (High Latency)</span>`;
        }

        // Action Buttons
        const portalUrl = `portal.html?tenant=${t.id}`;
        
        let actionBtn = '';
        if(isActive) {
            actionBtn = `
                <button onclick="openConfirmModal('${t.id}', '${t.name}', 'Suspended')" class="text-slate-400 hover:text-red-400 hover:bg-red-500/10 p-2 rounded transition" title="Suspend Account"><i class="fas fa-ban"></i></button>
            `;
        } else {
            actionBtn = `
                <button onclick="openConfirmModal('${t.id}', '${t.name}', 'Active')" class="text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 p-2 rounded transition" title="Reactivate Account"><i class="fas fa-unlock"></i></button>
            `;
        }

        return `
        <tr class="border-b border-slate-800 hover:bg-slate-800/30 transition group">
            <td class="p-4 font-mono text-slate-400 font-bold text-xs"><i class="fas fa-microchip mr-2 text-slate-600"></i>${t.id}</td>
            <td class="p-4">
                <p class="font-bold text-white">${t.name}</p>
                <p class="text-[10px] text-blue-400 mt-0.5">${t.subdomain}.veltrix.com</p>
            </td>
            <td class="p-4 font-mono">${healthHtml}</td>
            <td class="p-4">${statusBadge}</td>
            <td class="p-4 text-right space-x-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                <a href="${portalUrl}" target="_blank" class="inline-block text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 p-2 rounded transition" title="Remote Portal Access"><i class="fas fa-external-link-alt"></i></a>
                ${actionBtn}
            </td>
        </tr>`;
    }).join('');
}

function filterTable() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const filtered = allTenants.filter(t => 
        t.name.toLowerCase().includes(query) || 
        t.subdomain.toLowerCase().includes(query) || 
        t.id.toLowerCase().includes(query)
    );
    renderTable(filtered);
}

// --- CHARTS LOGIC ---
function initCharts(data) {
    Chart.defaults.color = '#64748b';
    Chart.defaults.font.family = "'Inter', sans-serif";

    // 1. Growth Line Chart (Simulated historical data ending at current total)
    const ctxGrowth = document.getElementById('growthChart').getContext('2d');
    
    // Create Gradient
    let gradient = ctxGrowth.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(56, 189, 248, 0.5)');   
    gradient.addColorStop(1, 'rgba(56, 189, 248, 0)');

    // Simulate last 6 months growth ending in current active count
    const currentTotal = data.stats.total;
    const historyData = [
        Math.max(1, Math.floor(currentTotal * 0.2)),
        Math.max(2, Math.floor(currentTotal * 0.4)),
        Math.max(3, Math.floor(currentTotal * 0.55)),
        Math.max(4, Math.floor(currentTotal * 0.7)),
        Math.max(5, Math.floor(currentTotal * 0.85)),
        currentTotal
    ];

    lineChart = new Chart(ctxGrowth, {
        type: 'line',
        data: {
            labels: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
            datasets: [{
                label: 'Total Platform Nodes',
                data: historyData,
                borderColor: '#38bdf8',
                backgroundColor: gradient,
                borderWidth: 3,
                pointBackgroundColor: '#0f172a',
                pointBorderColor: '#38bdf8',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4 // Smooth curves
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.05)' }, border: { dash: [4, 4] } },
                x: { grid: { display: false } }
            },
            interaction: { intersect: false, mode: 'index' },
        }
    });

    // 2. Status Doughnut Chart
    const ctxStatus = document.getElementById('statusChart').getContext('2d');
    doughnutChart = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: ['Active', 'Suspended'],
            datasets: [{
                data: [data.stats.active, data.stats.suspended],
                backgroundColor: ['#10b981', '#ef4444'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: { legend: { display: false } }
        }
    });
}

function updateCharts(data) {
    if(doughnutChart) {
        doughnutChart.data.datasets[0].data = [data.stats.active, data.stats.suspended];
        doughnutChart.update();
    }
    if(lineChart) {
        // Just update the last point to current total for realism
        const len = lineChart.data.datasets[0].data.length;
        lineChart.data.datasets[0].data[len-1] = data.stats.total;
        lineChart.update();
    }
}

// --- KILL SWITCH MODAL LOGIC ---
let actionTenantId = null;
let actionNewStatus = null;

function openConfirmModal(id, name, status) {
    actionTenantId = id;
    actionNewStatus = status;
    
    const modal = document.getElementById('confirmModal');
    const content = document.getElementById('confirmModalContent');
    const icon = document.getElementById('modalIcon');
    const title = document.getElementById('modalTitle');
    const desc = document.getElementById('modalDesc');
    const btn = document.getElementById('modalConfirmBtn');

    if (status === 'Suspended') {
        icon.className = "w-16 h-16 rounded-full mx-auto flex items-center justify-center text-3xl mb-4 bg-red-500/20 text-red-500";
        icon.innerHTML = '<i class="fas fa-skull-crossbones"></i>';
        title.innerText = "Initiate Kill Switch";
        title.className = "text-xl font-black mb-2 text-red-400";
        desc.innerHTML = `This will instantly sever API access and portal routing for <br><strong class="text-white">${name} (${id})</strong>.`;
        btn.className = "flex-1 text-white font-black py-3 rounded-xl transition text-sm uppercase tracking-widest shadow-lg bg-red-600 hover:bg-red-500 shadow-red-600/30";
        btn.innerText = "Suspend";
    } else {
        icon.className = "w-16 h-16 rounded-full mx-auto flex items-center justify-center text-3xl mb-4 bg-emerald-500/20 text-emerald-500";
        icon.innerHTML = '<i class="fas fa-unlock"></i>';
        title.innerText = "Restore Access";
        title.className = "text-xl font-black mb-2 text-emerald-400";
        desc.innerHTML = `This will restore full billing functionality for <br><strong class="text-white">${name} (${id})</strong>.`;
        btn.className = "flex-1 text-white font-black py-3 rounded-xl transition text-sm uppercase tracking-widest shadow-lg bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30";
        btn.innerText = "Reactivate";
    }

    modal.classList.remove('hidden');
    setTimeout(() => { content.classList.remove('scale-95'); content.classList.add('scale-100'); }, 10);
}

function closeModal() {
    const modal = document.getElementById('confirmModal');
    const content = document.getElementById('confirmModalContent');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); }, 150);
    actionTenantId = null;
    actionNewStatus = null;
}

async function executeToggle() {
    if(!actionTenantId || !actionNewStatus) return;
    
    const btn = document.getElementById('modalConfirmBtn');
    const originalText = btn.innerText;
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i>`;
    btn.disabled = true;
    
    showToast(`Overriding tenant protocols...`, "warning");
    
    try {
        const res = await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({ action: "toggleTenantStatus", tenantId: actionTenantId, status: actionNewStatus, password: currentPass })
        });
        const result = await res.json();
        
        if(result.status === "success") {
            showToast(`Protocol successful. ${actionTenantId} is ${actionNewStatus}.`, "success");
            closeModal();
            fetchData(); // Refresh table and charts
        } else {
            showToast(result.message || "Action Failed", "error");
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    } catch (e) { 
        showToast("Network Error during execution.", "error"); 
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// --- EVENT LISTENERS ---

// Attach event listener to the form for login
document.getElementById('loginForm')?.addEventListener('submit', function(e) {
    e.preventDefault();
    login();
});

// Attach event listener for the logout button
document.getElementById('logoutBtn')?.addEventListener('click', logout);

// Attach event listener for the refresh button
document.getElementById('refreshBtn')?.addEventListener('click', fetchData);

// Attach event listeners for the modal buttons
document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
document.getElementById('modalConfirmBtn')?.addEventListener('click', executeToggle);