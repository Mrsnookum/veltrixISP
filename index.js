// Update this with your Master Apps Script Deployment URL
const MASTER_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzNWG5QOqG72Hroid3BZ3yQGSp4lVw-yhYlXwy5P_B7vDvFUlTUFZchQc6rh84hwrU/exec';

// Modal Logic
function openLoginModal() { document.getElementById('loginModal').classList.remove('hidden'); }
function closeLoginModal() { document.getElementById('loginModal').classList.add('hidden'); }

function executeLogin() {
    const tenant = document.getElementById('subdomainLogin').value.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (tenant) {
        window.location.href = `admin.html?tenant=${tenant}`;
    }
}

// Pricing Calculator Logic
const revSlider = document.getElementById('revSlider');
const pppoeSlider = document.getElementById('pppoeSlider');
const revDisplay = document.getElementById('revDisplay');
const pppoeDisplay = document.getElementById('pppoeDisplay');
const totalFeeDisplay = document.getElementById('totalFee');
const hotspotCostDisplay = document.getElementById('hotspotCost');
const pppoeCostDisplay = document.getElementById('pppoeCost');

function calculatePricing() {
    if (!revSlider || !pppoeSlider) return;
    
    const revenue = parseInt(revSlider.value);
    const pppoe = parseInt(pppoeSlider.value);
    
    // Format numbers with commas
    revDisplay.innerText = revenue.toLocaleString();
    pppoeDisplay.innerText = pppoe.toLocaleString();

    // Calculate Hotspot Fee (Tiered percentage)
    let hotspotFee = 0;
    let percent = 0;
    if (revenue > 0) {
        if(revenue <= 10000) { percent = 10; hotspotFee = revenue * 0.10; }
        else if(revenue <= 50000) { percent = 8; hotspotFee = revenue * 0.08; }
        else { percent = 6; hotspotFee = revenue * 0.06; }
    }

    // Calculate PPPoE Fee (Flat KES 20 per client)
    const pppoeFee = pppoe * 20;
    const total = Math.round(hotspotFee + pppoeFee);

    // Update DOM
    document.querySelector('#hotspotCost').parentElement.previousElementSibling.innerText = `Hotspot (${percent}%)`;
    hotspotCostDisplay.innerText = Math.round(hotspotFee).toLocaleString();
    document.querySelector('#pppoeCost').parentElement.previousElementSibling.innerText = `PPPoE (KES 20/ea)`;
    pppoeCostDisplay.innerText = pppoeFee.toLocaleString();
    totalFeeDisplay.innerText = total.toLocaleString();
}

if (revSlider && pppoeSlider) {
    revSlider.addEventListener('input', calculatePricing);
    pppoeSlider.addEventListener('input', calculatePricing);
    calculatePricing(); // Initialize on load
}

// Provisioning Form Logic
const form = document.getElementById('provisionForm');
if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnText = document.getElementById('btnText');
        const btnIcon = document.getElementById('btnIcon');
        const status = document.getElementById('formStatus');
        const provisionBtn = document.getElementById('provisionBtn');
        const subdomainInput = document.getElementById('subdomain').value.toLowerCase().replace(/[^a-z0-9]/g, '');

        provisionBtn.disabled = true;
        btnText.innerText = "PROVISIONING ENVIRONMENT...";
        btnIcon.className = "fas fa-circle-notch fa-spin";
        status.classList.remove('hidden', 'text-red-500', 'text-emerald-500');
        status.innerText = "Cloning Database & Configuring Security...";
        status.classList.add('text-blue-500', 'block');

        const payload = {
            action: "signup",
            ispName: document.getElementById('ispName').value,
            subdomain: subdomainInput,
            email: document.getElementById('adminEmail').value,
            password: document.getElementById('adminPassword').value
        };

        // Use URLSearchParams to build the GET request
        const finalUrl = `${MASTER_APPS_SCRIPT_URL}?${new URLSearchParams(payload).toString()}`;

        try {
            // FALLBACK STRATEGY: Use fetch with 'no-cors' mode first if standard fails
            // But for App Script JSON return, standard fetch is better if deployed as 'Anyone'
            const response = await fetch(finalUrl, { method: 'GET' });
            const result = await response.json();

            if (result.status === "success") {
                status.innerText = "DEPLOYMENT SUCCESSFUL! REDIRECTING...";
                status.classList.replace('text-blue-500', 'text-emerald-500');
                localStorage.setItem('veltrix_temp_pass', payload.password);
                setTimeout(() => { window.location.href = `admin.html?tenant=${subdomainInput}`; }, 2000);
            } else {
                throw new Error(result.message || "Failed to provision.");
            }
        } catch (err) {
            // If it's a CORS issue, the request might have actually succeeded 
            // but the browser blocked the response.
            if(err.message.includes('fetch')) {
                status.innerText = "DEPLOYMENT INITIATED. REDIRECTING IN 5 SECONDS...";
                status.classList.replace('text-blue-500', 'text-orange-500');
                localStorage.setItem('veltrix_temp_pass', payload.password);
                setTimeout(() => { window.location.href = `admin.html?tenant=${subdomainInput}`; }, 5000);
            } else {
                provisionBtn.disabled = false;
                btnText.innerText = "RETRY DEPLOYMENT";
                btnIcon.className = "fas fa-rocket";
                status.innerText = "ERROR: " + err.message;
                status.classList.replace('text-blue-500', 'text-red-500');
            }
        }
    });
}