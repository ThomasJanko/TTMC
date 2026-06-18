// --- GÉNÉRATEUR DE SONS INTEGRÉ ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode); gainNode.connect(audioCtx.destination);
    if (type === 'success') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(1174.66, audioCtx.currentTime + 0.15);
        gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc.start(); osc.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'error') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(140, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
        osc.start(); osc.stop(audioCtx.currentTime + 0.4);
    } else if (type === 'tick') {
        osc.type = 'square'; osc.frequency.setValueAtTime(900, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.015, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
        osc.start(); osc.stop(audioCtx.currentTime + 0.04);
    }
}
