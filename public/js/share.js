function getPlayerJoinUrl(roomCode) {
  const code = (roomCode || '').trim().toUpperCase();
  return `${location.protocol}//${location.host}/player?room=${encodeURIComponent(code)}`;
}

function getPlayerJoinHint() {
  return `${location.host}/player`;
}

function renderQrIntoElement(elementOrId, url, size) {
  const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
  if (!el || typeof QRCode === 'undefined') return;
  el.innerHTML = '';
  // eslint-disable-next-line no-new
  new QRCode(el, {
    text: url,
    width: size,
    height: size,
    colorDark: '#22223b',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
