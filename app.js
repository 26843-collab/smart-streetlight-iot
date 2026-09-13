/**
 * Smart Streetlight IoT - Web Dashboard Application Logic
 * Supports both standalone Simulation Mode & Real ESP32 Hardware Integration
 */

// ==========================================================================
// Application State
// ==========================================================================
const state = {
  mode: 'AUTO',             // 'AUTO' | 'MANUAL_ON' | 'MANUAL_OFF' | 'TIMER'
  ledState: false,          // true = ON (Active LOW in hardware), false = OFF
  distance: 180,            // current distance in cm
  isVehicleInRange: false,  // true if distance < 30 cm

  // 5-second hold-off timer logic after vehicle leaves
  holdOffDuration: 5.0,     // 5 seconds
  holdOffRemaining: 0,      // remaining countdown
  holdOffIntervalId: null,
  detectionStartTime: null, // to measure duration

  // Timer Override (e.g. 12 Hours)
  timerTotalSeconds: 0,
  timerRemainingSeconds: 0,
  timerIntervalId: null,
  timerMultiplier: 1,       // 1x, 60x, 3600x for fast simulation

  // Real Hardware ESP32 Config
  isSimulation: true,
  espIp: 'http://192.168.50.219',
  hardwarePollingId: null,

  // Historical Analytics & Logs
  vehicleCount: 0,
  logs: [],
  hourlyTraffic: new Array(24).fill(0)
};

// ==========================================================================
// DOM Elements
// ==========================================================================
const DOM = {
  // Connection & Settings
  connectionBadge: document.getElementById('connectionBadge'),
  connectionText: document.getElementById('connectionText'),
  btnSettings: document.getElementById('btnSettings'),
  settingsModal: document.getElementById('settingsModal'),
  btnCloseModal: document.getElementById('btnCloseModal'),
  btnSaveSettings: document.getElementById('btnSaveSettings'),
  chkSimulationMode: document.getElementById('chkSimulationMode'),
  espIpInput: document.getElementById('espIpInput'),
  esp32ConfigGroup: document.getElementById('esp32ConfigGroup'),
  btnTestEspConnection: document.getElementById('btnTestEspConnection'),
  pingResultText: document.getElementById('pingResultText'),

  // Visualizer / Street Scene
  btnSimulateVehicle: document.getElementById('btnSimulateVehicle'),
  btnSimulateLeave: document.getElementById('btnSimulateLeave'),
  bulbEmitter: document.getElementById('bulbEmitter'),
  lightCone: document.getElementById('lightCone'),
  radarBeam: document.getElementById('radarBeam'),
  vehicleActor: document.getElementById('vehicleActor'),
  vehicleDistTag: document.getElementById('vehicleDistTag'),

  // HUD Elements
  hudLightStatus: document.getElementById('hudLightStatus'),
  hudModeStatus: document.getElementById('hudModeStatus'),
  hudDistance: document.getElementById('hudDistance'),
  hudTimerBox: document.getElementById('hudTimerBox'),
  hudTimerValue: document.getElementById('hudTimerValue'),

  // Control Buttons
  btnSetAutoMode: document.getElementById('btnSetAutoMode'),
  btnSetManualOn: document.getElementById('btnSetManualOn'),
  btnSetManualOff: document.getElementById('btnSetManualOff'),
  currentModeBadge: document.getElementById('currentModeBadge'),

  // 5-Sec Delay Progress
  delayCountdownText: document.getElementById('delayCountdownText'),
  delayProgressBar: document.getElementById('delayProgressBar'),

  // Timer Override Controls
  btn12Hours: document.getElementById('btn12Hours'),
  btn1Hour: document.getElementById('btn1Hour'),
  btn30Mins: document.getElementById('btn30Mins'),
  btn30SecDemo: document.getElementById('btn30SecDemo'),
  customHoursInput: document.getElementById('customHoursInput'),
  customMinsInput: document.getElementById('customMinsInput'),
  btnStartCustomTimer: document.getElementById('btnStartCustomTimer'),

  // Active Timer UI
  activeTimerBox: document.getElementById('activeTimerBox'),
  timerTotalDurationText: document.getElementById('timerTotalDurationText'),
  bigCountdownDisplay: document.getElementById('bigCountdownDisplay'),
  timerProgressBar: document.getElementById('timerProgressBar'),
  btnCancelTimer: document.getElementById('btnCancelTimer'),
  speedChips: document.querySelectorAll('.speed-accelerator .btn-chip'),

  // Metrics
  metricTotalVehicles: document.getElementById('metricTotalVehicles'),
  metricEnergySaved: document.getElementById('metricEnergySaved'),
  metricCurrentDistance: document.getElementById('metricCurrentDistance'),
  metricDistanceStatus: document.getElementById('metricDistanceStatus'),
  metricRelayPin: document.getElementById('metricRelayPin'),

  // Analytics & History Table
  btnExportCSV: document.getElementById('btnExportCSV'),
  btnClearHistory: document.getElementById('btnClearHistory'),
  searchInput: document.getElementById('searchInput'),
  logsTableBody: document.getElementById('logsTableBody'),
  tableCountSummary: document.getElementById('tableCountSummary')
};

let trafficChart = null;

// ==========================================================================
// Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initSampleData();
  initChart();
  bindEvents();
  updateUI();
  updateConnectionStatusUI();
  setupHardwarePolling();
});

// Populate initial baseline sample history so the student's chart & table look rich immediately
function initSampleData() {
  const now = new Date();
  const sampleTimes = [
    { minsAgo: 85, dist: 14, dur: 7.4, type: 'รถเก๋ง / รถส่วนบุคคล' },
    { minsAgo: 50, dist: 18, dur: 6.8, type: 'รถจักรยานยนต์' },
    { minsAgo: 25, dist: 22, dur: 8.1, type: 'รถบรรทุกขนาดเล็ก' },
    { minsAgo: 10, dist: 12, dur: 6.2, type: 'รถกระบะ' }
  ];

  sampleTimes.forEach((item, idx) => {
    const t = new Date(now.getTime() - item.minsAgo * 60000);
    const hour = t.getHours();
    state.hourlyTraffic[hour] = (state.hourlyTraffic[hour] || 0) + 1;

    state.logs.unshift({
      id: idx + 1,
      timestamp: t.toLocaleDateString('th-TH') + ' ' + t.toLocaleTimeString('th-TH'),
      distance: item.dist,
      duration: item.dur.toFixed(1) + ' วินาที',
      mode: 'AUTO',
      analysis: item.type + ' (ผ่านไฟปกติ)'
    });
  });

  state.vehicleCount = sampleTimes.length;
}

// Initialize Chart.js for traffic density
function initChart() {
  const ctx = document.getElementById('trafficChart').getContext('2d');
  const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

  trafficChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'จำนวนรถยนต์ที่สัญจร (คัน)',
        data: state.hourlyTraffic,
        backgroundColor: 'rgba(245, 158, 11, 0.65)',
        borderColor: '#f59e0b',
        borderWidth: 1,
        borderRadius: 6,
        hoverBackgroundColor: '#fbbf24'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#94a3b8', font: { family: "'Prompt', sans-serif" } }
        },
        tooltip: {
          callbacks: {
            label: (context) => `ตรวจพบ: ${context.parsed.y} คัน`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', font: { family: "'JetBrains Mono', monospace", size: 10 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', stepSize: 1, font: { family: "'JetBrains Mono', monospace" } }
        }
      }
    }
  });
}

// ==========================================================================
// Event Listeners
// ==========================================================================
function bindEvents() {
  // Mode Change Buttons
  DOM.btnSetAutoMode.addEventListener('click', () => setSystemMode('AUTO'));
  DOM.btnSetManualOn.addEventListener('click', () => setSystemMode('MANUAL_ON'));
  DOM.btnSetManualOff.addEventListener('click', () => setSystemMode('MANUAL_OFF'));

  // Timer Preset Buttons
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const duration = parseInt(btn.getAttribute('data-duration'), 10);
      startTimerOverride(duration);
    });
  });

  // Custom Timer Start
  DOM.btnStartCustomTimer.addEventListener('click', () => {
    const hours = parseInt(DOM.customHoursInput.value, 10) || 0;
    const mins = parseInt(DOM.customMinsInput.value, 10) || 0;
    const totalSecs = (hours * 3600) + (mins * 60);
    if (totalSecs <= 0) {
      alert('กรุณาระบุเวลาที่มากกว่า 0 นาที');
      return;
    }
    startTimerOverride(totalSecs);
  });

  // Cancel Timer
  DOM.btnCancelTimer.addEventListener('click', () => {
    cancelTimerOverride();
  });

  // Speed Accelerator for Presentation Demo
  DOM.speedChips.forEach(chip => {
    chip.addEventListener('click', () => {
      DOM.speedChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.timerMultiplier = parseInt(chip.getAttribute('data-multiplier'), 10);
    });
  });

  // Simulation Vehicle Buttons
  DOM.btnSimulateVehicle.addEventListener('click', () => {
    triggerSimulatedVehicleEnter();
  });

  DOM.btnSimulateLeave.addEventListener('click', () => {
    triggerSimulatedVehicleLeave();
  });

  // Export CSV
  DOM.btnExportCSV.addEventListener('click', exportLogsToCSV);

  // Clear History
  DOM.btnClearHistory.addEventListener('click', () => {
    if (confirm('คุณต้องการล้างข้อมูลประวัติการจราจรทั้งหมดหรือไม่?')) {
      state.logs = [];
      state.vehicleCount = 0;
      state.hourlyTraffic.fill(0);
      if (trafficChart) trafficChart.update();
      updateHistoryTable();
      updateMetrics();
      if (!state.isSimulation) {
        fetch(`${state.espIp}/api/clear-logs`, { method: 'POST' }).catch(() => {});
      }
    }
  });

  // Search Filter
  DOM.searchInput.addEventListener('input', (e) => {
    renderFilteredLogs(e.target.value);
  });

  // Settings Modal
  DOM.btnSettings.addEventListener('click', () => {
    DOM.settingsModal.style.display = 'flex';
  });
  DOM.btnCloseModal.addEventListener('click', () => {
    DOM.settingsModal.style.display = 'none';
  });
  DOM.chkSimulationMode.addEventListener('change', (e) => {
    DOM.esp32ConfigGroup.style.opacity = e.target.checked ? '0.5' : '1';
    DOM.esp32ConfigGroup.style.pointerEvents = e.target.checked ? 'none' : 'auto';
  });
  DOM.btnSaveSettings.addEventListener('click', () => {
    state.isSimulation = DOM.chkSimulationMode.checked;
    state.espIp = DOM.espIpInput.value.trim().replace(/\/$/, '');
    DOM.settingsModal.style.display = 'none';
    setupHardwarePolling();
    updateConnectionStatusUI();
  });

  DOM.btnTestEspConnection.addEventListener('click', async () => {
    DOM.pingResultText.textContent = 'กำลังทดสอบเชื่อมต่อ...';
    try {
      const url = `${DOM.espIpInput.value.trim().replace(/\/$/, '')}/api/status`;
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        DOM.pingResultText.textContent = '✅ เชื่อมต่อ ESP32 สำเร็จ!';
        DOM.pingResultText.style.color = '#10b981';
      } else {
        throw new Error('Status: ' + res.status);
      }
    } catch (err) {
      DOM.pingResultText.textContent = '❌ ไม่สามารถเชื่อมต่อได้ (ตรวจสอบ IP หรือ WiFi)';
      DOM.pingResultText.style.color = '#f43f5e';
    }
  });
}

// ==========================================================================
// Core State & Logic Handlers
// ==========================================================================

function setSystemMode(newMode) {
  state.mode = newMode;

  if (newMode === 'AUTO') {
    // If timer was running, clear it
    clearTimerInterval();
    DOM.activeTimerBox.style.display = 'none';
    DOM.hudTimerBox.style.display = 'none';

    // Check current sensor distance
    if (state.isVehicleInRange) {
      turnLamp(true);
    } else {
      turnLamp(false);
    }
  } else if (newMode === 'MANUAL_ON') {
    clearTimerInterval();
    clearHoldOffCountdown();
    DOM.activeTimerBox.style.display = 'none';
    DOM.hudTimerBox.style.display = 'none';
    turnLamp(true);
  } else if (newMode === 'MANUAL_OFF') {
    clearTimerInterval();
    clearHoldOffCountdown();
    DOM.activeTimerBox.style.display = 'none';
    DOM.hudTimerBox.style.display = 'none';
    turnLamp(false);
  }

  updateUI();

  // If connected to real hardware, send command
  if (!state.isSimulation) {
    sendHardwareControl({ mode: newMode, state: state.ledState ? 'ON' : 'OFF' });
  }
}

// Start Timer Override Mode (e.g. 12 Hours)
function startTimerOverride(durationSeconds) {
  state.mode = 'TIMER';
  state.timerTotalSeconds = durationSeconds;
  state.timerRemainingSeconds = durationSeconds;

  clearTimerInterval();
  clearHoldOffCountdown();

  // Turn light ON immediately
  turnLamp(true);

  // Format total duration label
  const h = Math.floor(durationSeconds / 3600);
  const m = Math.floor((durationSeconds % 3600) / 60);
  const s = durationSeconds % 60;
  let label = '';
  if (h > 0) label += `${h} ชม. `;
  if (m > 0) label += `${m} นาที `;
  if (s > 0 && h === 0) label += `${s} วินาที`;
  DOM.timerTotalDurationText.textContent = `ระยะเวลารวม: ${label.trim()}`;

  DOM.activeTimerBox.style.display = 'flex';
  DOM.hudTimerBox.style.display = 'flex';
  updateTimerCountdownDisplay();

  // Run timer interval
  state.timerIntervalId = setInterval(() => {
    state.timerRemainingSeconds -= (1 * state.timerMultiplier);

    if (state.timerRemainingSeconds <= 0) {
      state.timerRemainingSeconds = 0;
      clearTimerInterval();
      onTimerCompleted();
    } else {
      updateTimerCountdownDisplay();
    }
  }, 1000);

  updateUI();

  if (!state.isSimulation) {
    sendHardwareControl({ mode: 'TIMER', duration: durationSeconds });
  }
}

function updateTimerCountdownDisplay() {
  const total = state.timerRemainingSeconds;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  DOM.bigCountdownDisplay.textContent = formatted;
  DOM.hudTimerValue.textContent = formatted;

  const percent = ((state.timerRemainingSeconds / state.timerTotalSeconds) * 100).toFixed(1);
  DOM.timerProgressBar.style.width = `${percent}%`;
}

// Triggered when 12 Hours timer expires -> Automatically reverts to AUTO Mode!
function onTimerCompleted() {
  alert('🔔 ครบกำหนดเวลาตั้งเวลาเปิดไฟแล้ว! ระบบได้สลับกลับเข้าสู่ "โหมดอัตโนมัติ (AUTO)" ตามเดิมเรียบร้อยแล้ว');
  setSystemMode('AUTO');
}

function cancelTimerOverride() {
  clearTimerInterval();
  setSystemMode('AUTO');
}

function clearTimerInterval() {
  if (state.timerIntervalId) {
    clearInterval(state.timerIntervalId);
    state.timerIntervalId = null;
  }
}

// ==========================================================================
// Simulation of Vehicle Passing & 5-Second Hold-off Logic
// ==========================================================================

function triggerSimulatedVehicleEnter() {
  // Vehicle moves into sensor beam (< 30 cm)
  state.distance = 18; // 18 cm
  state.isVehicleInRange = true;
  state.detectionStartTime = Date.now();

  // Clear any existing hold-off countdown
  clearHoldOffCountdown();

  // In Auto Mode: Turn Light ON immediately
  if (state.mode === 'AUTO') {
    turnLamp(true);
  }

  // Update Animation
  DOM.vehicleActor.classList.add('in-range');
  DOM.vehicleDistTag.textContent = `${state.distance} cm (ตรวจจับได้!)`;
  DOM.radarBeam.classList.add('active');

  updateUI();
}

function triggerSimulatedVehicleLeave() {
  // Vehicle drives past the sensor (> 30 cm)
  state.distance = 180; // 180 cm
  state.isVehicleInRange = false;

  DOM.vehicleActor.classList.remove('in-range');
  DOM.vehicleDistTag.textContent = `${state.distance} cm`;
  DOM.radarBeam.classList.remove('active');

  // In Auto Mode: Start 5-second countdown before turning OFF
  if (state.mode === 'AUTO') {
    start5SecondHoldOff();
  }

  updateUI();
}

function start5SecondHoldOff() {
  clearHoldOffCountdown();

  state.holdOffRemaining = state.holdOffDuration; // 5.0 seconds
  DOM.delayCountdownText.textContent = `${state.holdOffRemaining.toFixed(1)} วินาที`;
  DOM.delayProgressBar.style.width = '100%';

  const stepMs = 100;
  const stepSec = stepMs / 1000;

  state.holdOffIntervalId = setInterval(() => {
    state.holdOffRemaining -= stepSec;

    if (state.holdOffRemaining <= 0) {
      state.holdOffRemaining = 0;
      clearHoldOffCountdown();

      // 5 Seconds elapsed: Turn Light OFF!
      if (state.mode === 'AUTO' && !state.isVehicleInRange) {
        turnLamp(false);

        // Record detection in History Table
        recordVehicleDetectionLog();
      }
    } else {
      const pct = (state.holdOffRemaining / state.holdOffDuration) * 100;
      DOM.delayProgressBar.style.width = `${pct}%`;
      DOM.delayCountdownText.textContent = `${state.holdOffRemaining.toFixed(1)} วินาที`;
    }
  }, stepMs);
}

function clearHoldOffCountdown() {
  if (state.holdOffIntervalId) {
    clearInterval(state.holdOffIntervalId);
    state.holdOffIntervalId = null;
  }
  DOM.delayProgressBar.style.width = '0%';
  DOM.delayCountdownText.textContent = 'ไม่ได้ทำงาน';
}

function recordVehicleDetectionLog() {
  state.vehicleCount++;
  const now = new Date();
  const durSec = state.detectionStartTime
    ? ((now.getTime() - state.detectionStartTime) / 1000) + state.holdOffDuration
    : 7.2;

  const newLog = {
    id: state.logs.length + 1,
    timestamp: now.toLocaleDateString('th-TH') + ' ' + now.toLocaleTimeString('th-TH'),
    distance: 18,
    duration: durSec.toFixed(1) + ' วินาที',
    mode: state.mode,
    analysis: 'ตรวจพบรถยนต์สัญจร (เปิดไฟอัตโนมัติ + หน่วง 5 วิ)'
  };

  state.logs.unshift(newLog);

  // Update chart
  const currentHour = now.getHours();
  state.hourlyTraffic[currentHour] = (state.hourlyTraffic[currentHour] || 0) + 1;
  if (trafficChart) trafficChart.update();

  updateHistoryTable();
  updateMetrics();
}

// Helper to switch lamp visual states
function turnLamp(turnOn) {
  state.ledState = turnOn;
  if (turnOn) {
    DOM.bulbEmitter.classList.add('active');
    DOM.lightCone.classList.add('active');
  } else {
    DOM.bulbEmitter.classList.remove('active');
    DOM.lightCone.classList.remove('active');
  }
}

// ==========================================================================
// UI Rendering & Synchronization
// ==========================================================================

function updateUI() {
  // HUD Status
  if (state.ledState) {
    DOM.hudLightStatus.textContent = 'เปิด (ON)';
    DOM.hudLightStatus.className = 'hud-val badge-on';
    DOM.metricRelayPin.textContent = 'ON (LOW)';
    DOM.metricRelayPin.className = 'metric-val text-warning';
  } else {
    DOM.hudLightStatus.textContent = 'ปิด (OFF)';
    DOM.hudLightStatus.className = 'hud-val badge-off';
    DOM.metricRelayPin.textContent = 'OFF (HIGH)';
    DOM.metricRelayPin.className = 'metric-val text-off';
  }

  // HUD Mode
  const modeNames = {
    'AUTO': 'AUTO (อัตโนมัติ)',
    'MANUAL_ON': 'MANUAL (เปิดค้าง)',
    'MANUAL_OFF': 'MANUAL (ปิดค้าง)',
    'TIMER': 'TIMER (ตั้งเวลาพิเศษ)'
  };
  DOM.hudModeStatus.textContent = modeNames[state.mode] || state.mode;
  DOM.hudDistance.textContent = `${state.distance} cm`;

  // Mode Buttons Active State
  DOM.btnSetAutoMode.classList.toggle('active', state.mode === 'AUTO');
  DOM.btnSetManualOn.classList.toggle('active', state.mode === 'MANUAL_ON');
  DOM.btnSetManualOff.classList.toggle('active', state.mode === 'MANUAL_OFF');

  // Badge Text
  const badgeLabels = {
    'AUTO': 'โหมดอัตโนมัติ (เซนเซอร์ + หน่วง 5 วิ)',
    'MANUAL_ON': 'โหมดกำหนดเอง: สั่งเปิดไฟ',
    'MANUAL_OFF': 'โหมดกำหนดเอง: สั่งปิดไฟ',
    'TIMER': 'โหมดตั้งเวลาเปิดค้างพิเศษ'
  };
  DOM.currentModeBadge.textContent = badgeLabels[state.mode];

  updateMetrics();
}

function updateMetrics() {
  DOM.metricTotalVehicles.textContent = state.vehicleCount;
  DOM.metricCurrentDistance.textContent = state.distance;

  if (state.isVehicleInRange) {
    DOM.metricDistanceStatus.textContent = '⚠️ พบวัตถุ (< 30 cm)';
    DOM.metricDistanceStatus.className = 'metric-trend text-warning font-bold';
  } else {
    DOM.metricDistanceStatus.textContent = 'ปกติ (> 30 cm)';
    DOM.metricDistanceStatus.className = 'metric-trend text-muted';
  }
}

function updateHistoryTable() {
  renderFilteredLogs(DOM.searchInput.value);
}

function renderFilteredLogs(query = '') {
  DOM.logsTableBody.innerHTML = '';
  const q = query.toLowerCase().trim();

  const filtered = state.logs.filter(log =>
    log.timestamp.toLowerCase().includes(q) ||
    log.analysis.toLowerCase().includes(q) ||
    log.mode.toLowerCase().includes(q)
  );

  filtered.forEach((log) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="font-mono">${log.id}</td>
      <td>${log.timestamp}</td>
      <td class="font-mono">${log.distance} cm</td>
      <td class="font-mono text-cyan">${log.duration}</td>
      <td><span class="mode-badge" style="font-size: 0.72rem;">${log.mode}</span></td>
      <td>${log.analysis}</td>
    `;
    DOM.logsTableBody.appendChild(tr);
  });

  DOM.tableCountSummary.textContent = `แสดงทั้งหมด ${filtered.length} จาก ${state.logs.length} รายการ`;
}

// Export CSV Function
function exportLogsToCSV() {
  if (state.logs.length === 0) {
    alert('ไม่มีข้อมูลประวัติสำหรับส่งออก');
    return;
  }

  let csvContent = '﻿'; // UTF-8 BOM for Thai characters in Microsoft Excel
  csvContent += 'ลำดับ,วันและเวลา,ระยะทางที่ตรวจพบ (cm),ระยะเวลาเปิดไฟ,โหมดการทำงาน,ผลการวิเคราะห์การจราจร\r\n';

  state.logs.forEach(log => {
    const row = [
      log.id,
      `"${log.timestamp}"`,
      log.distance,
      `"${log.duration}"`,
      `"${log.mode}"`,
      `"${log.analysis}"`
    ];
    csvContent += row.join(',') + '\r\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `traffic_report_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==========================================================================
// ESP32 Real Hardware Integration (REST API)
// ==========================================================================

function updateConnectionStatusUI() {
  if (state.isSimulation) {
    DOM.connectionText.textContent = 'โหมดจำลอง (Simulation)';
    DOM.connectionBadge.style.borderColor = 'rgba(6, 182, 212, 0.3)';
    DOM.connectionBadge.style.color = '#06b6d4';
  } else {
    DOM.connectionText.textContent = `ESP32: ${state.espIp}`;
    DOM.connectionBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    DOM.connectionBadge.style.color = '#10b981';
  }
}

function setupHardwarePolling() {
  if (state.hardwarePollingId) {
    clearInterval(state.hardwarePollingId);
    state.hardwarePollingId = null;
  }

  if (state.isSimulation) return;

  // Poll ESP32 status every 600ms
  state.hardwarePollingId = setInterval(async () => {
    try {
      const res = await fetch(`${state.espIp}/api/status`, { signal: AbortSignal.timeout(1500) });
      if (!res.ok) return;
      const data = await res.json();

      // Sync hardware state
      state.distance = data.distance;
      state.isVehicleInRange = state.distance > 0 && state.distance < 30;
      state.ledState = (data.led === 1 || data.led === true);
      turnLamp(state.ledState);

      if (data.mode) {
        state.mode = data.mode;
      }
      if (data.timerRemaining !== undefined && state.mode === 'TIMER') {
        state.timerRemainingSeconds = data.timerRemaining;
        updateTimerCountdownDisplay();
      }

      updateUI();
    } catch (err) {
      // Hardware communication error handled silently during polling
    }
  }, 600);
}

async function sendHardwareControl(payload) {
  try {
    await fetch(`${state.espIp}/api/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.warn('Failed to send control to ESP32 hardware', e);
  }
}
