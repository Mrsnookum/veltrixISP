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
    
    // Note: statMRR was safely removed to prevent the null crash!

    try {
        renderTable(allTenants);
    } catch(err) {
        console.error("Table render failed:", err);
    }
}

function renderTable(tenantsData) {
    const tbody = document.getElementById('tenantTableBody');
    if(!tbody) return;

    // Safely filter out blank rows
    const validTenants = tenantsData.filter(t => t && t.id && String(t.id).trim() !== '');

    if(validTenants.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-12 text-slate-500 italic">No network nodes detected.</td></tr>`;
        return;
    }

    let htmlContent = '';

    validTenants.forEach(t => {
        const isActive = t.status === "Active";
        
        const safeId = String(t.id || '');
        const safeName = String(t.name || 'Unknown ISP').replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const safeSubdomain = String(t.subdomain || '');
        
        // Status Badge
        const statusBadge = isActive 
            ? `<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded text-[10px] uppercase tracking-widest font-bold"><i class="fas fa-circle text-[8px] mr-1"></i> Active</span>`
            : `<span class="bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-1 rounded text-[10px] uppercase tracking-widest font-bold"><i class="fas fa-lock text-[8px] mr-1"></i> Suspended</span>`;
        
        // Billing Info
        let billDateStr = t.nextBilling || "Not Set";
        let isPastDue = false;
        if(billDateStr && billDateStr !== "Not Set") {
            const billDate = new Date(billDateStr);
            if(billDate < new Date() && isActive) isPastDue = true;
        }
        
        const billHtml = `<div class="flex items-center gap-2">
            <span class="font-mono text-xs ${isPastDue ? 'text-red-400 font-bold' : 'text-slate-300'}">${billDateStr}</span>
            <button onclick="openBillingModal('${safeId}', '${safeName}')" class="text-slate-500 hover:text-purple-400 p-1 transition" title="Log Payment & Update Date"><i class="fas fa-edit text-xs"></i></button>
        </div>`;

        // Safe router health simulation
        const isHealthy = isActive && (safeId.charCodeAt(Math.max(0, safeId.length-1)) % 5 !== 0); 
        let healthHtml = '';
        if (!isActive) {
            healthHtml = `<span class="text-slate-500 text-[10px]"><i class="fas fa-unlink mr-1"></i> Offline</span>`;
        } else if (isHealthy) {
            const ping = Math.floor(Math.random() * 30) + 10;
            healthHtml = `<span class="text-emerald-400 text-[10px]"><i class="fas fa-wifi mr-1 animate-pulse"></i> Online (${ping}ms)</span>`;
        } else {
            healthHtml = `<span class="text-orange-400 text-[10px]"><i class="fas fa-exclamation-triangle mr-1"></i> Warning Latency</span>`;
        }

        const portalUrl = `portal.html?tenant=${safeId}`;
        const adminUrl = `admin.html?tenant=${safeSubdomain}&autoAuth=true&masterToken=${encodeURIComponent(currentPass)}`;
        
        let actionBtn = '';
        if(isActive) {
            actionBtn = `<button onclick="openConfirmModal('${safeId}', '${safeName}', 'Suspended')" class="text-slate-400 hover:text-red-400 hover:bg-red-500/10 p-2 rounded transition" title="Suspend Account"><i class="fas fa-ban"></i></button>`;
        } else {
            actionBtn = `<button onclick="openConfirmModal('${safeId}', '${safeName}', 'Active')" class="text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 p-2 rounded transition" title="Reactivate Account"><i class="fas fa-unlock"></i></button>`;
        }

        htmlContent += `
        <tr class="border-b border-slate-800 hover:bg-slate-800/30 transition group">
            <td class="p-4 font-mono text-slate-400 font-bold text-xs"><i class="fas fa-microchip mr-2 text-slate-600"></i>${safeId}</td>
            <td class="p-4">
                <p class="font-bold text-white">${t.name}</p>
                <div class="flex items-center gap-3 mt-0.5">
                    <span class="text-[10px] text-blue-400">${safeSubdomain}.veltrix.com</span>
                    ${healthHtml}
                </div>
            </td>
            <td class="p-4">${billHtml}</td>
            <td class="p-4">${statusBadge}</td>
            <td class="p-4 text-right space-x-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                <a href="${portalUrl}" target="_blank" class="inline-block text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 p-2 rounded transition" title="Remote Portal Access"><i class="fas fa-external-link-alt"></i></a>
                <button onclick="impersonate('${adminUrl}')" class="inline-block text-slate-400 hover:text-purple-400 hover:bg-purple-500/10 p-2 rounded transition" title="Ghost Login (Impersonate Admin)"><i class="fas fa-user-secret"></i></button>
                ${actionBtn}
            </td>
        </tr>`;
    });

    tbody.innerHTML = htmlContent;
}

function filterTable() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const filtered = allTenants.filter(t => 
        (t.name || '').toLowerCase().includes(query) || 
        (t.subdomain || '').toLowerCase().includes(query) || 
        String(t.id || '').toLowerCase().includes(query)
    );
    renderTable(filtered);
}

// --- CHARTS LOGIC ---
function initCharts(data) {
    try {
        if (typeof Chart === 'undefined') {
            console.warn("Chart.js failed to load. Browser tracking prevention may be active.");
            return;
        }

        Chart.defaults.color = '#64748b';
        Chart.defaults.font.family = "'Inter', sans-serif";

        // 1. Growth Line Chart
        const ctxGrowth = document.getElementById('growthChart').getContext('2d');
        let gradient = ctxGrowth.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(56, 189, 248, 0.5)');   
        gradient.addColorStop(1, 'rgba(56, 189, 248, 0)');

        const currentTotal = data.stats.total;
        const historyData = [ Math.max(1, Math.floor(currentTotal * 0.2)), Math.max(2, Math.floor(currentTotal * 0.4)), Math.max(3, Math.floor(currentTotal * 0.55)), Math.max(4, Math.floor(currentTotal * 0.7)), Math.max(5, Math.floor(currentTotal * 0.85)), currentTotal ];

        lineChart = new Chart(ctxGrowth, {
            type: 'line',
            data: { labels: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'], datasets: [{ label: 'Total Platform Nodes', data: historyData, borderColor: '#38bdf8', backgroundColor: gradient, borderWidth: 3, pointBackgroundColor: '#0f172a', pointBorderColor: '#38bdf8', pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6, fill: true, tension: 0.4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.05)' }, border: { dash: [4, 4] } }, x: { grid: { display: false } } }, interaction: { intersect: false, mode: 'index' } }
        });

        // 2. Status Doughnut Chart
        const ctxStatus = document.getElementById('statusChart').getContext('2d');
        doughnutChart = new Chart(ctxStatus, {
            type: 'doughnut',
            data: { labels: ['Active', 'Suspended'], datasets: [{ data: [data.stats.active, data.stats.suspended], backgroundColor: ['#10b981', '#ef4444'], borderWidth: 0, hoverOffset: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } }
        });
    } catch(err) {
        console.error("Chart initialization skipped.", err);
    }
}

function updateCharts(data) {
    if(doughnutChart) { doughnutChart.data.datasets[0].data = [data.stats.active, data.stats.suspended]; doughnutChart.update(); }
    if(lineChart) { const len = lineChart.data.datasets[0].data.length; lineChart.data.datasets[0].data[len-1] = data.stats.total; lineChart.update(); }
}

// --- KILL SWITCH MODAL LOGIC ---
let actionTenantId = null; let actionNewStatus = null;

function openConfirmModal(id, name, status) {
    actionTenantId = id; actionNewStatus = status;
    const modal = document.getElementById('confirmModal');
    const content = document.getElementById('confirmModalContent');
    const icon = document.getElementById('modalIcon');
    const title = document.getElementById('modalTitle');
    const desc = document.getElementById('modalDesc');
    const btn = document.getElementById('modalConfirmBtn');

    if (status === 'Suspended') {
        icon.className = "w-16 h-16 rounded-full mx-auto flex items-center justify-center text-3xl mb-4 bg-red-500/20 text-red-500"; icon.innerHTML = '<i class="fas fa-skull-crossbones"></i>';
        title.innerText = "Initiate Kill Switch"; title.className = "text-xl font-black mb-2 text-red-400";
        desc.innerHTML = `This will instantly sever API access and portal routing for <br><strong class="text-white">${name} (${id})</strong>.`;
        btn.className = "flex-1 text-white font-black py-3 rounded-xl transition text-sm uppercase tracking-widest shadow-lg bg-red-600 hover:bg-red-500 shadow-red-600/30"; btn.innerText = "Suspend";
    } else {
        icon.className = "w-16 h-16 rounded-full mx-auto flex items-center justify-center text-3xl mb-4 bg-emerald-500/20 text-emerald-500"; icon.innerHTML = '<i class="fas fa-unlock"></i>';
        title.innerText = "Restore Access"; title.className = "text-xl font-black mb-2 text-emerald-400";
        desc.innerHTML = `This will restore full billing functionality for <br><strong class="text-white">${name} (${id})</strong>.`;
        btn.className = "flex-1 text-white font-black py-3 rounded-xl transition text-sm uppercase tracking-widest shadow-lg bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30"; btn.innerText = "Reactivate";
    }

    modal.classList.remove('hidden');
    setTimeout(() => { content.classList.replace('scale-95', 'scale-100'); }, 10);
}

function closeModal() {
    const modal = document.getElementById('confirmModal');
    const content = document.getElementById('confirmModalContent');
    content.classList.replace('scale-100', 'scale-95');
    setTimeout(() => { modal.classList.add('hidden'); }, 150);
    actionTenantId = null; actionNewStatus = null;
}

async function executeToggle() {
    if(!actionTenantId || !actionNewStatus) return;
    const btn = document.getElementById('modalConfirmBtn');
    const originalText = btn.innerText;
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i>`; btn.disabled = true;
    showToast(`Overriding tenant protocols...`, "warning");
    
    try {
        const res = await fetch(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "toggleTenantStatus", tenantId: actionTenantId, status: actionNewStatus, password: currentPass }) });
        const result = await res.json();
        if(result.status === "success") { showToast(result.message, "success"); closeModal(); fetchData(); } else { showToast(result.message || "Action Failed", "error"); }
    } catch (e) { showToast("Network Error during execution.", "error"); } finally { btn.innerHTML = originalText; btn.disabled = false; }
}

// --- ADD TENANT LOGIC ---
function openAddTenantModal() { document.getElementById('addTenantModal').classList.remove('hidden'); }
function closeAddTenantModal() { document.getElementById('addTenantModal').classList.add('hidden'); document.getElementById('addTenantForm').reset(); }

document.getElementById('addTenantForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.getElementById('submitTenantBtn');
    const originalText = btn.innerText;
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-2"></i> PROVISIONING...`; btn.disabled = true;
    const payload = { action: "superadminAddTenant", password: currentPass, ispName: document.getElementById('newIspName').value, subdomain: document.getElementById('newIspSubdomain').value.toLowerCase().replace(/[^a-z0-9]/g, ''), adminEmail: document.getElementById('newIspEmail').value, adminPassword: document.getElementById('newIspPassword').value };
    try {
        const res = await fetch(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) });
        const result = await res.json();
        if(result.status === "success") { showToast(`Instance ${payload.subdomain} created successfully!`, "success"); closeAddTenantModal(); fetchData(); } else { showToast(result.message, "error"); }
    } catch (e) { showToast("Network Error", "error"); } finally { btn.innerHTML = originalText; btn.disabled = false; }
});

// --- BILLING LOGIC ---
let billingTenantId = null;
function openBillingModal(id, name) {
    billingTenantId = id; document.getElementById('billingTenantName').innerText = name;
    const d = new Date(); d.setDate(d.getDate() + 30);
    document.getElementById('newBillingDate').value = d.toISOString().split('T')[0];
    document.getElementById('billingModal').classList.remove('hidden');
}
function closeBillingModal() { document.getElementById('billingModal').classList.add('hidden'); billingTenantId = null; }

async function submitBillingUpdate() {
    const dateVal = document.getElementById('newBillingDate').value;
    if(!dateVal || !billingTenantId) return;
    const [year, month, day] = dateVal.split('-'); 
    const formattedDate = `${month}/${day}/${year}`;
    const btn = document.getElementById('submitBillingBtn');
    const originalText = btn.innerText;
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i>`; btn.disabled = true;
    try {
        const res = await fetch(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "superadminUpdateBilling", tenantId: billingTenantId, newDate: formattedDate, password: currentPass }) });
        const result = await res.json();
        if(result.status === "success") { showToast(result.message, "success"); closeBillingModal(); fetchData(); } else { showToast(result.message, "error"); }
    } catch (e) { showToast("Network Error", "error"); } finally { btn.innerHTML = originalText; btn.disabled = false; }
}

// --- 💰 PLATFORM GMV CALCULATION ---
document.getElementById('calcGMVBtn')?.addEventListener('click', async function() {
    const icon = document.getElementById('calcGMVIcon');
    if (icon) icon.classList.add('fa-spin');
    showToast("Scanning network for global revenue...", "warning");
    try {
        const res = await fetch(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "superadminCalculateGMV", password: currentPass }) });
        const result = await res.json();
        if(result.status === "success") { document.getElementById('statGMV').innerText = result.gmv.toLocaleString(); showToast("GMV scan complete.", "success"); } else { showToast("Error calculating GMV", "error"); }
    } catch (e) { showToast("Network Error", "error"); } finally { if (icon) icon.classList.remove('fa-spin'); }
});

// --- 📢 GLOBAL BROADCAST LOGIC ---
function openBroadcastModal() { document.getElementById('broadcastModal').classList.remove('hidden'); }
function closeBroadcastModal() { document.getElementById('broadcastModal').classList.add('hidden'); document.getElementById('broadcastMessage').value = ''; }

document.getElementById('submitBroadcastBtn')?.addEventListener('click', async function() {
    const msg = document.getElementById('broadcastMessage').value;
    if(!msg.trim()) { showToast("Message cannot be empty", "error"); return; }
    const btn = document.getElementById('submitBroadcastBtn');
    const originalText = btn.innerText;
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-2"></i> Transmitting...`; btn.disabled = true;
    try {
        const res = await fetch(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "superadminBroadcast", message: msg, password: currentPass }) });
        const result = await res.json();
        if(result.status === "success") { showToast("Broadcast transmitted successfully!", "success"); closeBroadcastModal(); } else { showToast(result.message, "error"); }
    } catch (e) { showToast("Network Error", "error"); } finally { btn.innerHTML = originalText; btn.disabled = false; }
});

// --- 👻 GHOST LOGIN (IMPERSONATE) ---
function impersonate(url) {
    showToast("Ghosting into Tenant Dashboard...", "info");
    window.open(url, '_blank');
}

// --- EVENT LISTENERS ---
document.getElementById('loginForm')?.addEventListener('submit', function(e) { e.preventDefault(); login(); });
document.getElementById('logoutBtn')?.addEventListener('click', logout);
document.getElementById('refreshBtn')?.addEventListener('click', fetchData);

document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
document.getElementById('modalConfirmBtn')?.addEventListener('click', executeToggle);

document.getElementById('addTenantBtn')?.addEventListener('click', openAddTenantModal);
document.getElementById('mobileAddBtn')?.addEventListener('click', openAddTenantModal);
document.getElementById('closeAddTenantBtn')?.addEventListener('click', closeAddTenantModal);

document.getElementById('closeBillingModalBtn')?.addEventListener('click', closeBillingModal);
document.getElementById('submitBillingBtn')?.addEventListener('click', submitBillingUpdate);

document.getElementById('openBroadcastBtn')?.addEventListener('click', openBroadcastModal);
document.getElementById('closeBroadcastBtn')?.addEventListener('click', closeBroadcastModal);

document.getElementById('searchInput')?.addEventListener('keyup', filterTable);
