
const ROBOT_CONFIG = {
    l1: 0.12,  
    l2: 0.12,    
    gripper: 0.02, 
    home: { x: 0.14, y: 0.14 } 
};

// Estado del robot
let robot = {
    theta1: Math.PI / 2,
    theta2: 0,
    pos: { x: 0.14, y: 0.14 }, // Actualizado
    path: []
};

// Elementos DOM 
let canvas, ctx, xInput, yInput, moveBtn, homeBtn, alertDiv, posSpan, theta1Span, theta2Span;
let chart1, chart2;

// Inicialización 
function init() {
    console.log("Inicializando aplicación...");
    
    canvas = document.getElementById('robotCanvas');
    ctx = canvas.getContext('2d');
    xInput = document.getElementById('targetX');
    yInput = document.getElementById('targetY');
    moveBtn = document.getElementById('executeMove');
    homeBtn = document.getElementById('resetPosition');
    alertDiv = document.getElementById('systemAlert');
    posSpan = document.getElementById('currentPos');
    theta1Span = document.getElementById('joint1Angle');
    theta2Span = document.getElementById('joint2Angle');
    
    moveBtn.addEventListener('click', moveRobot);
    homeBtn.addEventListener('click', goHome);
    xInput.addEventListener('input', checkInput);
    yInput.addEventListener('input', checkInput);
    
    initCharts();
    draw();
    updateDisplay();
}

// Gráficas 
function initCharts() {
    const config = {
        type: 'line',
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Tiempo (s)' }, min: 0, max: 20 },
                y: { title: { display: true, text: 'Ángulo (rad)' } }
            }
        }
    };

    chart1 = new Chart(document.getElementById('joint1Chart'), {
        ...config,
        data: {
            labels: [],
            datasets: [{
                label: 'θ₁',
                data: [],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4,
                fill: true
            }]
        }
    });

    chart2 = new Chart(document.getElementById('joint2Chart'), {
        ...config,
        data: {
            labels: [],
            datasets: [{
                label: 'θ₂',
                data: [],
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                tension: 0.4,
                fill: true
            }]
        }
    });
}

//  CINEMÁTICA INVERSA 
function calculateIK(x, y) {
    const { l1, l2 } = ROBOT_CONFIG;
    
    // Enfoque diferente: usar distancia y ángulos auxiliares
    const distancia = Math.sqrt(x * x + y * y);
    
    // Verificación 
    const sumaEslabones = l1 + l2;
    const diferenciaEslabones = Math.abs(l1 - l2);
    
    if (distancia > sumaEslabones || distancia < diferenciaEslabones) {
        return null;
    }
    
    // Cálculo alternativo usando teorema del coseno
    const anguloGamma = Math.atan2(y, x);
    const cosBeta = (distancia * distancia + l1 * l1 - l2 * l2) / (2 * distancia * l1);
    
    // Validar dominio del coseno
    if (Math.abs(cosBeta) > 1) return null;
    
    const anguloBeta = Math.acos(cosBeta);
    const theta1 = anguloGamma - anguloBeta;
    
    // Calcular theta2 usando ley de cosenos en el triángulo completo
    const cosAlpha = (l1 * l1 + l2 * l2 - distancia * distancia) / (2 * l1 * l2);
    if (Math.abs(cosAlpha) > 1) return null;
    
    const theta2 = Math.PI - Math.acos(cosAlpha);
    
    return { theta1, theta2 };
}

//  VALIDACIÓN MODIFICADA
function isReachable(x, y) {
    const { l1, l2 } = ROBOT_CONFIG;
    const distanciaCuadrada = x * x + y * y;
    const suma = l1 + l2;
    const diferencia = Math.abs(l1 - l2);
    
    // Verificar anillo de trabajo con márgenes
    return distanciaCuadrada <= suma * suma && distanciaCuadrada >= diferencia * diferencia;
}

function checkInput() {
    const x = parseFloat(xInput.value);
    const y = parseFloat(yInput.value);
    
    if (isNaN(x) || isNaN(y)) return;
    
    if (!isReachable(x, y)) {
        showAlert("¡Punto fuera del alcance!");
    } else {
        hideAlert();
    }
}

//  TRAYECTORIA 
function generatePath(targetTheta1, targetTheta2) {
    const steps = 100;
    const path = { time: [], theta1: [], theta2: [], x: [], y: [] };
    
    // Usar función de easing diferente (bezier cúbico)
    function easingBezier(t) {
        return t * t * (3 - 2 * t); // Función de suavizado diferente
    }
    
    // Duración variable basada en distancia angular
    const dist1 = Math.abs(targetTheta1 - robot.theta1);
    const dist2 = Math.abs(targetTheta2 - robot.theta2);
    const maxDist = Math.max(dist1, dist2);
    const duration = 15 + (maxDist * 10); // Duración variable
    
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const tiempoReal = t * duration;
        
        // Aplicar easing diferente
        const progreso = easingBezier(t);
        
        const theta1 = robot.theta1 + (targetTheta1 - robot.theta1) * progreso;
        const theta2 = robot.theta2 + (targetTheta2 - robot.theta2) * progreso;
        
        // Cinemática directa
        const x = ROBOT_CONFIG.l1 * Math.cos(theta1) + ROBOT_CONFIG.l2 * Math.cos(theta1 + theta2);
        const y = ROBOT_CONFIG.l1 * Math.sin(theta1) + ROBOT_CONFIG.l2 * Math.sin(theta1 + theta2);
        
        path.time.push(tiempoReal);
        path.theta1.push(theta1);
        path.theta2.push(theta2);
        path.x.push(x);
        path.y.push(y);
    }
    
    return path;
}

//  DIBUJO MODIFICADO 
function draw() {
    if (!ctx) {
        console.error("Contexto del canvas no disponible");
        return;
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const originX = canvas.width / 2;
    const originY = canvas.height - 50;
    const scale = 1000;
    
    // Dibujar ejes (estilo diferente)
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 2]);
    
    ctx.beginPath();
    ctx.moveTo(50, originY);
    ctx.lineTo(canvas.width - 50, originY);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(originX, canvas.height - 50);
    ctx.lineTo(originX, 50);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Resto del código de dibujo sin cambios...
    const joint1X = originX + ROBOT_CONFIG.l1 * Math.cos(robot.theta1) * scale;
    const joint1Y = originY - ROBOT_CONFIG.l1 * Math.sin(robot.theta1) * scale;
    
    const endX = originX + robot.pos.x * scale;
    const endY = originY - robot.pos.y * scale;
    
    // Eslabones con colores ligeramente diferentes
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(joint1X, joint1Y);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(joint1X, joint1Y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    
    // Pinza
    const gripAngle = robot.theta1 + robot.theta2;
    const gripX = endX + ROBOT_CONFIG.gripper * scale * Math.cos(gripAngle);
    const gripY = endY - ROBOT_CONFIG.gripper * scale * Math.sin(gripAngle);
    
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(gripX, gripY);
    ctx.stroke();
    
    // Articulaciones
    drawJoint(originX, originY, 12, '#4b5563');
    drawJoint(joint1X, joint1Y, 10, '#d97706');
    drawJoint(endX, endY, 10, '#dc2626');
    
    // Trayectoria 
    if (robot.path.length > 0) {
        ctx.strokeStyle = '#7c3aed';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 4]);
        
        ctx.beginPath();
        robot.path.forEach((point, i) => {
            const x = originX + point.x * scale;
            const y = originY - point.y * scale;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    // Etiqueta
    ctx.fillStyle = '#f8fafc';
    ctx.font = '14px Arial';
    ctx.fillText(`Pos: (${robot.pos.x.toFixed(3)}, ${robot.pos.y.toFixed(3)})`, endX + 10, endY - 10);
}

// 🔄 FUNCIÓN drawJoint 
function drawJoint(x, y, radius, color) {
    // Estilo de articulación diferente
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    // Añadir punto central
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
}

// Funciones restantes 
function updateCharts(path) {
    chart1.data.labels = path.time;
    chart1.data.datasets[0].data = path.theta1;
    chart1.update();
    
    chart2.data.labels = path.time;
    chart2.data.datasets[0].data = path.theta2;
    chart2.update();
}

function moveRobot() {
    const x = parseFloat(xInput.value);
    const y = parseFloat(yInput.value);
    
    if (isNaN(x) || isNaN(y)) {
        showAlert("Coordenadas inválidas");
        return;
    }
    
    if (!isReachable(x, y)) {
        showAlert("Punto fuera del alcance");
        return;
    }
    
    hideAlert();
    
    const ik = calculateIK(x, y);
    if (!ik) {
        showAlert("No se puede alcanzar esta posición");
        return;
    }
    
    const path = generatePath(ik.theta1, ik.theta2);
    robot.path = path.x.map((x, i) => ({ x, y: path.y[i] }));
    
    robot.theta1 = ik.theta1;
    robot.theta2 = ik.theta2;
    robot.pos = { x, y };
    
    updateCharts(path);
    draw();
    updateDisplay();
}

function goHome() {
    xInput.value = ROBOT_CONFIG.home.x;
    yInput.value = ROBOT_CONFIG.home.y;
    moveRobot();
}

function showAlert(msg) {
    alertDiv.textContent = msg;
    alertDiv.style.display = 'block';
}

function hideAlert() {
    alertDiv.style.display = 'none';
}

function updateDisplay() {
    posSpan.textContent = `x: ${robot.pos.x.toFixed(3)}, y: ${robot.pos.y.toFixed(3)}`;
    theta1Span.textContent = (robot.theta1 * 180 / Math.PI).toFixed(1);
    theta2Span.textContent = (robot.theta2 * 180 / Math.PI).toFixed(1);
}

document.addEventListener('DOMContentLoaded', init);

window.addEventListener('load', function() {
    setTimeout(() => {
        const path = generatePath(robot.theta1, robot.theta2);
        robot.path = path.x.map((x, i) => ({ x, y: path.y[i] }));
        updateCharts(path);
        hideAlert();
    }, 100);
});