// client.js — WebRTC camera access, countdown capture, upload (base64), and gallery rendering
(function () {
  const startBtn = document.getElementById('startCameraBtn');
  const captureBtn = document.getElementById('captureBtn');
  const timerToggle = document.getElementById('timer-toggle');
  const flipToggle = document.getElementById('flip-toggle');
  const video = document.getElementById('videoPreview');
  const canvas = document.getElementById('captureCanvas');
  const countdownOverlay = document.getElementById('countdownOverlay');
  const countdownNumber = document.getElementById('countdownNumber');
  const galleryGrid = document.querySelector('.gallery-grid');
  const refreshBtn = document.getElementById('refreshGalleryBtn');
  const preview = document.querySelector('.camera-preview');

  let stream = null;
  let facing = 'user'; // default to front camera when available

  async function startCamera() {
    if (stream) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
      video.srcObject = stream;
      await video.play();
      preview.classList.add('active');
      video.classList.remove('hidden');
      startBtn.setAttribute('aria-pressed', 'true');
      startBtn.textContent = '■';
    } catch (err) {
      console.error('startCamera:', err);
      alert('Gagal mengakses kamera — periksa izin/perangkat.');
    }
  }

  function stopCamera() {
    if (!stream) return;
    stream.getTracks().forEach(t => t.stop());
    stream = null;
    video.pause();
    video.srcObject = null;
    preview.classList.remove('active');
    video.classList.add('hidden');
    startBtn.setAttribute('aria-pressed', 'false');
    startBtn.textContent = '▶';
  }

  async function doCapture() {
    if (!stream) await startCamera();

    const countdownFrom = timerToggle && timerToggle.checked ? 3 : 0;
    if (countdownFrom > 0) await runCountdown(countdownFrom);

    const w = video.videoWidth || 1280;
    const h = video.videoHeight || Math.round(w * 9 / 16);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // Draw video frame (if you want overlays/filters merged — draw them too before uploading)
    ctx.drawImage(video, 0, 0, w, h);

    // Convert to data url and upload
    const dataUrl = canvas.toDataURL('image/png');
    await uploadBase64(dataUrl);
    await refreshGallery();
  }

  function runCountdown(n) {
    return new Promise(resolve => {
      countdownOverlay.classList.remove('hidden');
      countdownNumber.textContent = n;
      countdownNumber.classList.add('show');
      let cur = n;
      const tick = () => {
        setTimeout(() => {
          countdownNumber.classList.remove('show');
          cur -= 1;
          if (cur <= 0) {
            countdownOverlay.classList.add('hidden');
            resolve();
            return;
          }
          countdownNumber.textContent = cur;
          countdownNumber.classList.add('show');
          tick();
        }, 850);
      };
      tick();
    });
  }

  async function uploadBase64(dataUrl) {
    try {
      const res = await fetch('/api/upload-base64', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Upload failed');
      }
      return await res.json();
    } catch (err) {
      console.error('uploadBase64:', err);
      alert('Gagal mengunggah foto: ' + (err.message || err));
    }
  }

  async function refreshGallery() {
    if (!galleryGrid) return;
    try {
      const res = await fetch('/api/photos');
      if (!res.ok) throw new Error('Gagal memuat galeri');
      const items = await res.json();
      renderGallery(items);
    } catch (err) {
      console.warn('refreshGallery:', err);
      galleryGrid.innerHTML = '<div style="color:var(--text-gray);padding:1rem">Tidak dapat memuat galeri</div>';
    }
  }

  function renderGallery(items = []) {
    galleryGrid.innerHTML = '';
    if (!items.length) {
      galleryGrid.innerHTML = '<div style="color:var(--text-gray);padding:1rem">Galeri kosong</div>';
      return;
    }

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'photo-card';

      const wrapper = document.createElement('div');
      wrapper.className = 'photo-wrapper';

      const img = document.createElement('img');
      img.src = item.url;
      img.alt = item.filename;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      wrapper.appendChild(img);

      // overlay actions
      const overlay = document.createElement('div');
      overlay.className = 'photo-overlay';
      overlay.style.position = 'absolute';
      overlay.style.right = '8px';
      overlay.style.top = '8px';
      overlay.style.display = 'flex';
      overlay.style.gap = '8px';
      overlay.style.zIndex = 8;

      const delBtn = document.createElement('button');
      delBtn.className = 'photo-action';
      delBtn.textContent = 'Hapus';
      delBtn.title = 'Hapus foto';
      delBtn.addEventListener('click', async () => {
        if (!confirm('Hapus foto ini?')) return;
        try {
          const r = await fetch('/api/photos/' + encodeURIComponent(item.filename), { method: 'DELETE' });
          if (r.status === 204) refreshGallery();
          else {
            const j = await r.json().catch(() => null);
            throw new Error(j?.error || 'Gagal menghapus');
          }
        } catch (err) {
          alert('Gagal menghapus: ' + (err.message || err));
        }
      });

      overlay.appendChild(delBtn);
      wrapper.appendChild(overlay);
      card.appendChild(wrapper);

      const info = document.createElement('div');
      info.className = 'photo-info';
      info.innerHTML = `<div style="font-size:13px;color:var(--text-gray)">${item.filename}</div><div style="font-size:12px;color:var(--text-gray)">${new Date(item.createdAt).toLocaleString()}</div>`;
      card.appendChild(info);

      galleryGrid.appendChild(card);
    });
  }

  // events
  startBtn?.addEventListener('click', () => {
    if (stream) stopCamera();
    else startCamera();
  });

  captureBtn?.addEventListener('click', () => {
    captureBtn.disabled = true;
    doCapture().finally(() => { captureBtn.disabled = false; });
  });

  flipToggle?.addEventListener('change', () => {
    facing = flipToggle.checked ? 'environment' : 'user';
    if (stream) {
      stopCamera();
      // tiny delay to allow tracks to stop
      setTimeout(startCamera, 250);
    }
  });

  refreshBtn?.addEventListener('click', refreshGallery);
  window.addEventListener('load', refreshGallery);
})();
