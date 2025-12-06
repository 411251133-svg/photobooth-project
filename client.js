// client.js — WebRTC camera access, countdown capture, upload (base64), and gallery rendering
(function () {
  const startBtn = document.getElementById("startCameraBtn");
  const captureBtn = document.getElementById("captureBtn");
  const timerToggle = document.getElementById("timer-toggle");
  const flipToggle = document.getElementById("flip-toggle");
  const galleryBtn = document.getElementById("galleryBtn");
  const galleryInput = document.getElementById("galleryInput");
  const video = document.getElementById("videoPreview");
  const canvas = document.getElementById("captureCanvas");
  const countdownOverlay = document.getElementById("countdownOverlay");
  const countdownNumber = document.getElementById("countdownNumber");
  const galleryGrid = document.querySelector(".gallery-grid");
  const preview = document.querySelector(".camera-preview");

  let stream = null;
  let facing = "user"; // default to front camera when available
  let currentFilter = "none";
  let currentFrame = "none";
  let selectedStickers = new Set();
  let animationId = null;
  let previewCanvas = null;

  async function startCamera() {
    if (stream) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      preview.classList.add("active");
      video.classList.remove("hidden");
      startBtn.setAttribute("aria-pressed", "true");
      startBtn.textContent = "■";

      // Create preview canvas setelah video ready
      if (!previewCanvas) {
        previewCanvas = document.createElement("canvas");
        previewCanvas.id = "previewCanvas";
        previewCanvas.style.position = "absolute";
        previewCanvas.style.top = "0";
        previewCanvas.style.left = "0";
        previewCanvas.style.display = "none";
        previewCanvas.style.zIndex = "5";
        preview.appendChild(previewCanvas);
      }

      // Start live preview
      startLivePreview();
    } catch (err) {
      console.error("startCamera:", err);
      alert("Gagal mengakses kamera — periksa izin/perangkat.");
    }
  }

  function stopCamera() {
    if (!stream) return;
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.pause();
    video.srcObject = null;
    preview.classList.remove("active");
    video.classList.add("hidden");
    startBtn.setAttribute("aria-pressed", "false");
    startBtn.textContent = "▶";
    if (previewCanvas) previewCanvas.style.display = "none";

    // Stop live preview
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  function startLivePreview() {
    const drawPreview = () => {
      if (!stream || !video || video.paused || !previewCanvas) {
        animationId = requestAnimationFrame(drawPreview);
        return;
      }

      try {
        const w = video.videoWidth;
        const h = video.videoHeight;

        if (w === 0 || h === 0) {
          animationId = requestAnimationFrame(drawPreview);
          return;
        }

        previewCanvas.width = w;
        previewCanvas.height = h;

        const ctx = previewCanvas.getContext("2d");
        if (!ctx) {
          animationId = requestAnimationFrame(drawPreview);
          return;
        }

        ctx.drawImage(video, 0, 0, w, h);

        // Apply filter
        if (currentFilter !== "none") {
          applyFilter(ctx, w, h, currentFilter);
        }

        // Draw frame
        if (currentFrame !== "none") {
          drawFrame(ctx, w, h, currentFrame);
        }

        // Draw stickers
        if (selectedStickers.size > 0) {
          drawStickers(ctx, w, h, Array.from(selectedStickers));
        }

        // Show canvas hanya jika ada filter/frame/stiker
        if (
          currentFilter !== "none" ||
          currentFrame !== "none" ||
          selectedStickers.size > 0
        ) {
          previewCanvas.style.display = "block";
        } else {
          previewCanvas.style.display = "none";
        }
      } catch (err) {
        console.error("Error in drawPreview:", err);
      }

      animationId = requestAnimationFrame(drawPreview);
    };

    drawPreview();
  }

  function applyFilter(ctx, w, h, filter) {
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    switch (filter) {
      case "bw":
        // Grayscale
        for (let i = 0; i < data.length; i += 4) {
          const gray =
            data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          data[i] = data[i + 1] = data[i + 2] = gray;
        }
        break;

      case "sepia":
        // Sepia tone
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i],
            g = data[i + 1],
            b = data[i + 2];
          data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
          data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
          data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
        }
        break;

      case "vintage":
        // Vintage (reduce saturation + sepia tint)
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i],
            g = data[i + 1],
            b = data[i + 2];
          const gray = r * 0.299 + g * 0.587 + b * 0.114;
          data[i] = Math.min(255, gray * 0.7 + r * 0.3);
          data[i + 1] = Math.min(255, gray * 0.7 + g * 0.3);
          data[i + 2] = Math.min(255, gray * 0.5 + b * 0.5);
        }
        break;

      case "cool":
        // Cool tones (boost blue)
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.max(0, data[i] - 20); // reduce red
          data[i + 1] = Math.max(0, data[i + 1] - 10); // reduce green
          data[i + 2] = Math.min(255, data[i + 2] + 30); // boost blue
        }
        break;

      case "warm":
        // Warm tones (boost red/yellow)
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, data[i] + 30); // boost red
          data[i + 1] = Math.min(255, data[i + 1] + 20); // boost green
          data[i + 2] = Math.max(0, data[i + 2] - 20); // reduce blue
        }
        break;

      case "dramatic":
        // High contrast
        for (let i = 0; i < data.length; i += 4) {
          const level = 100;
          data[i] =
            data[i] > 128
              ? Math.min(255, data[i] + level)
              : Math.max(0, data[i] - level);
          data[i + 1] =
            data[i + 1] > 128
              ? Math.min(255, data[i + 1] + level)
              : Math.max(0, data[i + 1] - level);
          data[i + 2] =
            data[i + 2] > 128
              ? Math.min(255, data[i + 2] + level)
              : Math.max(0, data[i + 2] - level);
        }
        break;

      case "neon":
        // Neon effect - vibrant & inverted
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 255 - data[i]; // R
          data[i + 1] = 255 - data[i + 1]; // G
          data[i + 2] = 255 - data[i + 2]; // B
        }
        break;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  function drawFrame(ctx, w, h, frame) {
    const borderSize = 50;

    switch (frame) {
      case "classic":
        // Elegant double border
        ctx.lineWidth = 8;
        ctx.strokeStyle = "#2c3e50";
        ctx.strokeRect(10, 10, w - 20, h - 20);

        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ecf0f1";
        ctx.strokeRect(18, 18, w - 36, h - 36);

        ctx.lineWidth = 8;
        ctx.strokeStyle = "#2c3e50";
        ctx.strokeRect(26, 26, w - 52, h - 52);
        break;

      case "polaroid":
        // Polaroid-style frame with white border and text
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);

        const photoX = 15;
        const photoY = 15;
        const photoW = w - 30;
        const photoH = h - 110;

        ctx.save();
        ctx.clearRect(photoX, photoY, photoW, photoH);
        ctx.restore();

        // Add text at bottom
        ctx.fillStyle = "#666";
        ctx.font = "italic 16px 'Courier New'";
        ctx.fillText("📷 PhotoBooth", 25, h - 25);
        ctx.font = "12px 'Courier New'";
        const date = new Date().toLocaleDateString();
        ctx.fillText(date, w - 120, h - 25);
        break;

      case "heart":
        // Heart-shaped border
        ctx.strokeStyle = "#e74c3c";
        ctx.fillStyle = "rgba(231, 76, 60, 0.1)";
        ctx.lineWidth = 15;

        // Draw 4 corners with heart patterns
        const corners = [
          { x: 40, y: 40 },
          { x: w - 40, y: 40 },
          { x: 40, y: h - 40 },
          { x: w - 40, y: h - 40 },
        ];

        corners.forEach((corner) => {
          ctx.beginPath();
          ctx.arc(corner.x, corner.y, 25, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });

        // Border outline
        ctx.strokeStyle = "#e74c3c";
        ctx.lineWidth = 10;
        ctx.strokeRect(30, 30, w - 60, h - 60);
        break;

      case "film":
        // Film strip effect with sprocket holes
        ctx.fillStyle = "#1a1a1a";
        const stripWidth = 45;

        // Left strip
        ctx.fillRect(0, 0, stripWidth, h);
        // Right strip
        ctx.fillRect(w - stripWidth, 0, stripWidth, h);

        // Sprocket holes
        ctx.fillStyle = "#444";
        const holeSize = 12;
        const holeSpacing = 35;

        for (let y = 15; y < h; y += holeSpacing) {
          // Left sprockets
          ctx.fillRect(10, y, holeSize, holeSize);
          ctx.fillRect(25, y, holeSize, holeSize);

          // Right sprockets
          ctx.fillRect(w - 35, y, holeSize, holeSize);
          ctx.fillRect(w - 20, y, holeSize, holeSize);
        }

        // Film frame border
        ctx.strokeStyle = "#666";
        ctx.lineWidth = 3;
        ctx.strokeRect(stripWidth + 5, 5, w - 2 * stripWidth - 10, h - 10);
        break;

      case "gold":
        // Luxurious gold frame with gradient effect
        ctx.lineWidth = 20;
        ctx.strokeStyle = "#ffd700";
        ctx.shadowColor = "rgba(0,0,0,0.3)";
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.strokeRect(12, 12, w - 24, h - 24);

        // Inner accent line
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#daa520";
        ctx.shadowBlur = 0;
        ctx.strokeRect(20, 20, w - 40, h - 40);

        // Corner decorations
        ctx.fillStyle = "#ffd700";
        const cornerSize = 15;
        const corners2 = [
          { x: 15, y: 15 },
          { x: w - 15, y: 15 },
          { x: 15, y: h - 15 },
          { x: w - 15, y: h - 15 },
        ];
        corners2.forEach((c) => {
          ctx.beginPath();
          ctx.arc(c.x, c.y, cornerSize, 0, Math.PI * 2);
          ctx.fill();
        });
        break;

      case "rainbow":
        // Colorful rainbow border
        const rainbowColors = [
          "#ff0000",
          "#ff7f00",
          "#ffff00",
          "#00ff00",
          "#0000ff",
          "#4b0082",
          "#9400d3",
        ];

        const segmentWidth = w / rainbowColors.length;

        // Top border
        for (let i = 0; i < rainbowColors.length; i++) {
          ctx.fillStyle = rainbowColors[i];
          ctx.fillRect(i * segmentWidth, 0, segmentWidth, 30);
        }

        // Bottom border
        for (let i = 0; i < rainbowColors.length; i++) {
          ctx.fillStyle = rainbowColors[i];
          ctx.fillRect(i * segmentWidth, h - 30, segmentWidth, 30);
        }

        // Side borders
        ctx.fillStyle = "#ff69b4";
        ctx.fillRect(0, 30, 30, h - 60);
        ctx.fillRect(w - 30, 30, 30, h - 60);
        break;

      case "glitter":
        // Sparkle/glitter effect border
        ctx.lineWidth = 12;
        ctx.strokeStyle = "#c0c0c0";
        ctx.strokeRect(15, 15, w - 30, h - 30);

        // Add sparkles
        ctx.fillStyle = "#fff";
        const sparklePositions = [
          [25, 25],
          [w - 25, 25],
          [25, h - 25],
          [w - 25, h - 25],
          [w / 2, 20],
          [w / 2, h - 20],
          [20, h / 2],
          [w - 20, h / 2],
        ];

        sparklePositions.forEach((pos) => {
          ctx.beginPath();
          ctx.arc(pos[0], pos[1], 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#c0c0c0";
          ctx.lineWidth = 2;
          ctx.stroke();
        });
        break;
    }
  }

  function drawStickers(ctx, w, h, stickers) {
    const stickerEmojis = {
      "sticker-1": "😊",
      "sticker-2": "❤️",
      "sticker-3": "⭐",
      "sticker-4": "🎉",
      "sticker-5": "🌈",
      "sticker-6": "✨",
      "sticker-7": "🎈",
      "sticker-8": "🦋",
    };

    const positions = [
      { x: w * 0.15, y: h * 0.15 },
      { x: w * 0.85, y: h * 0.15 },
      { x: w * 0.5, y: h * 0.5 },
      { x: w * 0.15, y: h * 0.85 },
      { x: w * 0.85, y: h * 0.85 },
    ];

    ctx.save();
    ctx.font = `${Math.round(w * 0.08)}px Arial`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    let idx = 0;
    stickers.forEach((stickerId) => {
      if (idx < positions.length) {
        const emoji = stickerEmojis[stickerId];
        if (emoji) {
          ctx.fillText(emoji, positions[idx].x, positions[idx].y);
        }
        idx++;
      }
    });

    ctx.restore();
  }

  async function doCapture() {
    // If no camera stream but video has src (gallery image), use the gallery image
    if (!stream && video.src) {
      // Gallery image is already on canvas from handleGalleryImage
      const dataUrl = canvas.toDataURL("image/png");
      await uploadBase64(dataUrl);
      await refreshGallery();
      return;
    }

    // Camera capture logic
    if (!stream) await startCamera();

    const countdownFrom = timerToggle && timerToggle.checked ? 3 : 0;
    if (countdownFrom > 0) await runCountdown(countdownFrom);

    const w = video.videoWidth || 1280;
    const h = video.videoHeight || Math.round((w * 9) / 16);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    // Draw video frame
    ctx.drawImage(video, 0, 0, w, h);

    // Apply filter
    if (currentFilter !== "none") {
      applyFilter(ctx, w, h, currentFilter);
    }

    // Draw frame
    if (currentFrame !== "none") {
      drawFrame(ctx, w, h, currentFrame);
    }

    // Draw stickers
    if (selectedStickers.size > 0) {
      drawStickers(ctx, w, h, Array.from(selectedStickers));
    }

    // Convert to data url and upload
    const dataUrl = canvas.toDataURL("image/png");
    await uploadBase64(dataUrl);
    await refreshGallery();
  }

  function runCountdown(n) {
    return new Promise((resolve) => {
      countdownOverlay.classList.remove("hidden");
      countdownNumber.textContent = n;
      countdownNumber.classList.add("show");
      let cur = n;
      const tick = () => {
        setTimeout(() => {
          countdownNumber.classList.remove("show");
          cur -= 1;
          if (cur <= 0) {
            countdownOverlay.classList.add("hidden");
            resolve();
            return;
          }
          countdownNumber.textContent = cur;
          countdownNumber.classList.add("show");
          tick();
        }, 850);
      };
      tick();
    });
  }

  async function uploadBase64(dataUrl) {
    try {
      const res = await fetch("/api/upload-base64", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Upload failed");
      }
      return await res.json();
    } catch (err) {
      console.error("uploadBase64:", err);
      alert("Gagal mengunggah foto: " + (err.message || err));
    }
  }

  function handleGalleryImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      video.src = e.target.result;
      video.classList.remove("hidden");
      preview.classList.add("active");

      // Draw image to canvas for capture
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  async function refreshGallery() {
    if (!galleryGrid) return;
    try {
      const res = await fetch("/api/photos");
      if (!res.ok) throw new Error("Gagal memuat galeri");
      const items = await res.json();
      renderGallery(items);
    } catch (err) {
      console.warn("refreshGallery:", err);
      galleryGrid.innerHTML =
        '<div style="color:var(--text-gray);padding:1rem">Tidak dapat memuat galeri</div>';
    }
  }

  function renderGallery(items = []) {
    galleryGrid.innerHTML = "";
    if (!items.length) {
      galleryGrid.innerHTML =
        '<div style="grid-column:1/-1;text-align:center;color:var(--text-gray);padding:3rem;font-size:18px">📸 Galeri kosong<br><small style="font-size:14px">Ambil foto untuk mulai!</small></div>';
      return;
    }

    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "photo-card";
      card.style.position = "relative";
      card.style.overflow = "hidden";
      card.style.borderRadius = "12px";
      card.style.boxShadow = "0 4px 15px rgba(0,0,0,0.1)";
      card.style.transition = "transform 0.3s ease, box-shadow 0.3s ease";
      card.style.cursor = "pointer";

      const wrapper = document.createElement("div");
      wrapper.className = "photo-wrapper";
      wrapper.style.position = "relative";
      wrapper.style.width = "100%";
      wrapper.style.paddingBottom = "100%";
      wrapper.style.overflow = "hidden";

      const img = document.createElement("img");
      img.src = item.url;
      img.alt = item.filename;
      img.style.position = "absolute";
      img.style.top = "0";
      img.style.left = "0";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      img.style.transition = "transform 0.3s ease";

      wrapper.appendChild(img);

      // Hover effect
      card.addEventListener("mouseenter", () => {
        card.style.transform = "scale(1.05)";
        card.style.boxShadow = "0 8px 25px rgba(0,0,0,0.2)";
        img.style.transform = "scale(1.1)";
      });

      card.addEventListener("mouseleave", () => {
        card.style.transform = "scale(1)";
        card.style.boxShadow = "0 4px 15px rgba(0,0,0,0.1)";
        img.style.transform = "scale(1)";
      });

      // Action overlay
      const overlay = document.createElement("div");
      overlay.className = "photo-overlay";
      overlay.style.position = "absolute";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.right = "0";
      overlay.style.bottom = "0";
      overlay.style.background = "rgba(0,0,0,0.6)";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.gap = "10px";
      overlay.style.opacity = "0";
      overlay.style.transition = "opacity 0.3s ease";
      overlay.style.zIndex = "10";

      // Preview button
      const previewBtn = document.createElement("button");
      previewBtn.title = "Lihat Besar";
      previewBtn.style.padding = "8px 12px";
      previewBtn.style.borderRadius = "6px";
      previewBtn.style.border = "none";
      previewBtn.style.background = "#3498db";
      previewBtn.style.color = "#fff";
      previewBtn.style.cursor = "pointer";
      previewBtn.style.fontSize = "14px";
      previewBtn.style.fontWeight = "bold";
      previewBtn.innerHTML = "👁️ Lihat";
      previewBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showImageModal(item.url, item.filename);
      });

      // Download button
      const downloadBtn = document.createElement("button");
      downloadBtn.title = "Download";
      downloadBtn.style.padding = "8px 12px";
      downloadBtn.style.borderRadius = "6px";
      downloadBtn.style.border = "none";
      downloadBtn.style.background = "#27ae60";
      downloadBtn.style.color = "#fff";
      downloadBtn.style.cursor = "pointer";
      downloadBtn.style.fontSize = "14px";
      downloadBtn.style.fontWeight = "bold";
      downloadBtn.innerHTML = "⬇️ Download";
      downloadBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        downloadImage(item.url, item.filename);
      });

      // Delete button
      const deleteBtn = document.createElement("button");
      deleteBtn.title = "Hapus";
      deleteBtn.style.padding = "8px 12px";
      deleteBtn.style.borderRadius = "6px";
      deleteBtn.style.border = "none";
      deleteBtn.style.background = "#e74c3c";
      deleteBtn.style.color = "#fff";
      deleteBtn.style.cursor = "pointer";
      deleteBtn.style.fontSize = "14px";
      deleteBtn.style.fontWeight = "bold";
      deleteBtn.innerHTML = "🗑️ Hapus";
      deleteBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Hapus foto ini? Tindakan ini tidak dapat dibatalkan."))
          return;
        try {
          const r = await fetch(
            "/api/photos/" + encodeURIComponent(item.filename),
            { method: "DELETE" }
          );
          if (r.status === 204) {
            refreshGallery();
          } else {
            const j = await r.json().catch(() => null);
            throw new Error(j?.error || "Gagal menghapus");
          }
        } catch (err) {
          alert("Gagal menghapus: " + (err.message || err));
        }
      });

      overlay.appendChild(previewBtn);
      overlay.appendChild(downloadBtn);
      overlay.appendChild(deleteBtn);

      wrapper.appendChild(overlay);
      card.appendChild(wrapper);

      // Hover effect untuk overlay
      card.addEventListener("mouseenter", () => {
        overlay.style.opacity = "1";
      });

      card.addEventListener("mouseleave", () => {
        overlay.style.opacity = "0";
      });

      // Info section
      const info = document.createElement("div");
      info.style.padding = "12px";
      info.style.background = "#f8f9fa";
      info.style.borderTop = "1px solid #e0e0e0";

      const filename = document.createElement("div");
      filename.style.fontSize = "14px";
      filename.style.fontWeight = "600";
      filename.style.color = "#2c3e50";
      filename.style.marginBottom = "4px";
      filename.style.wordBreak = "break-all";
      filename.textContent = item.filename;

      const timestamp = document.createElement("div");
      timestamp.style.fontSize = "12px";
      timestamp.style.color = "#7f8c8d";
      timestamp.textContent = new Date(item.createdAt).toLocaleString("id-ID", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      info.appendChild(filename);
      info.appendChild(timestamp);
      card.appendChild(info);

      galleryGrid.appendChild(card);
    });
  }

  function showImageModal(imageUrl, filename) {
    // Create modal
    const modal = document.createElement("div");
    modal.style.position = "fixed";
    modal.style.top = "0";
    modal.style.left = "0";
    modal.style.width = "100%";
    modal.style.height = "100%";
    modal.style.background = "rgba(0,0,0,0.9)";
    modal.style.display = "flex";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.zIndex = "9999";
    modal.style.animation = "fadeIn 0.3s ease";

    const container = document.createElement("div");
    container.style.position = "relative";
    container.style.maxWidth = "90vw";
    container.style.maxHeight = "90vh";

    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = filename;
    img.style.maxWidth = "100%";
    img.style.maxHeight = "100%";
    img.style.objectFit = "contain";
    img.style.borderRadius = "8px";

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "✕";
    closeBtn.style.position = "absolute";
    closeBtn.style.top = "-40px";
    closeBtn.style.right = "0";
    closeBtn.style.background = "none";
    closeBtn.style.border = "none";
    closeBtn.style.color = "#fff";
    closeBtn.style.fontSize = "32px";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.padding = "0";
    closeBtn.style.width = "40px";
    closeBtn.style.height = "40px";
    closeBtn.addEventListener("click", () => modal.remove());

    container.appendChild(img);
    container.appendChild(closeBtn);
    modal.appendChild(container);

    // Close on background click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
  }

  function downloadImage(imageUrl, filename) {
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = filename || "photo.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // events
  startBtn?.addEventListener("click", () => {
    if (stream) stopCamera();
    else startCamera();
  });

  captureBtn?.addEventListener("click", () => {
    captureBtn.disabled = true;
    doCapture().finally(() => {
      captureBtn.disabled = false;
    });
  });

  flipToggle?.addEventListener("change", () => {
    facing = flipToggle.checked ? "environment" : "user";
    if (stream) {
      stopCamera();
      // tiny delay to allow tracks to stop
      setTimeout(startCamera, 250);
    }
  });

  galleryBtn?.addEventListener("click", () => {
    galleryInput.click();
  });

  galleryInput?.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) {
      handleGalleryImage(file);
    }
  });

  // Filter listeners
  document.querySelectorAll(".filter-input").forEach((input) => {
    input.addEventListener("change", (e) => {
      currentFilter = e.target.id.replace("filter-", "");
    });
  });

  // Frame listeners
  document.querySelectorAll(".frame-input").forEach((input) => {
    input.addEventListener("change", (e) => {
      currentFrame = e.target.id.replace("frame-", "");
    });
  });

  // Sticker listeners
  document.querySelectorAll(".sticker-input").forEach((input) => {
    input.addEventListener("change", (e) => {
      if (e.target.checked) {
        selectedStickers.add(e.target.id);
      } else {
        selectedStickers.delete(e.target.id);
      }
    });
  });

  window.addEventListener("load", refreshGallery);
})();
