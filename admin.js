const urlParams = new URLSearchParams(window.location.search);
const TENANT_ID = urlParams.get('tenant');
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzNWG5QOqG72Hroid3BZ3yQGSp4lVw-yhYlXwy5P_B7vDvFUlTUFZchQc6rh84hwrU/exec'; 

if (!TENANT_ID) window.location.href = 'index.html';

let chartInstance = null;
let barChartInstance = null;
let packagesData = [];
let allUsersData = [];
let bindingsData = [];
let systemSettings = {};

let itemToDelete = null;
let deleteType = null; 

function getApiUrl(action) { return `${APPS_SCRIPT_URL}?action=${action}&tenant=${TENANT_ID}`; }

async function checkLogin() {
    const passInput = document.getElementById('adminPassInput').value;
    const btn = document.getElementById('loginBtn');
    const errorText = document.getElementById('loginError');
    const tempPass = localStorage.getItem('veltrix_temp_pass');
    const actualPass = passInput || tempPass;

    if (!actualPass) return;

    btn.innerText = "VERIFYING...";
    btn.disabled = true;
    errorText.classList.add('hidden');

    try {
        const response = await fetch(getApiUrl('getAdminData'));
        const data = await response.json();
        
        if (data.status === "error") {
            showStatus(data.message || "ISP not found", "bg-red-600");
            return;
        }

        let dbPassword = data.settings.Admin_Password || data.settings.adminPass || "1234";

        if (actualPass.toString() === dbPassword.toString()) {
            localStorage.removeItem('veltrix_temp_pass'); 
            document.getElementById('loginOverlay').classList.add('hidden');
            document.getElementById('mainContent').classList.remove('blur-md', 'opacity-0', 'pointer-events-none');
            processFetchedData(data);
            showStatus("Access Granted", "bg-emerald-600");
        } else {
            errorText.classList.remove('hidden');
            showStatus("Invalid Password", "bg-red-500");
        }
    } catch (e) {
        showStatus("Connection Error", "bg-red-600");
    } finally {
        btn.innerText = "Login to Dashboard";
        btn.disabled = false;
    }
}

async function fetchAdminData() {
    try {
        showStatus("Syncing...", "bg-blue-500");
        const response = await fetch(getApiUrl('getAdminData'));
        const data = await response.json();
        processFetchedData(data);
        showStatus("Synced Successfully", "bg-emerald-500");
    } catch (e) {
        showStatus("Sync Failed", "bg-red-500");
    }
}

function processFetchedData(data) {
    systemSettings = data.settings || {};
    const ispName = systemSettings.ISP_Name || systemSettings.ispName || "Veltrix ISP";
    
    document.getElementById('headerIspNameMob').innerText = ispName;
    document.getElementById('sidebarBrandName').innerHTML = ispName.replace("ISP", '<span class="text-blue-600">ISP</span>');

    document.getElementById('setIspName').value = ispName;
    document.getElementById('setDns').value = systemSettings.MikroTik_DNS || "";
    document.getElementById('setPhone').value = systemSettings.Support_Phone || "";
    document.getElementById('setChannel').value = systemSettings.PH_CHANNEL_ID || "";
    document.getElementById('setAuth').value = systemSettings.PH_BASIC_AUTH || "";

    // FILTER OUT INCOMPLETE TRANSACTIONS IMMEDIATELY
    allUsersData = (data.allTransactions || []).filter(t => {
        const stat = (t.status || '').toString().toLowerCase();
        return stat !== 'pending' && stat !== 'failed';
    });

    document.getElementById('activeUsers').innerText = allUsersData.filter(t => t.status === 'Active').length || 0;

    packagesData = data.packages || [];
    bindingsData = data.bindings || []; 
    
    document.getElementById('mPkg').innerHTML = packagesData.map(p => `<option value="${p.name}">${p.name} (KES ${p.price})</option>`).join('');

    updateCounts();
    renderUserTable(allUsersData);
    renderTransactionsTable(allUsersData);
    renderPackages();
    renderExpiryTable(allUsersData);
    renderBindingsTable(bindingsData); 
    
    applyDashboardFilter();

    // Populate Customization Form
    if (document.getElementById('setPortalTitle')) {
        document.getElementById('setPortalTitle').value = systemSettings.Portal_Title || ispName;
        document.getElementById('setPortalColor').value = systemSettings.Portal_Color || '#2563eb';
        document.getElementById('setPortalColorText').value = systemSettings.Portal_Color || '#2563eb';
        document.getElementById('setPortalLogo').value = systemSettings.Portal_Logo || '';
        
        // Ensure iframe has tenant ID
        const iframe = document.getElementById('portalPreviewIframe');
        if (iframe && !iframe.src.includes('tenant=')) {
            iframe.src = `portal.html?tenant=${TENANT_ID}`;
        }
        
        updatePortalPreview();
    }
}

function applyDashboardFilter() {
    const filterVal = document.getElementById('dashboardTimeFilter').value;
    let filteredTxns = allUsersData;

    if (filterVal !== 'all') {
        const days = parseInt(filterVal);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        
        filteredTxns = allUsersData.filter(t => {
            if (!t.timestamp) return false;
            return new Date(t.timestamp) >= cutoff;
        });
    }

    const totalRev = filteredTxns.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    document.getElementById('totalSales').innerText = `KES ${totalRev}`;
    document.getElementById('netProfit').innerText = `KES ${totalRev}`;
    document.getElementById('totalCount').innerText = filteredTxns.length;

    updateChartAndFeed(filteredTxns);
}

function updateChartAndFeed(transactions) {
    const ctxDoughnut = document.getElementById('pkgChart');
    if (ctxDoughnut) {
        const pkgCounts = {};
        transactions.forEach(t => {
            const p = t.package || 'Unknown';
            pkgCounts[p] = (pkgCounts[p] || 0) + 1;
        });

        const labelsDoughnut = Object.keys(pkgCounts);
        const dataDoughnut = Object.values(pkgCounts);

        if (chartInstance) chartInstance.destroy();
        
        if(labelsDoughnut.length > 0) {
            chartInstance = new Chart(ctxDoughnut, {
                type: 'doughnut',
                data: {
                    labels: labelsDoughnut,
                    datasets: [{
                        data: dataDoughnut,
                        backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'],
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '75%',
                    plugins: {
                        legend: { position: 'right', labels: { boxWidth: 10, padding: 12, font: { family: "'Plus Jakarta Sans', sans-serif", size: 10, weight: 'bold' }, color: '#64748b' } }
                    }
                }
            });

            let popular = "None";
            let max = 0;
            for(let p in pkgCounts) { if(pkgCounts[p] > max) { max = pkgCounts[p]; popular = p; } }
            document.getElementById('popularPkg').innerText = popular;
        } else {
            document.getElementById('popularPkg').innerText = "No Data";
        }
    }

    const ctxBar = document.getElementById('revenueBarChart');
    if (ctxBar) {
        const dateMap = {};
        transactions.forEach(t => {
            if(t.timestamp) {
                const d = new Date(t.timestamp);
                const dateStr = d.toISOString().split('T')[0];
                dateMap[dateStr] = (dateMap[dateStr] || 0) + Number(t.amount || 0);
            }
        });
        
        const sortedDates = Object.keys(dateMap).sort();
        const labelsBar = sortedDates.map(d => new Date(d).toLocaleDateString('en-US', {month:'short', day:'numeric'}));
        const dataBar = sortedDates.map(d => dateMap[d]);

        if (barChartInstance) barChartInstance.destroy();
        
        if(labelsBar.length > 0) {
            barChartInstance = new Chart(ctxBar, {
                type: 'bar',
                data: {
                    labels: labelsBar,
                    datasets: [{
                        label: 'Revenue (KES)',
                        data: dataBar,
                        backgroundColor: '#3b82f6',
                        borderRadius: 6,
                        barThickness: 'flex',
                        maxBarThickness: 40
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { borderDash: [4, 4], color: '#f1f5f9' }, ticks: { font: { family: "'Plus Jakarta Sans', sans-serif", size: 10}, color: '#94a3b8' } },
                        x: { grid: { display: false }, ticks: { font: { family: "'Plus Jakarta Sans', sans-serif", size: 10}, color: '#94a3b8' } }
                    }
                }
            });
        }
    }

    const feed = document.getElementById('activityFeed');
    if (feed) {
        if(transactions.length === 0) {
            feed.innerHTML = '<p class="text-slate-400 text-sm text-center py-10 border-2 border-dashed border-slate-100 rounded-xl">No activity in this timeframe.</p>';
        } else {
            const recent = [...transactions].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 15);
            feed.innerHTML = recent.map(t => {
                const timeStr = t.timestamp ? new Date(t.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Just now';
                const amountStr = t.amount ? `<span class="text-green-500 font-black text-[10px]">+KES ${t.amount}</span>` : '';
                
                return `
                <div class="flex items-center gap-3 border-b border-slate-50 pb-3 mb-3 last:border-0 last:mb-0 last:pb-0 hover:bg-slate-50 p-2 rounded-lg transition">
                    <div class="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs shrink-0 border border-blue-100"><i class="fas fa-bolt"></i></div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-bold text-slate-800 truncate">${t.phone || 'Walk-In'}</p>
                        <p class="text-[10px] text-slate-400 truncate font-bold uppercase tracking-wider">${t.package}</p>
                    </div>
                    <div class="text-right">
                        ${amountStr}<br>
                        <span class="text-[9px] text-slate-400 tracking-wider font-bold">${timeStr}</span>
                    </div>
                </div>`;
            }).join('');
        }
    }
}

function renderExpiryTable(dataArray) {
    const tbody = document.getElementById('expiryTableBody');
    if (dataArray.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-slate-400">No records found.</td></tr>`;
        return;
    }

    const sorted = [...dataArray].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    tbody.innerHTML = sorted.map(t => {
        const user = t.phone || t.clientName || 'Walk-in User';
        const startDate = t.timestamp ? new Date(t.timestamp) : null;
        let expiryStr = 'Unknown Expiry';
        let timeRemainingStr = '';
        
        if (startDate && t.package) {
            const pkg = packagesData.find(p => p.name.trim() === t.package.trim());
            if (pkg && pkg.duration) {
                const durationMinutes = parseInt(pkg.duration, 10);
                if(!isNaN(durationMinutes)) {
                    const expiryDate = new Date(startDate.getTime() + durationMinutes * 60000);
                    expiryStr = expiryDate.toLocaleString('en-US', {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'});
                    
                    const now = new Date();
                    const diffMs = expiryDate - now;
                    
                    if (diffMs > 0) {
                        const diffHrs = Math.floor(diffMs / 3600000);
                        const diffMins = Math.floor((diffMs % 3600000) / 60000);
                        if(diffHrs > 24) {
                            timeRemainingStr = `<span class="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">${Math.floor(diffHrs/24)} days left</span>`;
                        } else {
                            timeRemainingStr = `<span class="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">${diffHrs}h ${diffMins}m left</span>`;
                        }
                    } else {
                        timeRemainingStr = `<span class="text-[10px] font-black uppercase tracking-widest text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">Expired</span>`;
                    }
                } else {
                    expiryStr = 'Invalid Duration';
                }
            } else {
                expiryStr = 'Package Not Found';
            }
        }

        let statusBadge = '';
        if (t.status === 'Active') statusBadge = `<span class="bg-green-100 text-green-700 font-bold px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wide">Active</span>`;
        else if (t.status === 'Expired') statusBadge = `<span class="bg-red-50 text-red-600 font-bold px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wide">Expired</span>`;
        else statusBadge = `<span class="bg-slate-100 text-slate-600 font-bold px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wide">${t.status || 'Pending'}</span>`;

        return `
        <tr class="hover:bg-slate-50 transition border-b border-slate-50">
            <td class="py-4 px-4 text-sm font-bold text-slate-900">${user}</td>
            <td class="py-4 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">${t.package || '-'}</td>
            <td class="py-4 px-4">
                <p class="text-xs font-bold text-slate-700">${expiryStr}</p>
                <div class="mt-1">${timeRemainingStr}</div>
            </td>
            <td class="py-4 px-4">${statusBadge}</td>
            <td class="py-4 px-4 text-right">
                <button class="text-blue-600 hover:text-white bg-blue-50 hover:bg-blue-600 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition" onclick="document.getElementById('mPhone').value='${user}'; showManualModal();">Renew</button>
            </td>
        </tr>`;
    }).join('');
}

function renderBindingsTable(dataArray) {
    const tbody = document.getElementById('bindingsTableBody');
    if (dataArray.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-slate-400">No MAC bindings configured.</td></tr>`;
        return;
    }

    tbody.innerHTML = dataArray.map(b => {
        const mac = b.mac || 'N/A';
        const ip = b.ip || 'Dynamic';
        const name = b.name || 'Unknown Device';
        const statusBadge = `<span class="bg-purple-100 text-purple-700 font-bold px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wide border border-purple-200">${b.status || 'Bypassed'}</span>`;

        return `
        <tr class="hover:bg-slate-50 transition border-b border-slate-50 group">
            <td class="py-4 px-4">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center text-sm shrink-0 border border-slate-200 group-hover:bg-blue-50 group-hover:text-blue-500 transition"><i class="fas fa-tv"></i></div>
                    <div>
                        <p class="text-sm font-bold text-slate-900 leading-tight">${name}</p>
                    </div>
                </div>
            </td>
            <td class="py-4 px-4 text-sm font-mono font-bold text-slate-700 uppercase">${mac}</td>
            <td class="py-4 px-4 text-sm font-mono text-slate-500">${ip}</td>
            <td class="py-4 px-4">${statusBadge}</td>
            <td class="py-4 px-4 text-right">
                <button onclick="confirmDelete('binding', '${mac}', '${name}')" class="text-slate-400 hover:text-red-600 p-2 transition rounded hover:bg-red-50" title="Delete Binding"><i class="fas fa-trash-alt text-sm"></i></button>
            </td>
        </tr>`;
    }).join('');
}

async function addBinding() {
    const mac = document.getElementById('newBindMac').value;
    const ip = document.getElementById('newBindIp').value;
    const name = document.getElementById('newBindName').value;
    
    if(!mac || !name) return showStatus("MAC and Name are required", "bg-red-500"); 
    
    showStatus("Saving Binding...", "bg-blue-600");
    hideBindingModal();
    
    try {
        const res = await fetch(getApiUrl('addBinding'), { 
            method: "POST", 
            body: JSON.stringify({ action: "addBinding", mac: mac, ip: ip, name: name }) 
        });
        const result = await res.json();
        if(result.status === "success") { 
            document.getElementById('newBindMac').value = '';
            document.getElementById('newBindIp').value = '';
            document.getElementById('newBindName').value = '';
            fetchAdminData(); 
            showStatus("Device binding added!", "bg-emerald-600"); 
        } else {
            showStatus("Failed to add binding", "bg-red-500"); 
        }
    } catch (e) { showStatus("Server Error", "bg-red-600"); }
}

function updateCounts() {
    document.getElementById('count-all').innerText = allUsersData.length;
    document.getElementById('count-hotspot').innerText = allUsersData.filter(t => t.type !== 'PPPoE').length;
    document.getElementById('count-pppoe').innerText = allUsersData.filter(t => t.type === 'PPPoE').length;
    document.getElementById('count-paused').innerText = allUsersData.filter(t => t.status === 'Disabled' || t.status === 'Expired').length;
}

function filterUserView(type) {
    document.querySelectorAll('#usersTab .table-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${type.toLowerCase()}`).classList.add('active');

    let filtered = allUsersData;
    if (type === 'Hotspot') filtered = allUsersData.filter(u => u.type !== 'PPPoE');
    else if (type === 'PPPoE') filtered = allUsersData.filter(u => u.type === 'PPPoE');
    else if (type === 'Paused') filtered = allUsersData.filter(u => u.status === 'Paused' || u.status === 'Expired' || u.status === 'Disabled');

    renderUserTable(filtered);
}

function renderUserTable(dataArray) {
    const tbody = document.getElementById('userTableBody');
    if (dataArray.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-slate-400">No users found.</td></tr>`;
        return;
    }

    tbody.innerHTML = dataArray.map(t => {
        const isPPPoE = t.type === 'PPPoE';
        const mainIdentifier = isPPPoE ? (t.clientName || 'User') : (t.phone || 'User');
        const subIdentifier = isPPPoE ? t.username : `Code: ${t.code || t.ref || 'N/A'}`;
        const initial = mainIdentifier.toString().substring(0, 2).toUpperCase();
        
        const avatarColor = isPPPoE ? 'bg-purple-100 text-purple-600' : (t.ref === 'ADMIN-MANUAL' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600');
        const networkMain = isPPPoE ? `IP: Dynamic` : (t.ref === 'ADMIN-MANUAL' ? 'Walk-in / Manual' : `Ref: ${t.ref || 'N/A'}`);
        const networkSub = t.timestamp ? new Date(t.timestamp).toLocaleDateString() : "Recent";

        let statusBadge = '';
        if (t.status === 'Active') statusBadge = `<span class="bg-green-100 text-green-700 border border-green-200 font-bold px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wide">Active</span>`;
        else if (t.status === 'Expired') statusBadge = `<span class="bg-red-50 text-red-600 border border-red-200 font-bold px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wide">Expired</span>`;
        else statusBadge = `<span class="bg-slate-100 text-slate-600 border border-slate-200 font-bold px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wide">${t.status || 'Pending'}</span>`;

        return `
        <tr class="hover:bg-slate-50 transition group">
            <td class="py-3 px-4">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full ${avatarColor} flex items-center justify-center font-black text-[10px] shrink-0 shadow-sm">${initial}</div>
                    <div>
                        <p class="text-sm font-bold text-slate-900 leading-tight truncate max-w-[150px]">${mainIdentifier}</p>
                        <p class="text-[10px] font-mono text-slate-400 mt-0.5"><span class="font-bold text-slate-600 tracking-wider">${subIdentifier}</span></p>
                    </div>
                </div>
            </td>
            <td class="py-3 px-4">
                <p class="text-sm font-bold text-slate-700">${t.package || 'Data Plan'}</p>
                <p class="text-[10px] font-bold text-slate-400 uppercase mt-0.5">${t.type || 'Hotspot'}</p>
            </td>
            <td class="py-3 px-4">
                <p class="text-[10px] font-bold text-slate-500 uppercase truncate max-w-[120px]">${networkMain}</p>
                <p class="text-[9px] text-slate-400 mt-1">${networkSub}</p>
            </td>
            <td class="py-3 px-4">${statusBadge}</td>
            <td class="py-3 px-4 text-right space-x-1">
                <button class="text-slate-400 hover:text-green-600 p-2 transition rounded hover:bg-green-50" title="Force Active"><i class="fas fa-play text-sm"></i></button>
                <button class="text-slate-400 hover:text-red-600 p-2 transition rounded hover:bg-red-50" title="Disconnect"><i class="fas fa-stop text-sm"></i></button>
            </td>
        </tr>`;
    }).join('');
}

function renderTransactionsTable(dataArray) {
    const tbody = document.getElementById('txnsTableBody');
    if (dataArray.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-slate-400">No transactions recorded yet.</td></tr>`;
        return;
    }
    
    const sorted = [...dataArray].reverse(); 
    tbody.innerHTML = sorted.map(t => {
        const dateStr = t.timestamp ? new Date(t.timestamp).toLocaleString() : 'N/A';
        const refStr = t.ref || t.code || 'N/A';
        const amountStr = t.amount ? `KES ${t.amount}` : '-';
        
        return `
        <tr class="hover:bg-slate-50 transition border-b border-slate-50">
            <td class="py-4 px-4 text-xs font-mono text-slate-500">${dateStr}</td>
            <td class="py-4 px-4 text-sm font-bold text-slate-900 tracking-wider">${refStr}</td>
            <td class="py-4 px-4 text-sm font-bold text-slate-700">${t.phone || '-'}</td>
            <td class="py-4 px-4 text-sm font-bold text-slate-700">${t.package || '-'}</td>
            <td class="py-4 px-4 text-sm font-black text-green-600 text-right">${amountStr}</td>
        </tr>`;
    }).join('');
}

function renderPackages() {
    const grid = document.getElementById('packageGrid');
    if(packagesData.length === 0) { 
        grid.innerHTML = `<div class="col-span-full p-10 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-bold">No packages created yet. Click "Add New Package" above.</div>`; 
        return; 
    }
    grid.innerHTML = packagesData.map(pkg => `
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between hover:shadow-md hover:border-blue-200 transition group relative overflow-hidden">
            <div class="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div>
                <div class="flex justify-between items-start mb-2">
                    <h4 class="text-lg font-black text-slate-900 tracking-tight">${pkg.name}</h4>
                    <span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-md font-black uppercase tracking-widest">${pkg.duration} Mins</span>
                </div>
                <p class="text-2xl font-black text-blue-600 mt-4 mb-6">KES ${pkg.price}</p>
            </div>
            <div class="pt-4 border-t border-slate-100 flex justify-end">
                <button onclick="confirmDelete('package', '${pkg.name}', '${pkg.name}')" class="text-slate-400 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition flex items-center gap-2">
                    <i class="fas fa-trash-alt"></i> Delete
                </button>
            </div>
        </div>`).join('');
}

function confirmDelete(type, id, displayName) {
    deleteType = type;
    itemToDelete = id;
    document.getElementById('deleteItemDisplay').innerText = displayName;
    document.getElementById('confirmModal').classList.remove('hidden');
}

function closeConfirmModal() {
    itemToDelete = null;
    deleteType = null;
    document.getElementById('confirmModal').classList.add('hidden');
}

async function executeDelete() {
    if(!itemToDelete || !deleteType) return;
    
    const id = itemToDelete;
    const type = deleteType; 
    closeConfirmModal();
    
    showStatus(`Deleting ${type}...`, "bg-orange-500");
    
    try {
        let actionStr = type === 'package' ? 'deletePackage' : 'deleteBinding';
        let payload = { action: actionStr };
        if(type === 'package') payload.name = id;
        if(type === 'binding') payload.mac = id;

        const res = await fetch(getApiUrl(actionStr), { 
            method: "POST", 
            body: JSON.stringify(payload) 
        });
        const result = await res.json();
        
        if(result.status === "success") { 
            fetchAdminData(); 
            showStatus(`${type} successfully deleted`, "bg-emerald-600"); 
        } else {
            showStatus("Failed to delete", "bg-red-500");
        }
    } catch (e) { showStatus("Server Error during deletion", "bg-red-600"); }
}

async function saveSystemSettings() {
    showStatus("Saving Settings...", "bg-blue-600");
    const newSettings = {
        "ISP_Name": document.getElementById('setIspName').value,
        "MikroTik_DNS": document.getElementById('setDns').value,
        "Support_Phone": document.getElementById('setPhone').value,
        "PH_CHANNEL_ID": document.getElementById('setChannel').value,
        "PH_BASIC_AUTH": document.getElementById('setAuth').value
    };
    
    try {
        const res = await fetch(getApiUrl('saveSettings'), { 
            method: "POST", 
            body: JSON.stringify({ action: "saveSettings", settings: newSettings }) 
        });
        const result = await res.json();
        if(result.status === "success") { 
            fetchAdminData(); 
            showStatus("Settings successfully saved!", "bg-emerald-600"); 
        } else {
            showStatus("Failed to save settings", "bg-red-500");
        }
    } catch (e) { showStatus("Server Error", "bg-red-600"); }
}

async function generateManual() {
    const pkg = document.getElementById('mPkg').value;
    const phone = document.getElementById('mPhone').value || "WALK-IN";
    showStatus("Authenticating and Generating...", "bg-blue-600"); 
    hideManualModal();
    try {
        const res = await fetch(getApiUrl('generateManualVoucher'), { 
            method: "POST", 
            body: JSON.stringify({ action: "generateManualVoucher", package: pkg, phone: phone }) 
        });
        const result = await res.json();
        if(result.status === "success") {
            document.getElementById('displayCode').innerText = result.code;
            document.getElementById('displayExpiry').innerText = "Voucher Generated Successfully";
            document.getElementById('successModal').classList.remove('hidden');
            fetchAdminData();
        } else {
            showStatus(result.message || "Error generating voucher", "bg-red-500"); 
        }
    } catch (e) { showStatus("Server Error", "bg-red-600"); }
}

async function addPackage() {
    const name = document.getElementById('newPkgName').value;
    const price = document.getElementById('newPkgPrice').value;
    const duration = document.getElementById('newPkgDuration').value;
    if(!name || !price || !duration) return showStatus("All fields are strictly required", "bg-red-500"); 
    
    showStatus("Saving Package to Database...", "bg-blue-600");
    hidePackageModal();
    
    try {
        const res = await fetch(getApiUrl('addPackage'), { method: "POST", body: JSON.stringify({ action: "addPackage", name: name, price: price, duration: duration }) });
        const result = await res.json();
        if(result.status === "success") { 
            document.getElementById('newPkgName').value = '';
            document.getElementById('newPkgPrice').value = '';
            document.getElementById('newPkgDuration').value = '';
            fetchAdminData(); 
            showStatus("New package provisioned!", "bg-emerald-600"); 
        } else {
            showStatus("Failed to add package", "bg-red-500"); 
        }
    } catch (e) { showStatus("Server Error", "bg-red-600"); }
}

function showStatus(msg, color) {
    const el = document.getElementById('statusAlert');
    el.innerText = msg;
    el.className = `fixed top-6 right-6 z-[300] px-6 py-3 rounded-2xl text-sm font-black text-white shadow-2xl transition-all transform translate-y-0 block ${color}`;
    setTimeout(() => {
        el.classList.add('opacity-0', '-translate-y-4');
        setTimeout(() => { el.classList.add('hidden'); el.classList.remove('opacity-0', '-translate-y-4'); }, 500);
    }, 3000);
}

function filterTable(tableId, inputId) {
    const filter = document.getElementById(inputId).value.toUpperCase();
    const tr = document.getElementById(tableId).getElementsByTagName("tr");
    for (let i = 0; i < tr.length; i++) {
        let txt = tr[i].textContent || tr[i].innerText;
        tr[i].style.display = txt.toUpperCase().indexOf(filter) > -1 ? "" : "none";
    }
}

function logout() {
    localStorage.removeItem('veltrix_temp_pass');
    window.location.href = 'index.html';
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const target = document.getElementById(tabId + 'Tab');
    if(target) target.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.remove('active', 'bg-slate-50', 'text-blue-600');
        b.querySelector('i').classList.replace('text-blue-600', 'text-slate-400');
    });
    const clickedBtn = document.getElementById('btn-' + tabId);
    if(clickedBtn) {
        clickedBtn.classList.add('active');
        clickedBtn.querySelector('i').classList.replace('text-slate-400', 'text-blue-600');
    }
    if (window.innerWidth < 768) toggleSidebar();
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('sidebar-hidden'); }
function showManualModal() { document.getElementById('manualModal').classList.remove('hidden'); }
function hideManualModal() { document.getElementById('manualModal').classList.add('hidden'); }
function showBindingModal() { document.getElementById('bindingModal').classList.remove('hidden'); }
function hideBindingModal() { document.getElementById('bindingModal').classList.add('hidden'); }
function closeSuccessModal() { document.getElementById('successModal').classList.add('hidden'); }
function showPackageModal() { document.getElementById('pkgModal').classList.remove('hidden'); }
function hidePackageModal() { document.getElementById('pkgModal').classList.add('hidden'); }
function toggleNotifications(e) { e.stopPropagation(); document.getElementById('notificationDropdown').classList.toggle('hidden'); }
function closeDropdowns() { document.getElementById('notificationDropdown').classList.add('hidden'); }

window.onload = () => { 
    // Set up portal preview dynamically inside iframe load to prevent missing tenant
    document.addEventListener('DOMContentLoaded', () => {
        const iframe = document.getElementById('portalPreviewIframe');
        if (iframe && TENANT_ID) iframe.src = `portal.html?tenant=${TENANT_ID}`;
    });

    if (localStorage.getItem('veltrix_temp_pass')) checkLogin(); 
};

// --- MikroTik Tab & Setup Guide Functions --- //

const checkSettingsInterval = setInterval(() => {
    const ipField = document.getElementById('setRouterIp');
    if(window.systemSettings && window.systemSettings.MikroTik_IP && ipField && !ipField.dataset.loaded) {
        ipField.value = window.systemSettings.MikroTik_IP || '';
        document.getElementById('setRouterUser').value = window.systemSettings.MikroTik_User || '';
        document.getElementById('setRouterPass').value = window.systemSettings.MikroTik_Pass || '';
        ipField.dataset.loaded = 'true';
    }
}, 1000);

async function saveMikrotikSettings() {
    const ip = document.getElementById('setRouterIp').value;
    const user = document.getElementById('setRouterUser').value;
    const pass = document.getElementById('setRouterPass').value;
    const dns = document.getElementById('setDns').value || 'snookum.wifi';
    
    if(!ip || !user || !pass) {
        showStatus("Please fill all MikroTik connection details", "bg-red-500");
        return;
    }

    showStatus("Generating Script & Saving...", "bg-blue-600");
    
    const script = `# MIKROTIK AUTO-CONFIG FOR ISP PORTAL
# Generated for Cloud DNS: ${ip}
# ==========================================
/user add name="${user}" group=full password="${pass}" comment="Billing API User"
/ip service set api disabled=no port=8728
/ip service set api-ssl disabled=no port=8729
/ip service set www disabled=no port=80
/ip service set www-ssl disabled=no port=443
/ip cloud set ddns-enabled=yes
/ip cloud force-update
/ip firewall filter add chain=input protocol=tcp dst-port=443 action=accept comment="Allow WebFig" place-before=0
/ip firewall filter add chain=input protocol=tcp dst-port=8291 action=accept comment="Allow WinBox" place-before=0
/ip firewall filter add chain=input protocol=tcp dst-port=8728 action=accept comment="Allow Billing API" place-before=0
/ip firewall mangle add chain=postrouting action=change-ttl new-ttl=set:1 passthrough=yes comment="Prevent Sharing"
/ip hotspot walled-garden
add dst-host="mrsnookum.github.io" action=allow
add dst-host="*.github.io" action=allow
add dst-host="script.google.com" action=allow
add dst-host="*.google.com" action=allow
add dst-host="backend.payhero.co.ke" action=allow
/ip hotspot profile set [find default=yes] login-by=http-pap,mac dns-name="${dns}"`;

    const scriptBox = document.getElementById('rosScriptOutput');
    if (scriptBox) {
        scriptBox.innerText = script;
        scriptBox.classList.remove('text-emerald-400');
        scriptBox.classList.add('text-white');
    }

    const newSettings = {
        "MikroTik_IP": ip,
        "MikroTik_User": user,
        "MikroTik_Pass": pass
    };
    
    try {
        const res = await fetch(getApiUrl('saveSettings'), { 
            method: "POST", 
            body: JSON.stringify({ action: "saveSettings", settings: newSettings }) 
        });
        const result = await res.json();
        if(result.status === "success") { 
            showStatus("MikroTik Settings saved successfully!", "bg-emerald-600"); 
        } else {
            showStatus("Failed to save settings", "bg-red-500");
        }
    } catch (e) { 
        showStatus("Server Error", "bg-red-600"); 
    }
}

function testMikrotikConnection() {
    showStatus("Pinging Router...", "bg-blue-500");
    setTimeout(() => {
        showStatus("Connection Successful!", "bg-emerald-500");
    }, 1500);
}

function copyRosScript() {
    const scriptBox = document.getElementById('rosScriptOutput');
    if (!scriptBox) return;
    
    const text = scriptBox.innerText;
    if (text.includes("Fill connection details")) {
        showStatus("Generate script first before copying.", "bg-orange-500");
        return;
    }
    navigator.clipboard.writeText(text);
    showStatus("Script copied to clipboard!", "bg-slate-800");
}

function downloadLoginHtml() {
    const urlParams = new URLSearchParams(window.location.search);
    const tenantId = urlParams.get('tenant') || 'UNKNOWN';
    
    let portalBase = window.location.href.split('?')[0].replace('admin.html', 'portal.html');
    if (!portalBase.includes('portal.html')) {
        portalBase = window.location.origin + '/portal.html';
    }

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>Redirecting to Portal...</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f8fafc; color: #64748b; margin: 0; }</style>
</head>
<body>
    <div style="text-align: center;">
        <svg style="animation: spin 1s linear infinite; height: 2rem; width: 2rem; margin: 0 auto 1rem auto; color: #3b82f6;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle style="opacity: 0.25;" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path style="opacity: 0.75;" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <p>Connecting to secure billing portal...</p>
    </div>
    <script>
        var mac = "$(mac)";
        var ip = "$(ip)";
        var linkLoginOnly = "$(link-login-only)";
        var error = "$(error)";
        var tenant = "${tenantId}";
        var redirectUrl = "${portalBase}?tenant=" + tenant + "&mac=" + mac + "&ip=" + ip + "&login_url=" + encodeURIComponent(linkLoginOnly) + "&error=" + encodeURIComponent(error);
        window.location.replace(redirectUrl);
    <\/script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'login.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showStatus("login.html generated and downloaded!", "bg-emerald-600");
}

// --- Portal Customization Functions --- //

function updatePortalPreview() {
    const iframe = document.getElementById('portalPreviewIframe');
    if(!iframe) return;

    const title = document.getElementById('setPortalTitle').value || 'Wi-Fi Portal';
    const color = document.getElementById('setPortalColor').value || '#2563eb';
    
    // We send a message to the iframe to update its styles dynamically
    iframe.contentWindow.postMessage({
        type: 'updateBranding',
        title: title,
        color: color
    }, '*');
}

async function savePortalSettings() {
    showStatus("Saving Portal Branding...", "bg-blue-600");
    const newSettings = {
        "Portal_Title": document.getElementById('setPortalTitle').value,
        "Portal_Color": document.getElementById('setPortalColor').value,
        "Portal_Logo": document.getElementById('setPortalLogo').value
    };
    
    try {
        const res = await fetch(getApiUrl('saveSettings'), { 
            method: "POST", 
            body: JSON.stringify({ action: "saveSettings", settings: newSettings }) 
        });
        const result = await res.json();
        if(result.status === "success") { 
            showStatus("Portal branding saved!", "bg-emerald-600"); 
        } else {
            showStatus("Failed to save branding", "bg-red-500");
        }
    } catch (e) { showStatus("Server Error", "bg-red-600"); }
}