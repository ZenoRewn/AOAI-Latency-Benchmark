// Azure OpenAI Latency Benchmark - Frontend Logic

let currentRunId = null;
let allResults = [];
let currentMode = 'benchmark';
const configuredRegions = [];

const COLORS = {
    primary: '#8661C5',
    secondary: '#0078D4',
    primaryLight: '#C5B4E3',
    secondaryLight: '#8DC8E8',
};

const CHART_COLORS = [
    '#8661C5', '#0078D4', '#10B981', '#F59E0B', '#EF4444',
    '#6366F1', '#EC4899', '#14B8A6', '#F97316', '#8B5CF6',
];

const PLOTLY_LAYOUT = {
    height: 400,
    font: { family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", size: 13, color: '#1A1A2E' },
    title: { font: { size: 16 } },
    margin: { l: 60, r: 20, t: 50, b: 100 },
    legend: { orientation: 'h', y: -0.22, x: 0.5, xanchor: 'center', font: { size: 12 } },
    xaxis: { tickfont: { size: 12 }, titlefont: { size: 13 }, gridcolor: '#E5E7EB' },
    yaxis: { tickfont: { size: 12 }, titlefont: { size: 13 }, gridcolor: '#E5E7EB' },
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    bargap: 0.6,
    bargroupgap: 0.15,
};

function mergeLayout(...overrides) {
    const base = JSON.parse(JSON.stringify(PLOTLY_LAYOUT));
    for (const obj of overrides) {
        for (const [key, val] of Object.entries(obj)) {
            if (val && typeof val === 'object' && !Array.isArray(val) && base[key]) {
                base[key] = { ...base[key], ...val };
            } else {
                base[key] = val;
            }
        }
    }
    return base;
}

// ==================== Init ====================

document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    discoverResources();
});

async function checkAuthStatus() {
    try {
        const resp = await fetch('/api/auth/status');
        const data = await resp.json();
        const el = document.getElementById('auth-status');

        if (data.method === 'azure_cli') {
            el.className = 'auth-status ok';
            el.innerHTML = `<div class="auth-dot"></div><span>Authenticated via ${data.detail}</span>`;
        } else if (data.method === 'env_vars') {
            el.className = 'auth-status warn';
            el.innerHTML = `<div class="auth-dot"></div><span>Authenticated via ${data.detail}</span>`;
        } else {
            el.className = 'auth-status none';
            el.innerHTML = `<div class="auth-dot"></div><span>${data.detail}</span>`;
        }
    } catch {
        const el = document.getElementById('auth-status');
        el.className = 'auth-status none';
        el.innerHTML = `<div class="auth-dot"></div><span>Failed to check auth status</span>`;
    }
}

// ==================== UI Helpers ====================

function toggleCollapse(header) {
    header.classList.toggle('open');
    header.nextElementSibling.classList.toggle('open');
}

function switchRegionTab(tab, el) {
    document.querySelectorAll('#region-tab-bar .tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('tab-discover').style.display = tab === 'discover' ? 'block' : 'none';
    document.getElementById('tab-manual').style.display = tab === 'manual' ? 'block' : 'none';
}

function showPhase(name) {
    document.querySelectorAll('.phase').forEach(p => p.classList.remove('active'));
    document.getElementById(`phase-${name}`).classList.add('active');
}

function switchMode(mode, el) {
    currentMode = mode;
    document.querySelectorAll('#mode-tab-bar .tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('monitor-params').style.display = mode === 'monitor' ? 'block' : 'none';
}

async function stopBenchmark() {
    if (!currentRunId) return;
    try {
        await fetch(`/api/benchmark/${currentRunId}/stop`, { method: 'POST' });
        document.getElementById('stop-btn').disabled = true;
        document.getElementById('stop-btn').textContent = 'Stopping...';
    } catch { /* ignore */ }
}

function updateRegionList() {
    const list = document.getElementById('region-list');
    const count = document.getElementById('region-count');
    count.textContent = configuredRegions.length;

    if (configuredRegions.length === 0) {
        list.innerHTML = '<div style="color:var(--text-secondary);font-size:0.85rem;padding:0.5rem">No regions added yet</div>';
        return;
    }

    list.innerHTML = configuredRegions.map((r, i) => `
        <div class="region-item fade-in">
            <span class="region-name">${r.name}</span>
            <span class="region-endpoint">${r.endpoint}</span>
            <button class="btn-remove" onclick="removeRegion(${i})">&times;</button>
        </div>
    `).join('');
}

function removeRegion(idx) {
    configuredRegions.splice(idx, 1);
    updateRegionList();
}

// ==================== Region Config ====================

let discoveredResources = [];

async function discoverResources() {
    const statusEl = document.getElementById('discover-status');
    const listEl = document.getElementById('discover-list');

    try {
        const resp = await fetch('/api/resources/discover');
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ detail: resp.statusText }));
            statusEl.innerHTML = `<span style="color:var(--error)">${err.detail || 'Discovery failed'}</span>`;
            return;
        }

        discoveredResources = await resp.json();
        if (discoveredResources.length === 0) {
            statusEl.innerHTML = '<span style="color:var(--text-secondary)">No AIServices or OpenAI resources found in your subscription.</span>';
            return;
        }

        statusEl.style.display = 'none';
        listEl.innerHTML = discoveredResources.map((r, i) => `
            <label class="discover-item checkbox-label" data-idx="${i}">
                <input type="checkbox" onchange="toggleDiscoveredResource(${i}, this.checked); this.parentElement.classList.toggle('checked', this.checked)">
                <span class="discover-item-name">${r.name}</span>
                <span class="discover-item-region">(${r.region})</span>
                <span class="discover-item-endpoint">${r.endpoint}</span>
            </label>
        `).join('');
    } catch (e) {
        statusEl.innerHTML = `<span style="color:var(--error)">Failed to discover resources: ${e.message}</span>`;
    }
}

function toggleDiscoveredResource(idx, checked) {
    const r = discoveredResources[idx];
    if (checked) {
        if (!configuredRegions.some(cr => cr.endpoint === r.endpoint)) {
            configuredRegions.push({ name: r.region, endpoint: r.endpoint });
        }
    } else {
        const i = configuredRegions.findIndex(cr => cr.endpoint === r.endpoint);
        if (i !== -1) configuredRegions.splice(i, 1);
    }
    updateRegionList();
}

function addManualRegion() {
    const endpoint = document.getElementById('manual-endpoint').value.trim();
    if (!endpoint) { alert('Please enter an endpoint URL'); return; }

    // Extract a region name from the endpoint hostname
    let name = 'custom';
    try {
        const host = new URL(endpoint).hostname;
        name = host.split('.')[0];
    } catch { /* keep 'custom' */ }

    if (!configuredRegions.some(r => r.endpoint === endpoint)) {
        configuredRegions.push({ name, endpoint });
    }
    document.getElementById('manual-endpoint').value = '';
    updateRegionList();
}

// ==================== Model Tabs ====================

function switchModelTab(tabId, el) {
    document.querySelectorAll('#model-tab-bar .tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    document.querySelectorAll('.model-tab-panel').forEach(p => p.style.display = 'none');
    const target = document.querySelector(`.model-tab-panel[data-model-tab="${tabId}"]`);
    if (target) target.style.display = 'block';
}

function updateModelCount() {
    const checked = document.querySelectorAll('#model-checkboxes input[type="checkbox"]:checked').length;
    const total = checked + customModels.length;
    const el = document.getElementById('model-selected-count');
    el.textContent = total > 0 ? `(${total} selected)` : '';
}

// ==================== Custom Models ====================

const customModels = [];

function addCustomModel() {
    const input = document.getElementById('custom-model-input');
    const name = input.value.trim();
    if (!name) return;
    if (customModels.includes(name)) { input.value = ''; return; }

    customModels.push(name);
    input.value = '';
    renderCustomModelTags();
    updateModelCount();
}

function removeCustomModel(idx) {
    customModels.splice(idx, 1);
    renderCustomModelTags();
    updateModelCount();
}

function renderCustomModelTags() {
    const container = document.getElementById('custom-model-tags');
    container.innerHTML = customModels.map((m, i) => `
        <span class="custom-tag">
            ${m}
            <button class="remove-tag" onclick="removeCustomModel(${i})">&times;</button>
        </span>
    `).join('');
}

// ==================== Benchmark ====================

async function startBenchmark() {
    // Collect config
    if (configuredRegions.length === 0) {
        alert('Please add at least one region');
        return;
    }

    const models = [
        ...document.querySelectorAll('#model-checkboxes input:checked')
    ].map(cb => cb.value).concat(customModels);
    if (models.length === 0) { alert('Please select at least one model'); return; }

    const apiTypes = [...document.querySelectorAll('#api-type-group input[type="checkbox"]')]
        .filter(cb => cb.checked).map(cb => cb.value);
    if (apiTypes.length === 0) { alert('Please select at least one API type'); return; }

    const config = {
        regions: configuredRegions,
        models,
        api_types: apiTypes,
        iterations: parseInt(document.getElementById('iterations').value) || 3,
        rounds: parseInt(document.getElementById('rounds').value) || 1,
        concurrency: parseInt(document.getElementById('concurrency').value) || 5,
        max_tokens: parseInt(document.getElementById('max-tokens').value) || 100,
        timeout: 30,
        system_prompt: document.getElementById('system-prompt').value,
        user_prompt: document.getElementById('user-prompt').value,
        streaming: document.getElementById('streaming-toggle').classList.contains('active'),
        warmup: document.getElementById('warmup-toggle').classList.contains('active'),
        test_cache: document.getElementById('cache-toggle').classList.contains('active'),
        mode: currentMode,
        monitor_interval: parseInt(document.getElementById('monitor-interval').value) || 30,
        monitor_duration: parseInt(document.getElementById('monitor-duration').value) || 600,
        api_key: document.getElementById('api-key').value || null,
        api_version: document.getElementById('api-version').value || '2025-03-01-preview',
        reasoning_efforts: [...document.querySelectorAll('#reasoning-effort-group input:checked')].map(cb => cb.value),
        reasoning_summary: document.getElementById('reasoning-summary').value || null,
    };

    // Start benchmark
    document.getElementById('start-btn').disabled = true;
    showPhase('running');
    document.getElementById('live-tbody').innerHTML = '';
    allResults = [];

    try {
        const resp = await fetch('/api/benchmark/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
        });
        const data = await resp.json();
        currentRunId = data.run_id;
        connectSSE(currentRunId);
    } catch (e) {
        alert('Failed to start benchmark: ' + e.message);
        showPhase('config');
        document.getElementById('start-btn').disabled = false;
    }
}

function connectSSE(runId) {
    const evtSource = new EventSource(`/api/benchmark/${runId}/stream`);

    evtSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'started':
                if (data.mode === 'monitor') {
                    document.getElementById('stop-btn').style.display = 'inline-block';
                    document.getElementById('stop-btn').disabled = false;
                    document.getElementById('stop-btn').textContent = 'Stop';
                    document.getElementById('chart-monitor-live').style.display = 'block';
                    initMonitorChart();
                }
                break;
            case 'warmup':
                document.getElementById('progress-message').textContent = data.message || 'Warming up...';
                break;
            case 'progress':
                handleProgress(data);
                break;
            case 'call_result':
                handleCallResult(data);
                break;
            case 'monitor_point':
                handleMonitorPoint(data);
                break;
            case 'result':
                allResults.push(data.data);
                break;
            case 'error':
                handleError(data);
                break;
            case 'complete':
            case 'done':
                evtSource.close();
                document.getElementById('stop-btn').style.display = 'none';
                handleComplete();
                break;
        }
    };

    evtSource.onerror = () => {
        evtSource.close();
        // Check if benchmark actually completed
        setTimeout(() => fetchFinalResults(runId), 500);
    };
}

function handleProgress(data) {
    const pct = Math.round((data.current / data.total) * 100);
    document.getElementById('progress-fill').style.width = pct + '%';
    document.getElementById('progress-pct').textContent = pct + '%';
    document.getElementById('progress-message').textContent = data.message || '';
}

function handleCallResult(data) {
    const m = data.metrics;
    const tbody = document.getElementById('live-tbody');
    const row = document.createElement('tr');
    row.className = 'fade-in';

    const status = m.error
        ? `<span class="error-cell">${m.error}</span>`
        : '<span style="color:var(--success)">OK</span>';

    row.innerHTML = `
        <td>${data.round || 1}</td>
        <td>${data.region}</td>
        <td>${data.model}</td>
        <td>${data.api_type}</td>
        <td>${data.reasoning_effort || '-'}</td>
        <td>${data.iteration}</td>
        <td>${m.error ? '-' : (m.ttft_ms != null ? m.ttft_ms.toFixed(1) : '-')}</td>
        <td>${m.error ? '-' : m.total_latency_ms.toFixed(1)}</td>
        <td>${m.error ? '-' : m.tokens_per_second.toFixed(1)}</td>
        <td>${status}</td>
        <td>${m.request_id ? `<span class="copy-id" onclick="copyId(this,'${m.request_id}')">${m.request_id.substring(0, 8)}</span>` : '-'}</td>
    `;
    tbody.appendChild(row);
    tbody.parentElement.parentElement.scrollTop = tbody.parentElement.parentElement.scrollHeight;
}

function handleError(data) {
    const tbody = document.getElementById('live-tbody');
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="11" class="error-cell">${data.message || data.region || 'Error'}</td>`;
    tbody.appendChild(row);
}

async function fetchFinalResults(runId) {
    try {
        const resp = await fetch(`/api/benchmark/${runId}/results`);
        const data = await resp.json();
        if (data.results && data.results.length > 0) {
            allResults = data.results;
        }
    } catch { /* ignore */ }
    handleComplete();
}

function handleComplete() {
    showPhase('results');
    document.getElementById('start-btn').disabled = false;

    if (allResults.length === 0) {
        document.getElementById('summary-grid').innerHTML =
            '<div class="card" style="grid-column:1/-1;text-align:center;color:var(--error)">No results collected. Check your configuration and try again.</div>';
        return;
    }

    renderSummary();
    renderResultTable();
    renderTTFTChart();
    renderLatencyChart();
    renderTPSChart();
    renderTTFTPercentilesChart();
    renderHeatmap();
    renderLatencyBreakdownChart();
    renderRoundTrendChart();
    renderNetworkTimingChart();
    renderCacheChart();
}

// ==================== Results Rendering ====================

function renderSummary() {
    const grid = document.getElementById('summary-grid');
    const n = allResults.length;
    const avgTTFT = (allResults.reduce((s, r) => s + r.avg_ttft_ms, 0) / n).toFixed(1);
    const avgLatency = (allResults.reduce((s, r) => s + r.avg_latency_ms, 0) / n).toFixed(1);
    const avgTPS = (allResults.reduce((s, r) => s + r.avg_tps, 0) / n).toFixed(1);

    const fastest = allResults.reduce((a, b) => a.avg_ttft_ms < b.avg_ttft_ms ? a : b);
    const highestTPS = allResults.reduce((a, b) => a.avg_tps > b.avg_tps ? a : b);
    const errorCount = allResults.filter(r => r.error_rate > 0).length;

    const cacheResults = allResults.filter(r => r.cache && r.cache.hit_rate > 0);
    const avgCacheHit = cacheResults.length > 0
        ? (cacheResults.reduce((s, r) => s + r.cache.hit_rate, 0) / cacheResults.length * 100).toFixed(1) + '%'
        : 'N/A';

    const totalRounds = Math.max(...allResults.map(r => r.round || 1));

    grid.innerHTML = `
        <div class="summary-card fade-in">
            <div class="value">${n}</div>
            <div class="label">Total Tests${totalRounds > 1 ? ` (${totalRounds} Rounds)` : ''}</div>
        </div>
        <div class="summary-card fade-in">
            <div class="value">${avgTTFT}</div>
            <div class="label">Avg TTFT (ms)</div>
        </div>
        <div class="summary-card fade-in">
            <div class="value">${avgLatency}</div>
            <div class="label">Avg Latency (ms)</div>
        </div>
        <div class="summary-card fade-in">
            <div class="value">${avgTPS}</div>
            <div class="label">Avg TPS</div>
        </div>
        <div class="summary-card fade-in">
            <div class="value" style="font-size:1.3rem">${fastest.region}</div>
            <div class="label">Fastest TTFT (${fastest.avg_ttft_ms.toFixed(1)} ms)</div>
        </div>
        <div class="summary-card fade-in">
            <div class="value" style="font-size:1.3rem">${highestTPS.model}</div>
            <div class="label">Highest TPS (${highestTPS.avg_tps} t/s)</div>
        </div>
        <div class="summary-card fade-in">
            <div class="value">${avgCacheHit}</div>
            <div class="label">Cache Hit Rate</div>
        </div>
        <div class="summary-card fade-in">
            <div class="value">${errorCount}/${n}</div>
            <div class="label">Tests with Errors</div>
        </div>
    `;
}

function renderResultTable() {
    const tbody = document.getElementById('result-tbody');
    tbody.innerHTML = allResults.map(r => `
        <tr>
            <td>${r.round || 1}</td>
            <td>${r.region}</td>
            <td>${r.model}</td>
            <td>${r.api_type}</td>
            <td>${r.reasoning_effort || '-'}</td>
            <td>${r.avg_ttfb_ms ? r.avg_ttfb_ms.toFixed(1) : '-'}</td>
            <td title="${r.avg_ttft_ms ? `±${r.std_ttft_ms.toFixed(1)} (${r.min_ttft_ms.toFixed(1)}~${r.max_ttft_ms.toFixed(1)})` : ''}">${r.avg_ttft_ms ? r.avg_ttft_ms.toFixed(1) : '-'}</td>
            <td>${r.p50_ttft_ms ? r.p50_ttft_ms.toFixed(1) : '-'}</td>
            <td>${r.p95_ttft_ms ? r.p95_ttft_ms.toFixed(1) : '-'}</td>
            <td>${r.p99_ttft_ms ? r.p99_ttft_ms.toFixed(1) : '-'}</td>
            <td title="±${r.std_latency_ms.toFixed(1)} (${r.min_latency_ms.toFixed(1)}~${r.max_latency_ms.toFixed(1)})">${r.avg_latency_ms.toFixed(1)}</td>
            <td>${r.avg_tps ? r.avg_tps.toFixed(1) : '-'}</td>
            <td>${r.error_rate > 0 ? `<span class="error-cell">${(r.error_rate * 100).toFixed(1)}%</span>` : '0%'}</td>
        </tr>
    `).join('');
}

function getModelEffortKeys() {
    const hasMultiEffort = new Set(allResults.map(r => r.reasoning_effort || '')).size > 1;
    const keys = [...new Set(allResults.map(r => {
        const effort = r.reasoning_effort || '';
        return hasMultiEffort && effort ? `${r.model} (${effort})` : r.model;
    }))];
    // Build a map from key → filter function
    const keyFilters = {};
    keys.forEach(key => {
        const match = key.match(/^(.+) \((.+)\)$/);
        if (match) {
            keyFilters[key] = r => r.model === match[1] && r.reasoning_effort === match[2];
        } else {
            keyFilters[key] = r => r.model === key && (!hasMultiEffort || !r.reasoning_effort);
        }
    });
    return { keys, keyFilters, hasMultiEffort };
}

function barMargins(numRegions) {
    // When few x-axis categories, add horizontal padding so bars don't stretch full width
    if (numRegions <= 2) return { l: 80, r: 80, t: 50, b: 100, pad: 20 };
    return {};
}

function renderTTFTChart() {
    const container = document.getElementById('chart-ttft');
    if (!allResults.some(r => r.avg_ttft_ms > 0)) { container.style.display = 'none'; return; }
    container.style.display = '';
    const { keys: modelKeys, keyFilters } = getModelEffortKeys();
    const regions = [...new Set(allResults.map(r => r.region))];

    const traces = modelKeys.map((key, i) => {
        const vals = regions.map(region => {
            const match = allResults.find(r => r.region === region && keyFilters[key](r));
            return match ? match.avg_ttft_ms : 0;
        });
        return {
            name: key, type: 'bar', x: regions, y: vals,
            text: vals.map(v => v > 0 ? v.toFixed(0) : ''),
            textposition: 'outside', textfont: { size: 11 },
            marker: { color: CHART_COLORS[i % CHART_COLORS.length] },
        };
    });

    Plotly.newPlot(container, traces, mergeLayout({
        title: { text: 'Average TTFT by Region' },
        barmode: 'group',
        xaxis: { title: 'Region', tickangle: -45 },
        yaxis: { title: 'TTFT (ms)' },
        margin: barMargins(regions.length),
    }), { responsive: true });
}

function renderLatencyChart() {
    const container = document.getElementById('chart-latency');
    const { keys: modelKeys, keyFilters } = getModelEffortKeys();
    const regions = [...new Set(allResults.map(r => r.region))];

    const traces = modelKeys.map((key, i) => {
        const vals = regions.map(region => {
            const match = allResults.find(r => r.region === region && keyFilters[key](r));
            return match ? match.avg_latency_ms : 0;
        });
        return {
            name: key, type: 'bar', x: regions, y: vals,
            text: vals.map(v => v > 0 ? v.toFixed(0) : ''),
            textposition: 'outside', textfont: { size: 11 },
            marker: { color: CHART_COLORS[i % CHART_COLORS.length] },
        };
    });

    Plotly.newPlot(container, traces, mergeLayout({
        title: { text: 'Average Total Latency by Region' },
        barmode: 'group',
        xaxis: { title: 'Region', tickangle: -45 },
        yaxis: { title: 'Latency (ms)' },
        margin: barMargins(regions.length),
    }), { responsive: true });
}

function renderTPSChart() {
    const container = document.getElementById('chart-tps');
    if (!allResults.some(r => r.avg_tps > 0)) { container.style.display = 'none'; return; }
    container.style.display = '';
    const { keys: modelKeys, keyFilters } = getModelEffortKeys();
    const regions = [...new Set(allResults.map(r => r.region))];

    const traces = modelKeys.map((key, i) => {
        const vals = regions.map(region => {
            const match = allResults.find(r => r.region === region && keyFilters[key](r));
            return match ? match.avg_tps : 0;
        });
        return {
            name: key, type: 'bar', x: regions, y: vals,
            text: vals.map(v => v > 0 ? v.toFixed(1) : ''),
            textposition: 'outside', textfont: { size: 11 },
            marker: { color: CHART_COLORS[i % CHART_COLORS.length] },
        };
    });

    Plotly.newPlot(container, traces, mergeLayout({
        title: { text: 'Tokens Per Second by Region' },
        barmode: 'group',
        xaxis: { title: 'Region', tickangle: -45 },
        yaxis: { title: 'TPS' },
        margin: barMargins(regions.length),
    }), { responsive: true });
}

function renderTTFTPercentilesChart() {
    const container = document.getElementById('chart-ttft-percentiles');
    if (!allResults.some(r => r.p50_ttft_ms > 0)) { container.style.display = 'none'; return; }
    container.style.display = '';
    const { hasMultiEffort } = getModelEffortKeys();
    const labels = allResults.map(r => {
        const base = `${r.region} / ${r.model}`;
        return hasMultiEffort && r.reasoning_effort ? `${base} (${r.reasoning_effort})` : base;
    });

    const p50 = allResults.map(r => r.p50_ttft_ms);
    const p95 = allResults.map(r => r.p95_ttft_ms);
    const p99 = allResults.map(r => r.p99_ttft_ms);
    const avg = allResults.map(r => r.avg_ttft_ms);

    const traces = [
        {
            name: 'P50 TTFT', type: 'bar', x: labels, y: p50,
            text: p50.map(v => v > 0 ? v.toFixed(0) : ''),
            textposition: 'outside', textfont: { size: 10 },
            marker: { color: COLORS.secondary },
        },
        {
            name: 'P95 TTFT', type: 'bar', x: labels, y: p95,
            text: p95.map(v => v > 0 ? v.toFixed(0) : ''),
            textposition: 'outside', textfont: { size: 10 },
            marker: { color: COLORS.primary },
        },
        {
            name: 'P99 TTFT', type: 'bar', x: labels, y: p99,
            text: p99.map(v => v > 0 ? v.toFixed(0) : ''),
            textposition: 'outside', textfont: { size: 10 },
            marker: { color: '#EF4444' },
        },
        {
            name: 'Avg TTFT', type: 'scatter', mode: 'markers+text',
            x: labels, y: avg,
            text: avg.map(v => v > 0 ? v.toFixed(0) : ''),
            textposition: 'top center', textfont: { size: 10, color: '#F59E0B' },
            marker: { color: '#F59E0B', size: 8, symbol: 'diamond' },
        },
    ];

    Plotly.newPlot(container, traces, mergeLayout({
        title: { text: 'TTFT Percentiles (P50 / P95 / P99 / Avg)' },
        barmode: 'group',
        xaxis: { tickangle: -45 },
        yaxis: { title: 'TTFT (ms)' },
    }), { responsive: true });
}

function renderHeatmap() {
    const container = document.getElementById('chart-heatmap');
    if (!allResults.some(r => r.avg_ttft_ms > 0)) { container.style.display = 'none'; return; }
    container.style.display = '';
    const { hasMultiEffort } = getModelEffortKeys();

    // Build unique Y-axis labels: model (api_type) [effort]
    const yLabels = [];
    const yResults = [];
    allResults.forEach(r => {
        let label = `${r.model} (${r.api_type})`;
        if (hasMultiEffort && r.reasoning_effort) label += ` [${r.reasoning_effort}]`;
        if (!yLabels.includes(label)) {
            yLabels.push(label);
            yResults.push([]);
        }
        const idx = yLabels.indexOf(label);
        yResults[idx].push(r);
    });

    const regions = [...new Set(allResults.map(r => r.region))];

    const z = yLabels.map((_, yi) =>
        regions.map(region => {
            const match = yResults[yi].find(r => r.region === region);
            return match ? match.avg_ttft_ms : null;
        })
    );

    // Text annotations showing values
    const textVals = z.map(row => row.map(v => v != null ? v.toFixed(0) : ''));

    Plotly.newPlot(container, [{
        type: 'heatmap',
        z,
        x: regions,
        y: yLabels,
        text: textVals,
        texttemplate: '%{text}',
        colorscale: [
            [0, '#10B981'],
            [0.5, '#F59E0B'],
            [1, '#EF4444'],
        ],
        hovertemplate: 'Region: %{x}<br>%{y}<br>TTFT: %{z:.1f} ms<extra></extra>',
        colorbar: { title: 'TTFT (ms)', titleside: 'right' },
    }], mergeLayout({
        title: { text: 'TTFT Heatmap' },
        xaxis: { tickangle: -45 },
        margin: { l: 200, r: 80, t: 50, b: 100 },
        height: Math.max(400, yLabels.length * 40 + 150),
    }), { responsive: true });
}

function renderLatencyBreakdownChart() {
    const container = document.getElementById('chart-latency-breakdown');
    // Need TTFB data to show a meaningful breakdown
    if (!allResults.some(r => r.avg_ttfb_ms > 0)) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    const { hasMultiEffort } = getModelEffortKeys();

    const labels = [];
    const networkVals = [];   // network probe baseline
    const backendVals = [];   // backend processing estimate
    const ttftDelta = [];     // TTFT - TTFB (model warm-up / first token delay)
    const tokenGenVals = [];  // token generation

    allResults.forEach(r => {
        let label = `${r.region} / ${r.model} (${r.api_type})`;
        if (hasMultiEffort && r.reasoning_effort) label += ` [${r.reasoning_effort}]`;
        labels.push(label);

        const net = r.network_probe_ms || 0;
        const backend = r.avg_backend_est_ms || 0;
        const ttfb = r.avg_ttfb_ms || 0;
        const ttft = r.avg_ttft_ms || 0;
        const tgen = r.avg_token_gen_ms || 0;
        const firstTokenDelay = Math.max(ttft - ttfb, 0);

        networkVals.push(Math.round(net));
        backendVals.push(Math.round(backend));
        ttftDelta.push(Math.round(firstTokenDelay));
        tokenGenVals.push(Math.round(tgen));
    });

    const traces = [
        {
            name: 'Network (DNS+TCP+TLS)',
            type: 'bar', x: labels, y: networkVals,
            marker: { color: '#8DC8E8' },
            hovertemplate: '%{y} ms<extra>Network</extra>',
        },
        {
            name: 'Backend Processing',
            type: 'bar', x: labels, y: backendVals,
            marker: { color: '#6366F1' },
            hovertemplate: '%{y} ms<extra>Backend</extra>',
        },
        {
            name: 'First Token Delay',
            type: 'bar', x: labels, y: ttftDelta,
            marker: { color: '#F59E0B' },
            hovertemplate: '%{y} ms<extra>First Token Delay</extra>',
        },
        {
            name: 'Token Generation',
            type: 'bar', x: labels, y: tokenGenVals,
            marker: { color: '#10B981' },
            hovertemplate: '%{y} ms<extra>Token Gen</extra>',
        },
    ];

    Plotly.newPlot(container, traces, mergeLayout({
        title: { text: 'Latency Breakdown (Network → Backend → First Token → Generation)' },
        barmode: 'stack',
        xaxis: { tickangle: -45 },
        yaxis: { title: 'Latency (ms)' },
        margin: { l: 60, r: 20, t: 50, b: 150 },
    }), { responsive: true });
}

function renderNetworkTimingChart() {
    const container = document.getElementById('chart-network');
    const hasNetwork = allResults.some(r => r.avg_tcp_connect_ms > 0 || r.avg_tls_ms > 0);

    if (!hasNetwork) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    const { keys: modelKeys, keyFilters } = getModelEffortKeys();
    const regions = [...new Set(allResults.map(r => r.region))];

    const labels = [];
    const tcpVals = [];
    const tlsVals = [];
    const serverVals = [];

    for (const region of regions) {
        for (const key of modelKeys) {
            const match = allResults.find(r => r.region === region && keyFilters[key](r));
            if (match) {
                labels.push(`${region} / ${key}`);
                tcpVals.push(match.avg_tcp_connect_ms);
                tlsVals.push(match.avg_tls_ms);
                const serverTime = Math.max(match.avg_latency_ms - match.avg_tcp_connect_ms - match.avg_tls_ms, 0);
                serverVals.push(round2(serverTime));
            }
        }
    }

    function round2(v) { return Math.round(v * 100) / 100; }

    const traces = [
        {
            name: 'TCP Connect',
            type: 'bar',
            x: labels,
            y: tcpVals,
            marker: { color: '#8DC8E8' },
            hovertemplate: '%{y:.1f} ms<extra>TCP</extra>',
        },
        {
            name: 'TLS Handshake',
            type: 'bar',
            x: labels,
            y: tlsVals,
            marker: { color: '#0078D4' },
            hovertemplate: '%{y:.1f} ms<extra>TLS</extra>',
        },
        {
            name: 'Server + Transfer',
            type: 'bar',
            x: labels,
            y: serverVals,
            marker: { color: '#8661C5' },
            hovertemplate: '%{y:.1f} ms<extra>Server</extra>',
        },
    ];

    Plotly.newPlot(container, traces, mergeLayout({
        title: { text: 'Network Timing Breakdown (TCP + TLS + Server)' },
        barmode: 'stack',
        xaxis: { tickangle: -45 },
        yaxis: { title: 'Latency (ms)' },
    }), { responsive: true });
}

function renderCacheChart() {
    const container = document.getElementById('chart-cache');
    const allCacheResults = allResults.filter(r => r.cache && (r.cache.miss_latency_ms > 0 || r.cache.hit_latency_ms > 0));

    if (allCacheResults.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    const { hasMultiEffort } = getModelEffortKeys();

    const hitResults = allCacheResults.filter(r => r.cache.cached_tokens > 0);
    const missResults = allCacheResults.filter(r => r.cache.cached_tokens === 0);
    const maxLatency = Math.max(...allCacheResults.flatMap(r => [r.cache.miss_latency_ms, r.cache.hit_latency_ms]));

    function buildLabel(r) {
        const base = `${r.region} / ${r.model}`;
        return hasMultiEffort && r.reasoning_effort ? `${base} (${r.reasoning_effort})` : base;
    }

    const hitCards = hitResults.map(r => {
        const c = r.cache;
        const label = buildLabel(r);
        const missPct = maxLatency > 0 ? (c.miss_latency_ms / maxLatency * 100) : 0;
        const hitPct  = maxLatency > 0 ? (c.hit_latency_ms / maxLatency * 100) : 0;
        const hitRate = (c.hit_rate * 100).toFixed(1);
        const speedup = c.speedup_pct.toFixed(1);
        const hitRateClass = c.hit_rate >= 0.5 ? 'good' : 'warn';
        const speedupClass = c.speedup_pct >= 10 ? 'good' : c.speedup_pct > 0 ? 'warn' : '';

        return `
            <div class="cache-card fade-in">
                <div class="cache-card-title">${label} (${r.api_type})</div>
                <div class="cache-bar-row">
                    <span class="cache-bar-label">Miss</span>
                    <div class="cache-bar-track">
                        <div class="cache-bar-fill miss" style="width:${missPct}%"></div>
                    </div>
                    <span class="cache-bar-value">${c.miss_latency_ms.toFixed(0)} ms</span>
                </div>
                <div class="cache-bar-row">
                    <span class="cache-bar-label">Hit</span>
                    <div class="cache-bar-track">
                        <div class="cache-bar-fill hit" style="width:${hitPct}%"></div>
                    </div>
                    <span class="cache-bar-value">${c.hit_latency_ms.toFixed(0)} ms</span>
                </div>
                <div class="cache-stats">
                    <div class="cache-stat">
                        <span class="cache-stat-value ${hitRateClass}">${hitRate}%</span>
                        <span class="cache-stat-label">Hit Rate</span>
                    </div>
                    <div class="cache-stat">
                        <span class="cache-stat-value ${speedupClass}">${speedup}%</span>
                        <span class="cache-stat-label">Speedup</span>
                    </div>
                    <div class="cache-stat">
                        <span class="cache-stat-value">${c.cached_tokens} / ${c.prompt_tokens}</span>
                        <span class="cache-stat-label">Cached / Prompt Tokens</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    const missCards = missResults.map(r => {
        const label = buildLabel(r);
        return `
            <div class="cache-card fade-in" style="opacity:0.7">
                <div class="cache-card-title">${label} (${r.api_type})</div>
                <div style="color:var(--text-secondary);font-size:0.85rem;padding:0.5rem 0">
                    No cache hit detected — this model/region may not support prompt caching, or the prompt is too short.
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="card-title" style="margin-bottom:1rem">Prompt Cache Results</div>
        <div class="cache-cards">${hitCards}${missCards}</div>
    `;
}

function renderRoundTrendChart() {
    const container = document.getElementById('chart-round-trend');
    const totalRounds = Math.max(...allResults.map(r => r.round || 1));

    if (totalRounds <= 1) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    // Group by region×model×api_type×effort combo
    const { hasMultiEffort } = getModelEffortKeys();
    const combos = {};
    allResults.forEach(r => {
        const effortSuffix = hasMultiEffort && r.reasoning_effort ? ` [${r.reasoning_effort}]` : '';
        const key = `${r.model} (${r.api_type})${effortSuffix}`;
        if (!combos[key]) combos[key] = {};
        combos[key][r.round || 1] = r;
    });

    const roundNums = Array.from({length: totalRounds}, (_, i) => i + 1);

    // Build separate TTFT and Latency traces
    const ttftTraces = [];
    const latencyTraces = [];
    let colorIdx = 0;

    for (const [label, rounds] of Object.entries(combos)) {
        const color = CHART_COLORS[colorIdx % CHART_COLORS.length];
        const ttftVals = roundNums.map(rn => rounds[rn] && rounds[rn].avg_ttft_ms ? rounds[rn].avg_ttft_ms : null);
        const latVals = roundNums.map(rn => rounds[rn] ? rounds[rn].avg_latency_ms : null);

        // Only add TTFT trace if there are non-null values
        if (ttftVals.some(v => v != null && v > 0)) {
            ttftTraces.push({
                name: label,
                type: 'scatter',
                mode: 'lines+markers',
                x: roundNums,
                y: ttftVals,
                line: { color },
                marker: { size: 6 },
            });
        }

        latencyTraces.push({
            name: label,
            type: 'scatter',
            mode: 'lines+markers',
            x: roundNums,
            y: latVals,
            line: { color },
            marker: { size: 6 },
        });

        colorIdx++;
    }

    // Render two stacked charts in one container
    container.innerHTML = '<div id="chart-round-ttft" style="margin-bottom:1rem"></div><div id="chart-round-latency"></div>';

    if (ttftTraces.length > 0) {
        Plotly.newPlot('chart-round-ttft', ttftTraces, mergeLayout({
            title: { text: 'TTFT Trend by Round' },
            xaxis: { title: 'Round', dtick: 1 },
            yaxis: { title: 'Avg TTFT (ms)' },
        }), { responsive: true });
    }

    Plotly.newPlot('chart-round-latency', latencyTraces, mergeLayout({
        title: { text: 'Latency Trend by Round' },
        xaxis: { title: 'Round', dtick: 1 },
        yaxis: { title: 'Avg Latency (ms)' },
    }), { responsive: true });
}

// ==================== Monitor Mode ====================

let monitorTraces = {};

function initMonitorChart() {
    monitorTraces = {};
    const container = document.getElementById('chart-monitor-live');
    Plotly.newPlot(container, [], mergeLayout({
        title: { text: 'Live Latency Monitor' },
        xaxis: { title: 'Time', type: 'date' },
        yaxis: { title: 'Latency (ms)' },
    }), { responsive: true });
}

function handleMonitorPoint(data) {
    const m = data.metrics;
    if (m.error) return;

    const effort = data.reasoning_effort || '';
    const key = `${data.region}/${data.model}/${data.api_type}${effort ? '/' + effort : ''}`;
    const container = document.getElementById('chart-monitor-live');

    if (!monitorTraces[key]) {
        const idx = Object.keys(monitorTraces).length;
        monitorTraces[key] = { index: idx };
        Plotly.addTraces(container, {
            name: key,
            type: 'scatter',
            mode: 'lines+markers',
            x: [data.timestamp],
            y: [m.total_latency_ms],
            line: { color: CHART_COLORS[idx % CHART_COLORS.length] },
            marker: { size: 5 },
        });
    } else {
        Plotly.extendTraces(container, {
            x: [[data.timestamp]],
            y: [[m.total_latency_ms]],
        }, [monitorTraces[key].index]);
    }

    // Also add to live table
    const tbody = document.getElementById('live-tbody');
    const row = document.createElement('tr');
    row.className = 'fade-in';
    const ttft = m.ttft_ms != null ? m.ttft_ms.toFixed(1) : '-';
    row.innerHTML = `
        <td>${data.probe || '-'}</td>
        <td>${data.region}</td>
        <td>${data.model}</td>
        <td>${data.api_type}</td>
        <td>${data.reasoning_effort || '-'}</td>
        <td>1</td>
        <td>${ttft}</td>
        <td>${m.total_latency_ms.toFixed(1)}</td>
        <td>${m.tokens_per_second ? m.tokens_per_second.toFixed(1) : '-'}</td>
        <td><span style="color:var(--success)">OK</span></td>
        <td>${m.request_id ? `<span class="copy-id" onclick="copyId(this,'${m.request_id}')">${m.request_id.substring(0, 8)}</span>` : '-'}</td>
    `;
    tbody.appendChild(row);
    tbody.parentElement.parentElement.scrollTop = tbody.parentElement.parentElement.scrollHeight;
}

// ==================== Table Sorting ====================

let sortState = {};

function sortTable(tableId, colIdx) {
    const table = document.getElementById(tableId);
    const tbody = table.querySelector('tbody');
    const rows = [...tbody.querySelectorAll('tr')];

    const key = `${tableId}-${colIdx}`;
    const asc = sortState[key] = !sortState[key];

    rows.sort((a, b) => {
        const aVal = a.cells[colIdx].textContent.trim();
        const bVal = b.cells[colIdx].textContent.trim();
        const aNum = parseFloat(aVal);
        const bNum = parseFloat(bVal);

        if (!isNaN(aNum) && !isNaN(bNum)) {
            return asc ? aNum - bNum : bNum - aNum;
        }
        return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

    rows.forEach(row => tbody.appendChild(row));
}

// ==================== Export ====================

function copyId(el, fullId) {
    navigator.clipboard.writeText(fullId);
    const orig = el.textContent;
    el.textContent = 'Copied!';
    setTimeout(() => el.textContent = orig, 1000);
}

function downloadExport(fmt) {
    if (!currentRunId) return;
    window.location = `/api/benchmark/${currentRunId}/export/${fmt}`;
}

function resetToConfig() {
    showPhase('config');
    allResults = [];
    currentRunId = null;
}

// Init region list
updateRegionList();
