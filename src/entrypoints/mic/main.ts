const s = document.getElementById('s')!;
navigator.mediaDevices
  .getUserMedia({ audio: true })
  .then((stream) => {
    stream.getTracks().forEach((t) => t.stop());
    s.textContent = 'All done. You can close this tab and talk to Steady.';
  })
  .catch(() => {
    s.textContent = 'The microphone is blocked. Click the lock icon next to the address, allow Microphone, then reload this page.';
  });
