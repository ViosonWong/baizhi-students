(function initBaizhiAsrRecorder() {
  var REALTIME_ASR_ENDPOINT = "/api/asr/realtime";
  var AUDIO_RECORD_ENDPOINT = "/api/class-audio-records";
  var AUDIO_TASK_ENDPOINT = "/api/class-audio-tasks";
  var NOTE_KEY = "baizhi_asr_notes";
  var AUDIO_RECORD_KEY = "baizhi_class_audio_records";
  var MOCK_USER_KEY = "baizhi_mock_user_id";
  var AUDIO_DB_NAME = "baizhi_client_db";
  var AUDIO_BLOB_STORE = "class_audio_blobs";
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
  var pendingRecording = null;
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
    segments: [],
    note: null,
  };
  var liveLines = [];
  var livePartial = "";
  var speakerAliasMap = {};
  var speakerAliasNext = 0;
  var activeDetailTab = "transcript";
  var reattachTimer = null;
  var classroomHostObserver = null;
  var audioRecordPeriodOpen = {
    "今天": true,
    "本周": true,
    "更早": false,
  };

  injectStyle();
  cleanupPreviewAudioRecords();
  document.addEventListener("click", interceptRecordClicks, true);
  document.addEventListener("click", renderAudioRecordsAfterAiNoteClick, true);
  document.addEventListener("click", renderMarketAfterKnowledgeClick, true);
  document.addEventListener("click", renderRecorderAfterClassroomClick, true);
  document.addEventListener("click", interceptOwnPublishedUnlockClick, true);
  window.addEventListener("beforeunload", cleanupStream);
  observeClassroomHost();
  window.BaizhiAudioRecords = {
    render: renderAudioRecordsPanel,
    list: loadAudioRecords,
    currentUserId: currentUserId,
    runTask: runAudioTask,
  };

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

  function renderRecorderAfterClassroomClick(event) {
    if (!hasActiveRecordingSession()) {
      return;
    }

    var target = event.target.closest("button,a,[role='button'],.nav-item,.side-nav-item,.sidebar-item");
    var targetText = target && target.textContent ? target.textContent.replace(/\s+/g, "") : "";
    if (targetText.indexOf("今日课堂") < 0 && targetText.indexOf("课堂") < 0) {
      return;
    }

    scheduleRecorderReattach();
  }

  function renderAudioRecordsAfterAiNoteClick(event) {
    var button = event.target.closest("button");
    if (!button || !button.textContent || button.textContent.replace(/\s+/g, "").indexOf("AI笔记") < 0) {
      return;
    }

    window.setTimeout(function() {
      refreshServerAudioRecords();
      renderAudioRecordsPanel();
    }, 260);
  }

  function renderMarketAfterKnowledgeClick(event) {
    var button = event.target.closest("button");
    if (!button || !button.textContent || button.textContent.replace(/\s+/g, "").indexOf("知识广场") < 0) {
      return;
    }

    schedulePublishedMarketRender();
  }

  function interceptOwnPublishedUnlockClick(event) {
    var button = event.target.closest("[data-bz-own-note-unlock]");
    if (!button) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    showFloatingToast("这是你自己的笔记呦");
  }

  function openModal() {
    if (!window.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError("当前浏览器不支持网页录音，请使用最新版 Chrome、Edge 或 Safari。");
      return;
    }

    if (hasActiveRecordingSession()) {
      switchToClassroomView();
      scheduleRecorderReattach();
      return;
    }

    state = {
      mode: "requesting",
      elapsed: 0,
      error: "",
      text: "",
      segments: [],
      note: null,
    };
    liveLines = [];
    livePartial = "";
    pendingRecording = null;
    resetSpeakerAliases();
    startRecording();
  }

  async function startRecording() {
    try {
      state.mode = "requesting";
      state.error = "";
      state.text = "";
      state.segments = [];
      state.note = null;
      liveLines = [];
      livePartial = "";
      pendingRecording = null;
      resetSpeakerAliases();

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
        prepareRecordingForConfirmation();
      } else if (state.mode === "transcribing") {
        capturePendingRecording();
      }
    };
    recorder.start(1000);
  }

  function stopBackupRecorder(useFallback) {
    if (!recorder || recorder.state === "inactive") {
      if (useFallback) {
        prepareRecordingForConfirmation();
      }
      return;
    }

    recorder.stop();
  }

  function capturePendingRecording() {
    clearInterval(timer);
    timer = null;
    cleanupAudioInput();

    var blob = new Blob(chunks, { type: (chunks[0] && chunks[0].type) || "audio/webm" });

    if (!blob.size) {
      return null;
    }

    if (lastBlobUrl) {
      URL.revokeObjectURL(lastBlobUrl);
    }
    lastBlobUrl = URL.createObjectURL(blob);

    pendingRecording = {
      blob: blob,
      audioUrl: lastBlobUrl,
      fileName: "baizhi-class-recording." + fileExt(blob.type),
      mimeType: blob.type || "audio/webm",
      duration: state.elapsed,
      realtimeText: state.text,
      realtimeSegments: state.segments || [],
    };

    return pendingRecording;
  }

  function prepareRecordingForConfirmation() {
    var recording = capturePendingRecording();
    if (!recording) {
      showError("没有录到有效音频，请重新录制。");
      return;
    }

    state.mode = "confirming";
    renderModal();
  }

  async function runFineTranscription(record) {
    try {
      var updated = await runAudioTask(record.id, "transcribe");
      var text = String(updated.transcript || updated.content || "").trim();
      var segments = normalizeSpeakerSegments(updated.segments || []);

      if (!text) {
        throw new Error("ASR 没有返回可用文本。");
      }

      state.note = createNote(text, segments, updated.duration, updated);
      saveNote(state.note);
      pushNoteToXiaoZhi(state.note);
      renderAudioRecordsPanel(updated.id);
    } catch (error) {
      record.statusLabel = "转写失败";
      record.processing.fineTranscription = "failed";
      record.processing.error = error.message;
      record.updatedAt = new Date().toISOString();
      saveAudioRecord(record);
      patchServerAudioRecord(record);
      renderAudioRecordsPanel(record.id);
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
      if (Array.isArray(data.segments)) {
        state.segments = normalizeSpeakerSegments(data.segments);
      }
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
    state.segments = normalizeSpeakerSegments((data && data.segments) || state.segments || []);
    if (!pendingRecording) {
      capturePendingRecording();
    }
    if (pendingRecording) {
      pendingRecording.realtimeText = text;
      pendingRecording.realtimeSegments = state.segments;
      pendingRecording.duration = (data && data.duration) || state.elapsed;
    }
    state.mode = "confirming";
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
    if (state.mode === "confirming") {
      renderConfirmOverlay();
      return;
    }

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

  function renderConfirmOverlay() {
    restoreClassroomHost(false);

    var existing = document.getElementById("bz-asr-modal");
    if (!existing) {
      existing = document.createElement("div");
      existing.id = "bz-asr-modal";
      document.body.appendChild(existing);
    }

    existing.className = "modal-backdrop bz-confirm-overlay";
    existing.innerHTML = confirmLessonHtml();
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

  function confirmLessonHtml() {
    return '' +
      '<section class="compact-modal wide bz-confirm-shell">' +
        '<button class="modal-close bz-confirm-close" type="button" data-bz-asr-discard aria-label="关闭">×</button>' +
        '<div class="bz-confirm-head">' +
          '<h2>课堂信息确认</h2>' +
          '<p>是否已录入学校、教室、老师和课程？这些信息不是必填，跳过后也会继续生成笔记。</p>' +
        '</div>' +
        '<div class="meta-form compact bz-confirm-form">' +
          confirmInputHtml("course", "课程", "如：高等数学") +
          confirmInputHtml("teacher", "老师", "如：张老师") +
          confirmInputHtml("school", "学校", "如：北京某大学") +
          confirmInputHtml("classroom", "教室", "如：A203") +
        '</div>' +
        '<div class="bz-confirm-audio">' +
          '<span>录音时长</span><strong>' + esc(formatClock((pendingRecording && pendingRecording.duration) || state.elapsed || 0)) + '</strong>' +
          (pendingRecording && pendingRecording.audioUrl ? '<audio controls src="' + esc(pendingRecording.audioUrl) + '"></audio>' : '') +
        '</div>' +
        '<div class="meta-actions bz-confirm-actions">' +
          '<button class="secondary-action bz-confirm-secondary" type="button" data-bz-asr-confirm-skip>跳过，直接生成</button>' +
          '<button class="primary-action bz-confirm-primary" type="button" data-bz-asr-confirm-save>保存并生成笔记</button>' +
        '</div>' +
      '</section>';
  }

  function confirmInputHtml(key, label, placeholder) {
    return '<label><span>' + label + '</span><input data-bz-asr-meta="' + key + '" placeholder="' + esc(placeholder) + '" value="' + esc(lessonMeta[key] || "") + '"></label>';
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

    var entries = transcriptEntries();
    if (!entries.length) {
      return '<article class="transcript-line--new"><time>' + esc(formatWallTime(0)) + '</time><strong>Speaker A</strong><p>正在听课，识别内容会一句一句出现在这里。</p></article>';
    }

    return entries.map(function(entry, index) {
      var line = entry.text || "";
      var isCurrent = !includeAllDone && index === entries.length - 1 && !/[。！？!?；;]$/.test(line);
      return '<article class="' + (isCurrent ? "transcript-line--new" : "") + '">' +
        '<time>' + esc(formatEntryWallTime(entry, index)) + '</time>' +
        '<strong>' + esc(speakerLabel(entry, index)) + '</strong>' +
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

    var confirmSave = root.querySelector("[data-bz-asr-confirm-save]");
    if (confirmSave) {
      confirmSave.addEventListener("click", function() {
        confirmLessonAndCreateRecord(false);
      });
    }

    var confirmSkip = root.querySelector("[data-bz-asr-confirm-skip]");
    if (confirmSkip) {
      confirmSkip.addEventListener("click", function() {
        confirmLessonAndCreateRecord(true);
      });
    }

    root.querySelectorAll("[data-bz-asr-meta]").forEach(function(input) {
      input.addEventListener("input", function() {
        lessonMeta[input.getAttribute("data-bz-asr-meta")] = input.value;
      });
    });
  }

  function closeModal() {
    if (hasActiveRecordingSession()) {
      restoreClassroomHost();
      showFloatingToast("录音仍在进行，回到今日课堂可继续查看转译。");
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

  async function confirmLessonAndCreateRecord(skipMeta) {
    if (!pendingRecording) {
      showError("没有找到可保存的录音，请重新录制。");
      return;
    }

    if (skipMeta) {
      lessonMeta = {
        school: "",
        classroom: "",
        teacher: "",
        course: "",
      };
    }

    var record = createAudioRecord(pendingRecording);

    try {
      setConfirmBusy(true);
      var serverRecord = await createServerAudioRecord(record, pendingRecording.blob);
      record = normalizeServerRecord(serverRecord || record);
      record.serverSynced = true;
      saveAudioRecord(record);
      saveAudioBlob(record.id, pendingRecording.blob);
      restoreClassroomHost();
      cleanupStream();
      goToAiNotes(record.id);
      simulateAudioRecordPipeline(record.id, pendingRecording.blob);
    } catch (error) {
      setConfirmBusy(false);
      showInlineConfirmError("保存服务器失败：" + error.message);
    }
  }

  function createAudioRecord(recording) {
    var now = new Date();
    var id = "audio-" + now.getTime();
    var titlePrefix = lessonMeta.course || lessonMeta.classroom || "新录音";
    var title = titlePrefix + " " + pad(now.getFullYear()) + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + " " + pad(now.getHours()) + ":" + pad(now.getMinutes());

    return {
      id: id,
      userId: currentUserId(),
      tableName: "class_audio_records",
      title: title,
      type: "classroom_audio",
      date: "刚刚",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      duration: recording.duration || state.elapsed,
      fileName: recording.fileName,
      mimeType: recording.mimeType,
      size: recording.blob ? recording.blob.size : 0,
      audioStorage: {
        database: AUDIO_DB_NAME,
        store: AUDIO_BLOB_STORE,
        key: id,
      },
      status: "file_transfer",
      statusLabel: "文件传输",
      stageIndex: 0,
      stages: processingStages(),
      transcript: recording.realtimeText || state.text || "",
      content: recording.realtimeText || state.text || "",
      segments: recording.realtimeSegments || state.segments || [],
      meta: Object.assign({}, lessonMeta),
      processing: {
        fineTranscription: "pending",
        diarization: "pending",
        summary: "pending",
        quiz: "pending",
        review: "pending",
      },
      artifacts: {},
    };
  }

  function createNote(text, segments, duration, sourceRecord) {
    var now = new Date();
    var id = sourceRecord ? "note-" + sourceRecord.id : "asr-" + now.getTime();
    var titlePrefix = lessonMeta.course || lessonMeta.classroom || "课堂录音";
    var title = titlePrefix + " " + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + " " + pad(now.getHours()) + ":" + pad(now.getMinutes());

    return {
      id: id,
      audioRecordId: sourceRecord && sourceRecord.id,
      userId: currentUserId(),
      title: sourceRecord ? sourceRecord.title : title,
      type: "classroom",
      date: "刚刚",
      createdAt: now.toISOString(),
      duration: duration || state.elapsed,
      transcript: text,
      content: text,
      segments: segments,
      status: sourceRecord ? sourceRecord.status : "done",
      meta: Object.assign({}, sourceRecord ? sourceRecord.meta : lessonMeta),
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

  function saveAudioRecord(record) {
    var records = loadAllAudioRecords();
    records = records.filter(function(item) {
      return item.id !== record.id;
    });
    records.unshift(record);
    localStorage.setItem(AUDIO_RECORD_KEY, JSON.stringify(records.slice(0, 100)));
  }

  async function createServerAudioRecord(record, blob) {
    if (!blob) {
      throw new Error("缺少音频文件。");
    }

    var form = new FormData();
    form.append("metadata", JSON.stringify(record));
    form.append("audio", new File([blob], record.fileName || "class-recording.webm", {
      type: record.mimeType || blob.type || "audio/webm",
    }));

    var response = await fetch(AUDIO_RECORD_ENDPOINT, {
      method: "POST",
      body: form,
    });
    var data = await response.json().catch(function() {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.detail || data.error || "HTTP " + response.status);
    }

    return data.record;
  }

  function patchServerAudioRecord(record) {
    if (!record || !record.id || !record.serverSynced) {
      return;
    }

    fetch(AUDIO_RECORD_ENDPOINT + "?id=" + encodeURIComponent(record.id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: record.title,
        duration: record.duration,
        status: record.status,
        statusLabel: record.statusLabel,
        stageIndex: record.stageIndex,
        transcript: record.transcript,
        content: record.content,
        segments: record.segments,
        meta: record.meta,
        processing: record.processing,
        artifacts: record.artifacts,
        publish: record.publish,
      }),
    }).catch(function() {});
  }

  async function deleteServerAudioRecord(record) {
    if (!record || !record.id || !record.serverSynced) {
      return;
    }

    var response = await fetch(AUDIO_RECORD_ENDPOINT + "?id=" + encodeURIComponent(record.id), {
      method: "DELETE",
    });
    var data = await response.json().catch(function() {
      return {};
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(data.detail || data.error || "HTTP " + response.status);
    }
  }

  async function runAudioTask(recordId, task) {
    var record = updateAudioRecord(recordId, {
      processing: setTaskProcessing(recordId, task, "running"),
    });
    if (record) {
      renderAudioRecordsPanel(recordId);
    }

    var response = await fetch(AUDIO_TASK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recordId: recordId,
        task: task,
        userId: currentUserId(),
      }),
    });
    var data = await response.json().catch(function() {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.detail || data.error || "HTTP " + response.status);
    }

    if (data.record) {
      var normalized = normalizeServerRecord(data.record);
      saveAudioRecord(normalized);
      renderAudioRecordsPanel(recordId);
      return normalized;
    }

    var latest = loadAudioRecords().find(function(item) {
      return item.id === recordId;
    });
    return latest || {};
  }

  function setTaskProcessing(recordId, task, value) {
    var current = loadAudioRecords().find(function(item) {
      return item.id === recordId;
    });
    var processing = Object.assign({}, current && current.processing);
    if (task === "transcribe") {
      processing.fineTranscription = value;
      processing.diarization = value;
      return processing;
    }
    processing[task] = value;
    return processing;
  }

  async function refreshServerAudioRecords() {
    try {
      var response = await fetch(AUDIO_RECORD_ENDPOINT + "?userId=" + encodeURIComponent(currentUserId()), {
        method: "GET",
      });
      var data = await response.json().catch(function() {
        return {};
      });

      if (!response.ok || !Array.isArray(data.records)) {
        return;
      }

      data.records.forEach(function(record) {
        var normalized = normalizeServerRecord(record);
        normalized.serverSynced = true;
        saveAudioRecord(normalized);
      });
      renderAudioRecordsPanel();
    } catch {
    }
  }

  function normalizeServerRecord(record) {
    if (!record || typeof record !== "object") {
      return record;
    }

    return Object.assign({}, record, {
      serverSynced: true,
      audioStorage: record.audioStorage || {
        api: AUDIO_RECORD_ENDPOINT,
        id: record.id,
      },
      stages: Array.isArray(record.stages) && record.stages.length ? record.stages : processingStages(),
      meta: record.meta || {},
      processing: record.processing || {
        fineTranscription: "pending",
        diarization: "pending",
        summary: "pending",
        quiz: "pending",
        review: "pending",
      },
      artifacts: record.artifacts || {},
      publish: record.publish || {},
    });
  }

  function setConfirmBusy(isBusy) {
    var modal = document.getElementById("bz-asr-modal");
    if (!modal) {
      return;
    }

    modal.querySelectorAll("[data-bz-asr-confirm-save],[data-bz-asr-confirm-skip]").forEach(function(button) {
      button.disabled = isBusy;
    });

    var primary = modal.querySelector("[data-bz-asr-confirm-save]");
    if (primary) {
      primary.textContent = isBusy ? "正在保存..." : "保存并生成笔记";
    }
  }

  function showInlineConfirmError(message) {
    var modal = document.getElementById("bz-asr-modal");
    if (!modal) {
      showError(message);
      return;
    }

    var old = modal.querySelector(".bz-confirm-error");
    if (old) {
      old.remove();
    }

    var target = modal.querySelector(".bz-confirm-actions");
    if (!target || !target.parentNode) {
      showError(message);
      return;
    }

    var node = document.createElement("div");
    node.className = "bz-confirm-error";
    node.textContent = message;
    target.parentNode.insertBefore(node, target);
  }

  function loadAllAudioRecords() {
    try {
      var value = JSON.parse(localStorage.getItem(AUDIO_RECORD_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function cleanupPreviewAudioRecords() {
    try {
      var records = JSON.parse(localStorage.getItem(AUDIO_RECORD_KEY) || "[]");
      if (!Array.isArray(records) || !records.length) {
        return;
      }

      var cleaned = records.filter(function(record) {
        return !isCodexPreviewRecord(record);
      });

      if (cleaned.length !== records.length) {
        localStorage.setItem(AUDIO_RECORD_KEY, JSON.stringify(cleaned.slice(0, 100)));
      }
    } catch {
    }
  }

  function isCodexPreviewRecord(record) {
    if (!record || !record.id) {
      return false;
    }

    var id = String(record.id || "");
    var title = String(record.title || "");
    return id === "audio-preview-soul-class" ||
      id === "audio-demo-tabs" ||
      id === "audio-demo-mobile" ||
      id === "audio-status-flow-preview" ||
      id === "audio-rollback-check" ||
      title === "死亡哲学课堂重点";
  }

  function loadAudioRecords() {
    try {
      var value = loadAllAudioRecords();
      var userId = currentUserId();
      return value.filter(function(record) {
        return !record.userId || record.userId === userId;
      });
    } catch {
      return [];
    }
  }

  function updateAudioRecord(id, patch) {
    var records = loadAudioRecords();
    var record = records.find(function(item) {
      return item.id === id;
    });
    if (!record) {
      return null;
    }
    Object.keys(patch).forEach(function(key) {
      record[key] = patch[key];
    });
    record.updatedAt = new Date().toISOString();
    saveAudioRecord(record);
    patchServerAudioRecord(record);
    return record;
  }

  function removeAudioRecordLocal(id) {
    var records = loadAllAudioRecords().filter(function(item) {
      return item.id !== id;
    });
    localStorage.setItem(AUDIO_RECORD_KEY, JSON.stringify(records.slice(0, 100)));
  }

  function processingStages() {
    return [
      { key: "file_transfer", label: "文件传输" },
      { key: "file_transcode", label: "文件转码" },
      { key: "server_upload", label: "文件上传服务器" },
      { key: "waiting_summary", label: "待AI总结" },
    ];
  }

  function audioRecordDisplayStatus(record) {
    var processing = (record && record.processing) || {};
    var artifacts = (record && record.artifacts) || {};
    if (artifacts.summary || processing.summary === "done" || record && record.status === "stored") {
      return "已入库";
    }

    var label = record && record.statusLabel ? record.statusLabel : "待AI总结";
    if (label === "待总结") {
      return "待AI总结";
    }
    return label;
  }

  function isAudioRecordPublishReady(record) {
    return audioRecordDisplayStatus(record) === "已入库";
  }

  function audioRecordStatusClass(record) {
    var status = String((record && (record.status || record.statusLabel)) || "").toLowerCase();
    if (audioRecordDisplayStatus(record) === "已入库") {
      return "is-stored";
    }
    if (status.indexOf("record") >= 0 || status.indexOf("录音") >= 0) {
      return "is-recording";
    }
    if (status.indexOf("transfer") >= 0 || status.indexOf("传输") >= 0) {
      return "is-transferring";
    }
    if (status.indexOf("transcode") >= 0 || status.indexOf("转码") >= 0) {
      return "is-transcoding";
    }
    if (status.indexOf("upload") >= 0 || status.indexOf("上传") >= 0) {
      return "is-uploading";
    }
    if (status.indexOf("summary") >= 0 || status.indexOf("总结中") >= 0) {
      return "is-summarizing";
    }
    return "is-pending";
  }

  function audioRecordDurationText(record) {
    return formatClock(Math.round((record && record.duration) || 0));
  }

  function lessonMetaChipsHtml(record) {
    var meta = (record && record.meta) || {};
    var items = [
      ["课程", meta.course],
      ["老师", meta.teacher],
      ["教室", meta.classroom],
      ["学校", meta.school],
    ].filter(function(item) {
      return String(item[1] || "").trim();
    });

    if (!items.length) {
      return "";
    }

    return '<div class="bz-lesson-meta-chips">' + items.map(function(item) {
      return '<span><strong>' + esc(item[0]) + '</strong>' + esc(item[1]) + '</span>';
    }).join("") + '</div>';
  }

  function lessonMetaLineHtml(record) {
    var meta = (record && record.meta) || {};
    var items = [
      ["学校", meta.school],
      ["教室", meta.classroom],
      ["老师", meta.teacher],
    ].filter(function(item) {
      return String(item[1] || "").trim();
    });

    if (!items.length) {
      return "";
    }

    return '<p class="bz-lesson-meta-line">' + items.map(function(item) {
      return esc(item[0] + "：" + item[1]);
    }).join(" · ") + '</p>';
  }

  function simulateSummaryStored(recordId) {
    var record = loadAudioRecords().find(function(item) {
      return item.id === recordId;
    });

    if (!record || audioRecordDisplayStatus(record) === "已入库") {
      return;
    }

    var processing = Object.assign({}, record.processing, { summary: "done" });
    updateAudioRecord(recordId, {
      status: "stored",
      statusLabel: "已入库",
      stageIndex: processingStages().length - 1,
      processing: processing,
      artifacts: Object.assign({}, record.artifacts || {}, {
        summary: record.artifacts && record.artifacts.summary ? record.artifacts.summary : previewSummaryArtifact(record),
      }),
    });
    renderAudioRecordsPanel(recordId);
  }

  function previewSummaryArtifact(record) {
    var lines = splitTranscriptLines(record && (record.transcript || record.content || "")).slice(0, 4);
    var title = displayRecordTitle(record);

    return {
      title: title,
      overview: lines[0] || "小智已根据课堂录音整理出本节课的重点内容。",
      keyPoints: lines.length ? lines.map(function(line, index) {
        return {
          time: formatClock(index * 90),
          title: summaryPointTitle(line),
          detail: summaryPointDetail(line),
        };
      }) : [{
        time: "00:00:00",
        title: title,
        detail: "课堂录音已入库，可继续生成测试题集和复习建议。",
      }],
      timeline: lines.slice(0, 2).map(function(line, index) {
        return {
          time: formatClock(index * 90),
          speaker: defaultSpeakerLabel(),
          text: line,
        };
      }),
      openQuestions: ["这节课最容易混淆的概念是什么？", "课后应该优先复习哪一部分？"],
    };
  }

  function summaryPointTitle(text) {
    var value = String(text || "").trim();
    var split = value.split(/[：:。；;]/)[0] || value;
    return split.length <= 18 ? split : split.slice(0, 18);
  }

  function summaryPointDetail(text) {
    var value = String(text || "").trim();
    var detail = value.replace(/^[^：:。；;]{1,24}[：:]/, "").trim() || value;
    return detail.length <= 96 ? detail : detail.slice(0, 96) + "...";
  }

  function audioPlayerHtml(record) {
    var duration = Math.round((record && record.duration) || 0);
    return '<div class="audio-player bz-audio-player">' +
      '<button type="button" aria-label="播放录音">' + playIcon() + '</button>' +
      '<span>0:00</span>' +
      '<div aria-hidden="true"><i></i></div>' +
      '<span>' + esc(formatClock(duration)) + '</span>' +
      '<button type="button">1x</button>' +
    '</div>';
  }

  function simulateAudioRecordPipeline(id, blob) {
    var stages = processingStages();

    stages.forEach(function(stage, index) {
      window.setTimeout(function() {
        var record = updateAudioRecord(id, {
          status: stage.key,
          statusLabel: stage.label,
          stageIndex: index,
        });
        if (record) {
          renderAudioRecordsPanel(id);
        }
        if (index === 2 && record && blob) {
          runFineTranscription(record, blob);
        }
      }, index * 900);
    });
  }

  function goToAiNotes(recordId) {
    var buttons = Array.prototype.slice.call(document.querySelectorAll("button"));
    var target = buttons.find(function(button) {
      return button.textContent && button.textContent.replace(/\s+/g, "").indexOf("AI笔记") >= 0;
    });

    if (target) {
      target.click();
    }

    window.setTimeout(function() {
      refreshServerAudioRecords();
      renderAudioRecordsPanel(recordId);
    }, 180);
    window.setTimeout(function() {
      refreshServerAudioRecords();
      renderAudioRecordsPanel(recordId);
    }, 520);
  }

  function renderAudioRecordsPanel(activeId) {
    var host = document.querySelector(".file-list-card");
    if (!host) {
      return;
    }

    var records = sortAudioRecords(loadAudioRecords());
    if (!records.length) {
      restoreNativeNoteList(host);
      return;
    }

    var existing = prepareAudioRecordListHost(host);
    updateAudioRecordTabCount(host, records.length);
    showAudioRecordListTab(host);

    var selectedId = activeId || records[0].id;
    var groups = groupAudioRecordsByPeriod(records);
    existing.innerHTML = groups.map(function(group) {
      return audioRecordPeriodHtml(group.period, group.records, selectedId);
    }).join("");

    document.querySelectorAll(".file-list article.selected").forEach(function(item) {
      if (item.getAttribute("data-bz-audio-record-id") !== selectedId) {
        item.classList.remove("selected");
      }
    });

    existing.querySelectorAll("[data-bz-audio-period]").forEach(function(button) {
      button.addEventListener("click", function() {
        var period = button.getAttribute("data-bz-audio-period");
        audioRecordPeriodOpen[period] = !audioRecordPeriodOpen[period];
        renderAudioRecordsPanel(selectedId);
      });
    });

    existing.querySelectorAll("[data-bz-delete-audio-record]").forEach(function(button) {
      button.addEventListener("click", function(event) {
        event.preventDefault();
        event.stopPropagation();
        deleteAudioRecord(button.getAttribute("data-bz-delete-audio-record"));
      });
    });

    existing.querySelectorAll("[data-bz-audio-record-id]").forEach(function(card) {
      card.addEventListener("click", function() {
        document.querySelectorAll(".file-list article.selected").forEach(function(item) {
          item.classList.remove("selected");
        });
        card.classList.add("selected");
        renderAudioRecordDetail(card.getAttribute("data-bz-audio-record-id"));
      });
    });

    renderAudioRecordDetail(selectedId);
  }

  function prepareAudioRecordListHost(host) {
    var existing = document.getElementById("bz-audio-records-panel");
    var tabs = host.querySelector(".notes-lib-tabs");
    var mockLists = Array.prototype.slice.call(host.querySelectorAll(".file-list")).filter(function(list) {
      return list.id !== "bz-audio-records-panel";
    });

    if (!existing && mockLists.length) {
      existing = mockLists[0];
      existing.id = "bz-audio-records-panel";
      existing.className = "file-list bz-audio-records-panel";
    }

    if (!existing) {
      existing = document.createElement("div");
      existing.id = "bz-audio-records-panel";
      existing.className = "file-list bz-audio-records-panel";
      if (tabs && tabs.nextSibling) {
        host.insertBefore(existing, tabs.nextSibling);
      } else {
        host.insertBefore(existing, host.firstChild);
      }
    }

    mockLists.slice(1).forEach(function(list) {
      list.setAttribute("data-bz-native-note-list", "mine");
      list.style.display = "none";
    });

    bindNotesLibraryTabs(host, existing);
    return existing;
  }

  function bindNotesLibraryTabs(host, panel) {
    var tabs = host.querySelector(".notes-lib-tabs");
    if (!tabs || tabs.getAttribute("data-bz-tabs-bound") === "true") {
      return;
    }

    tabs.setAttribute("data-bz-tabs-bound", "true");
    var buttons = tabs.querySelectorAll("button");
    if (buttons[0]) {
      buttons[0].addEventListener("click", function(event) {
        event.preventDefault();
        event.stopPropagation();
        showAudioRecordListTab(host);
        renderAudioRecordsPanel();
      }, true);
    }

    if (buttons[1]) {
      buttons[1].addEventListener("click", function(event) {
        event.preventDefault();
        event.stopPropagation();
        showNativeMineNoteTab(host, panel);
      }, true);
    }
  }

  function showAudioRecordListTab(host) {
    var tabs = host.querySelector(".notes-lib-tabs");
    var buttons = tabs ? tabs.querySelectorAll("button") : [];
    if (buttons[0]) buttons[0].classList.add("active");
    if (buttons[1]) buttons[1].classList.remove("active");

    var panel = document.getElementById("bz-audio-records-panel");
    if (panel) {
      panel.style.display = "";
    }

    host.querySelectorAll("[data-bz-native-note-list='mine']").forEach(function(list) {
      list.style.display = "none";
    });
  }

  function showNativeMineNoteTab(host, panel) {
    var tabs = host.querySelector(".notes-lib-tabs");
    var buttons = tabs ? tabs.querySelectorAll("button") : [];
    if (buttons[0]) buttons[0].classList.remove("active");
    if (buttons[1]) buttons[1].classList.add("active");
    if (panel) panel.style.display = "none";

    var nativeLists = host.querySelectorAll("[data-bz-native-note-list='mine']");
    if (!nativeLists.length) {
      var fallback = document.createElement("div");
      fallback.className = "file-list";
      fallback.setAttribute("data-bz-native-note-list", "mine");
      fallback.innerHTML = '<div class="notes-purchased-empty"><p>暂无我的笔记</p><small>你保存或购买的笔记会出现在这里。</small></div>';
      host.insertBefore(fallback, host.querySelector(".notes-asset-strip") || null);
      nativeLists = host.querySelectorAll("[data-bz-native-note-list='mine']");
    }

    nativeLists.forEach(function(list) {
      list.style.display = "";
    });
    renderAudioEmptyDetail();
  }

  function restoreNativeNoteList(host) {
    var panel = document.getElementById("bz-audio-records-panel");
    if (panel) {
      panel.removeAttribute("id");
      panel.classList.remove("bz-audio-records-panel");
      panel.style.display = "";
    }

    var tabs = host.querySelector(".notes-lib-tabs");
    var buttons = tabs ? tabs.querySelectorAll("button") : [];
    if (buttons[0]) buttons[0].classList.add("active");
    if (buttons[1]) buttons[1].classList.remove("active");
  }

  function updateAudioRecordTabCount(host, count) {
    var button = host.querySelector(".notes-lib-tabs button");
    var badge = button && button.querySelector("span");
    if (badge) {
      badge.textContent = String(count);
    }
  }

  function sortAudioRecords(records) {
    return records.slice().sort(function(a, b) {
      return recordTimeValue(b) - recordTimeValue(a);
    });
  }

  function recordTimeValue(record) {
    var date = record && record.createdAt ? new Date(record.createdAt) : null;
    return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
  }

  function groupAudioRecordsByPeriod(records) {
    var map = {
      "今天": [],
      "本周": [],
      "更早": [],
    };

    records.forEach(function(record) {
      map[audioRecordPeriod(record)].push(record);
    });

    return ["今天", "本周", "更早"].filter(function(period) {
      return map[period].length > 0;
    }).map(function(period) {
      return {
        period: period,
        records: map[period],
      };
    });
  }

  function audioRecordPeriod(record) {
    var date = record && record.createdAt ? new Date(record.createdAt) : null;
    if (!date || Number.isNaN(date.getTime())) {
      return "更早";
    }

    var now = new Date();
    var startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var startRecord = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var diffDays = Math.floor((startToday.getTime() - startRecord.getTime()) / 86400000);

    if (diffDays <= 0) {
      return "今天";
    }
    if (diffDays < 7) {
      return "本周";
    }
    return "更早";
  }

  function audioRecordPeriodHtml(period, records, activeId) {
    var isOpen = audioRecordPeriodOpen[period] !== false;
    return '<section class="file-period">' +
      '<button class="file-period-head" type="button" data-bz-audio-period="' + esc(period) + '"><span>' + esc(period) + '</span><small>' + records.length + ' 条</small>' + chevronIcon(isOpen) + '</button>' +
      (isOpen ? '<div class="file-period-items">' + records.map(function(record) {
        return audioRecordCardHtml(record, record.id === activeId);
      }).join("") + '</div>' : '') +
    '</section>';
  }

  function audioRecordCardHtml(record, active) {
    return '<article class="bz-audio-record-card ' + (active ? "selected" : "") + '" data-bz-audio-record-id="' + esc(record.id) + '">' +
      '<button class="bz-audio-delete" type="button" data-bz-delete-audio-record="' + esc(record.id) + '" aria-label="删除录音" title="删除录音">' + trashIcon() + '</button>' +
      '<div class="mini-note">' +
        '<strong>' + esc(displayRecordTitle(record)) + '</strong>' +
        '<div class="mini-note-meta">' +
          '<small class="file-status ' + esc(audioRecordStatusClass(record)) + '">' + esc(audioRecordDisplayStatus(record)) + '</small>' +
          '<small class="file-duration">' + esc(audioRecordDurationText(record)) + '</small>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function renderAudioRecordDetail(recordId) {
    var record = loadAudioRecords().find(function(item) {
      return item.id === recordId;
    });
    var detail = document.querySelector(".note-detail-card");
    if (!record || !detail) {
      return;
    }

    var text = record.transcript || "精细化转写与说话人分离正在准备中。";
    var tab = activeDetailTab || "transcript";
    detail.innerHTML =
      '<div class="note-detail-head">' +
        '<div class="bz-note-title-block"><h2>' + esc(displayRecordTitle(record)) + '</h2><p>' + esc((record.meta && record.meta.course) || "课堂录音") + ' · ' + esc(formatClock(Math.round(record.duration || 0))) + '</p>' + lessonMetaLineHtml(record) + '</div>' +
        '<button class="primary-action bz-publish-entry" type="button" data-bz-publish-record="' + esc(record.id) + '">' + marketIcon() + '<span>发布到知识广场</span></button>' +
      '</div>' +
      audioPlayerHtml(record) +
      '<div class="note-tabs">' +
        detailTabButton("transcript", "转译文本", tab) +
        detailTabButton("summary", "智能总结", tab) +
        detailTabButton("highlights", "重点速览", tab) +
        detailTabButton("materials", "课堂资料", tab) +
        detailTabButton("quiz", "测试题集", tab) +
        detailTabButton("review", "复习建议", tab) +
      '</div>' +
      '<div class="note-content-scroll bz-audio-transcript">' + detailTabHtml(record, text, tab) + '</div>';

    detail.querySelectorAll("[data-bz-detail-tab]").forEach(function(button) {
      button.addEventListener("click", function() {
        activeDetailTab = button.getAttribute("data-bz-detail-tab") || "transcript";
        if (activeDetailTab === "summary") {
          simulateSummaryStored(recordId);
        }
        renderAudioRecordDetail(recordId);
      });
    });

    detail.querySelectorAll("[data-bz-generate-artifact]").forEach(function(button) {
      button.addEventListener("click", function(event) {
        event.stopPropagation();
        generateArtifact(recordId, button.getAttribute("data-bz-generate-artifact"));
      });
    });

    detail.querySelectorAll("[data-bz-do-exercise]").forEach(function(button) {
      button.addEventListener("click", function(event) {
        event.stopPropagation();
        openExerciseSheet(recordId);
      });
    });

    var publishButton = detail.querySelector("[data-bz-publish-record]");
    if (publishButton) {
      publishButton.addEventListener("click", function(event) {
        event.stopPropagation();
        openPublishModal(recordId);
      });
    }
  }

  async function deleteAudioRecord(recordId) {
    var record = loadAudioRecords().find(function(item) {
      return item.id === recordId;
    });

    if (!record) {
      return;
    }

    var nextRecords = sortAudioRecords(loadAudioRecords()).filter(function(item) {
      return item.id !== recordId;
    });
    var nextId = nextRecords.length ? nextRecords[0].id : "";

    removeAudioRecordLocal(recordId);
    deleteAudioBlob(recordId);
    renderAudioRecordsPanel(nextId);

    try {
      await deleteServerAudioRecord(record);
    } catch (error) {
      showAudioListToast("服务器删除失败：" + error.message);
    }
  }

  function openPublishModal(recordId) {
    var record = loadAudioRecords().find(function(item) {
      return item.id === recordId;
    });

    if (!record) {
      return;
    }

    if (!isAudioRecordPublishReady(record)) {
      showFloatingToast("请先对课堂笔记完成智能总结！");
      return;
    }

    closePublishModal();

    var modal = document.createElement("div");
    modal.className = "modal-backdrop bz-publish-backdrop";
    modal.setAttribute("role", "presentation");
    modal.innerHTML = publishModalHtml(record);
    document.body.appendChild(modal);

    bindPublishModal(modal, record);
  }

  function closePublishModal() {
    var existing = document.querySelector(".bz-publish-backdrop");
    if (existing) {
      existing.remove();
    }
  }

  function publishModalHtml(record) {
    var meta = record.meta || {};
    var values = {
      school: meta.school || "北京某大学",
      classroom: meta.classroom || "A203",
      teacher: meta.teacher || "授课老师",
      course: meta.course || displayRecordTitle(record),
    };
    var assets = ["音频文件", "转译文本", "智能总结", "测试题集", "复习建议"];
    var selected = ["转译文本", "智能总结", "测试题集"];
    var price = record.publish && record.publish.price ? Number(record.publish.price) : 30;

    return '<section class="compact-modal wide bz-publish-modal" role="dialog" aria-label="发布到知识广场">' +
      '<button class="modal-close" type="button" data-bz-publish-close aria-label="关闭">×</button>' +
      '<h2>发布到知识广场</h2>' +
      '<p>确认笔记信息和积分价值后，会生成一张学习卡片放入知识广场。</p>' +
      '<div class="publish-section">' +
        '<label class="publish-section-title">课堂属性</label>' +
        '<div class="publish-meta-grid">' +
          publishMetaInput("school", "学校", values.school) +
          publishMetaInput("classroom", "教室", values.classroom) +
          publishMetaInput("teacher", "授课老师", values.teacher) +
          publishMetaInput("course", "课程名称", values.course) +
        '</div>' +
      '</div>' +
      '<div class="publish-section">' +
        '<label class="publish-section-title">设置积分价格</label>' +
        '<div class="preset-grid four">' +
          [10, 20, 30, 50].map(function(value) {
            return '<button type="button" class="' + (price === value ? "active" : "") + '" data-bz-publish-price="' + value + '"><strong>' + value + '</strong><span>积分</span></button>';
          }).join("") +
        '</div>' +
        '<input type="number" min="1" max="999" value="' + esc(price) + '" placeholder="自定义价格" data-bz-publish-price-input>' +
      '</div>' +
      '<div class="publish-section">' +
        '<label class="publish-section-title">可见范围</label>' +
        '<div class="segmented">' +
          '<button type="button" class="active" data-bz-publish-scope="school">本校同学</button>' +
          '<button type="button" data-bz-publish-scope="public">全平台公开</button>' +
        '</div>' +
      '</div>' +
      '<div class="publish-section">' +
        '<label class="publish-section-title">发布内容</label>' +
        '<div class="publish-asset-grid">' +
          assets.map(function(asset) {
            var isActive = selected.indexOf(asset) >= 0;
            return '<label class="publish-asset-item ' + (isActive ? "active" : "") + '">' +
              '<input type="checkbox" value="' + esc(asset) + '" ' + (isActive ? "checked" : "") + ' data-bz-publish-asset>' +
              '<span>' + esc(asset) + '</span>' +
            '</label>';
          }).join("") +
        '</div>' +
      '</div>' +
      '<label class="publish-toggle">' +
        '<input type="checkbox" checked data-bz-publish-preview>' +
        '<div><strong>允许免费试读前 3 段</strong><span>同学可以预览部分内容再决定是否购买</span></div>' +
      '</label>' +
      '<button class="primary-action full" type="button" data-bz-publish-confirm>确认发布</button>' +
    '</section>';
  }

  function publishMetaInput(key, label, value) {
    return '<label><span>' + esc(label) + '</span><input value="' + esc(value) + '" data-bz-publish-meta="' + esc(key) + '"></label>';
  }

  function bindPublishModal(modal, record) {
    modal.addEventListener("click", function(event) {
      if (event.target === modal || event.target.closest("[data-bz-publish-close]")) {
        closePublishModal();
      }
    });

    modal.querySelectorAll("[data-bz-publish-price]").forEach(function(button) {
      button.addEventListener("click", function() {
        modal.querySelectorAll("[data-bz-publish-price]").forEach(function(item) {
          item.classList.remove("active");
        });
        button.classList.add("active");
        var input = modal.querySelector("[data-bz-publish-price-input]");
        if (input) {
          input.value = button.getAttribute("data-bz-publish-price") || "30";
        }
        updatePublishConfirmState(modal);
      });
    });

    var priceInput = modal.querySelector("[data-bz-publish-price-input]");
    if (priceInput) {
      priceInput.addEventListener("input", function() {
        var value = Number(priceInput.value || 0);
        modal.querySelectorAll("[data-bz-publish-price]").forEach(function(button) {
          button.classList.toggle("active", Number(button.getAttribute("data-bz-publish-price")) === value);
        });
        updatePublishConfirmState(modal);
      });
    }

    modal.querySelectorAll("[data-bz-publish-scope]").forEach(function(button) {
      button.addEventListener("click", function() {
        modal.querySelectorAll("[data-bz-publish-scope]").forEach(function(item) {
          item.classList.remove("active");
        });
        button.classList.add("active");
      });
    });

    modal.querySelectorAll("[data-bz-publish-asset]").forEach(function(input) {
      input.addEventListener("change", function() {
        var label = input.closest(".publish-asset-item");
        if (label) {
          label.classList.toggle("active", input.checked);
        }
        updatePublishConfirmState(modal);
      });
    });

    var confirm = modal.querySelector("[data-bz-publish-confirm]");
    if (confirm) {
      confirm.addEventListener("click", function() {
        confirmPublishRecord(record, modal);
      });
    }

    updatePublishConfirmState(modal);
  }

  function updatePublishConfirmState(modal) {
    var confirm = modal.querySelector("[data-bz-publish-confirm]");
    var price = Number((modal.querySelector("[data-bz-publish-price-input]") || {}).value || 0);
    var checked = modal.querySelectorAll("[data-bz-publish-asset]:checked").length;
    if (confirm) {
      confirm.disabled = price < 1 || checked === 0;
    }
  }

  function confirmPublishRecord(record, modal) {
    var meta = {};
    modal.querySelectorAll("[data-bz-publish-meta]").forEach(function(input) {
      meta[input.getAttribute("data-bz-publish-meta")] = input.value.trim();
    });

    var price = Number((modal.querySelector("[data-bz-publish-price-input]") || {}).value || 0);
    var scopeButton = modal.querySelector("[data-bz-publish-scope].active");
    var assets = Array.prototype.slice.call(modal.querySelectorAll("[data-bz-publish-asset]:checked")).map(function(input) {
      return input.value;
    });
    var publishedAt = new Date().toISOString();

    var updated = updateAudioRecord(record.id, {
      meta: Object.assign({}, record.meta || {}, meta),
      publish: {
        id: record.publish && record.publish.id ? record.publish.id : "published-" + Date.now(),
        sourceRecordId: record.id,
        ownerUserId: currentUserId(),
        title: meta.course || displayRecordTitle(record),
        excerpt: publishExcerptForRecord(record),
        price: price,
        scope: scopeButton ? scopeButton.getAttribute("data-bz-publish-scope") : "school",
        assets: assets,
        allowPreview: Boolean(modal.querySelector("[data-bz-publish-preview]:checked")),
        publishedAt: publishedAt,
      },
    });

    closePublishModal();
    clickKnowledgeMarketNav();
    showFloatingToast("已发布到知识广场 · " + price + " 积分");
    schedulePublishedMarketRender();
    if (updated) {
      renderAudioRecordsPanel(updated.id);
    }
  }

  function schedulePublishedMarketRender() {
    [180, 420, 860, 1400].forEach(function(delay) {
      window.setTimeout(renderPublishedMarketCards, delay);
    });
  }

  async function renderPublishedMarketCards() {
    var marketList = document.querySelector(".market-list");
    var marketCard = document.querySelector(".market-list-card");
    if (!marketCard) {
      return;
    }

    var records = publishedLocalRecords();
    try {
      var response = await fetch(AUDIO_RECORD_ENDPOINT + "?published=1", { method: "GET" });
      var data = await response.json().catch(function() {
        return {};
      });
      if (response.ok && Array.isArray(data.records)) {
        data.records.forEach(function(record) {
          records.push(normalizeServerRecord(record));
        });
      }
    } catch {
    }

    records = uniquePublishedRecords(records);
    if (!records.length) {
      return;
    }

    if (!marketList) {
      var empty = marketCard.querySelector(".market-empty");
      if (empty) {
        empty.remove();
      }
      marketList = document.createElement("div");
      marketList.className = "market-list";
      marketCard.appendChild(marketList);
    }

    marketList.querySelectorAll(".bz-published-market-card").forEach(function(card) {
      card.remove();
    });
    marketList.insertAdjacentHTML("afterbegin", records.map(publishedMarketCardHtml).join(""));
  }

  function publishedLocalRecords() {
    return loadAllAudioRecords().filter(function(record) {
      return record.publish && record.publish.publishedAt;
    });
  }

  function uniquePublishedRecords(records) {
    var seen = {};
    return sortAudioRecords(records.filter(function(record) {
      if (!record || !record.id || seen[record.id] || !(record.publish && record.publish.publishedAt)) {
        return false;
      }
      seen[record.id] = true;
      return true;
    }));
  }

  function publishedMarketCardHtml(record) {
    var meta = record.meta || {};
    var publish = record.publish || {};
    var summary = record.artifacts && record.artifacts.summary ? record.artifacts.summary : {};
    var title = publish.title || displayRecordTitle(record);
    var school = meta.school || "北京某大学";
    var major = meta.major || "课堂笔记";
    var author = "我";
    var price = Number(publish.price || 30);
    var tags = (publish.assets && publish.assets.length ? publish.assets : ["笔记重点", "测试题集"]).slice(0, 2);
    var excerpt = publish.excerpt || summary.overview || publishExcerptForRecord(record);
    var unlockAttr = isOwnPublishedRecord(record) ? "data-bz-own-note-unlock" : "data-bz-published-note-unlock";

    return '<article class="bz-published-market-card" data-bz-published-record-id="' + esc(record.id) + '">' +
      '<div class="market-card-top">' +
        '<span class="market-card-meta">' + esc(school) + ' · ' + esc(major) + '</span>' +
        '<h3>' + esc(title) + '</h3>' +
        '<p>' + esc(excerpt) + '</p>' +
        '<div class="market-card-tags">' + tags.map(function(tag) {
          return '<span>' + esc(tag) + '</span>';
        }).join("") + '</div>' +
      '</div>' +
      '<div class="market-card-foot">' +
        '<small>✎ ' + esc(author) + '</small>' +
        '<strong>' + esc(price) + ' 积分</strong>' +
      '</div>' +
      '<button class="primary-action" type="button" ' + unlockAttr + '="' + esc(record.id) + '">立即解锁</button>' +
    '</article>';
  }

  function isOwnPublishedRecord(record) {
    var publish = record && record.publish ? record.publish : {};
    var userId = currentUserId();
    return !record || !record.userId || record.userId === userId || publish.ownerUserId === userId;
  }

  function publishExcerptForRecord(record) {
    var summary = record && record.artifacts && record.artifacts.summary ? record.artifacts.summary : {};
    if (summary.overview) {
      return trimPublishExcerpt(summary.overview);
    }

    var content = record && (record.transcript || record.content || "");
    if (Array.isArray(record && record.segments)) {
      content = record.segments.map(function(segment) {
        return segment && segment.text ? segment.text : "";
      }).join(" ") || content;
    }

    if (content) {
      return trimPublishExcerpt(content);
    }

    return "由课堂录音自动整理，包含转译文本、结构化总结、测试题集和复习建议，适合课后快速回顾。";
  }

  function trimPublishExcerpt(text) {
    var value = String(text || "").replace(/\s+/g, " ").trim();
    if (value.length <= 72) {
      return value;
    }
    return value.slice(0, 72) + "...";
  }

  function renderAudioEmptyDetail() {
    var detail = document.querySelector(".note-detail-card");
    if (!detail) {
      return;
    }
    detail.innerHTML = '<div class="notes-purchased-empty" style="margin:auto"><p>选择一条真实课堂录音查看内容</p></div>';
  }

  function detailTabButton(key, label, active) {
    return '<button class="' + (key === active ? "active" : "") + '" data-bz-detail-tab="' + esc(key) + '">' + esc(label) + '</button>';
  }

  function detailTabHtml(record, text, tab) {
    if (tab === "highlights") {
      return highlightsDetailHtml(record);
    }

    if (tab === "materials") {
      return classroomMaterialsDetailHtml(record);
    }

    if (tab === "summary" || tab === "quiz" || tab === "review") {
      return artifactPanelHtml(record, tab);
    }

    return transcriptDetailHtml(record, text);
  }

  async function generateArtifact(recordId, task) {
    var record = loadAudioRecords().find(function(item) {
      return item.id === recordId;
    });
    if (!record || !task) {
      return;
    }

    try {
      updateAudioRecord(recordId, {
        processing: Object.assign({}, record.processing, { [task]: "running" }),
      });
      renderAudioRecordDetail(recordId);
      await runAudioTask(recordId, task);
      activeDetailTab = task;
      renderAudioRecordsPanel(recordId);
    } catch (error) {
      var processing = Object.assign({}, record.processing, { [task]: "failed" });
      processing.errors = Object.assign({}, processing.errors, { [task]: error.message });
      updateAudioRecord(recordId, { processing: processing });
      renderAudioRecordDetail(recordId);
    }
  }

  function artifactPanelHtml(record, task) {
    var processing = record.processing || {};
    var artifacts = record.artifacts || {};
    var status = processing[task] || "pending";
    var artifact = artifacts[task];
    var label = artifactLabel(task);

    if (status === "running") {
      return artifactEmptyStateHtml(task, {
        title: label + "生成中",
        description: "小智正在读取完整课堂内容，请稍等片刻。",
        busy: true,
      });
    }

    if (status === "failed") {
      var message = processing.errors && processing.errors[task] ? processing.errors[task] : "生成失败，请重试。";
      return artifactEmptyStateHtml(task, {
        title: label + "生成失败",
        description: message,
        buttonText: "重新生成" + label,
        error: true,
      });
    }

    if (!artifact) {
      if (!(record.transcript || record.content)) {
        return artifactEmptyStateHtml(task, {
          title: "等待转写完成",
          description: "精细转写完成后，小智会基于完整课堂内容生成" + label + "。",
          busy: true,
        });
      }
      return artifactEmptyStateHtml(task, artifactEmptyCopy(task));
    }

    if (task === "quiz") {
      return quizArtifactHtml(artifact);
    }

    if (task === "review") {
      return reviewArtifactHtml(artifact);
    }

    return summaryArtifactHtml(artifact, record);
  }

  function summaryArtifactHtml(artifact, record) {
    var keyPoints = toArray(artifact.keyPoints).slice(0, 4);
    var terms = toArray(artifact.terms).slice(0, 4);
    var questions = toArray(artifact.openQuestions).slice(0, 3);
    var timeline = toArray(artifact.timeline).slice(0, 2);
    var firstPoint = keyPoints[0] || {};
    var tags = terms.length ? terms.map(function(item) {
      return item.term || item.title || item;
    }) : keyPoints.map(function(item) {
      return item.title || item;
    });

    return '<div class="generated-wrap bz-generated-wrap">' +
      regenerateBarHtml("已由小智整理 · 刚刚", "summary", "重新生成") +
      '<div class="summary-board">' +
        '<section class="summary-hero">' +
          '<div>' +
            '<span>AI 结构化笔记</span>' +
            '<h3>' + esc(artifact.title || firstPoint.title || "智能总结") + '</h3>' +
            '<p>' + esc(artifact.overview || firstPoint.detail || "小智已根据课堂转写整理出本节课的复习要点。") + '</p>' +
          '</div>' +
          '<div class="formula-card">' +
            '<strong>本节重点</strong>' +
            keyPoints.slice(0, 3).map(function(item) {
              return '<span>' + esc(item.title || item.detail || item) + '</span>';
            }).join("") +
          '</div>' +
        '</section>' +
        '<section class="chalk-sketch">' +
          '<div class="axis-card"><span class="axis-dot peak"></span><span class="axis-dot saddle"></span><span class="axis-curve"></span></div>' +
          '<div>' +
            '<h4>课堂线索</h4>' +
            '<p>' + esc(firstPoint.evidence || firstPoint.detail || artifact.overview || "围绕课堂原文提炼知识点、证据和复习入口。") + '</p>' +
            '<div class="summary-tags">' + tags.slice(0, 4).map(function(tag) { return '<span>' + esc(tag) + '</span>'; }).join("") + '</div>' +
          '</div>' +
        '</section>' +
        '<section class="cornell-note">' +
          '<div>' +
            '<h4>追问线索</h4>' +
            (questions.length ? questions.map(function(item) { return '<p>' + esc(item) + '</p>'; }).join("") : '<p>暂无待追问问题。</p>') +
          '</div>' +
          '<div>' +
            '<h4>课堂笔记</h4>' +
            '<ul>' + keyPoints.map(function(item) {
              return '<li>' + esc(item.title || "知识点") + (item.detail ? "：" + esc(item.detail) : "") + '</li>';
            }).join("") + '</ul>' +
          '</div>' +
        '</section>' +
        '<section class="review-grid">' +
          timeline.map(function(item) {
            return '<article><strong>' + esc((item.time || "") + (item.speaker ? " · " + item.speaker : "")) + '</strong><p>' + esc(item.text || item.summary || "") + '</p></article>';
          }).join("") +
        '</section>' +
        highValueQuotesHtml(artifact, record) +
      '</div>' +
    '</div>';
  }

  function highValueQuotesHtml(artifact, record) {
    var quotes = highValueQuotesForSummary(artifact, record).slice(0, 3);
    if (!quotes.length) {
      return "";
    }

    return '<section class="bz-high-value-quotes">' +
      '<header><span>课堂高价值原话</span><strong>适合复盘时反复看</strong></header>' +
      '<div>' + quotes.map(function(item) {
        var meta = [item.time, item.speaker].filter(Boolean).join(" · ");
        return '<article>' +
          (meta ? '<small>' + esc(meta) + '</small>' : '') +
          '<p>“' + esc(item.quote || item.text || item.content || "") + '”</p>' +
          (item.reason ? '<em>' + esc(item.reason) + '</em>' : '') +
        '</article>';
      }).join("") + '</div>' +
    '</section>';
  }

  function highValueQuotesForSummary(artifact, record) {
    var explicit = toArray(
      artifact.highValueQuotes ||
      artifact.classroomQuotes ||
      artifact.originalQuotes ||
      artifact.valuableQuotes
    ).map(normalizeHighValueQuote).filter(function(item) {
      return item.quote;
    });

    if (explicit.length) {
      return explicit;
    }

    var evidenceQuotes = toArray(artifact.keyPoints).map(function(item) {
      if (!item || typeof item !== "object" || !item.evidence) {
        return null;
      }
      return normalizeHighValueQuote({
        quote: item.evidence,
        reason: item.title ? "对应知识点：" + item.title : "",
      });
    }).filter(function(item) {
      return item && item.quote;
    });

    if (evidenceQuotes.length) {
      return evidenceQuotes;
    }

    return inferHighValueQuotes(record);
  }

  function normalizeHighValueQuote(item) {
    if (typeof item === "string") {
      return { quote: trimQuoteText(item) };
    }
    item = item || {};
    return {
      quote: trimQuoteText(item.quote || item.text || item.content || item.original || item.sentence || ""),
      speaker: item.speaker || item.role || "",
      time: item.time || item.timestamp || "",
      reason: item.reason || item.value || item.note || "",
    };
  }

  function inferHighValueQuotes(record) {
    var segments = normalizeSpeakerSegments(record && record.segments ? record.segments : []);
    var candidates = segments.length ? segments.map(function(segment, index) {
      return {
        quote: trimQuoteText(segment.text || ""),
        speaker: speakerLabel(segment),
        time: segment && typeof segment.start === "number" ? formatClock(Math.round(segment.start)) : "",
        score: quoteValueScore(segment.text || "", index),
      };
    }) : splitTranscriptLines(record && (record.transcript || record.content || "")).map(function(line, index) {
      return {
        quote: trimQuoteText(line),
        speaker: defaultSpeakerLabel(),
        time: "",
        score: quoteValueScore(line, index),
      };
    });

    return candidates.filter(function(item) {
      return item.quote && item.quote.length >= 12;
    }).sort(function(a, b) {
      return b.score - a.score;
    }).slice(0, 3).map(function(item) {
      return {
        quote: item.quote,
        speaker: item.speaker,
        time: item.time,
        reason: "小智从课堂原文中挑出的关键表达",
      };
    });
  }

  function quoteValueScore(text, index) {
    var value = String(text || "");
    var score = Math.max(0, 120 - Math.abs(value.length - 42));
    if (/[。！？；]/.test(value)) score += 8;
    if (/重点|关键|注意|结论|定义|公式|所以|因此|也就是说|如果|那么|因为|第一|第二|我们来看/.test(value)) score += 36;
    if (/同学|作业|考试|容易错|不要|一定/.test(value)) score += 18;
    return score - index * 0.5;
  }

  function trimQuoteText(text) {
    var value = String(text || "").replace(/\s+/g, " ").replace(/^["“”'‘’]+|["“”'‘’]+$/g, "").trim();
    if (value.length <= 96) {
      return value;
    }
    return value.slice(0, 96) + "...";
  }

  function quizArtifactHtml(artifact) {
    var questions = toArray(artifact.questions).slice(0, 10);
    return '<div class="generated-wrap bz-generated-wrap">' +
      regenerateBarHtml("共 " + questions.length + " 道题 · 难度自适应", "quiz", "换一批") +
      '<div class="exam-board">' +
        questions.map(function(item, index) {
          var tone = difficultyTone(item.difficulty);
          var level = difficultyLabel(item.difficulty);
          var options = toArray(item.options);
          return '<article class="exam-card ' + tone + '">' +
            '<header><span class="exam-tag">Q' + (index + 1) + ' · ' + esc(level) + '</span><strong>' + esc(item.question || item.title || "题目") + '</strong></header>' +
            (options.length ? '<ol class="bz-exam-options">' + options.map(function(option) { return '<li>' + esc(option) + '</li>'; }).join("") + '</ol>' : "") +
            (item.relatedPoint ? '<p>关联知识点：' + esc(item.relatedPoint) + '</p>' : "") +
          '</article>';
        }).join("") +
      '</div>' +
      '<div class="do-exercise-cta">' +
        '<button type="button" class="do-exercise-btn" data-bz-do-exercise><span>立即做题</span><span class="do-exercise-badge">随写随存 3.0</span></button>' +
        '<p class="do-exercise-hint">连接 3.0 智能笔，书写过程实时同步入库</p>' +
      '</div>' +
    '</div>';
  }

  function openExerciseSheet(recordId) {
    var record = loadAudioRecords().find(function(item) {
      return item.id === recordId;
    });
    var questions = record && record.artifacts && record.artifacts.quiz ? toArray(record.artifacts.quiz.questions) : [];

    if (!record || !questions.length) {
      return;
    }

    closeExerciseSheet();

    var sheet = document.createElement("div");
    sheet.className = "ea-backdrop bz-ea-backdrop";
    sheet.setAttribute("role", "presentation");
    sheet.innerHTML =
      '<div class="ea-sheet bz-ea-sheet" role="dialog" aria-label="答题卷">' +
        '<div class="ea-header">' +
          '<div><h2 class="ea-title">答题卷</h2><p class="ea-meta">共 ' + questions.length + ' 道题 · ' + esc((record.meta && record.meta.course) || record.title || "课堂练习") + '</p></div>' +
          '<button type="button" class="ea-close" data-bz-close-exercise aria-label="关闭">✕</button>' +
        '</div>' +
        '<div class="ea-body">' +
          questions.map(function(item, index) {
            var tone = difficultyTone(item.difficulty);
            var level = difficultyLabel(item.difficulty);
            var options = toArray(item.options);
            return '<div class="ea-question">' +
              '<div class="ea-q-header"><span class="ea-q-tag tone-' + tone + '">Q' + (index + 1) + ' · ' + esc(level) + '</span><p class="ea-q-text">' + esc(item.question || item.title || "题目") + '</p></div>' +
              (options.length ? '<p class="ea-q-hint">' + esc(options.join("　")) + '</p>' : (item.relatedPoint ? '<p class="ea-q-hint">关联知识点：' + esc(item.relatedPoint) + '</p>' : "")) +
              '<div class="ea-answer-zone"><span class="ea-answer-label">作答区</span><div class="ea-answer-lines">' +
                Array.from({ length: 6 }).map(function(_, lineIndex) {
                  return '<div class="ea-line" data-line="' + lineIndex + '"></div>';
                }).join("") +
              '</div></div>' +
            '</div>';
          }).join("") +
        '</div>' +
        '<div class="ea-footer">' +
          '<div class="ea-footer-inner">' +
            '<div class="ea-footer-copy"><p class="ea-footer-title">随写随存 智能笔 3.0</p><p class="ea-footer-desc">连接后，纸上书写的答案将实时同步到此界面</p></div>' +
            '<button type="button" class="ea-connect-btn" data-bz-connect-pen>链接智能笔，开启智能答题</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(sheet);
    sheet.addEventListener("click", function(event) {
      if (event.target === sheet || event.target.closest("[data-bz-close-exercise]")) {
        closeExerciseSheet();
      }

      if (event.target.closest("[data-bz-connect-pen]")) {
        showExerciseToast(sheet);
      }
    });
  }

  function closeExerciseSheet() {
    var existing = document.querySelector(".bz-ea-backdrop");
    if (existing) {
      existing.remove();
    }
  }

  function showExerciseToast(sheet) {
    var footer = sheet.querySelector(".ea-footer");
    var existing = sheet.querySelector(".ea-local-toast");
    if (existing) {
      existing.remove();
    }

    if (!footer) {
      return;
    }

    var toast = document.createElement("div");
    toast.className = "ea-local-toast";
    toast.textContent = "敬请期待";
    footer.appendChild(toast);
    window.setTimeout(function() {
      toast.remove();
    }, 2000);
  }

  function reviewArtifactHtml(artifact) {
    var schedule = toArray(artifact.schedule).slice(0, 7);
    var suggestions = toArray(artifact.suggestions).slice(0, 4);
    var weakPoints = toArray(artifact.weakPoints).slice(0, 4);
    var cards = schedule.length ? schedule : suggestions.map(function(item) {
      return {
        day: priorityLabel(item.priority),
        title: item.title,
        task: item.action || item.reason,
        priority: item.priority,
      };
    });

    return '<div class="generated-wrap bz-generated-wrap">' +
      regenerateBarHtml((schedule.length || 3) + " 天循序复习计划 · 个性化", "review", "重新生成") +
      '<div class="exam-board">' +
        cards.map(function(item, index) {
          var tone = difficultyTone(item.priority || (index === 0 ? "high" : index === 1 ? "medium" : "low"));
          return '<article class="exam-card ' + tone + '">' +
            '<header><span class="exam-tag">' + esc(item.day || ("第 " + (index + 1) + " 天")) + '</span><strong>' + esc(item.title || item.task || "复习任务") + '</strong></header>' +
            '<p>' + esc((item.task || item.action || item.reason || "") + (item.minutes ? " · " + item.minutes + " 分钟" : "")) + '</p>' +
          '</article>';
        }).join("") +
      '</div>' +
    '</div>';
  }

  function regenerateBarHtml(meta, task, label) {
    return '<div class="regenerate-bar">' +
      '<span>' + esc(meta) + '</span>' +
      '<button type="button" data-bz-generate-artifact="' + esc(task) + '">' + sparkleIcon() + ' ' + esc(label) + '</button>' +
    '</div>';
  }

  function toArray(value) {
    if (Array.isArray(value)) {
      return value.filter(function(item) {
        return item !== null && item !== undefined && item !== "";
      });
    }
    if (value === null || value === undefined || value === "") {
      return [];
    }
    return [value];
  }

  function difficultyTone(value) {
    var text = String(value || "").toLowerCase();
    if (text.indexOf("hard") >= 0 || text.indexOf("high") >= 0 || text.indexOf("拔高") >= 0 || text.indexOf("高") >= 0) return "high";
    if (text.indexOf("medium") >= 0 || text.indexOf("mid") >= 0 || text.indexOf("中") >= 0) return "mid";
    return "low";
  }

  function difficultyLabel(value) {
    var text = String(value || "").toLowerCase();
    if (text.indexOf("hard") >= 0 || text.indexOf("high") >= 0 || text.indexOf("拔高") >= 0 || text.indexOf("高") >= 0) return "拔高";
    if (text.indexOf("medium") >= 0 || text.indexOf("mid") >= 0 || text.indexOf("中") >= 0) return "中等";
    return "基础";
  }

  function priorityLabel(value) {
    var text = String(value || "").toLowerCase();
    if (text.indexOf("high") >= 0 || text.indexOf("高") >= 0) return "优先";
    if (text.indexOf("medium") >= 0 || text.indexOf("中") >= 0) return "重点";
    return "巩固";
  }

  function reviewOverview(artifact, suggestions, weakPoints) {
    if (artifact.overview) return artifact.overview;
    if (suggestions[0] && suggestions[0].reason) return suggestions[0].reason;
    if (weakPoints.length) return "优先补强：" + weakPoints.join("、");
    return "小智已根据课堂重点，为你安排一份可执行的复习节奏。";
  }

  function artifactListHtml(title, items, renderItem) {
    if (!Array.isArray(items) || !items.length) {
      return "";
    }
    return '<div class="bz-artifact-group">' + (title ? '<h4>' + esc(title) + '</h4>' : "") +
      '<div class="bz-artifact-list">' + items.map(function(item, index) {
        return '<article>' + renderItem(item || {}, index) + '</article>';
      }).join("") + '</div></div>';
  }

  function artifactStringListHtml(title, items, tag) {
    if (!Array.isArray(items) || !items.length) {
      return "";
    }
    var listTag = tag || "ul";
    return '<div class="bz-artifact-group">' + (title ? '<h4>' + esc(title) + '</h4>' : "") +
      '<' + listTag + '>' + items.map(function(item) {
        return '<li>' + esc(item) + '</li>';
      }).join("") + '</' + listTag + '></div>';
  }

  function artifactLabel(task) {
    if (task === "quiz") return "测试题集";
    if (task === "review") return "复习建议";
    return "智能总结";
  }

  function artifactEmptyCopy(task) {
    if (task === "quiz") {
      return {
        title: "还没有测试题集",
        description: "让小智根据这节课的重点，生成一组可练习的测试题。",
        buttonText: "生成测试题集",
      };
    }

    if (task === "review") {
      return {
        title: "还没有复习建议",
        description: "让小智结合课堂内容和薄弱点，安排一份可执行的复习计划。",
        buttonText: "生成复习建议",
      };
    }

    return {
      title: "还没有智能总结",
      description: "让小智读完整段课堂内容，给你一份结构化的复习要点。",
      buttonText: "生成智能总结",
    };
  }

  function artifactEmptyStateHtml(task, copy) {
    var button = copy.busy ? "" :
      '<button type="button" class="primary-action note-empty-action" data-bz-generate-artifact="' + esc(task) + '">' +
        sparkleIcon() +
        '<span>' + esc(copy.buttonText || ("生成" + artifactLabel(task))) + '</span>' +
      '</button>';

    return '<div class="note-empty bz-online-empty ' + (copy.error ? "is-error" : "") + (copy.busy ? " is-loading" : "") + '">' +
      '<div class="note-empty-icon">' + wandIcon() + '</div>' +
      '<h3>' + esc(copy.title) + '</h3>' +
      '<p>' + esc(copy.description) + '</p>' +
      (copy.busy ? '<span class="bz-loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>' : '') +
      button +
    '</div>';
  }

  function highlightsDetailHtml(record) {
    var items = overviewItemsForRecord(record).slice(0, 8);
    if (!items.length) {
      return '<p class="bz-audio-empty">精细转写完成后，小智会在这里整理课堂重点速览。</p>';
    }

    return '<div class="speaker-list bz-audio-speaker-list bz-key-overview-list">' +
      '<div class="bz-overview-title"><span></span><strong>考点重点</strong></div>' +
      items.map(function(item) {
        var detail = item.detail || "";
        return '<article>' +
          (item.time ? '<time>' + esc(item.time) + '</time>' : '') +
          '<p><strong>' + esc((item.title || "课堂重点") + (detail ? "：" : "")) + '</strong>' + esc(detail) + '</p>' +
        '</article>';
      }).join("") +
    '</div>';
  }

  function classroomMaterialsDetailHtml(record) {
    var items = classroomMaterialItems(record).slice(0, 6);
    if (!items.length) {
      return '<p class="bz-audio-empty">课堂资料会在录音结束并完成整理后显示在这里。</p>';
    }

    return '<div class="speaker-list bz-audio-speaker-list bz-material-list">' +
      items.map(function(item, index) {
        var description = item.description || item.kind || "课堂过程中沉淀的资料内容。";
        return '<article>' +
          '<div class="bz-material-meta">' + imageIcon() + '<time>' + esc(item.time || formatClock(index * 150)) + '</time></div>' +
          materialThumbHtml(item, index) +
          '<p><strong>' + esc((item.title || "课堂资料") + (description ? "：" : "")) + '</strong>' + esc(description) + '</p>' +
        '</article>';
      }).join("") +
    '</div>';
  }

  function overviewItemsForRecord(record) {
    var summary = record && record.artifacts && record.artifacts.summary ? record.artifacts.summary : {};
    var explicit = []
      .concat(toArray(summary.highlights))
      .concat(toArray(summary.keyHighlights))
      .concat(toArray(summary.quickOverview))
      .concat(toArray(summary.keyPoints))
      .map(normalizeOverviewItem).filter(function(item) {
      return item.title || item.detail;
    });

    if (explicit.length) {
      return explicit;
    }

    var segments = normalizeSpeakerSegments(record && record.segments ? record.segments : []);
    if (segments.length) {
      return segments.map(function(segment, index) {
        return normalizeOverviewItem({
          time: segment.start === null ? "" : formatClock(Math.round(segment.start)),
          text: segment.text,
        }, index);
      }).filter(function(item) {
        return item.title || item.detail;
      });
    }

    return splitTranscriptLines(record && (record.transcript || record.content || "")).map(function(line, index) {
      return normalizeOverviewItem({
        time: formatClock(index * 90),
        text: line,
      }, index);
    });
  }

  function normalizeOverviewItem(item, index) {
    if (typeof item === "string") {
      return {
        time: index === undefined ? "" : formatClock(index * 90),
        title: summaryPointTitle(item),
        detail: summaryPointDetail(item),
      };
    }

    item = item || {};
    var source = item.detail || item.summary || item.text || item.content || item.evidence || item.title || "";
    var title = item.title || item.topic || item.name || summaryPointTitle(source);
    var detail = item.detail || item.summary || item.text || item.content || item.evidence || "";
    var time = item.time || item.timestamp || (typeof item.start === "number" ? formatClock(Math.round(item.start)) : "");

    return {
      time: time,
      title: title,
      detail: detail && detail !== title ? detail : summaryPointDetail(source),
    };
  }

  function classroomMaterialItems(record) {
    var artifacts = (record && record.artifacts) || {};
    var raw = []
      .concat(extractMaterialValues(artifacts.materials))
      .concat(extractMaterialValues(artifacts.classroomMaterials))
      .concat(extractMaterialValues(artifacts.slides))
      .concat(extractMaterialValues(artifacts.assets))
      .concat(extractMaterialValues(record.materials))
      .concat(extractMaterialValues(record.assets));
    var explicit = raw.map(normalizeClassroomMaterial).filter(function(item) {
      return item.title || item.image || item.description;
    });

    if (explicit.length) {
      return explicit;
    }

    return overviewItemsForRecord(record).slice(0, 3).map(function(item, index) {
      return {
        time: item.time || formatClock(index * 150 + 160),
        title: item.title || ("课堂资料 " + (index + 1)),
        description: item.detail || "根据课堂重点自动整理出的资料卡片。",
        kind: index === 0 ? "课件截图" : "板书资料",
      };
    });
  }

  function extractMaterialValues(value) {
    if (Array.isArray(value)) {
      return value;
    }

    if (value && typeof value === "object") {
      return toArray(value.items || value.slides || value.images || value.materials || value.resources || value.files || value.cards || value);
    }

    return toArray(value);
  }

  function normalizeClassroomMaterial(item, index) {
    if (typeof item === "string") {
      return {
        time: formatClock(index * 150 + 160),
        title: "课堂资料 " + (index + 1),
        description: item,
      };
    }

    item = item || {};
    return {
      time: item.time || item.timestamp || (typeof item.start === "number" ? formatClock(Math.round(item.start)) : formatClock(index * 150 + 160)),
      title: item.title || item.name || item.caption || item.type || ("课堂资料 " + (index + 1)),
      description: item.description || item.summary || item.text || item.content || item.note || "",
      kind: item.kind || item.type || "",
      image: item.image || item.imageUrl || item.thumbnail || item.thumbnailUrl || item.url || item.src || "",
    };
  }

  function materialThumbHtml(item, index) {
    if (item.image) {
      return '<figure class="bz-material-thumb"><img src="' + esc(item.image) + '" alt="' + esc(item.title || "课堂资料") + '"></figure>';
    }

    return '<figure class="bz-material-thumb bz-material-thumb-fallback">' +
      '<div><small>' + esc(item.kind || "课堂资料") + '</small><strong>' + esc(item.title || ("课堂资料 " + (index + 1))) + '</strong><span></span><span></span><span></span></div>' +
    '</figure>';
  }

  function transcriptDetailHtml(record, fallbackText) {
    var segments = normalizeSpeakerSegments(record.segments || []);
    if (segments.length) {
      return '<div class="speaker-list bz-audio-speaker-list">' + segments.map(function(segment, index) {
        return '<article><time>' + esc(formatRecordSegmentTime(record, segment, index)) + '</time><p><strong>' + esc(speakerLabel(segment)) + '</strong>' + esc(segment.text || "") + '</p></article>';
      }).join("") + '</div>';
    }

    var lines = splitTranscriptLines(fallbackText);
    if (lines.length) {
      return '<div class="speaker-list bz-audio-speaker-list">' + lines.map(function(line, index) {
        return '<article><time>' + esc(formatRecordSegmentTime(record, { start: index * 6 }, index)) + '</time><p><strong>' + esc(defaultSpeakerLabel()) + '</strong>' + esc(line) + '</p></article>';
      }).join("") + '</div>';
    }

    return '<p class="bz-audio-empty">精细化转写与说话人分离正在准备中。</p>';
  }

  function formatRecordSegmentTime(record, segment, index) {
    var created = record && record.createdAt ? new Date(record.createdAt) : null;
    var base = created && !Number.isNaN(created.getTime()) ? created : new Date();
    var offset = segment && typeof segment.start === "number" ? segment.start : index * 6;
    var time = new Date(base.getTime() + Math.max(0, offset || 0) * 1000);
    return pad(time.getHours()) + ":" + pad(time.getMinutes()) + ":" + pad(time.getSeconds());
  }

  function displayRecordTitle(record) {
    var summary = record && record.artifacts && record.artifacts.summary;
    if (summary && summary.title) {
      return summary.title;
    }

    if (record && record.title) {
      return record.title;
    }

    var date = record && record.createdAt ? new Date(record.createdAt) : new Date();
    if (Number.isNaN(date.getTime())) {
      date = new Date();
    }
    return "新录音 " + pad(date.getFullYear()) + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  function formatRecordTime(value) {
    var date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) {
      date = new Date();
    }
    return pad(date.getFullYear()) + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
  }

  function currentUserId() {
    var value = window.BAIZHI_USER_ID || localStorage.getItem(MOCK_USER_KEY);
    if (!value) {
      value = "baizhi_student_web";
      localStorage.setItem(MOCK_USER_KEY, value);
    }
    return value;
  }

  function saveAudioBlob(id, blob) {
    if (!blob || !window.indexedDB) {
      return;
    }

    var request = indexedDB.open(AUDIO_DB_NAME, 1);
    request.onupgradeneeded = function(event) {
      var db = event.target.result;
      if (!db.objectStoreNames.contains(AUDIO_BLOB_STORE)) {
        db.createObjectStore(AUDIO_BLOB_STORE);
      }
    };
    request.onsuccess = function(event) {
      var db = event.target.result;
      var tx = db.transaction(AUDIO_BLOB_STORE, "readwrite");
      tx.objectStore(AUDIO_BLOB_STORE).put(blob, id);
      tx.oncomplete = function() {
        db.close();
      };
      tx.onerror = function() {
        db.close();
      };
    };
  }

  function deleteAudioBlob(id) {
    if (!id || !window.indexedDB) {
      return;
    }

    var request = indexedDB.open(AUDIO_DB_NAME, 1);
    request.onupgradeneeded = function(event) {
      var db = event.target.result;
      if (!db.objectStoreNames.contains(AUDIO_BLOB_STORE)) {
        db.createObjectStore(AUDIO_BLOB_STORE);
      }
    };
    request.onsuccess = function(event) {
      var db = event.target.result;
      var tx = db.transaction(AUDIO_BLOB_STORE, "readwrite");
      tx.objectStore(AUDIO_BLOB_STORE).delete(id);
      tx.oncomplete = function() {
        db.close();
      };
      tx.onerror = function() {
        db.close();
      };
    };
  }

  function showAudioListToast(message) {
    var host = document.getElementById("bz-audio-records-panel");
    if (!host) {
      return;
    }

    var old = host.querySelector(".bz-audio-list-toast");
    if (old) {
      old.remove();
    }

    var toast = document.createElement("div");
    toast.className = "bz-audio-list-toast";
    toast.textContent = message;
    host.appendChild(toast);
    window.setTimeout(function() {
      toast.remove();
    }, 2600);
  }

  function clickKnowledgeMarketNav() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll("button"));
    var target = buttons.find(function(button) {
      return button.textContent && button.textContent.replace(/\s+/g, "").indexOf("知识广场") >= 0;
    });

    if (target) {
      target.click();
    }
  }

  function showFloatingToast(message) {
    var old = document.querySelector(".floating-toast.bz-publish-toast");
    if (old) {
      old.remove();
    }

    var toast = document.createElement("div");
    toast.className = "floating-toast bz-publish-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(function() {
      toast.remove();
    }, 2600);
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

  function hasActiveRecordingSession() {
    return ["requesting", "recording", "transcribing", "batch-transcribing", "confirming"].indexOf(state.mode) >= 0;
  }

  function scheduleRecorderReattach() {
    if (!hasActiveRecordingSession()) {
      return;
    }

    clearTimeout(reattachTimer);
    reattachTimer = window.setTimeout(function() {
      if (!hasActiveRecordingSession()) {
        return;
      }

      if (state.mode === "confirming") {
        renderConfirmOverlay();
        return;
      }

      renderModal();
    }, 120);

    window.setTimeout(function() {
      if (hasActiveRecordingSession() && state.mode !== "confirming") {
        renderModal();
      }
    }, 420);
  }

  function observeClassroomHost() {
    if (!window.MutationObserver || classroomHostObserver) {
      return;
    }

    classroomHostObserver = new MutationObserver(function() {
      if (!hasActiveRecordingSession() || state.mode === "confirming") {
        return;
      }

      var host = getClassroomHost();
      var mountedRecorder = document.querySelector("#bz-asr-modal.bz-asr-old-recorder");
      if (host && !mountedRecorder) {
        scheduleRecorderReattach();
      }
    });

    classroomHostObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
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
    var overlay = document.querySelector("#bz-asr-modal.bz-confirm-overlay");
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }

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

    var entries = transcriptEntries(text);
    return entries.map(function(entry, index) {
      var line = entry.text || "";
      var isCurrent = !includeAllDone && index === entries.length - 1 && !/[。！？!?；;]$/.test(line);
      return '<p class="bz-asr-line ' + (isCurrent ? "is-current" : "") + '"><span class="bz-asr-line-time">' + esc(formatLineTime(index)) + '</span><span class="bz-asr-line-text">' + esc(line) + '</span></p>';
    }).join("");
  }

  function transcriptEntries(text) {
    var requestedText = typeof text === "string" ? text : state.text;
    var normalizedSegments = normalizeSpeakerSegments(state.segments || []);

    if (normalizedSegments.length) {
      return normalizedSegments;
    }

    return splitTranscriptLines(requestedText).map(function(line, index) {
      return {
        text: line,
        speaker: defaultSpeakerLabel(),
        start: index * 8,
      };
    });
  }

  function normalizeSpeakerSegments(segments) {
    if (!Array.isArray(segments)) {
      return [];
    }

    return segments.map(function(segment, index) {
      var text = String((segment && segment.text) || "").trim();
      if (!text) {
        return null;
      }

      return {
        index: segment.index == null ? index + 1 : segment.index,
        start: typeof segment.start === "number" ? segment.start : null,
        end: typeof segment.end === "number" ? segment.end : null,
        text: text,
        speaker: speakerLabel(segment),
        confidence: segment.confidence,
      };
    }).filter(Boolean);
  }

  function speakerLabel(segment) {
    var namedSpeaker = firstPresent(segment, ["speaker", "speakerLabel", "speaker_label"]);
    var speakerId = firstPresent(segment, ["speakerId", "speaker_id"]);

    if (namedSpeaker !== undefined && namedSpeaker !== null && namedSpeaker !== "") {
      return normalizeNamedSpeaker(namedSpeaker);
    }

    if (speakerId !== undefined && speakerId !== null && speakerId !== "") {
      return speakerAlias(speakerId);
    }

    return defaultSpeakerLabel();
  }

  function normalizeNamedSpeaker(raw) {
    var value = String(raw || "").trim();
    if (!value) {
      return defaultSpeakerLabel();
    }

    if (/^speaker\s+/i.test(value)) {
      return value.replace(/^speaker/i, "Speaker");
    }

    if (/^[A-Z]$/i.test(value)) {
      return "Speaker " + value.toUpperCase();
    }

    return value;
  }

  function speakerAlias(id) {
    var key = String(id).trim();

    if (!speakerAliasMap[key]) {
      speakerAliasMap[key] = "Speaker " + String.fromCharCode(65 + (speakerAliasNext % 26));
      speakerAliasNext += 1;
    }

    return speakerAliasMap[key];
  }

  function resetSpeakerAliases() {
    speakerAliasMap = {};
    speakerAliasNext = 0;
  }

  function firstPresent(source, keys) {
    if (!source) {
      return undefined;
    }

    for (var i = 0; i < keys.length; i += 1) {
      var value = source[keys[i]];
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }

    return undefined;
  }

  function defaultSpeakerLabel() {
    return window.BAIZHI_ASR_DEFAULT_SPEAKER || "Speaker A";
  }

  function formatEntryWallTime(entry, index) {
    var offset = entry && typeof entry.start === "number" ? entry.start : index * 8;
    return formatWallTime(offset);
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

  function marketIcon() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.4-4h11.2L22 7"></path><path d="M4 7v13h16V7"></path><path d="M9 20v-6h6v6"></path><path d="M2 7h20"></path><path d="M7 7v3"></path><path d="M12 7v3"></path><path d="M17 7v3"></path></svg>';
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

  function chevronIcon(isOpen) {
    return '<svg class="' + (isOpen ? "is-open" : "") + '" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>';
  }

  function wandIcon() {
    return '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 4 5 5"></path><path d="M13 6 5 14l5 5 8-8"></path><path d="M9 15 15 9"></path><path d="M6 4v3"></path><path d="M4.5 5.5h3"></path><path d="M19 16v3"></path><path d="M17.5 17.5h3"></path></svg>';
  }

  function sparkleIcon() {
    return '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 9.8 8.8 4 11l5.8 2.2L12 19l2.2-5.8L20 11l-5.8-2.2L12 3Z"></path><path d="M5 3v4"></path><path d="M3 5h4"></path><path d="M19 17v4"></path><path d="M17 19h4"></path></svg>';
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
      ".bz-confirm-overlay{z-index:9999}.bz-confirm-shell{max-height:calc(100vh - 48px);overflow:auto}.bz-confirm-audio{display:flex;align-items:center;gap:10px;color:var(--muted,#6b7280);font-size:12px;font-weight:700}.bz-confirm-audio strong{color:var(--ink,#0f1110);font-variant-numeric:tabular-nums}.bz-confirm-audio audio{width:220px;height:32px}.bz-confirm-actions button:disabled{opacity:.55;cursor:not-allowed}.bz-confirm-error{padding:10px 12px;border-radius:12px;background:#fff2f0;color:#b42318;font-size:12px;font-weight:700;line-height:1.5}" +
      ".bz-audio-records-panel{position:relative;border-bottom:1px solid var(--line,#e5e7eb);padding-bottom:14px;margin-bottom:10px}.bz-audio-record-card{position:relative}.bz-audio-record-card .mini-note{padding-right:42px}.bz-audio-record-card .mini-note strong{overflow-wrap:anywhere}.bz-audio-delete{position:absolute;top:16px;right:16px;z-index:3;display:grid;place-items:center;width:34px;height:34px;border:0;border-radius:50%;background:#0f11100d;color:#737a76;opacity:0;transform:translateY(-3px) scale(.94);cursor:pointer;transition:opacity .18s ease,transform .18s ease,background .18s ease,color .18s ease}.bz-audio-delete svg{width:17px;height:17px}.bz-audio-record-card:hover .bz-audio-delete,.bz-audio-record-card:focus-within .bz-audio-delete{opacity:1;transform:translateY(0) scale(1)}.bz-audio-delete:hover{background:#0f1110;color:#fff}.bz-audio-list-toast{position:absolute;left:18px;right:18px;bottom:8px;z-index:5;padding:9px 12px;border-radius:12px;background:#fff2f0;color:#b42318;font-size:12px;font-weight:800;box-shadow:0 10px 24px -14px #0f111059}.bz-audio-player{flex-shrink:0}.bz-audio-transcript{overflow:auto}.bz-note-title-block{min-width:0;flex:1}.bz-lesson-meta-chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px;max-width:100%}.bz-lesson-meta-chips span{display:inline-flex;align-items:center;gap:5px;max-width:220px;padding:5px 10px;border:1px solid rgba(168,212,0,.36);border-radius:999px;background:#f8ffdb;color:#4e6a00;font-size:12px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bz-lesson-meta-chips strong{color:#6b7400;font-weight:850}.bz-audio-speaker-list p strong{display:inline-block;margin-right:10px;color:#5f8c00;font-weight:800;white-space:nowrap}.bz-audio-empty{padding:18px;border:1px dashed var(--line,#e5e7eb);border-radius:14px;color:var(--muted,#6b7280)}.bz-overview-title{display:flex;align-items:center;gap:9px;padding:2px 0 12px;color:var(--ink,#0f1110);font-size:16px;font-weight:850}.bz-overview-title span{width:0;height:0;border-top:5px solid transparent;border-bottom:5px solid transparent;border-left:11px solid #d92d20;filter:drop-shadow(0 1px 1px rgba(217,45,32,.22))}.bz-key-overview-list article time{color:#5aa7df;text-decoration:underline;text-underline-offset:2px;font-size:14px}.bz-key-overview-list article p{font-size:15px;font-weight:650}.bz-key-overview-list article p:before{content:'•';display:inline-block;margin-right:10px;color:var(--ink,#0f1110);font-weight:900}.bz-key-overview-list article p strong{color:var(--ink,#0f1110);font-weight:850}.bz-material-list article{gap:12px}.bz-material-meta{display:flex;align-items:center;gap:10px;color:var(--hint,#9aa0a6);font-size:15px;font-weight:800}.bz-material-meta svg{width:17px;height:17px}.bz-material-meta time{font-size:15px;color:var(--hint,#9aa0a6)}.bz-material-thumb{width:min(520px,100%);aspect-ratio:16/9;margin:0;border:1px solid var(--line-soft,#eceff0);border-radius:14px;background:#fff;overflow:hidden;box-shadow:0 12px 30px -24px rgba(15,17,16,.35)}.bz-material-thumb img{display:block;width:100%;height:100%;object-fit:cover}.bz-material-thumb-fallback{display:grid;place-items:center;background:linear-gradient(180deg,#fff,#f7f8f5)}.bz-material-thumb-fallback>div{width:78%;display:grid;gap:9px}.bz-material-thumb-fallback small{color:#5f8c00;font-size:11px;font-weight:850}.bz-material-thumb-fallback strong{color:var(--ink,#0f1110);font-size:18px;font-weight:850;line-height:1.25}.bz-material-thumb-fallback span{display:block;height:8px;border-radius:999px;background:#0f111012}.bz-material-thumb-fallback span:nth-child(4){width:74%}.bz-material-thumb-fallback span:nth-child(5){width:52%;background:#a8d40066}.bz-material-list article p strong{color:var(--ink,#0f1110)}" +
      ".bz-publish-entry{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}.bz-publish-entry svg{width:16px;height:16px}.bz-publish-backdrop{z-index:9999}.bz-publish-modal{max-height:calc(100vh - 48px);overflow:auto}.bz-publish-modal .primary-action:disabled{opacity:.45;cursor:not-allowed}" +
      ".bz-online-empty.is-error p{color:#b42318}.bz-online-empty.is-loading{min-height:380px}.bz-online-empty.is-loading .note-empty-icon{animation:bzArtifactIconFloat 1.8s ease-in-out infinite}.bz-online-empty.is-loading .note-empty-icon svg{animation:bzArtifactIconTilt 1.8s ease-in-out infinite}.bz-loading-dots{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:18px;margin-top:4px}.bz-loading-dots i{display:block;width:7px;height:7px;border-radius:50%;background:#9aa0a6;opacity:.42;animation:bzArtifactDot 1.05s ease-in-out infinite}.bz-loading-dots i:nth-child(2){animation-delay:.14s}.bz-loading-dots i:nth-child(3){animation-delay:.28s}@keyframes bzArtifactIconFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}@keyframes bzArtifactIconTilt{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(4deg)}}@keyframes bzArtifactDot{0%,80%,100%{transform:translateY(0);opacity:.34}40%{transform:translateY(-5px);opacity:1}}" +
      ".note-empty-action svg{width:16px;height:16px}.note-empty-icon svg{width:26px;height:26px}.bz-generated-wrap{min-width:0}.bz-generated-wrap .regenerate-bar button svg{width:13px;height:13px}.bz-generated-wrap .summary-hero h3{overflow-wrap:anywhere}.bz-generated-wrap .formula-card span{overflow-wrap:anywhere}.bz-generated-wrap .review-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.bz-high-value-quotes{display:grid;gap:12px;padding:18px;border:1px solid rgba(168,212,0,.38);border-radius:18px;background:linear-gradient(180deg,#ffffff,#fbfff0);box-shadow:0 10px 28px -22px rgba(95,140,0,.55)}.bz-high-value-quotes header{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.bz-high-value-quotes header span{font-size:16px;font-weight:850;letter-spacing:0;color:var(--ink,#0f1110)}.bz-high-value-quotes header strong{font-size:12px;font-weight:800;color:#6aa800;white-space:nowrap}.bz-high-value-quotes>div{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.bz-high-value-quotes article{min-width:0;padding:12px 13px;border-radius:14px;background:#fff;border:1px solid rgba(15,17,16,.08)}.bz-high-value-quotes small{display:block;margin-bottom:7px;color:#7d981e;font-size:11px;font-weight:800}.bz-high-value-quotes p{margin:0;color:var(--ink,#0f1110);font-size:13px;font-weight:700;line-height:1.65;overflow-wrap:anywhere}.bz-high-value-quotes em{display:block;margin-top:8px;color:#8a918c;font-size:11.5px;font-style:normal;line-height:1.45}.bz-exam-options{margin:2px 0 0;padding-left:22px;color:var(--ink,#0f1110);font-size:13px;line-height:1.68}.bz-exam-options li{margin:3px 0}.bz-answer-line{color:#5f8c00!important;font-weight:800}.bz-review-board{padding:0}.do-exercise-btn{border:0}.do-exercise-btn span{line-height:1}" +
      "@media(max-width:720px){.bz-confirm-actions{flex-direction:column-reverse}.bz-confirm-actions button{width:100%}.bz-confirm-audio{align-items:flex-start;flex-direction:column}.bz-confirm-audio audio{width:100%}.bz-asr-old-recorder{min-height:calc(100vh - 120px)}.bz-asr-old-recorder .live-transcript{max-height:38vh}.bz-high-value-quotes>div{grid-template-columns:1fr}.bz-high-value-quotes header{display:grid;gap:4px}}";
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
