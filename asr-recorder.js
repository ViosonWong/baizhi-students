(function initBaizhiAsrRecorder() {
  var ASR_ENDPOINT = "/api/asr";
  var REALTIME_ASR_ENDPOINT = "/api/asr/realtime";
  var NOTE_KEY = "baizhi_asr_notes";
  var MAX_NOTES = 20;
  var recorder = null;
  var stream = null;
  var realtimeSocket = null;
  var audioContext = null;
  var audioSource = null;
  var audioProcessor = null;
  var chunks = [];
  var startedAt = 0;
  var timer = null;
  var lastBlobUrl = "";
  var originalRecorderCardHtml = "";
  var lessonMeta = {
    school: "",
    classroom: "",
    teacher: "",
    course: "",
  };
  var state = {
    mode: "idle",
    elapsed: 0,
    error: "",
    text: "",
    note: null,
  };
  var liveLines = [];
  var livePartial = "";

  injectStyle();
  document.addEventListener("click", interceptRecordClicks, true);
  window.addEventListener("beforeunload", cleanupStream);

  function interceptRecordClicks(event) {
    var recordTrigger = event.target.closest(".today-rec,.record-start-pill");
    var button = event.target.closest("button");
    var buttonText = button ? button.textContent.replace(/\s+/g, "") : "";
    var permissionTrigger = button && buttonText.indexOf("允许并开始录音") >= 0;

    if (!recordTrigger && !permissionTrigger) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    openModal();
  }

  function openModal() {
    if (!window.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError("当前浏览器不支持网页录音，请使用最新版 Chrome、Edge 或 Safari。");
      return;
    }

    state = {
      mode: "requesting",
      elapsed: 0,
      error: "",
      text: "",
      note: null,
    };
    liveLines = [];
    livePartial = "";
    startRecording();
  }

  async function startRecording() {
    try {
      state.mode = "requesting";
      state.error = "";
      state.text = "";
      state.note = null;
      liveLines = [];
      livePartial = "";

      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      chunks = [];
      startBackupRecorder(stream);

      try {
        await openRealtimeSocket();
      } catch (error) {
        realtimeSocket = null;
      }

      startRealtimeAudio(stream);

      startedAt = Date.now();
      state.mode = "recording";
      switchToClassroomView();
      tickTimer();
      scheduleRender();
    } catch (error) {
      cleanupStream();
      switchToClassroomView();
      showError(error && error.name === "NotAllowedError" ? "麦克风权限被拒绝，请在浏览器地址栏允许麦克风后再试。" : "无法开始录音：" + error.message);
    }
  }

  function stopRecording() {
    if (state.mode !== "recording") {
      return;
    }

    if (realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) {
      state.mode = "transcribing";
      renderModal();
      stopBackupRecorder(false);
      cleanupAudioInput();
      realtimeSocket.send(JSON.stringify({ type: "stop" }));
    } else {
      state.mode = "batch-transcribing";
      renderModal();
      stopBackupRecorder(true);
      cleanupAudioInput(false);
    }
  }

  function startBackupRecorder(inputStream) {
    if (!window.MediaRecorder) {
      return;
    }

    recorder = new MediaRecorder(inputStream, { mimeType: pickMimeType() });
    recorder.ondataavailable = function(event) {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onstop = function() {
      if (state.mode === "batch-transcribing") {
        transcribeRecording();
      }
    };
    recorder.start(1000);
  }

  function stopBackupRecorder(useFallback) {
    if (!recorder || recorder.state === "inactive") {
      if (useFallback) {
        transcribeRecording();
      }
      return;
    }

    recorder.stop();
  }

  async function transcribeRecording() {
    clearInterval(timer);
    timer = null;
    cleanupAudioInput();

    var blob = new Blob(chunks, { type: (chunks[0] && chunks[0].type) || "audio/webm" });

    if (!blob.size) {
      showError("没有录到有效音频，请重新录制。");
      return;
    }

    if (lastBlobUrl) {
      URL.revokeObjectURL(lastBlobUrl);
    }
    lastBlobUrl = URL.createObjectURL(blob);

    state.mode = "transcribing";
    renderModal();

    try {
      var file = new File([blob], "baizhi-class-recording." + fileExt(blob.type), { type: blob.type || "audio/webm" });
      var form = new FormData();
      form.append("file", file);
      form.append("language", "zh");

      if (window.BAIZHI_ASR_MODEL) {
        form.append("model", window.BAIZHI_ASR_MODEL);
      }

      var response = await fetch(ASR_ENDPOINT, {
        method: "POST",
        body: form,
      });
      var data = await response.json().catch(function() {
        return {};
      });

      if (!response.ok) {
        throw new Error(data.detail || data.error || "HTTP " + response.status);
      }

      var text = String(data.text || "").trim();

      if (!text) {
        throw new Error("ASR 没有返回可用文本。");
      }

      state.text = text;
      state.note = createNote(text, data.segments || [], data.duration);
      state.mode = "done";
      saveNote(state.note);
      pushNoteToXiaoZhi(state.note);
      renderModal();
    } catch (error) {
      showError("转写失败：" + error.message);
    }
  }

  function openRealtimeSocket() {
    return new Promise(function(resolve, reject) {
      var socket = new WebSocket(realtimeUrl());
      var opened = false;
      realtimeSocket = socket;
      socket.binaryType = "arraybuffer";

      socket.addEventListener("open", function() {
        opened = true;
        socket.send(JSON.stringify({
          type: "start",
          format: "pcm",
          sampleRate: 16000,
        }));
        resolve();
      });

      socket.addEventListener("message", function(event) {
        handleRealtimeMessage(event.data);
      });

      socket.addEventListener("error", function() {
        if (!opened) {
          reject(new Error("实时转写服务连接失败。"));
          return;
        }
        showError("实时转写服务连接异常，请稍后重试。");
      });

      socket.addEventListener("close", function() {
        if (state.mode === "recording") {
          showError("实时转写连接已断开，请重新录音。");
        }
      });
    });
  }

  function handleRealtimeMessage(raw) {
    var data = {};

    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    if (data.type === "error") {
      showError(data.message || "实时转写失败。");
      cleanupAudioInput();
      return;
    }

    if (data.type === "partial" || data.type === "final") {
      state.text = String(data.transcript || data.text || "").trim();
      syncLiveLines(state.text);
      updateLiveTranscript();
      return;
    }

    if (data.type === "completed") {
      finalizeRealtimeTranscript(data);
    }
  }

  function finalizeRealtimeTranscript(data) {
    cleanupAudioInput();
    cleanupRealtimeSocket();

    var text = String((data && (data.transcript || data.text)) || state.text || "").trim();

    if (!text) {
      showError("没有识别到可用文字，请靠近麦克风后重新录制。");
      return;
    }

    state.text = text;
    state.note = createNote(text, (data && data.segments) || [], (data && data.duration) || state.elapsed);
    state.mode = "done";
    saveNote(state.note);
    pushNoteToXiaoZhi(state.note);
    renderModal();
  }

  function startRealtimeAudio(inputStream) {
    var AudioContextImpl = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextImpl) {
      throw new Error("当前浏览器不支持实时音频处理。");
    }

    audioContext = new AudioContextImpl();
    audioSource = audioContext.createMediaStreamSource(inputStream);
    audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);

    audioProcessor.onaudioprocess = function(event) {
      var output = event.outputBuffer && event.outputBuffer.getChannelData(0);
      if (output) {
        output.fill(0);
      }

      if (!realtimeSocket || realtimeSocket.readyState !== WebSocket.OPEN) {
        return;
      }

      var input = event.inputBuffer.getChannelData(0);
      var pcm = floatTo16BitPcm(resampleTo16k(input, audioContext.sampleRate));

      if (pcm.byteLength > 0) {
        realtimeSocket.send(pcm.buffer);
      }
    };

    audioSource.connect(audioProcessor);
    audioProcessor.connect(audioContext.destination);
  }

  function renderModal() {
    var host = getClassroomHost();

    if (!host) {
      return;
    }

    if (!originalRecorderCardHtml) {
      originalRecorderCardHtml = host.innerHTML;
    }

    var existing = document.getElementById("bz-asr-modal");
    if (!existing) {
      existing = document.createElement("div");
      existing.id = "bz-asr-modal";
      existing.className = "bz-asr-embed bz-asr-old-recorder";
      host.innerHTML = "";
      host.appendChild(existing);
    }

    var isRecording = state.mode === "recording";
    var isBusy = state.mode === "requesting" || state.mode === "stopping" || state.mode === "transcribing" || state.mode === "batch-transcribing";

    existing.innerHTML = oldClassroomHtml(isRecording, isBusy);

    bindModal(existing);
  }

  function statusHtml() {
    if (state.error) {
      return '<div class="bz-asr-error">' + esc(state.error) + '</div>';
    }

    if (state.mode === "done") {
      return '<div class="bz-asr-result bz-asr-classroom-body">' +
        (lastBlobUrl ? '<audio controls src="' + esc(lastBlobUrl) + '"></audio>' : "") +
        '<div class="bz-asr-lines">' + transcriptLinesHtml(state.text, true) + '</div>' +
      '</div>';
    }

    if (state.mode === "transcribing") {
      return '<div class="bz-asr-status">正在整理课堂原文，请稍等...</div>';
    }

    if (state.mode === "batch-transcribing") {
      return '<div class="bz-asr-status">正在整理课堂原文，请稍等...</div>';
    }

    if (state.mode === "requesting") {
      return '<div class="bz-asr-status">等待麦克风授权...</div>';
    }

    if (state.mode === "recording" || state.mode === "stopping") {
      return '<div class="bz-asr-classroom-body">' +
        '<div class="bz-asr-lines" data-bz-asr-live>' + transcriptLinesHtml(state.text, false) + '</div>' +
        '<div class="bz-asr-live-empty ' + (state.text ? "is-hidden" : "") + '">正在听课，识别内容会一句一句出现在这里。</div>' +
      '</div>';
    }

    return '<div class="bz-asr-status">准备好了就开始录音。</div>';
  }

  function actionsHtml(isRecording, isBusy) {
    if (state.mode === "done") {
      return '<div class="bz-asr-actions">' +
        '<button class="bz-asr-secondary" type="button" data-bz-asr-close>完成</button>' +
        '<button class="bz-asr-primary" type="button" data-bz-asr-ask>让小智总结</button>' +
      '</div>';
    }

    return '<div class="bz-asr-actions">' +
      '<button class="bz-asr-secondary" type="button" data-bz-asr-close ' + (isBusy ? "disabled" : "") + '>取消</button>' +
      (isRecording
        ? '<div class="bz-asr-recbar"><div class="bz-asr-recstate"><span class="bz-asr-dot"></span><span>录音中</span><strong class="bz-asr-clock">' + formatClock(state.elapsed) + '</strong></div><div class="bz-asr-bottom-wave" aria-hidden="true">' + waveBarsHtml(28) + '</div><button class="bz-asr-primary" type="button" data-bz-asr-stop>结束录音</button></div>'
        : '<button class="bz-asr-primary" type="button" data-bz-asr-start ' + (isBusy ? "disabled" : "") + '>开始录音</button>') +
    '</div>';
  }

  function oldClassroomHtml(isRecording, isBusy) {
    var finalMode = state.mode === "done";
    var stopDisabled = isBusy ? "disabled" : "";
    var finishLabel = finalMode ? "完成录音" : "结束录音";

    return '' +
      '<div class="record-meta-inline">' +
        metaInputHtml("school", "学校") +
        metaInputHtml("classroom", "教室") +
        metaInputHtml("teacher", "授课老师") +
        metaInputHtml("course", "课程名称") +
      '</div>' +
      '<div class="photo-strip">' +
        '<button type="button">' + imageIcon() + '<span>插入照片</span></button>' +
      '</div>' +
      '<div class="live-transcript" data-bz-asr-live>' + oldTranscriptHtml(finalMode) + '</div>' +
      '<div class="wave-line" aria-hidden="true">' + oldWaveSvg() + '</div>' +
      '<div class="recorder-actions">' +
        '<button class="text-danger" type="button" data-bz-asr-discard>' + trashIcon() + '<span>放弃录音</span></button>' +
        '<span class="recorder-timer bz-asr-clock">' + formatClock(state.elapsed) + '</span>' +
        (isRecording
          ? '<button class="round-action" type="button" data-bz-asr-pause aria-label="暂停录音">' + pauseIcon() + '</button>'
          : '<button class="round-action" type="button" data-bz-asr-start ' + (isBusy || finalMode ? "disabled" : "") + ' aria-label="继续录音">' + playIcon() + '</button>') +
        '<button class="line-button" type="button" data-bz-asr-stop ' + stopDisabled + '>' + squareIcon() + '<span>' + finishLabel + '</span></button>' +
        (finalMode ? '<button class="primary-action" type="button" data-bz-asr-ask>让小智总结</button>' : '') +
      '</div>';
  }

  function metaInputHtml(key, label) {
    return '<label><span>' + label + '</span><input data-bz-asr-meta="' + key + '" placeholder="' + label + '" value="' + esc(lessonMeta[key] || "") + '"></label>';
  }

  function oldTranscriptHtml(includeAllDone) {
    if (state.error) {
      return '<article class="transcript-line--new bz-asr-error-row"><time>' + esc(formatWallTime(0)) + '</time><strong>系统提示</strong><p>' + esc(state.error) + '</p></article>';
    }

    if (state.mode === "requesting") {
      return '<article class="transcript-line--new"><time>' + esc(formatWallTime(0)) + '</time><strong>系统提示</strong><p>等待麦克风授权...</p></article>';
    }

    if (state.mode === "transcribing" || state.mode === "batch-transcribing") {
      return '<article class="transcript-line--new"><time>' + esc(formatWallTime(state.elapsed)) + '</time><strong>系统提示</strong><p>正在整理课堂原文，请稍等...</p></article>';
    }

    var lines = splitTranscriptLines(state.text);
    if (!lines.length) {
      return '<article class="transcript-line--new"><time>' + esc(formatWallTime(0)) + '</time><strong>Speaker A</strong><p>正在听课，识别内容会一句一句出现在这里。</p></article>';
    }

    return lines.map(function(line, index) {
      var isCurrent = !includeAllDone && index === lines.length - 1 && !/[。！？!?；;]$/.test(line);
      return '<article class="' + (isCurrent ? "transcript-line--new" : "") + '">' +
        '<time>' + esc(formatWallTime(index * 8)) + '</time>' +
        '<strong>Speaker ' + (index % 2 === 0 ? "A" : "B") + '</strong>' +
        '<p>' + esc(line) + '</p>' +
      '</article>';
    }).join("");
  }

  function oldWaveSvg() {
    return '<svg viewBox="0 0 620 86" role="img" aria-label="录音声纹">' +
      '<path class="wave-thread wave-soft" d="M0.0 32.5 C 14.8 30.2, 29.5 29.0, 44.3 29.0 C 59.0 29.0, 73.8 30.3, 88.6 32.5 C 103.3 34.8, 118.1 38.0, 132.9 41.5 C 147.6 45.0, 162.4 48.7, 177.1 52.0 C 191.9 55.2, 206.7 57.9, 221.4 59.4 C 236.2 61.0, 251.0 61.4, 265.7 60.6 C 280.5 59.8, 295.2 57.8, 310.0 54.9 C 324.8 52.1, 339.5 48.6, 354.3 45.0 C 369.0 41.4, 383.8 37.8, 398.6 35.0 C 413.3 32.2, 428.1 30.2, 442.9 29.4 C 457.6 28.6, 472.4 29.0, 487.1 30.6 C 501.9 32.2, 516.7 34.9, 531.4 38.1 C 546.2 41.3, 561.0 45.1, 575.7 48.6 C 590.5 52.1, 605.2 55.3, 620.0 57.5"></path>' +
      '<path class="wave-thread wave-main" d="M0.0 43.0 C 14.8 38.3, 29.5 33.6, 44.3 29.9 C 59.0 26.2, 73.8 23.6, 88.6 22.5 C 103.3 21.5, 118.1 22.0, 132.9 24.1 C 147.6 26.1, 162.4 29.6, 177.1 33.9 C 191.9 38.1, 206.7 43.1, 221.4 47.7 C 236.2 52.3, 251.0 56.5, 265.7 59.4 C 280.5 62.4, 295.2 64.0, 310.0 64.0 C 324.8 64.0, 339.5 62.4, 354.3 59.4 C 369.0 56.5, 383.8 52.3, 398.6 47.7 C 413.3 43.1, 428.1 38.1, 442.9 33.9 C 457.6 29.6, 472.4 26.1, 487.1 24.1 C 501.9 22.0, 516.7 21.5, 531.4 22.5 C 546.2 23.6, 561.0 26.2, 575.7 29.9 C 590.5 33.6, 605.2 38.3, 620.0 43.0"></path>' +
      '<path class="wave-thread wave-low" d="M0.0 35.6 C 14.8 36.5, 29.5 38.3, 44.3 40.5 C 59.0 42.8, 73.8 45.6, 88.6 48.3 C 103.3 50.9, 118.1 53.5, 132.9 55.4 C 147.6 57.3, 162.4 58.6, 177.1 58.9 C 191.9 59.2, 206.7 58.6, 221.4 57.2 C 236.2 55.8, 251.0 53.6, 265.7 51.0 C 280.5 48.5, 295.2 45.7, 310.0 43.1 C 324.8 40.6, 339.5 38.3, 354.3 36.9 C 369.0 35.4, 383.8 34.8, 398.6 35.1 C 413.3 35.3, 428.1 36.6, 442.9 38.5 C 457.6 40.3, 472.4 42.9, 487.1 45.6 C 501.9 48.2, 516.7 51.0, 531.4 53.3 C 546.2 55.6, 561.0 57.4, 575.7 58.3 C 590.5 59.2, 605.2 59.2, 620.0 58.4"></path>' +
    '</svg>';
  }

  function bindModal(root) {
    var closeButtons = root.querySelectorAll(".bz-asr-close,[data-bz-asr-close]");
    closeButtons.forEach(function(button) {
      button.addEventListener("click", closeModal);
    });

    var start = root.querySelector("[data-bz-asr-start]");
    if (start) {
      start.addEventListener("click", startRecording);
    }

    var stop = root.querySelector("[data-bz-asr-stop]");
    if (stop) {
      stop.addEventListener("click", stopRecording);
    }

    var ask = root.querySelector("[data-bz-asr-ask]");
    if (ask) {
      ask.addEventListener("click", askXiaoZhi);
    }

    var pause = root.querySelector("[data-bz-asr-pause]");
    if (pause) {
      pause.addEventListener("click", function(event) {
        event.preventDefault();
      });
    }

    var discard = root.querySelector("[data-bz-asr-discard]");
    if (discard) {
      discard.addEventListener("click", discardRecording);
    }

    root.querySelectorAll("[data-bz-asr-meta]").forEach(function(input) {
      input.addEventListener("input", function() {
        lessonMeta[input.getAttribute("data-bz-asr-meta")] = input.value;
      });
    });
  }

  function closeModal() {
    if (state.mode === "recording") {
      stopRecording();
      return;
    }

    restoreClassroomHost();
    cleanupStream();
  }

  function discardRecording() {
    state.mode = "idle";
    cleanupStream();
    restoreClassroomHost();
  }

  function showError(message) {
    state.mode = "error";
    state.error = message;
    scheduleRender();
  }

  function tickTimer() {
    clearInterval(timer);
    timer = setInterval(function() {
      state.elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      var clock = document.querySelector("#bz-asr-modal .bz-asr-clock");
      if (clock && state.mode === "recording") {
        clock.textContent = formatClock(state.elapsed);
      }
    }, 500);
  }

  function createNote(text, segments, duration) {
    var now = new Date();
    var id = "asr-" + now.getTime();
    var titlePrefix = lessonMeta.course || lessonMeta.classroom || "课堂录音";
    var title = titlePrefix + " " + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + " " + pad(now.getHours()) + ":" + pad(now.getMinutes());

    return {
      id: id,
      title: title,
      type: "classroom",
      date: "刚刚",
      createdAt: now.toISOString(),
      duration: duration || state.elapsed,
      transcript: text,
      content: text,
      segments: segments,
      meta: Object.assign({}, lessonMeta),
    };
  }

  function saveNote(note) {
    var notes = loadNotes().filter(function(item) {
      return item.id !== note.id;
    });
    notes.unshift(note);
    localStorage.setItem(NOTE_KEY, JSON.stringify(notes.slice(0, MAX_NOTES)));
  }

  function loadNotes() {
    try {
      var value = JSON.parse(localStorage.getItem(NOTE_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function pushNoteToXiaoZhi(note) {
    window.dispatchEvent(new CustomEvent("baizhi:asr-note", { detail: note }));

    if (window.BaizhiXiaoZhi && typeof window.BaizhiXiaoZhi.addAsrNote === "function") {
      window.BaizhiXiaoZhi.addAsrNote(note);
    }
  }

  function askXiaoZhi() {
    if (state.note) {
      pushNoteToXiaoZhi(state.note);
    }

    var input = document.getElementById("xz-input");
    var send = document.getElementById("xz-send-btn");

    if (input && send) {
      input.value = "请根据刚刚的课堂录音，帮我整理重点、待复习概念和 5 道练习题。";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      send.click();
      closeModal();
      return;
    }

    closeModal();
  }

  function cleanupStream() {
    clearInterval(timer);
    timer = null;
    cleanupAudioInput();
    cleanupRealtimeSocket();

    recorder = null;
  }

  function cleanupAudioInput(stopTracks) {
    if (stopTracks !== false) {
      stopTracks = true;
    }

    if (audioProcessor) {
      audioProcessor.disconnect();
      audioProcessor.onaudioprocess = null;
    }

    if (audioSource) {
      audioSource.disconnect();
    }

    if (audioContext && audioContext.state !== "closed") {
      audioContext.close().catch(function() {});
    }

    if (stopTracks && stream) {
      stream.getTracks().forEach(function(track) {
        track.stop();
      });
      stream = null;
    }

    audioContext = null;
    audioSource = null;
    audioProcessor = null;
  }

  function cleanupRealtimeSocket() {
    if (realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) {
      realtimeSocket.close(1000, "done");
    }

    realtimeSocket = null;
  }

  function updateLiveTranscript() {
    var node = document.querySelector("#bz-asr-modal [data-bz-asr-live]");
    if (node) {
      node.innerHTML = oldTranscriptHtml(false);
      node.scrollTop = node.scrollHeight;
    }
  }

  function switchToClassroomView() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll("button"));
    var target = buttons.find(function(button) {
      return button.textContent && button.textContent.replace(/\s+/g, "").indexOf("今日课堂") >= 0;
    });

    if (target) {
      target.click();
    }
  }

  function scheduleRender() {
    renderModal();
    window.setTimeout(renderModal, 80);
    window.setTimeout(renderModal, 240);
  }

  function getClassroomHost() {
    return document.querySelector(".glass-card.recorder-card");
  }

  function restoreClassroomHost() {
    var host = getClassroomHost();
    if (!host) {
      return;
    }

    if (originalRecorderCardHtml) {
      host.innerHTML = originalRecorderCardHtml;
    } else {
      var existing = document.getElementById("bz-asr-modal");
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
    }
  }

  function classroomMetaHtml(isRecording) {
    if (!isRecording && state.mode !== "done") {
      return "";
    }

    return '<div class="bz-asr-class-meta">' +
      '<span>' + esc(formatToday()) + '</span>' +
      '<span>课堂原文</span>' +
      '<span>' + (state.mode === "done" ? "已生成" : "实时记录中") + '</span>' +
    '</div>';
  }

  function transcriptLinesHtml(text, includeAllDone) {
    if (!text) {
      return "";
    }

    var lines = splitTranscriptLines(text);
    return lines.map(function(line, index) {
      var isCurrent = !includeAllDone && index === lines.length - 1 && !/[。！？!?；;]$/.test(line);
      return '<p class="bz-asr-line ' + (isCurrent ? "is-current" : "") + '"><span class="bz-asr-line-time">' + esc(formatLineTime(index)) + '</span><span class="bz-asr-line-text">' + esc(line) + '</span></p>';
    }).join("");
  }

  function syncLiveLines(text) {
    var lines = splitTranscriptLines(text);
    liveLines = lines.filter(function(line) {
      return /[。！？!?；;]$/.test(line);
    });
    livePartial = lines.length ? lines[lines.length - 1] : "";
  }

  function splitTranscriptLines(text) {
    var normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return [];
    }

    var matches = normalized.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [normalized];
    return matches.map(function(item) {
      return item.trim();
    }).filter(Boolean);
  }

  function formatLineTime(index) {
    var sec = Math.max(0, Math.min(state.elapsed || 0, index * 6));
    return formatClock(sec);
  }

  function formatWallTime(offsetSeconds) {
    var base = startedAt ? new Date(startedAt) : new Date();
    var time = new Date(base.getTime() + Math.max(0, offsetSeconds || 0) * 1000);
    return pad(time.getHours()) + ":" + pad(time.getMinutes()) + ":" + pad(time.getSeconds());
  }

  function formatToday() {
    var now = new Date();
    return now.getFullYear() + "." + pad(now.getMonth() + 1) + "." + pad(now.getDate());
  }

  function waveBarsHtml(count) {
    var html = "";
    for (var i = 0; i < count; i += 1) {
      html += "<i></i>";
    }
    return html;
  }

  function pickMimeType() {
    var types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/mpeg",
    ];

    for (var i = 0; i < types.length; i += 1) {
      if (MediaRecorder.isTypeSupported(types[i])) {
        return types[i];
      }
    }

    return "";
  }

  function fileExt(type) {
    if (type.indexOf("mp4") >= 0) return "m4a";
    if (type.indexOf("mpeg") >= 0) return "mp3";
    return "webm";
  }

  function realtimeUrl() {
    var protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return protocol + "//" + window.location.host + REALTIME_ASR_ENDPOINT;
  }

  function resampleTo16k(input, sourceRate) {
    var targetRate = 16000;

    if (sourceRate === targetRate) {
      return input;
    }

    var ratio = sourceRate / targetRate;
    var length = Math.floor(input.length / ratio);
    var output = new Float32Array(length);

    for (var i = 0; i < length; i += 1) {
      output[i] = input[Math.floor(i * ratio)] || 0;
    }

    return output;
  }

  function floatTo16BitPcm(input) {
    var output = new Int16Array(input.length);

    for (var i = 0; i < input.length; i += 1) {
      var sample = Math.max(-1, Math.min(1, input[i]));
      output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    return output;
  }

  function formatClock(total) {
    var hour = Math.floor(total / 3600);
    var min = Math.floor((total % 3600) / 60);
    var sec = total % 60;
    return pad(hour) + ":" + pad(min) + ":" + pad(sec);
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function micIcon() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19v3"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><rect x="9" y="2" width="6" height="13" rx="3"></rect></svg>';
  }

  function imageIcon() {
    return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="m21 15-5-5L5 21"></path><path d="M15 3v5"></path><path d="M12.5 5.5h5"></path></svg>';
  }

  function trashIcon() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v5"></path><path d="M14 11v5"></path></svg>';
  }

  function pauseIcon() {
    return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5v14"></path><path d="M14 5v14"></path></svg>';
  }

  function playIcon() {
    return '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l10-6.5-10-6.5Z"></path></svg>';
  }

  function squareIcon() {
    return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10" rx="1.5"></rect></svg>';
  }

  function injectStyle() {
    if (document.getElementById("bz-asr-style")) {
      return;
    }

    var style = document.createElement("style");
    style.id = "bz-asr-style";
    style.textContent =
      ".bz-asr-old-recorder{width:100%;min-height:560px}" +
      ".bz-asr-old-recorder .live-transcript{min-height:150px;max-height:260px;overflow:auto;scroll-behavior:smooth}" +
      ".bz-asr-old-recorder .bz-asr-error-row p{color:#b42318}" +
      ".bz-asr-old-recorder .recorder-actions button:disabled{opacity:.45;cursor:not-allowed}" +
      ".bz-asr-old-recorder .primary-action[data-bz-asr-ask]{margin-left:8px}" +
      "@media(max-width:720px){.bz-asr-old-recorder{min-height:calc(100vh - 120px)}.bz-asr-old-recorder .live-transcript{max-height:38vh}}";
    document.head.appendChild(style);
    return;
    style.textContent =
      ".bz-asr-embed{width:100%;height:100%;min-height:560px}" +
      ".bz-asr-inline{width:100%;height:100%;min-height:560px;padding:28px 30px;align-content:stretch!important;gap:18px!important}" +
      ".bz-asr-inline-head{display:flex;align-items:center;justify-content:center;gap:24px;text-align:left;margin:auto auto 0}" +
      ".bz-asr-inline-head .record-empty-stage{width:190px;transform:scale(.9);transform-origin:center}" +
      ".bz-asr-inline-head h3{margin:0;font-size:28px;font-weight:850;letter-spacing:0;line-height:1.2;color:var(--ink,#0f1110)}" +
      ".bz-asr-inline-head p{margin:8px 0 0;color:var(--muted,#6b7280);font-size:14px;line-height:1.55}" +
      ".bz-asr-inline.is-classroom-live{grid-template-rows:auto auto minmax(0,1fr) auto;align-content:stretch!important}" +
      ".bz-asr-inline.is-classroom-live .bz-asr-inline-head{margin:0;justify-content:flex-start}" +
      ".bz-asr-inline.is-classroom-status .bz-asr-inline-head{margin:auto auto 0;text-align:center;flex-direction:column;gap:8px}" +
      ".bz-asr-inline.is-classroom-status .bz-asr-inline-head .record-empty-stage{transform:scale(1);width:272px}" +
      ".bz-asr-backdrop{display:none}" +
      ".bz-asr-card{position:fixed;z-index:9999;left:50%;top:50%;transform:translate(-50%,-50%);width:min(460px,calc(100vw - 32px));border:1px solid var(--line,#e5e7eb);border-radius:18px;background:var(--surface,#fff);box-shadow:0 28px 80px -40px rgba(15,17,16,.65);padding:22px;color:var(--ink,#0f1110)}" +
      ".bz-asr-classroom{display:grid;grid-template-rows:auto auto 1fr auto;left:50%;top:50%;width:min(980px,calc(100vw - 36px));height:min(720px,calc(100vh - 36px));padding:28px 30px 24px;border-radius:26px;background:linear-gradient(180deg,#fff,#fbfcf7);box-shadow:0 34px 90px -48px rgba(15,17,16,.7);overflow:hidden}" +
      ".bz-asr-request{width:min(440px,calc(100vw - 32px))}" +
      ".bz-asr-close{position:absolute;right:18px;top:18px;display:grid;place-items:center;width:34px;height:34px;border:0;border-radius:50%;background:#0f111012;color:inherit;font-size:22px;line-height:1;cursor:pointer;z-index:2}" +
      ".bz-asr-close:hover{background:#0f11101f}" +
      ".bz-asr-head{display:flex;gap:14px;align-items:flex-start;padding-right:40px}" +
      ".bz-asr-icon{display:grid;place-items:center;width:48px;height:48px;border-radius:16px;background:var(--accent,#d9ff45);color:#0f1110;flex-shrink:0;box-shadow:inset 0 1px rgba(255,255,255,.7)}" +
      ".bz-asr-head h2{margin:0;font-size:28px;line-height:1.15;font-weight:850;letter-spacing:0}" +
      ".bz-asr-head p{margin:8px 0 0;color:var(--muted,#6b7280);font-size:14px;line-height:1.55}" +
      ".bz-asr-meter{display:flex;align-items:center;justify-content:center;gap:5px;height:72px;margin:18px 0 8px;border-radius:14px;background:#0f11100a}" +
      ".bz-asr-meter span{display:block;width:5px;height:18px;border-radius:999px;background:#0f111033}" +
      ".bz-asr-meter.is-live span{background:var(--accent,#d9ff45);animation:bzAsrWave 1s ease-in-out infinite}" +
      ".bz-asr-meter.is-live span:nth-child(2){height:30px;animation-delay:.12s}.bz-asr-meter.is-live span:nth-child(3){height:42px;animation-delay:.24s}.bz-asr-meter.is-live span:nth-child(4){height:28px;animation-delay:.36s}.bz-asr-meter.is-live span:nth-child(5){height:20px;animation-delay:.48s}" +
      "@keyframes bzAsrWave{0%,100%{transform:scaleY(.55);opacity:.65}50%{transform:scaleY(1.15);opacity:1}}" +
      ".bz-asr-class-meta{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 0}" +
      ".bz-asr-class-meta span{display:inline-flex;align-items:center;height:28px;padding:0 11px;border:1px solid var(--line,#e5e7eb);border-radius:999px;background:#fff;color:var(--muted,#6b7280);font-size:12px;font-weight:700;letter-spacing:0}" +
      ".bz-asr-classroom-body{position:relative;min-height:0;margin:4px 0 0;border:1px solid var(--line,#e5e7eb);border-radius:22px;background:#fff;box-shadow:inset 0 1px rgba(255,255,255,.8);overflow:hidden}" +
      ".bz-asr-lines{height:100%;max-height:100%;overflow:auto;padding:22px 22px 28px;scroll-behavior:smooth}" +
      ".bz-asr-line{display:grid;grid-template-columns:56px minmax(0,1fr);gap:14px;align-items:start;margin:0 0 14px;animation:bzAsrLineIn .28s ease-out both}" +
      ".bz-asr-line:last-child{margin-bottom:0}" +
      ".bz-asr-line-time{padding-top:3px;color:#9aa0a6;font-size:12px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:0}" +
      ".bz-asr-line-text{display:block;padding:13px 15px;border-radius:16px;background:#f7f8f4;color:var(--ink,#0f1110);font-size:16px;line-height:1.72;font-weight:560;letter-spacing:0}" +
      ".bz-asr-line.is-current .bz-asr-line-text{background:#f2ffd2;box-shadow:0 0 0 1px rgba(168,212,0,.2)}" +
      ".bz-asr-live-empty{position:absolute;left:22px;right:22px;top:22px;padding:24px;border:1px dashed #0f11101f;border-radius:18px;color:var(--muted,#6b7280);font-size:14px;line-height:1.7;background:#fafafa}" +
      ".bz-asr-live-empty.is-hidden{display:none}" +
      "@keyframes bzAsrLineIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}" +
      ".bz-asr-clock{font-size:14px;font-weight:850;text-align:center;font-variant-numeric:tabular-nums;letter-spacing:0;margin:0;color:#fff}" +
      ".bz-asr-status,.bz-asr-error{margin:8px 0 0;padding:10px 12px;border-radius:12px;font-size:13px;line-height:1.55;background:#0f11100a;color:var(--muted,#6b7280)}" +
      ".bz-asr-error{background:#fff2f0;color:#b42318}" +
      ".bz-asr-result{display:grid;gap:10px}.bz-asr-result audio{width:calc(100% - 44px);margin:16px 22px 0}" +
      ".bz-asr-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:12px}" +
      ".bz-asr-classroom>.bz-asr-actions{margin-top:0}" +
      ".bz-asr-actions button{height:40px;padding:0 16px;border-radius:999px;font-size:13px;font-weight:800;cursor:pointer}" +
      ".bz-asr-secondary{border:1px solid var(--line,#e5e7eb);background:#fff;color:var(--ink,#0f1110)}" +
      ".bz-asr-primary{border:0;background:var(--ink,#0f1110);color:var(--accent,#d9ff45)}" +
      ".bz-asr-actions button:disabled{opacity:.45;cursor:not-allowed}" +
      ".bz-asr-recbar{display:grid;grid-template-columns:auto minmax(120px,1fr) auto;align-items:center;gap:16px;width:100%;min-height:68px;padding:10px 12px 10px 16px;border-radius:22px;background:var(--ink,#0f1110);box-shadow:0 18px 42px -24px rgba(15,17,16,.8)}" +
      ".bz-asr-recstate{display:inline-flex;align-items:center;gap:8px;color:#fff;font-size:13px;font-weight:800;white-space:nowrap}" +
      ".bz-asr-dot{width:8px;height:8px;border-radius:50%;background:#ff5145;box-shadow:0 0 0 5px rgba(255,81,69,.16);animation:bzAsrPulse 1.25s ease-in-out infinite}" +
      "@keyframes bzAsrPulse{50%{transform:scale(.72);opacity:.72}}" +
      ".bz-asr-bottom-wave{display:flex;align-items:center;justify-content:center;gap:4px;height:42px;min-width:0;overflow:hidden}" +
      ".bz-asr-bottom-wave i{display:block;width:4px;border-radius:999px;background:var(--accent,#d9ff45);animation:bzAsrBottomWave 1.2s ease-in-out infinite;opacity:.82}" +
      ".bz-asr-bottom-wave i:nth-child(3n+1){height:12px;animation-delay:.05s}.bz-asr-bottom-wave i:nth-child(3n+2){height:28px;animation-delay:.16s}.bz-asr-bottom-wave i:nth-child(3n){height:20px;animation-delay:.28s}" +
      "@keyframes bzAsrBottomWave{0%,100%{transform:scaleY(.58);opacity:.55}50%{transform:scaleY(1.18);opacity:1}}" +
      ".bz-asr-recbar .bz-asr-primary{height:44px;padding:0 20px;background:var(--accent,#d9ff45);color:var(--ink,#0f1110)}" +
      "@media(max-width:720px){.bz-asr-inline{padding:20px 14px;min-height:calc(100vh - 110px)}.bz-asr-inline-head{align-items:flex-start;gap:12px}.bz-asr-inline-head .record-empty-stage{width:120px;transform:scale(.72);margin-left:-18px}.bz-asr-inline-head h3{font-size:22px}.bz-asr-inline-head p{font-size:13px}.bz-asr-classroom{width:100vw;height:100vh;border-radius:0;padding:22px 16px 18px}.bz-asr-head h2{font-size:24px}.bz-asr-head p{font-size:13px}.bz-asr-classroom-body{margin:0}.bz-asr-line{grid-template-columns:44px minmax(0,1fr);gap:10px}.bz-asr-line-text{font-size:14px;padding:11px 12px}.bz-asr-recbar{grid-template-columns:1fr auto;gap:10px}.bz-asr-bottom-wave{grid-column:1 / -1;grid-row:2}.bz-asr-recbar .bz-asr-primary{height:40px;padding:0 16px}}";
    document.head.appendChild(style);
  }
})();
