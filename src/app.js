const connectBtn = document.getElementById('connectButton');
const calibrateBtn = document.getElementById('calibrateButton');
const resetBtn = document.getElementById('resetButton');
const disconnectBtn = document.getElementById('disconnectButton');
const dot = document.getElementById('dot');
const statusLabel = document.getElementById('statusLabel');
const xVal = document.getElementById('headingVal');
const yVal = document.getElementById('strengthVal');
const zVal = document.getElementById('dheadingVal');
const dxVal = document.getElementById('dstrengthVal');
const dyVal = null;  // niet meer gebruikt
const dzVal = null;  // niet meer gebruikt
const dmVal = null;  // niet meer gebruikt
const bearingVal = null;  // niet meer gebruikt
const messageEl = document.getElementById('message');

const canvas = document.getElementById('viz');
const ctx = canvas.getContext('2d');
let width = 0;
let height = 0;

const latest = { heading: 0, strength: 0 };
const filtered = { heading: 0, strength: 0 };
const baseline = { heading: 0, strength: 0, x: 0, y: 0 };
let device, services, magnetometer;
let lastUpdate = 0;
let isCalibrated = false;
const updateInterval = 200; // milliseconden tussen updates (200ms = 5x per seconde)
const smoothing = 0.15; // Hoe lager, hoe meer smoothing (0.1 = veel smoothing, 0.5 = weinig)

function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    width = canvas.width = rect.width;
    height = canvas.height = rect.height;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function setStatus(text, state = 'idle') {
    statusLabel.textContent = text;
    dot.classList.remove('connected', 'error');
    if (state === 'connected') dot.classList.add('connected');
    if (state === 'error') dot.classList.add('error');
}

function setMessage(msg = '') {
    messageEl.textContent = msg;
}

function setMetrics(data) {
    xVal.textContent = data.heading.toFixed(0);
    yVal.textContent = data.strength.toFixed(0);
    
    const dheading = data.heading - baseline.heading;
    const dstrength = data.strength - baseline.strength;
    
    zVal.textContent = dheading.toFixed(0);
    dxVal.textContent = dstrength.toFixed(0);
    
    if (data.bearing != null) {
        bearingVal.textContent = data.bearing.toFixed(0);
    }
}

function drawPolarGrid() {
    // Teken radialen (voor heading)
    const radialsCount = 8;
    for (let i = 0; i < radialsCount; i++) {
        const angle = (i / radialsCount) * Math.PI * 2;
        const maxRadius = Math.min(width, height) * 0.35;
        const x = Math.cos(angle) * maxRadius;
        const y = Math.sin(angle) * maxRadius;
        
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(x, y);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // Labels (N, NE, E, SE, S, SW, W, NW)
        const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const labelDistance = maxRadius * 1.15;
        const labelX = Math.cos(angle) * labelDistance;
        const labelY = Math.sin(angle) * labelDistance;
        
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = 'bold 16px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labels[i], labelX, labelY);
    }
    
    // Teken concentrische cirkels (voor sterkte)
    const maxRadius = Math.min(width, height) * 0.35;
    const circleSteps = 5;
    for (let i = 1; i <= circleSteps; i++) {
        const radius = (maxRadius / circleSteps) * i;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);

    // Teken polair grid
    drawPolarGrid();

    const maxRadius = Math.min(width, height) * 0.35;
    
    if (isCalibrated) {
        // Na kalibratie: teken 3 vectoren
        
        // Vector 1: Aardmagnetisch veld (baseline) - blauw
        const baselineStrength = Math.sqrt(baseline.x ** 2 + baseline.y ** 2);
        const baselineScale = maxRadius / Math.max(baselineStrength, 50);
        const baselineTip = {
            x: baseline.x * baselineScale,
            y: baseline.y * baselineScale
        };
        drawVectorLine(0, 0, baselineTip.x, baselineTip.y, '#3b82f6', 'Earth Field', baselineStrength);
        
        // Vector 2: Totale magnetisch veld - groen
        const headingRad = filtered.heading * (Math.PI / 180);
        const totalStrength = filtered.strength;
        const totalScale = maxRadius / Math.max(totalStrength, 50);
        const totalTip = {
            x: Math.cos(headingRad) * totalStrength * totalScale,
            y: -Math.sin(headingRad) * totalStrength * totalScale
        };
        drawVectorLine(0, 0, totalTip.x, totalTip.y, '#22c55e', 'Total Field', totalStrength);
        
        // Vector 3: Elektromagnetisch veld (verschil) - rood
        const emTip = {
            x: totalTip.x - baselineTip.x,
            y: totalTip.y - baselineTip.y
        };
        const emStrength = Math.sqrt(emTip.x ** 2 + emTip.y ** 2) / maxRadius * Math.max(totalStrength, 50);
        drawVectorLine(baselineTip.x, baselineTip.y, totalTip.x, totalTip.y, '#ef4444', 'EM Field', emStrength);
        
        // Label met alle drie waardes
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = '12px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`Earth: ${baselineStrength.toFixed(0)} µT`, -width / 2 + 10, -height / 2 + 20);
        ctx.fillText(`Total: ${totalStrength.toFixed(0)} µT`, -width / 2 + 10, -height / 2 + 35);
        ctx.fillText(`EM: ${emStrength.toFixed(0)} µT`, -width / 2 + 10, -height / 2 + 50);
        ctx.fillText(`Heading: ${filtered.heading.toFixed(0)}°`, -width / 2 + 10, -height / 2 + 65);
        
    } else {
        // Voor kalibratie: teken gewone vector
        const headingRad = filtered.heading * (Math.PI / 180);
        const strength = filtered.strength;
        const scale = maxRadius / Math.max(strength, 50);
        
        const tip = {
            x: Math.cos(headingRad) * strength * scale,
            y: -Math.sin(headingRad) * strength * scale
        };
        
        drawVectorLine(0, 0, tip.x, tip.y, '#22c55e', 'Current Field', strength);
        
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = '14px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${filtered.heading.toFixed(0)}° / ${strength.toFixed(0)} µT`, 0, -height / 2 + 20);
    }

    ctx.restore();
    requestAnimationFrame(draw);
}

function drawVectorLine(fromX, fromY, toX, toY, color, label, strength) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    const arrowSize = 10;
    const dir = Math.atan2(toY - fromY, toX - fromX);
    const a1 = { x: toX - arrowSize * Math.cos(dir - Math.PI / 6), y: toY - arrowSize * Math.sin(dir - Math.PI / 6) };
    const a2 = { x: toX - arrowSize * Math.cos(dir + Math.PI / 6), y: toY - arrowSize * Math.sin(dir + Math.PI / 6) };
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(a1.x, a1.y);
    ctx.lineTo(a2.x, a2.y);
    ctx.closePath();
    ctx.fill();
    
    // Label
    const midX = (fromX + toX) / 2;
    const midY = (fromY + toY) / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, midX, midY - 8);
}

requestAnimationFrame(draw);

function handleDisconnect() {
    setStatus('Disconnected', 'error');
    connectBtn.disabled = false;
    calibrateBtn.disabled = true;
    resetBtn.disabled = true;
    disconnectBtn.disabled = true;
}

async function connect() {
    try {
        setMessage('');
        connectBtn.disabled = true;
        setStatus('Select your micro:bit...');

        device = await microbit.requestMicrobit(navigator.bluetooth);
        device.addEventListener('gattserverdisconnected', handleDisconnect);

        setStatus('Connecting...');
        services = await microbit.getServices(device);
        const uart = services.uartService;
        if (!uart) throw new Error('UART service not available');

        uart.addEventListener('receiveText', evt => {
            const now = Date.now();
            if (now - lastUpdate < updateInterval) return;
            lastUpdate = now;
            
            const text = evt.detail || evt;
            // Parse: "H:123,S:456" of "123,456"
            let heading, strength;
            
            if (text.includes('H:')) {
                const match = text.match(/H:(\d+\.?\d*),S:(\d+\.?\d*)/);
                if (match) {
                    console.log('Parsed with labels');
                    console.log(match[1], match[2]);
                    heading = parseFloat(match[1]);
                    strength = parseFloat(match[2]);
                }
            } else {
                const parts = text.trim().split(',');
                if (parts.length >= 2) {
                    heading = parseFloat(parts[0]);
                    strength = parseFloat(parts[1]);
                }
            }
            
            if (heading != null && strength != null) {
                latest.heading = heading;
                latest.strength = strength;
                
                // Exponential moving average filter
                if (filtered.heading === 0 && filtered.strength === 0) {
                    filtered.heading = heading;
                    filtered.strength = strength;
                } else {
                    filtered.heading = filtered.heading * (1 - smoothing) + heading * smoothing;
                    filtered.strength = filtered.strength * (1 - smoothing) + strength * smoothing;
                }
                
                setMetrics({ heading: filtered.heading, strength: filtered.strength });
            }
        });

        setStatus('Connected', 'connected');
        calibrateBtn.disabled = false;
        resetBtn.disabled = false;
        disconnectBtn.disabled = false;
    } catch (err) {
        console.error(err);
        setStatus('Error', 'error');
        setMessage(err.message || 'Connection failed');
        connectBtn.disabled = false;
    }
}

connectBtn.addEventListener('click', connect);

calibrateBtn.addEventListener('click', () => {
    // Sla de huidige meting op als baseline (aardmagnetisch veld)
    baseline.heading = filtered.heading;
    baseline.strength = filtered.strength;
    
    // Bereken de Cartesische coördinaten van het aardmagnetisch veld
    const headingRad = filtered.heading * (Math.PI / 180);
    baseline.x = Math.cos(headingRad) * filtered.strength;
    baseline.y = -Math.sin(headingRad) * filtered.strength;
    
    isCalibrated = true;
    setMessage('✓ Vectorial calibration complete - Earth field stored');
    setMetrics({ heading: filtered.heading, strength: filtered.strength });
    setTimeout(() => setMessage(''), 2000);
});

resetBtn.addEventListener('click', () => {
    baseline.heading = 0;
    baseline.strength = 0;
    baseline.x = 0;
    baseline.y = 0;
    isCalibrated = false;
    setMessage('✓ Calibration reset');
    setMetrics({ heading: filtered.heading, strength: filtered.strength });
    setTimeout(() => setMessage(''), 5000);
});

disconnectBtn.addEventListener('click', () => {
    if (device && device.gatt.connected) {
        device.gatt.disconnect();
    }
});
