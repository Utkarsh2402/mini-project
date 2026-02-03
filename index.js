// AI Virtual Keyboard using MediaPipe Hands (CDN)
// - Index up => types "A"
// - Index + Middle up => types "B"
// - Open palm => SPACE
// - Closed fist => BACKSPACE

// DOM references
const startBtn = document.getElementById('startCamera');
const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const output = document.getElementById('output');
// UI elements for detected gesture and command (updated realtime)
const detectedEl = document.getElementById('detected-gesture');
const commandEl = document.getElementById('command-executed');

// Highlight the corresponding item in the command legend
function highlightLegend(command) {
  document.querySelectorAll('.vk-item').forEach((el) => {
    if (command && el.dataset && el.dataset.command === command) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
}


// Gesture debouncing / cooldown controls
let prevDetectedGesture = null;
let stableCount = 0; // number of consecutive frames the gesture stayed the same
const REQUIRED_CONSECUTIVE = 4; // require this many frames to confirm a gesture
let lastActionTime = 0;
const ACTION_COOLDOWN = 800; // ms

// Resize the canvas to match video feed dimensions
function resizeCanvas() {
  if (!video.videoWidth || !video.videoHeight) return;
  
  // Set canvas internal resolution to match video
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  // Canvas display size matches the video element's rendered size
  const rect = video.getBoundingClientRect();
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
}

video.addEventListener('loadedmetadata', resizeCanvas);
window.addEventListener('resize', resizeCanvas);

// Initialize MediaPipe Hands
const hands = new Hands({
  locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
  }
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.75,
  minTrackingConfidence: 0.75
});

hands.onResults(onResults);

// Hook up camera using MediaPipe's Camera helper
let camera = null;
startBtn.addEventListener('click', async () => {
  try {
    // Hide the start button immediately
    startBtn.style.display = 'none';
    
    // Use the MediaPipe Camera utility to handle video stream
    camera = new Camera(video, {
      onFrame: async () => {
        await hands.send({ image: video });
      },
      width: 640,
      height: 480
    });
    
    await camera.start();
    
    // Wait a bit for video to initialize, then resize canvas
    setTimeout(() => {
      resizeCanvas();
    }, 100);
    
  } catch (err) {
    console.error('Camera error:', err);
    alert('Camera access denied or unavailable. Please allow camera access and try again.');
    startBtn.style.display = 'block';
  }
});

// Determine if a finger is 'up' by comparing tip and pip vertical positions
function fingerIsUp(landmarks, tipIndex, pipIndex) {
  // landmarks are normalized (0..1), smaller y = higher on screen
  return landmarks[tipIndex].y < landmarks[pipIndex].y;
}

// Main results callback — draws landmarks and recognizes gestures
function onResults(results) {
  // clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    // No hand detected
    statusEl.textContent = 'No hand detected';
    statusEl.classList.remove('hand-detected');
    statusEl.classList.add('no-hand');
    prevDetectedGesture = null;
    stableCount = 0;
    // clear UI
    if (detectedEl) detectedEl.textContent = '—';
    if (commandEl) commandEl.textContent = '—';
    highlightLegend(null);

    return;
  }

  // Hand detected
  statusEl.textContent = 'Hand detected';
  statusEl.classList.remove('no-hand');
  statusEl.classList.add('hand-detected');

  const landmarks = results.multiHandLandmarks[0];

  // draw landmarks and connections (uses MediaPipe drawing utils provided via CDN)
  drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#00e5ff', lineWidth: 2 });
  drawLandmarks(ctx, landmarks, { color: '#ff4ec6', lineWidth: 1.6 });

  // finger states
  const indexUp = fingerIsUp(landmarks, 8, 6);
  const middleUp = fingerIsUp(landmarks, 12, 10);
  const ringUp = fingerIsUp(landmarks, 16, 14);
  const pinkyUp = fingerIsUp(landmarks, 20, 18);

  const anyFingerUp = indexUp || middleUp || ringUp || pinkyUp;

  // gestures (priority order - check most fingers first)
  let gesture = null;

  // Open palm: all fingers up -> SPACE
  if (indexUp && middleUp && ringUp && pinkyUp) {
    gesture = 'SPACE';
  }

  // Fist: no fingers up -> BACKSPACE
  else if (!anyFingerUp) {
    gesture = 'BACKSPACE';
  }

  // Four fingers combinations
  else if (indexUp && middleUp && ringUp && !pinkyUp) {
    gesture = 'D';
  }

  // Three fingers combinations
  else if (indexUp && middleUp && ringUp) {
    gesture = 'C';
  }
  else if (middleUp && ringUp && pinkyUp) {
    gesture = 'F';
  }

  // Two fingers combinations
  else if (indexUp && middleUp && !ringUp && !pinkyUp) {
    gesture = 'B';
  }
  else if (indexUp && ringUp && !middleUp && !pinkyUp) {
    gesture = 'E';
  }
  else if (middleUp && ringUp && !indexUp && !pinkyUp) {
    gesture = 'G';
  }

  // One finger combinations
  else if (indexUp && !middleUp && !ringUp && !pinkyUp) {
    gesture = 'A';
  }
  else if (middleUp && !indexUp && !ringUp && !pinkyUp) {
    gesture = 'H';
  }
  else if (ringUp && !indexUp && !middleUp && !pinkyUp) {
    gesture = 'I';
  }
  else if (pinkyUp && !indexUp && !middleUp && !ringUp) {
    gesture = 'J';
  }
  
  // Update UI with detected gesture
  if (detectedEl) detectedEl.textContent = gesture || '—';
  highlightLegend(gesture);


  if (gesture === prevDetectedGesture) {
    stableCount++;
  } else {
    stableCount = 1;
    prevDetectedGesture = gesture;
  }

  const now = Date.now();
  if (gesture && stableCount >= REQUIRED_CONSECUTIVE && (now - lastActionTime) > ACTION_COOLDOWN) {
    performAction(gesture);
    lastActionTime = now;
    
    prevDetectedGesture = null;
    stableCount = 0;
  }

  
  // Draw gesture label near hand on canvas
  if (gesture) {
    const wrist = landmarks[0];
    const x = wrist.x * canvas.width;
    const y = wrist.y * canvas.height - 15;

    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - 45, y - 24, 95, 28);
    ctx.fillStyle = '#00e5ff';
    ctx.fillText(gesture, x - 38, y - 4);
  }
}


function performAction(action) {
  output.focus();
  
  // Handle letter inputs
  if (action === 'SPACE') {
    output.value += ' ';
  } else if (action === 'BACKSPACE') {
    // remove last character
    output.value = output.value.slice(0, -1);
  } else {
    // All letter actions (A-J)
    output.value += action;
  }


  // Update command UI with visual feedback
  if (commandEl) {
    commandEl.textContent = action;
    commandEl.style.transform = 'scale(1.1)';
    setTimeout(() => {
      commandEl.style.transform = 'scale(1)';
    }, 200);
  }
  
  // Highlight the corresponding legend item
  highlightLegend(action);
  setTimeout(() => highlightLegend(null), 700);


  const old = statusEl.textContent;
  statusEl.textContent = `${action} → applied`;
  setTimeout(() => {
   
    if (statusEl.classList.contains('hand-detected')) {
      statusEl.textContent = 'Hand detected';
    } else {
      statusEl.textContent = 'No hand detected';
    }
  }, 700);
}


output.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    // insert newline
    output.value += '\n';
  }
});