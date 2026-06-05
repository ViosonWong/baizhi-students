import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  ArrowRight,
  AudioLines,
  BookOpen,
  BookOpenCheck,
  BrainCircuit,
  CalendarCheck,
  ChevronRight,
  Check,
  CircleDollarSign,
  ClipboardList,
  FileAudio,
  FileText,
  ImagePlus,
  LibraryBig,
  Lightbulb,
  Loader2,
  LockKeyhole,
  LogOut,
  Mic,
  Notebook,
  Pause,
  Play,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Store,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import productRecorder from "./assets/product-recorder.png";
import productFlash from "./assets/product-flash.png";
import productPen from "./assets/product-pen.png";

type View = "home" | "classroom" | "notes" | "market";
type RecordState = "idle" | "recording" | "paused" | "metadata" | "generating" | "done";
type PermissionState = "not_requested" | "requesting" | "granted";
type NoteTab = "transcript" | "summary" | "exercise" | "review";
type LoginStep = "phone" | "code";
type LessonMeta = {
  school: string;
  classroom: string;
  teacher: string;
  course: string;
};
type ClassPhoto = {
  id: string;
  name: string;
  url: string;
};

type ClassroomFile = {
  title: string;
  type: string;
  folder: string;
  duration: string;
  durationText: string;
  status: string;
  price: number;
  period: "今天" | "本周" | "更早";
};

type MarketNote = {
  id: string;
  title: string;
  school: string;
  major: string;
  author: string;
  price: number;
  excerpt: string;
  tags: string[];
};

type StudentProfile = {
  school: string;
  major: string;
  className: string;
  verified: boolean;
};

const LOGIN_STORAGE_KEY = "baizhi-students.mock-login";

function readStoredLogin() {
  try {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(LOGIN_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeStoredLogin() {
  try {
    window.localStorage.setItem(LOGIN_STORAGE_KEY, "true");
  } catch {
    // 演示环境里即使本地存储不可用，也继续保留当前页面的登录态。
  }
}

const noteFiles: ClassroomFile[] = [
  {
    title: "新录音 2026-05-22 11:00:46",
    type: "录音文件",
    folder: "2026 春季学期 / 高等数学",
    duration: "34:24",
    durationText: "34min24s",
    status: "AI 总结中",
    price: 30,
    period: "今天",
  },
  {
    title: "新录音 2026-05-22 10:48:13",
    type: "录音文件",
    folder: "计算机科学 / 数据结构",
    duration: "42:08",
    durationText: "42min8s",
    status: "上传服务器",
    price: 18,
    period: "今天",
  },
  {
    title: "新录音 2026-05-21 16:25:09",
    type: "录音文件",
    folder: "经济管理 / 宏观经济学",
    duration: "28:16",
    durationText: "28min16s",
    status: "转码中",
    price: 24,
    period: "本周",
  },
  {
    title: "新录音 2026-05-21 14:02:31",
    type: "录音文件",
    folder: "外语学院 / 英语听力",
    duration: "12:09",
    durationText: "12min9s",
    status: "暂停中",
    price: 12,
    period: "本周",
  },
  {
    title: "新录音 2026-05-20 09:18:57",
    type: "录音文件",
    folder: "2026 春季学期 / 线性代数",
    duration: "08:42",
    durationText: "8min42s",
    status: "录音中",
    price: 16,
    period: "本周",
  },
  {
    title: "多元函数极值：约束条件与 Hessian 判别",
    type: "AI 笔记",
    folder: "2026 春季学期 / 高等数学",
    duration: "34:24",
    durationText: "34min24s",
    status: "已入库",
    price: 30,
    period: "本周",
  },
  {
    title: "图的遍历：DFS、BFS 与复杂度整理",
    type: "AI 笔记",
    folder: "计算机科学 / 数据结构",
    duration: "42:08",
    durationText: "42min8s",
    status: "已入库",
    price: 18,
    period: "更早",
  },
  {
    title: "TCP 拥塞控制：慢启动到快恢复",
    type: "转译文本",
    folder: "计算机科学 / 计算机网络",
    duration: "39:20",
    durationText: "39min20s",
    status: "已入库",
    price: 20,
    period: "更早",
  },
];

const transcriptLines = [
  {
    time: "14:30:20 - 14:30:48",
    speaker: "Speaker A",
    role: "授课老师",
    confidence: "98%",
    event: "PPT 第 12 页",
    text: "各位好，今天我们进入多元函数极值。先记住一个判断顺序：第一，看有没有约束条件；第二，找驻点；第三，再决定用 Hessian 判别还是拉格朗日乘子法。",
  },
  {
    time: "14:30:49 - 14:31:08",
    speaker: "Speaker B",
    role: "学生提问",
    confidence: "93%",
    event: "课堂问答",
    text: "老师，如果题目只给了一个函数，没有写约束，是不是就直接对 x 和 y 分别求偏导，然后令它们等于零？",
  },
  {
    time: "14:31:09 - 14:31:42",
    speaker: "Speaker A",
    role: "授课老师",
    confidence: "97%",
    event: "板书照片 01",
    text: "对。无约束极值先求一阶偏导，解出所有驻点。注意，驻点只是候选点，不等于一定有极值。接下来要看二阶偏导组成的 Hessian 矩阵，也就是 A、B、C 这三个量。",
  },
  {
    time: "14:31:43 - 14:32:16",
    speaker: "Speaker C",
    role: "学生追问",
    confidence: "91%",
    event: "课堂问答",
    text: "那如果 Hessian 判别里面 B 平方减 AC 等于零，这种临界情况考试里应该怎么处理？",
  },
  {
    time: "14:32:17 - 14:33:05",
    speaker: "Speaker A",
    role: "授课老师",
    confidence: "96%",
    event: "重点标记",
    text: "等于零时二阶判别法失效，不能直接下结论。你们要回到函数定义，沿不同方向代入观察增减性。考试里最容易扣分的地方，就是看到判别式为零还强行写极大或极小。",
  },
  {
    time: "14:33:06 - 14:33:34",
    speaker: "Speaker A",
    role: "授课老师",
    confidence: "98%",
    event: "PPT 第 13 页",
    text: "如果出现约束条件，比如 x 平方加 y 平方等于 1，就不要直接套 Hessian。先构造拉格朗日函数，再把原函数和约束方程一起联立求解。",
  },
];

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatFileDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h${minutes}min${seconds}s`;
  if (minutes > 0) return `${minutes}min${seconds}s`;
  return `${seconds}s`;
}

function formatRecordingTitle(date = new Date()) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `新录音 ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

const legacyPhotoMocks = ["板书", "课件", "例题"];

function statusClassName(status: string) {
  if (status === "录音中") return "is-recording";
  if (status === "暂停中") return "is-paused";
  if (status === "转码中") return "is-transcoding";
  if (status === "上传服务器" || status === "上传至云端") return "is-uploading";
  if (status === "AI 总结中") return "is-summarizing";
  return "is-ready";
}

const marketplaceNotes: MarketNote[] = [
  {
    id: "m1",
    title: "高数第 8 讲：多元函数极值",
    school: "北京某大学",
    major: "计算机科学",
    author: "林同学",
    price: 30,
    excerpt: "覆盖无约束极值、Hessian 判别和拉格朗日乘子法，适合考前快速串联判断路径。",
    tags: ["笔记重点", "测试题集", "复习建议"],
  },
  {
    id: "m2",
    title: "医学统计学考前重点包",
    school: "北京某大学",
    major: "临床医学",
    author: "周同学",
    price: 520,
    excerpt: "把假设检验、方差分析和样本量估算放在同一套复习卡里，附有易错提醒。",
    tags: ["笔记重点", "测试题集", "复习建议"],
  },
  {
    id: "m3",
    title: "宏观经济学期中复习清单",
    school: "上海某高校",
    major: "经济管理",
    author: "沈同学",
    price: 24,
    excerpt: "用问题清单梳理 GDP、通胀、货币政策和 IS-LM 模型，适合课后自测。",
    tags: ["笔记重点", "测试题集", "复习建议"],
  },
];

function App() {
  const [view, setView] = useState<View>("home");
  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [permission, setPermission] = useState<PermissionState>("not_requested");
  const [showPermission, setShowPermission] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginStep, setLoginStep] = useState<LoginStep>("phone");
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(readStoredLogin);
  const [student, setStudent] = useState<StudentProfile>({
    school: "",
    major: "",
    className: "",
    verified: false,
  });
  const [lessonMeta, setLessonMeta] = useState({
    school: "",
    classroom: "",
    teacher: "",
    course: "",
  });
  const [photos, setPhotos] = useState<ClassPhoto[]>([]);
  const [recordedFiles, setRecordedFiles] = useState<ClassroomFile[]>([]);
  const [noteTab, setNoteTab] = useState<NoteTab>("transcript");
  const [showCertify, setShowCertify] = useState(false);
  const [marketSchool, setMarketSchool] = useState("全部学校");
  const [marketMajor, setMarketMajor] = useState("全部专业");
  const [marketQuery, setMarketQuery] = useState("");
  const [publishedMarketNotes, setPublishedMarketNotes] = useState<MarketNote[]>([]);
  const [credits, setCredits] = useState(420);
  const [purchaseTarget, setPurchaseTarget] = useState<MarketNote | null>(null);
  const [purchaseStatus, setPurchaseStatus] = useState<"idle" | "success" | "insufficient">("idle");
  const [purchasedIds, setPurchasedIds] = useState<string[]>([]);
  const [purchasedNotes, setPurchasedNotes] = useState<MarketNote[]>([]);
  const [publishAfterCertify, setPublishAfterCertify] = useState(false);
  const [toast, setToast] = useState("");
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [showPublish, setShowPublish] = useState(false);
  const [showRecharge, setShowRecharge] = useState(false);
  const [showCreditsPanel, setShowCreditsPanel] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const photosRef = useRef<ClassPhoto[]>([]);

  const showToast = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 1800);
  };

  const recordTimer = formatDuration(recordSeconds);

  useEffect(() => {
    if (recordState !== "recording") return undefined;
    const timer = window.setInterval(() => {
      setRecordSeconds((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recordState]);

  useEffect(() => {
    setPhotos((items) => items.filter((photo) => !legacyPhotoMocks.includes(photo.name)));
  }, []);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => () => {
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url));
  }, []);

  useEffect(() => {
    if (!showAccountMenu) return;
    const handler = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setShowAccountMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAccountMenu]);

  const marketNotes = [...publishedMarketNotes, ...marketplaceNotes];
  const filteredMarket = marketNotes.filter((item) => {
    const schoolOk = marketSchool === "全部学校" || item.school === marketSchool;
    const majorOk = marketMajor === "全部专业" || item.major === marketMajor;
    const queryOk = !marketQuery || `${item.title}${item.school}${item.major}${item.author}`.toLowerCase().includes(marketQuery.toLowerCase());
    return schoolOk && majorOk && queryOk;
  });

  const purchasedTitles = marketNotes
    .filter((m) => purchasedIds.includes(m.id))
    .map((m) => m.title);

  const requireLogin = () => {
    if (isLoggedIn) return true;
    setShowLogin(true);
    return false;
  };

  const beginRecord = () => {
    if (!requireLogin()) return;
    if (permission !== "granted") {
      setShowPermission(true);
      return;
    }
    if (recordState === "idle" || recordState === "done") {
      setRecordSeconds(0);
    }
    setView("classroom");
    setRecordState("recording");
  };

  const generateRecordedNote = () => {
    const seconds = Math.max(recordSeconds, 1);
    const duration = formatDuration(seconds).replace(/^00:/, "");
    const nextFile: ClassroomFile = {
      title: formatRecordingTitle(),
      type: "录音文件",
      folder: lessonMeta.course ? `今日课堂 / ${lessonMeta.course}` : "今日课堂 / 未命名课程",
      duration,
      durationText: formatFileDuration(seconds),
      status: "AI 总结中",
      price: 0,
      period: "今天",
    };

    setRecordState("generating");
    window.setTimeout(() => {
      setRecordedFiles((files) => [nextFile, ...files]);
      setRecordState("done");
      setView("notes");
      setNoteTab("summary");
    }, 900);
  };

  const authorize = () => {
    setPermission("requesting");
    window.setTimeout(() => {
      setPermission("granted");
      setShowPermission(false);
      if (recordState === "idle" || recordState === "done") {
        setRecordSeconds(0);
      }
      setView("classroom");
      setRecordState("recording");
    }, 1000);
  };

  const finishRecord = () => {
    setRecordState("metadata");
  };

  const addPhotos = (files: FileList | null) => {
    if (!files?.length) return;
    const nextPhotos = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        name: file.name,
        url: URL.createObjectURL(file),
      }));
    if (!nextPhotos.length) return;
    setPhotos((items) => [...items, ...nextPhotos]);
  };

  const deletePhoto = (photoId: string) => {
    setPhotos((items) => {
      const target = items.find((photo) => photo.id === photoId);
      if (target) URL.revokeObjectURL(target.url);
      return items.filter((photo) => photo.id !== photoId);
    });
  };

  const completeMetadata = () => {
    generateRecordedNote();
  };

  const submitLogin = () => {
    if (loginStep === "phone") {
      setLoginStep("code");
      return;
    }
    writeStoredLogin();
    setIsLoggedIn(true);
    setShowLogin(false);
    setLoginStep("phone");
    if (student.verified) {
      setLessonMeta((prev) => ({
        ...prev,
        school: prev.school || student.school,
      }));
    }
  };

  const submitCertification = () => {
    const nextStudent = {
      school: student.school || "北京某大学",
      major: student.major || "计算机科学",
      className: student.className || "计科 2302 班",
      verified: true,
    };
    setStudent(nextStudent);
    setLessonMeta((prev) => ({
      ...prev,
      school: prev.school || nextStudent.school,
    }));
    setShowCertify(false);
    showToast("学生认证已通过");
    if (publishAfterCertify) {
      setPublishAfterCertify(false);
      setShowPublish(true);
    }
  };

  const confirmPublish = ({ meta, price }: { meta: LessonMeta; price: number }) => {
    const nextNote: MarketNote = {
      id: `published-${Date.now()}`,
      title: meta.course ? `${meta.course}：AI 课堂笔记精华` : "AI 课堂笔记精华",
      school: meta.school || student.school || "北京某大学",
      major: student.major || "计算机科学",
      author: "我",
      price,
      excerpt: "由课堂录音自动整理，包含转译文本、结构化总结、测试题集和复习建议，适合课后快速回顾。",
      tags: ["笔记重点", "测试题集", "复习建议"],
    };
    setLessonMeta(meta);
    setPublishedMarketNotes((notes) => [nextNote, ...notes]);
    setShowPublish(false);
    setView("market");
    showToast(`已发布到知识广场 · ${price} 积分`);
  };

  const openPurchase = (note: MarketNote) => {
    if (!requireLogin()) return;
    setPurchaseStatus("idle");
    setPurchaseTarget(note);
  };

  const confirmPurchase = () => {
    if (!purchaseTarget) return;
    if (credits < purchaseTarget.price) {
      setPurchaseStatus("insufficient");
      return;
    }
    setCredits((value) => value - purchaseTarget.price);
    setPurchasedIds((ids) => (ids.includes(purchaseTarget.id) ? ids : [...ids, purchaseTarget.id]));
    setPurchasedNotes((prev) => prev.find((n) => n.id === purchaseTarget!.id) ? prev : [purchaseTarget!, ...prev]);
    setPurchaseStatus("success");
  };

  const closePurchase = () => {
    setPurchaseTarget(null);
    setPurchaseStatus("idle");
  };

  const goToNotesAfterPurchase = () => {
    closePurchase();
    setView("notes");
    setNoteTab("summary");
  };
  const pageTitle =
    view === "home"
      ? "百智AI学习工作台"
      : view === "classroom"
      ? "今日课堂"
      : view === "notes"
      ? "AI 笔记资产库"
      : "校园知识广场";

  const openCreditsPanel = () => {
    if (!requireLogin()) return;
    setShowCreditsPanel(true);
  };

  return (
    <main className={`student-app ${view === "notes" ? "" : "no-agent"}`}>
      {showLogin && (
        <LoginModal
          code={code}
          isCodeStep={loginStep === "code"}
          phone={phone}
          setCode={setCode}
          setPhone={setPhone}
          onClose={() => setShowLogin(false)}
          onSubmit={submitLogin}
        />
      )}
      {showPermission && <PermissionModal onAuthorize={authorize} onClose={() => setShowPermission(false)} permission={permission} />}
      {permission === "requesting" && <FloatingToast>正在获取录音权限，请按浏览器提示完成授权...</FloatingToast>}
      {toast && <FloatingToast>{toast}</FloatingToast>}
      {recordState === "metadata" && (
        <MetadataModal
          lessonMeta={lessonMeta}
          setLessonMeta={setLessonMeta}
          onClose={generateRecordedNote}
          onSubmit={completeMetadata}
        />
      )}
      <input
        ref={photoInputRef}
        hidden
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          addPhotos(event.target.files);
          event.target.value = "";
        }}
      />
      {showDiscardConfirm && (
        <ConfirmModal
          title="放弃这次录音？"
          body="放弃后这段录音和临时照片不会保留。"
          confirmText="放弃"
          onCancel={() => setShowDiscardConfirm(false)}
          onConfirm={() => {
            setRecordState("idle");
            setShowDiscardConfirm(false);
          }}
        />
      )}
      {showCertify && <CertificationModal student={student} setStudent={setStudent} onClose={() => setShowCertify(false)} onSubmit={submitCertification} />}
      {purchaseTarget && (
        <PurchaseModal
          credits={credits}
          note={purchaseTarget}
          status={purchaseStatus}
          onClose={closePurchase}
          onConfirm={confirmPurchase}
          onGoToNotes={goToNotesAfterPurchase}
          onRecharge={() => {
            setCredits((value) => value + 200);
            setPurchaseStatus("idle");
            showToast("已充值 200 积分");
          }}
        />
      )}
      {showPublish && (
        <PublishModal
          lessonMeta={lessonMeta}
          onClose={() => setShowPublish(false)}
          onConfirm={confirmPublish}
        />
      )}
      {showRecharge && (
        <RechargeModal
          onClose={() => setShowRecharge(false)}
          onConfirm={(amount) => {
            setCredits((value) => value + amount);
            setShowRecharge(false);
            showToast(`充值成功，获得 ${amount} 积分`);
          }}
        />
      )}
      {showCreditsPanel && (
        <CreditsPanel
          credits={credits}
          onClose={() => setShowCreditsPanel(false)}
          onRecharge={() => {
            setShowCreditsPanel(false);
            setShowRecharge(true);
          }}
        />
      )}

      <aside className="thin-nav">
        <button className="brand-dot" onClick={() => setView("home")} aria-label="百智学生版首页">
          <BrainCircuit size={22} />
        </button>
        <nav className="thin-nav-group">
          <NavButton active={view === "home"} icon={<BookOpenCheck />} label="首页" onClick={() => setView("home")} />
          <NavButton active={view === "classroom"} icon={<Mic />} label="今日课堂" onClick={() => setView("classroom")} />
          <NavButton active={view === "notes"} icon={<LibraryBig />} label="AI 笔记" onClick={() => setView("notes")} />
          <NavButton active={view === "market"} icon={<Store />} label="知识广场" onClick={() => setView("market")} />
        </nav>
      </aside>

      <header className="student-topbar">
        <div className="brand-lockup">
          <h1>{pageTitle}</h1>
        </div>
        <div className="topbar-tools">
          {isLoggedIn && (
            <button
              type="button"
              className="topbar-credits"
              onClick={openCreditsPanel}
              aria-expanded={showCreditsPanel}
              aria-haspopup="dialog"
            >
              <CircleDollarSign size={15} />
              <span className="topbar-credits-value">{credits}</span>
              <span className="topbar-credits-label">积分</span>
            </button>
          )}
          <div className="topbar-account-wrap" ref={accountMenuRef}>
            <button
              className="topbar-account"
              onClick={() => {
                if (isLoggedIn) {
                  setShowAccountMenu((v) => !v);
                } else {
                  setShowLogin(true);
                }
              }}
            >
              <span className="avatar-dot">{isLoggedIn ? "我" : <LockKeyhole size={14} />}</span>
              <span className="topbar-account-text">
                {isLoggedIn ? (
                  <strong>138****8000</strong>
                ) : (
                  <strong>立即登录</strong>
                )}
              </span>
            </button>
            {isLoggedIn && showAccountMenu && (
              <div className="account-dropdown">
                <button
                  className="account-dropdown-item logout"
                  onClick={() => {
                    setIsLoggedIn(false);
                    setShowAccountMenu(false);
                  }}
                >
                  <LogOut size={14} />
                  退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="main-stage">
        {view === "home" && <HomeDashboard beginRecord={beginRecord} setView={setView} />}
        {view === "classroom" && (
          <ClassroomView
            lessonMeta={lessonMeta}
            photos={photos}
            recordTimer={recordTimer}
            recordState={recordState}
            setLessonMeta={setLessonMeta}
            setRecordState={setRecordState}
            beginRecord={beginRecord}
            finishRecord={finishRecord}
            onDiscard={() => setShowDiscardConfirm(true)}
            onDeletePhoto={deletePhoto}
            onPhoto={() => photoInputRef.current?.click()}
          />
        )}
        {view === "notes" && (
          <NotesLibrary
            noteTab={noteTab}
            recordedFiles={recordedFiles}
            setNoteTab={setNoteTab}
            purchasedNotes={purchasedNotes}
            beginRecord={beginRecord}
            onPublish={() => {
              if (!requireLogin()) return;
              if (!student.verified) {
                setPublishAfterCertify(true);
                setShowCertify(true);
                return;
              }
              setShowPublish(true);
            }}
          />
        )}
        {view === "market" && (
          <MarketView
            filteredMarket={filteredMarket}
            marketMajor={marketMajor}
            marketQuery={marketQuery}
            marketSchool={marketSchool}
            purchasedIds={purchasedIds}
            setMarketMajor={setMarketMajor}
            setMarketQuery={setMarketQuery}
            setMarketSchool={setMarketSchool}
            onPurchase={openPurchase}
            onOpenPurchased={() => setView("notes")}
          />
        )}
      </section>

      {view === "notes" && (
        <AgentPanel recordState={recordState} setNoteTab={setNoteTab} setView={setView} />
      )}
    </main>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={`side-nav-button ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function XiaozhiMiniAvatar() {
  return (
    <div className="xz-mini-wrap" aria-hidden="true">
      <div className="record-mascot xz-mini-mascot">
        <span className="rm-ear rm-ear-l" />
        <span className="rm-ear rm-ear-r" />
        <span className="rm-band" />
        <span className="rm-face">
          <span className="rm-eye rm-eye-l" />
          <span className="rm-eye rm-eye-r" />
          <span className="rm-mouth" />
        </span>
        <span className="rm-cheek rm-cheek-l" />
        <span className="rm-cheek rm-cheek-r" />
      </div>
    </div>
  );
}

function XiaozhiRecordStage({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`record-empty-stage${compact ? " is-compact" : ""}`}>
      <div className="record-mascot" aria-hidden="true">
        <span className="rm-ear rm-ear-l" />
        <span className="rm-ear rm-ear-r" />
        <span className="rm-band" />
        <span className="rm-face">
          <span className="rm-eye rm-eye-l" />
          <span className="rm-eye rm-eye-r" />
          <span className="rm-mouth" />
        </span>
        <span className="rm-cheek rm-cheek-l" />
        <span className="rm-cheek rm-cheek-r" />
        <span className="rm-note rm-note-1">♪</span>
        <span className="rm-note rm-note-2">♫</span>
      </div>
      <div className="record-empty-orbit">
        <span className="record-radar-ring ring-one" />
        <span className="record-radar-ring ring-two" />
        <span className="record-wave-disc">
          <AudioLines size={compact ? 24 : 30} />
        </span>
        <span className="record-wave-bars" aria-hidden="true">
          <i /><i /><i /><i /><i />
        </span>
      </div>
    </div>
  );
}

function HomeSpotlightVisual() {
  return (
    <div className="home-spotlight-visual" aria-hidden="true">
      {/* 背景柔光 + 旋转虚线环 */}
      <span className="hsv3-glow" />
      <span className="hsv3-ring" />

      {/* 戴耳机的小智吉祥物 */}
      <div className="record-mascot hsv3-mascot">
        <span className="rm-ear rm-ear-l" />
        <span className="rm-ear rm-ear-r" />
        <span className="rm-band" />
        <span className="rm-face">
          <span className="rm-eye rm-eye-l" />
          <span className="rm-eye rm-eye-r" />
          <span className="rm-mouth" />
        </span>
        <span className="rm-cheek rm-cheek-l" />
        <span className="rm-cheek rm-cheek-r" />
        <span className="rm-note rm-note-1">♪</span>
        <span className="rm-note rm-note-2">♫</span>
      </div>

      {/* 底部跳动音波小气泡 */}
      <span className="hsv3-wave-bubble">
        <span className="hsv3-wave-bars">
          <i /><i /><i /><i />
        </span>
      </span>
    </div>
  );
}

function HomeDashboard({ beginRecord, setView }: { beginRecord: () => void; setView: (view: View) => void }) {
  const [activeMethod, setActiveMethod] = useState<null | number>(null);

  const hardwareScenes: Array<{
    title: string;
    desc: string;
    subtitle: string;
    kicker: string;
    steps: string[];
    Icon: typeof Mic;
    handler: () => void;
    accentColor: string;
    bgColor: string;
    Visual: () => React.ReactElement;
    photoClass?: string;
  }> = [
    {
      title: "课堂拾音",
      kicker: "只管听课，笔记全自动",
      desc: "上课打开它，老师讲的每一句话都会变成你的笔记。",
      subtitle: "按一下录音键，老师讲的内容实时变成你的文字笔记。",
      steps: [],
      Icon: Mic,
      handler: beginRecord,
      accentColor: "#a8d400",
      bgColor: "#c8d4e2",
      Visual: RecordDeviceIllustration,
      photoClass: "hw-card-photo--padded",
    },
    {
      title: "随身灵感",
      kicker: "灵感一闪，即刻留住",
      desc: "想到啥都能随口说一句，小智帮你归类成今日待办。",
      subtitle: "随时随地，长按录入键说出脑中灵感，自动整理归档。",
      steps: [],
      Icon: Lightbulb,
      handler: () => setView("notes"),
      accentColor: "#a8d400",
      bgColor: "#f4f9f0",
      Visual: FlashIdeaIllustration,
    },
    {
      title: "随写随存",
      kicker: "纸上写一遍，云端存一遍",
      desc: "在纸上书写，手机同步显示笔迹，碎片知识秒入题库。",
      subtitle: "在纸上正常书写，手机实时同步笔迹，碎片知识秒入题库。",
      steps: [],
      Icon: Notebook,
      handler: () => setView("notes"),
      accentColor: "#a8d400",
      bgColor: "#c8d4e2",
      Visual: SyncPenIllustration,
      photoClass: "hw-card-photo--padded",
    },
  ];

  const studyMethods: Array<{
    title: string;
    tagline: string;
    principle: string;
    tip: string;
    flow?: string[];
    steps: Array<{ title: string; detail: string }>;
    visual: "teach" | "cornell" | "curve" | "faster" | "pomodoro" | "sq3r" | "question" | "mimic";
  }> = [
    {
      title: "费曼学习法",
      tagline: "讲得清楚，才算真懂。",
      principle: "用大白话讲复杂知识，讲不通就是没真懂。",
      tip: "讲完一遍录下来，自己回放找漏洞。",
      flow: ["选择目标", "教授知识", "回顾纠错", "简化语言"],
      steps: [
        { title: "锁定概念", detail: "只圈一个知识点" },
        { title: "大白话讲", detail: "像教同学一样说" },
        { title: "回头补缺", detail: "卡壳处回教材" },
        { title: "二轮简化", detail: "再讲一遍更短" },
      ],
      visual: "teach",
    },
    {
      title: "康奈尔 5R",
      tagline: "一页笔记，三个区。",
      principle: "分区记录 + 线索 + 总结，复习效率翻倍。",
      tip: "复习时遮住主栏，只看线索栏回忆内容。",
      steps: [
        { title: "右侧记", detail: "课堂内容原样记" },
        { title: "左侧提", detail: "关键词当线索" },
        { title: "底部总", detail: "一句话收束" },
        { title: "回头背", detail: "遮主栏背线索" },
      ],
      visual: "cornell",
    },
    {
      title: "艾宾浩斯",
      tagline: "趁忘记之前，再看一眼。",
      principle: "按遗忘曲线安排回看，记忆更牢。",
      tip: "把回看安排在 20 分钟 / 1 天 / 7 天后。",
      steps: [
        { title: "当天稳", detail: "课后先过一遍" },
        { title: "分段看", detail: "1 / 3 / 7 天回看" },
        { title: "薄弱加", detail: "易忘点多刷" },
        { title: "月度盘", detail: "30 天再回顾" },
      ],
      visual: "curve",
    },
    {
      title: "FASTER 法",
      tagline: "情绪 + 节奏 = 记得久。",
      principle: "调动情绪与节奏，让记忆有锚点。",
      tip: "给每个知识点配一个夸张的情绪标签。",
      flow: ["F", "A", "S", "T", "E", "R"],
      steps: [
        { title: "放下旧知", detail: "清空先入为主" },
        { title: "标重点", detail: "情绪挂钩记忆" },
        { title: "教一遍", detail: "输出再复盘" },
        { title: "再回看", detail: "睡前过一遍" },
      ],
      visual: "faster",
    },
    {
      title: "番茄钟",
      tagline: "25 分钟，只做一件事。",
      principle: "短冲刺 + 短休息，保持专注节奏。",
      tip: "番茄期间手机静音翻面，物理隔离干扰。",
      flow: ["学习 25′", "休息 5′", "循环 4 轮"],
      steps: [
        { title: "定目标", detail: "一件事做完" },
        { title: "专注学", detail: "25 分钟不分心" },
        { title: "歇再开", detail: "5 分钟后下一轮" },
        { title: "四轮长歇", detail: "完成后 15 分钟" },
      ],
      visual: "pomodoro",
    },
    {
      title: "SQ3R 阅读法",
      tagline: "先看骨架，再钻细节。",
      principle: "浏览 → 提问 → 阅读 → 复述 → 复习。",
      tip: "读前先把章节标题改写成问题清单。",
      flow: ["S", "Q", "R", "R", "R"],
      steps: [
        { title: "Survey", detail: "扫目录抓结构" },
        { title: "Question", detail: "带着问题读" },
        { title: "Read", detail: "找答案精读" },
        { title: "Review", detail: "复述并回看" },
      ],
      visual: "sq3r",
    },
    {
      title: "提问学习法",
      tagline: "带着问题去读，答案记得更牢。",
      principle: "通过自己提出问题，并找到答案的方式，深入理解知识。",
      tip: "把问题写在便利贴上，看到就思考一遍。",
      steps: [
        { title: "选择目标", detail: "定一个想学的概念" },
        { title: "向自己提问", detail: "是什么？为什么？怎么办？" },
        { title: "寻找答案", detail: "查资料或请教他人" },
        { title: "总结归纳", detail: "整理答案再输出" },
      ],
      visual: "question",
    },
    {
      title: "模仿学习法",
      tagline: "拆解高手，提炼精华变自己的。",
      principle: "通过模仿，总结提炼他人经验的精华，形成自己的知识体系。",
      tip: "先模仿结构，再填入自己的内容。",
      steps: [
        { title: "拆分知识点", detail: "划分为小块" },
        { title: "提炼关键词", detail: "一词 / 一句话概括" },
        { title: "分析整合", detail: "找到底层逻辑" },
        { title: "再次加工", detail: "形成自己的框架" },
      ],
      visual: "mimic",
    },
  ];

  return (
    <section className="home-dashboard">
      <section className="glass-card home-spotlight">
        <HomeSpotlightVisual />
        <div className="home-spotlight-copy">
          <h2 className="home-hero-title">
            <span className="hero-line-lead">开麦听课</span>
            <span className="hero-line-main">
              <span className="hero-highlight">笔记自己长出来</span>
              <span className="hero-spark" aria-hidden="true">
                ✦
              </span>
            </span>
          </h2>
          <p className="home-spotlight-sub">专心听讲就好，剩下的交给小智 ✨</p>
        </div>
        <button type="button" className="home-start-pill" onClick={beginRecord}>
          <span className="rsp-icon">
            <Mic size={16} />
          </span>
          <span className="rsp-wave" aria-hidden="true">
            <i /><i /><i /><i />
          </span>
          <span className="rsp-text">一键开录</span>
        </button>
      </section>

      <div className="home-lower-grid">
        <section className="glass-card home-entry-panel">
          <div className="section-head section-head--compact">
            <div>
              <h2>挑一种方式，三秒钟开启你的学习</h2>
            </div>
          </div>
          <div className="hardware-scenes">
            {hardwareScenes.map((scene) => (
              <article
                className="hw-card"
                key={scene.title}
              >
                <div className={`hw-card-visual${scene.photoClass ? " hw-card-visual--padded" : ""}`} style={{ background: scene.bgColor }}>
                  <scene.Visual />
                </div>
                <div className="hw-card-content">
                  <p className="hw-card-kicker">{scene.kicker}</p>
                  <h3 className="hw-card-title">{scene.title}</h3>
                  <p className="hw-card-sub">{scene.subtitle}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="glass-card home-methods-panel">
          <div className="section-head section-head--compact">
            <div>
              <h2>选一种学法，一键进入学霸模式</h2>
            </div>
          </div>
          <div className="study-method-wall">
            {studyMethods.map((m, index) => (
              <MethodPoster key={m.title} method={m} index={index} onClick={() => setActiveMethod(index)} />
            ))}
          </div>
        </section>
        {activeMethod !== null && (
          <MethodDetailModal
            method={studyMethods[activeMethod]}
            index={activeMethod}
            onClose={() => setActiveMethod(null)}
          />
        )}
      </div>
    </section>
  );
}

const CIRCLED_NUMS = ["①", "②", "③", "④", "⑤", "⑥"];

type StudyMethod = {
  title: string;
  tagline: string;
  principle: string;
  tip: string;
  flow?: string[];
  steps: Array<{ title: string; detail: string }>;
  visual: "teach" | "cornell" | "curve" | "faster" | "pomodoro" | "sq3r" | "question" | "mimic";
};

function MethodPoster({
  method,
  index,
  onClick,
}: {
  method: StudyMethod;
  index: number;
  onClick: () => void;
}) {
  return (
    <article
      className="method-poster"
      style={{ "--i": index } as React.CSSProperties}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <span className="method-corner-dots" aria-hidden="true">•••</span>
      <span className="method-poster-no" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      <header className="method-poster-head">
        <h3>{method.title}</h3>
        <p className="method-poster-tagline">{method.tagline}</p>
        <p className="method-poster-principle">
          <span className="method-poster-label">【原理】</span>
          <span>{method.principle}</span>
        </p>
      </header>
      <MethodVisual visual={method.visual} flow={method.flow} />
    </article>
  );
}

function MethodDetailModal({
  method,
  index,
  onClose,
}: {
  method: StudyMethod;
  index: number;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div className="method-modal-backdrop" onClick={onClose}>
      {/* 外壳：overflow visible，让图钉/关闭按钮悬出 */}
      <div
        className="method-modal-outer"
        style={{ "--i": index } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="method-modal-pin" aria-hidden="true" />

        {/* 内部：可滚动的笔记本纸 */}
        <div className="method-modal">
          <span className="method-poster-no" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>

          <header className="method-poster-head">
            <h3>{method.title}</h3>
            <p className="method-poster-tagline">{method.tagline}</p>
            <p className="method-poster-principle">
              <span className="method-poster-label">【原理】</span>
              <span>{method.principle}</span>
            </p>
          </header>

          <MethodVisual visual={method.visual} flow={method.flow} />

          <div className="method-poster-steps-wrap">
            <span className="method-poster-steps-label">【步骤】</span>
            <ol className="method-poster-steps">
              {method.steps.map((step, stepIndex) => (
                <li key={step.title}>
                  <span className="method-poster-step-no">{CIRCLED_NUMS[stepIndex] ?? stepIndex + 1}</span>
                  <span className="method-poster-step-body">
                    <strong>{step.title}</strong>
                    <small> {step.detail}</small>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <p className="method-poster-tip">
            <span className="method-poster-tip-label">💡贴士</span>
            <span>{method.tip}</span>
          </p>
        </div>

        {/* 关闭按钮在 outer 最后渲染，层级最高 */}
        <button className="method-modal-close" onClick={onClose} aria-label="关闭">✕</button>
      </div>
    </div>,
    document.body,
  );
}

function MethodVisual({
  visual,
  flow,
}: {
  visual: "teach" | "cornell" | "curve" | "faster" | "pomodoro" | "sq3r" | "question" | "mimic";
  flow?: string[];
}) {
  if (visual === "cornell") {
    return (
      <div className="method-visual cornell" aria-hidden="true">
        <span>笔记栏</span>
        <span>线索栏</span>
        <strong>总结栏</strong>
      </div>
    );
  }
  if (visual === "curve") {
    return (
      <div className="method-visual curve" aria-hidden="true">
        <i className="curve-line" />
        <span className="curve-dot a" />
        <span className="curve-dot b" />
        <span className="curve-dot c" />
      </div>
    );
  }
  if (visual === "pomodoro" && flow) {
    return (
      <div className="method-visual flow-row" aria-hidden="true">
        {flow.flatMap((label, index) =>
          index < flow.length - 1
            ? [<span key={label}>{label}</span>, <i key={`${label}-arrow`} aria-hidden="true" />]
            : [<span key={label}>{label}</span>],
        )}
      </div>
    );
  }
  if ((visual === "sq3r" || visual === "faster") && flow) {
    return (
      <div className={`method-visual letter-row ${visual}`} aria-hidden="true">
        {flow.map((item, index) => (
          <span key={`${item}-${index}`}>{item}</span>
        ))}
      </div>
    );
  }
  if (visual === "question") {
    return (
      <div className="method-visual question-vis" aria-hidden="true">
        <span className="q-bubble">是什么？</span>
        <span className="q-arrow">→</span>
        <span className="q-bubble">为什么？</span>
        <span className="q-arrow">→</span>
        <span className="q-bubble">怎么办？</span>
      </div>
    );
  }
  if (visual === "mimic") {
    return (
      <div className="method-visual mimic-vis" aria-hidden="true">
        <span>别人的</span>
        <i />
        <span>提炼精髓</span>
        <span>知识体系</span>
        <i className="back" />
        <span>自己的</span>
      </div>
    );
  }
  if (visual === "teach" && flow) {
    return (
      <div className="method-visual flow-row" aria-hidden="true">
        {flow.flatMap((label, index) =>
          index < flow.length - 1
            ? [<span key={label}>{label}</span>, <i key={`${label}-arrow`} aria-hidden="true" />]
            : [<span key={label}>{label}</span>],
        )}
      </div>
    );
  }
  if (flow && flow.length >= 3) {
    return (
      <div className="method-visual flow-row" aria-hidden="true">
        {flow.flatMap((label, index) =>
          index < flow.length - 1
            ? [<span key={label}>{label}</span>, <i key={`${label}-arrow`} aria-hidden="true" />]
            : [<span key={label}>{label}</span>],
        )}
      </div>
    );
  }
  return (
    <div className="method-visual flow-row" aria-hidden="true">
      <span>选择目标</span>
      <i aria-hidden="true" />
      <span>教授知识</span>
      <i aria-hidden="true" />
      <span>回顾纠错</span>
    </div>
  );
}

/* ── 课堂拾音 1.0：灰色卡片录音设备（真实产品图） ── */
function RecordDeviceIllustration() {
  return <img className="hw-card-photo" src={productRecorder} alt="课堂拾音录音设备" loading="lazy" />;
}

/* ── 随身灵感 2.0：绿色渐变卡片设备（真实产品图） ── */
function FlashIdeaIllustration() {
  return <img className="hw-card-photo" src={productFlash} alt="随身灵感录音设备" loading="lazy" />;
}

/* ── 随写随存 3.0：智能笔（真实产品图） ── */
function SyncPenIllustration() {
  return <img className="hw-card-photo" src={productPen} alt="随写随存智能笔" loading="lazy" />;
}

function ClassroomView({
  beginRecord,
  finishRecord,
  lessonMeta,
  onDiscard,
  onDeletePhoto,
  onPhoto,
  photos,
  recordTimer,
  recordState,
  setLessonMeta,
  setRecordState,
}: {
  beginRecord: () => void;
  finishRecord: () => void;
  lessonMeta: LessonMeta;
  onDiscard: () => void;
  onDeletePhoto: (photoId: string) => void;
  onPhoto: () => void;
  photos: ClassPhoto[];
  recordTimer: string;
  recordState: RecordState;
  setLessonMeta: (value: LessonMeta) => void;
  setRecordState: (value: RecordState) => void;
}) {
  const inlineMetaFields: Array<[keyof LessonMeta, string]> = [
    ["school", "学校"],
    ["classroom", "教室"],
    ["teacher", "授课老师"],
    ["course", "课程名称"],
  ];
  const visiblePhotos = photos.filter((photo) => !legacyPhotoMocks.includes(photo.name));

  return (
    <section className="glass-card recorder-card">
      {recordState !== "idle" && (
        <div className="record-heading">
          <strong>{recordTimer}</strong>
        </div>
      )}

      {recordState === "idle" ? (
        <div className="record-empty">
          <XiaozhiRecordStage />
          <div>
            <h3>开启一节课</h3>
            <p>专心听讲就好，剩下的交给小智 ✨</p>
          </div>
          <button className="record-start-pill" onClick={beginRecord}>
            <span className="rsp-icon">
              <Mic size={16} />
            </span>
            <span className="rsp-wave" aria-hidden="true">
              <i /><i /><i /><i />
            </span>
            <span className="rsp-text">开始录音</span>
          </button>
        </div>
      ) : (
        <>
          <div className="record-meta-inline">
            {inlineMetaFields.map(([key, placeholder]) => (
              <label key={key}>
                <span>{placeholder}</span>
                <input
                  placeholder={placeholder}
                  value={lessonMeta[key]}
                  onChange={(event) => setLessonMeta({ ...lessonMeta, [key]: event.target.value })}
                />
              </label>
            ))}
          </div>

          <div className="photo-strip">
            <button onClick={onPhoto}>
              <ImagePlus size={17} />
              插入照片
            </button>
            {visiblePhotos.map((photo, index) => (
              <div className={`photo-chip tone-${index % 4}`} key={photo.id}>
                <img alt={photo.name} src={photo.url} />
                <span>{`课堂照片 ${index + 1}`}</span>
                <button
                  className="photo-delete"
                  type="button"
                  aria-label={`删除课堂照片 ${index + 1}`}
                  onClick={() => onDeletePhoto(photo.id)}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>

          <div className="live-transcript">
            {transcriptLines.slice(0, 4).map((line) => (
              <article key={`${line.time}-${line.speaker}`}>
                <time>{line.time}</time>
                <strong>{line.speaker}</strong>
                <p>{line.text}</p>
              </article>
            ))}
          </div>

          <div className="wave-line" aria-hidden="true">
            <svg viewBox="0 0 620 86" role="presentation">
              <path className="wave-thread wave-soft" d="M8 45 C 72 22, 132 20, 205 42 S 336 65, 412 38 S 532 22, 612 40" />
              <path className="wave-thread wave-main" d="M10 35 C 82 10, 152 18, 220 31 S 348 50, 430 27 S 548 14, 610 32" />
              <path className="wave-thread wave-low" d="M22 54 C 98 42, 148 60, 218 50 S 346 28, 420 51 S 536 62, 596 48" />
            </svg>
          </div>

          <div className="recorder-actions">
            <button className="text-danger" onClick={onDiscard}>
              <Trash2 size={17} />
              放弃录音
            </button>
            <span className="recorder-timer">{recordTimer}</span>
            {recordState === "recording" || recordState === "paused" ? (
              <>
                <button className="round-action" onClick={() => setRecordState(recordState === "paused" ? "recording" : "paused")}>
                  {recordState === "paused" ? <Play size={19} /> : <Pause size={19} />}
                </button>
                <button className="line-button" onClick={finishRecord}>
                  <Square size={15} />
                  结束录音
                </button>
              </>
            ) : (
              <button className="primary-action" onClick={beginRecord}>
                <Mic size={17} />
                继续录音
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function NotesLibrary({
  noteTab,
  onPublish,
  purchasedNotes,
  recordedFiles,
  setNoteTab,
  beginRecord,
}: {
  noteTab: NoteTab;
  onPublish: () => void;
  purchasedNotes: MarketNote[];
  recordedFiles: ClassroomFile[];
  setNoteTab: (value: NoteTab) => void;
  beginRecord: () => void;
}) {
  const [libTab, setLibTab] = useState<"classroom" | "purchased">("classroom");

  // ── 课堂笔记 ──────────────────────────────────────────────────
  const classroomFiles = [...recordedFiles, ...noteFiles];

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedPeriods, setExpandedPeriods] = useState<Record<ClassroomFile["period"], boolean>>({
    今天: true,
    本周: true,
    更早: false,
  });
  const [summaryReady, setSummaryReady] = useState(false);
  const [exerciseReady, setExerciseReady] = useState(false);
  const [reviewReady, setReviewReady] = useState(false);
  const [generating, setGenerating] = useState<null | "summary" | "exercise" | "review">(null);

  const triggerGenerate = (kind: "summary" | "exercise" | "review") => {
    setGenerating(kind);
    window.setTimeout(() => {
      if (kind === "summary") setSummaryReady(true);
      if (kind === "exercise") setExerciseReady(true);
      if (kind === "review") setReviewReady(true);
      setGenerating(null);
    }, 900);
  };

  const periodOrder: ClassroomFile["period"][] = ["今天", "本周", "更早"];
  const groupedFiles = periodOrder.map((period) => ({
    period,
    files: classroomFiles
      .map((file, index) => ({ file, index }))
      .filter(({ file }) => file.period === period),
  }));

  const contentTabs: Array<[NoteTab, string]> = [
    ["transcript", "转译文本"],
    ["summary", "智能总结"],
    ["exercise", "测试题集"],
    ["review", "复习建议"],
  ];

  // ── 我的笔记（已购） ─────────────────────────────────────────
  const [selectedPurchasedIndex, setSelectedPurchasedIndex] = useState(0);
  const selectedPurchased = purchasedNotes[selectedPurchasedIndex] ?? null;
  const [purchasedTab, setPurchasedTab] = useState<"summary" | "exercise" | "review">("summary");
  const purchasedTabList: Array<["summary" | "exercise" | "review", string]> = [
    ["summary", "笔记重点"],
    ["exercise", "测试题集"],
    ["review", "复习建议"],
  ];

  return (
    <div className="notes-grid">
      <section className="glass-card file-list-card">
        {/* 顶部 Tab 切换 */}
        <div className="notes-lib-tabs">
          <button
            className={libTab === "classroom" ? "active" : ""}
            onClick={() => setLibTab("classroom")}
          >
            课堂笔记
            <span>{classroomFiles.length}</span>
          </button>
          <button
            className={libTab === "purchased" ? "active" : ""}
            onClick={() => setLibTab("purchased")}
          >
            我的笔记
            {purchasedNotes.length > 0 && <span>{purchasedNotes.length}</span>}
          </button>
        </div>

        {libTab === "classroom" ? (
          <div className="file-list">
            {groupedFiles.map(({ period, files }) => (
              <section className="file-period" key={period}>
                <button
                  type="button"
                  className="file-period-head"
                  onClick={() => setExpandedPeriods((current) => ({ ...current, [period]: !current[period] }))}
                >
                  <span>{period}</span>
                  <small>{files.length} 条</small>
                  <ChevronRight className={expandedPeriods[period] ? "is-open" : ""} size={15} />
                </button>
                {expandedPeriods[period] && (
                  <div className="file-period-items">
                    {files.map(({ file, index }) => (
                      <article
                        className={index === selectedIndex ? "selected" : ""}
                        key={`${file.title}-${index}`}
                        onClick={() => setSelectedIndex(index)}
                      >
                        <div className="mini-note">
                          <strong>{file.title}</strong>
                          <div className="mini-note-meta">
                            <small className={`file-status ${statusClassName(file.status)}`}>{file.status}</small>
                            <small className="file-duration">{file.durationText}</small>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className="file-list">
            {purchasedNotes.length === 0 ? (
              <div className="notes-purchased-empty">
                <BookOpen size={32} />
                <p>还没有购买任何笔记</p>
                <small>去知识广场发现优质课堂笔记</small>
              </div>
            ) : (
              purchasedNotes.map((note, index) => (
                <article
                  className={`purchased-note-item ${index === selectedPurchasedIndex ? "selected" : ""}`}
                  key={note.id}
                  onClick={() => setSelectedPurchasedIndex(index)}
                >
                  <div className="mini-note">
                    <strong>{note.title}</strong>
                    <div className="mini-note-meta">
                      <small className="purchased-note-author">{note.author} · {note.school}</small>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        )}
      </section>

      {libTab === "classroom" ? (
        <section className="glass-card note-detail-card">
          <div className="note-detail-head">
            <div>
              <h2>多元函数极值</h2>
              <p>高数第 8 讲 · 34 分 24 秒</p>
            </div>
            <button className="primary-action" onClick={onPublish}>
              <Store size={16} />
              发布到知识广场
            </button>
          </div>
          <div className="audio-player">
            <button>
              <Pause size={16} />
            </button>
            <span>0:30</span>
            <div>
              <i />
            </div>
            <span>34:24</span>
            <button>1x</button>
          </div>
          <div className="note-tabs">
            {contentTabs.map(([key, label]) => (
              <button className={noteTab === key ? "active" : ""} key={key} onClick={() => setNoteTab(key)}>
                {label}
              </button>
            ))}
          </div>
          <div className="note-content-scroll">
            <NoteContent
              tab={noteTab}
              summaryReady={summaryReady}
              exerciseReady={exerciseReady}
              reviewReady={reviewReady}
              generating={generating}
              onGenerate={triggerGenerate}
              onDoExercise={beginRecord}
            />
          </div>
        </section>
      ) : (
        <section className="glass-card note-detail-card">
          {selectedPurchased ? (
            <>
              <div className="note-detail-head">
                <div>
                  <h2>{selectedPurchased.title}</h2>
                  <p>{selectedPurchased.author} · {selectedPurchased.school} · {selectedPurchased.major}</p>
                </div>
              </div>
              <div className="note-tabs">
                {purchasedTabList.map(([key, label]) => (
                  <button
                    key={key}
                    className={purchasedTab === key ? "active" : ""}
                    onClick={() => setPurchasedTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="note-content-scroll">
                {purchasedTab === "summary" && (
                  <div className="purchased-note-intro">
                    <p className="purchased-excerpt">{selectedPurchased.excerpt}</p>
                  </div>
                )}
                <NoteContent
                  tab={purchasedTab}
                  summaryReady={true}
                  exerciseReady={true}
                  reviewReady={true}
                  generating={null}
                  onGenerate={() => {}}
                  hideRegenerate={true}
                  onDoExercise={beginRecord}
                />
              </div>
            </>
          ) : (
            <div className="notes-purchased-empty" style={{ margin: "auto" }}>
              <BookOpen size={32} />
              <p>选择左侧笔记查看内容</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function NoteContent({
  tab,
  summaryReady,
  exerciseReady,
  reviewReady,
  generating,
  onGenerate,
  hideRegenerate = false,
  onDoExercise,
}: {
  tab: NoteTab;
  summaryReady: boolean;
  exerciseReady: boolean;
  reviewReady: boolean;
  generating: null | "summary" | "exercise" | "review";
  onGenerate: (kind: "summary" | "exercise" | "review") => void;
  hideRegenerate?: boolean;
  onDoExercise?: () => void;
}) {
  const [showSheet, setShowSheet] = useState(false);
  if (tab === "transcript") {
    return (
      <div className="speaker-list">
        {transcriptLines.map((line) => (
          <article key={line.time}>
            <time>{line.time}</time>
            <p>{line.text}</p>
          </article>
        ))}
      </div>
    );
  }
  if (tab === "summary") {
    if (!summaryReady) {
      return (
        <GenerateEmpty
          kind="summary"
          title="还没有智能总结"
          desc="让小智读完整段课堂内容，给你一份结构化的复习要点。"
          buttonLabel="生成智能总结"
          loadingLabel="小智正在阅读课堂内容…"
          generating={generating === "summary"}
          onGenerate={() => onGenerate("summary")}
        />
      );
    }
    return (
      <div className="generated-wrap">
        {!hideRegenerate && (
          <div className="regenerate-bar">
            <span>已由小智整理 · 刚刚</span>
            <button type="button" onClick={() => onGenerate("summary")}>
              <RefreshCw size={13} /> 重新生成
            </button>
          </div>
        )}
        <SummaryNote />
      </div>
    );
  }
  if (tab === "exercise") {
    if (!exerciseReady) {
      return (
        <GenerateEmpty
          kind="exercise"
          title="还没有测试题集"
          desc="基于课堂内容自动生成 5–10 道随堂练习，做完即时校对。"
          buttonLabel="生成测试题集"
          loadingLabel="小智正在出题…"
          generating={generating === "exercise"}
          onGenerate={() => onGenerate("exercise")}
        />
      );
    }
    return (
      <div className="generated-wrap">
        {!hideRegenerate && (
          <div className="regenerate-bar">
            <span>共 6 道题 · 难度自适应</span>
            <button type="button" onClick={() => onGenerate("exercise")}>
              <RefreshCw size={13} /> 换一批
            </button>
          </div>
        )}
        <ExerciseBoard />
        <div className="do-exercise-cta">
          <button type="button" className="do-exercise-btn" onClick={() => setShowSheet(true)}>
            <Notebook size={17} />
            立即做题
            <span className="do-exercise-badge">随写随存 3.0</span>
          </button>
          <p className="do-exercise-hint">连接 3.0 智能笔，书写过程实时同步入库</p>
        </div>
        {showSheet && (
          <ExerciseAnswerSheet
            onClose={() => setShowSheet(false)}
            onConnect={onDoExercise}
          />
        )}
      </div>
    );
  }
  // review tab
  if (!reviewReady) {
    return (
      <GenerateEmpty
        kind="review"
        title="还没有复习建议"
        desc="结合本节重点和你过去的笔记，规划一份分天的复习方案。"
        buttonLabel="生成复习建议"
        loadingLabel="小智正在制定复习计划…"
        generating={generating === "review"}
        onGenerate={() => onGenerate("review")}
      />
    );
  }
  return (
    <div className="generated-wrap">
      {!hideRegenerate && (
        <div className="regenerate-bar">
          <span>3 天循序复习计划 · 个性化</span>
          <button type="button" onClick={() => onGenerate("review")}>
            <RefreshCw size={13} /> 重新生成
          </button>
        </div>
      )}
      <ReviewBoard />
    </div>
  );
}

function GenerateEmpty({
  kind,
  title,
  desc,
  buttonLabel,
  loadingLabel,
  generating,
  onGenerate,
}: {
  kind: "summary" | "exercise" | "review";
  title: string;
  desc: string;
  buttonLabel: string;
  loadingLabel: string;
  generating: boolean;
  onGenerate: () => void;
}) {
  const icon =
    kind === "summary" ? <Wand2 size={26} /> :
    kind === "exercise" ? <ClipboardList size={26} /> :
    <CalendarCheck size={26} />;

  return (
    <div className="note-empty">
      <div className="note-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{desc}</p>
      <button
        type="button"
        className="primary-action note-empty-action"
        onClick={onGenerate}
        disabled={generating}
      >
        {generating ? (
          <>
            <Loader2 size={16} className="spin" /> {loadingLabel}
          </>
        ) : (
          <>
            <Sparkles size={16} /> {buttonLabel}
          </>
        )}
      </button>
    </div>
  );
}

function ExerciseBoard() {
  const items = [
    {
      level: "基础",
      tone: "low",
      q: "对于函数 f(x,y)=x²+xy+y²−3x，求所有驻点。",
      hint: "先求一阶偏导，令其同时为 0。",
    },
    {
      level: "中等",
      tone: "mid",
      q: "用 Hessian 判别法判断 f(x,y)=x³−3xy²+y² 在驻点 (0,0) 是否取得极值。",
      hint: "注意当判别式为 0 时 Hessian 失效。",
    },
    {
      level: "拔高",
      tone: "high",
      q: "在约束 x²+y²=1 下求 f(x,y)=xy 的极值。",
      hint: "可以使用拉格朗日乘子法或代入约束。",
    },
  ];
  return (
    <div className="exam-board">
      {items.map((it, i) => (
        <article className={`exam-card ${it.tone}`} key={i}>
          <header>
            <span className="exam-tag">{`Q${i + 1} · ${it.level}`}</span>
            <strong>{it.q}</strong>
          </header>
          <p>💡 {it.hint}</p>
        </article>
      ))}
    </div>
  );
}

const EXERCISE_QUESTIONS = [
  { level: "基础", tone: "low",  no: 1, q: "对于函数 f(x,y)=x²+xy+y²−3x，求所有驻点。",                                           hint: "先求一阶偏导，令其同时为 0。" },
  { level: "基础", tone: "low",  no: 2, q: "设 f(x,y)=2x²−xy+y²+3，求函数在点 (1,1) 处的偏导数 f_x 和 f_y。",                   hint: "对 x 偏导时将 y 视为常数，反之亦然。" },
  { level: "中等", tone: "mid",  no: 3, q: "用 Hessian 判别法判断 f(x,y)=x³−3xy²+y² 在驻点 (0,0) 是否取得极值。",              hint: "注意当判别式 Δ=0 时，Hessian 法失效，需进一步分析。" },
  { level: "中等", tone: "mid",  no: 4, q: "求函数 f(x,y)=x²+y²−2x−4y+8 的极值，并说明其类型（极大还是极小）。",              hint: "令偏导数为 0，解方程组，再用 Hessian 判断极值类型。" },
  { level: "拔高", tone: "high", no: 5, q: "在约束 x²+y²=1 下，求 f(x,y)=xy 的最大值与最小值，写出完整求解步骤。",            hint: "可使用拉格朗日乘子法，或将约束代入后转化为单变量问题。" },
];

function ExerciseAnswerSheet({ onClose, onConnect }: { onClose: () => void; onConnect?: () => void }) {
  const [localToast, setLocalToast] = useState(false);

  const handleConnect = () => {
    setLocalToast(true);
    window.setTimeout(() => setLocalToast(false), 2000);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div className="ea-backdrop" onClick={onClose}>
      <div className="ea-sheet" onClick={e => e.stopPropagation()}>
        {/* 顶栏 */}
        <div className="ea-header">
          <div>
            <h2 className="ea-title">答题卷</h2>
            <p className="ea-meta">共 {EXERCISE_QUESTIONS.length} 道题 · 多元函数极值</p>
          </div>
          <button type="button" className="ea-close" onClick={onClose}>✕</button>
        </div>

        {/* 题目列表 */}
        <div className="ea-body">
          {EXERCISE_QUESTIONS.map((q) => (
            <div className="ea-question" key={q.no}>
              <div className="ea-q-header">
                <span className={`ea-q-tag tone-${q.tone}`}>{`Q${q.no} · ${q.level}`}</span>
                <p className="ea-q-text">{q.q}</p>
              </div>
              <p className="ea-q-hint">💡 {q.hint}</p>
              {/* 答题区 */}
              <div className="ea-answer-zone">
                <span className="ea-answer-label">作答区</span>
                <div className="ea-answer-lines">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div className="ea-line" key={i} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 底部 CTA */}
        <div className="ea-footer">
          <div className="ea-footer-inner">
            <div className="ea-footer-copy">
              <p className="ea-footer-title">随写随存 智能笔 3.0</p>
              <p className="ea-footer-desc">连接后，纸上书写的答案将实时同步到此界面</p>
            </div>
            <button
              type="button"
              className="ea-connect-btn"
              onClick={handleConnect}
            >
              <Notebook size={16} />
              链接智能笔，开启智能答题
            </button>
          </div>
          {localToast && (
            <div className="ea-local-toast">敬请期待 ✨</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ReviewBoard() {
  const days = [
    { day: "今晚", title: "整理思路", desc: "回顾本节判别路径，把无约束/有约束的入口图画在笔记本第一页。", tone: "high" },
    { day: "明天", title: "刷一组题", desc: "做小智推荐的测试题集（共 6 题），重点搞清楚 Hessian 判别失效的情况。", tone: "mid" },
    { day: "第 3 天", title: "讲给同桌听", desc: "用费曼学习法把驻点 → 候选点 → 极值的判断逻辑讲给同桌听一遍。", tone: "low" },
  ];
  return (
    <div className="exam-board">
      {days.map((d, i) => (
        <article className={`exam-card ${d.tone}`} key={i}>
          <header>
            <span className="exam-tag">{d.day}</span>
            <strong>{d.title}</strong>
          </header>
          <p>{d.desc}</p>
        </article>
      ))}
    </div>
  );
}

function SummaryNote() {
  return (
    <div className="summary-board">
      <section className="summary-hero">
        <div>
          <span>AI 结构化笔记</span>
          <h3>多元函数极值：先判断约束，再选择工具</h3>
          <p>本节课围绕“无约束极值”和“约束极值”的分流判断展开，复习时优先记住判断路径，而不是死背公式。</p>
        </div>
        <div className="formula-card">
          <strong>判别路径</strong>
          <span>无约束 → ∂f/∂x = 0, ∂f/∂y = 0</span>
          <span>有约束 → L = f(x,y) + λg(x,y)</span>
        </div>
      </section>

      <section className="chalk-sketch">
        <div className="axis-card">
          <span className="axis-dot peak" />
          <span className="axis-dot saddle" />
          <span className="axis-curve" />
        </div>
        <div>
          <h4>板书图解</h4>
          <p>驻点只是候选点，必须继续判断局部形态：极大、极小、鞍点或无法用二阶法判断。</p>
          <div className="summary-tags">
            <span>驻点</span>
            <span>Hessian</span>
            <span>拉格朗日</span>
          </div>
        </div>
      </section>

      <section className="cornell-note">
        <div>
          <h4>线索</h4>
          <p>看到题目先找“约束条件”关键词。</p>
          <p>判别式为 0 不要强行下结论。</p>
        </div>
        <div>
          <h4>课堂笔记</h4>
          <ul>
            <li>无约束：求一阶偏导，解驻点，再用 Hessian 判别。</li>
            <li>有约束：构造拉格朗日函数，联立原约束方程求候选点。</li>
            <li>所有候选点都要回代验证函数值和约束条件。</li>
          </ul>
        </div>
      </section>

      <section className="review-grid">
        <article>
          <strong>易错点</strong>
          <p>把“驻点”直接写成“极值点”；忘记检查约束条件是否满足。</p>
        </article>
        <article>
          <strong>课后任务</strong>
          <p>完成教材 P126 例 3、例 5；整理 Hessian 判别式三种结论。</p>
        </article>
      </section>
    </div>
  );
}

function MarketView({
  filteredMarket,
  marketMajor,
  marketQuery,
  marketSchool,
  purchasedIds,
  onPurchase,
  onOpenPurchased,
  setMarketMajor,
  setMarketQuery,
  setMarketSchool,
}: {
  filteredMarket: MarketNote[];
  marketMajor: string;
  marketQuery: string;
  marketSchool: string;
  purchasedIds: string[];
  onPurchase: (note: MarketNote) => void;
  onOpenPurchased: () => void;
  setMarketMajor: (value: string) => void;
  setMarketQuery: (value: string) => void;
  setMarketSchool: (value: string) => void;
}) {
  return (
    <div className="market-grid single">
      <section className="glass-card market-list-card">
        <div className="filter-row">
          <label className="market-search">
            <Search size={16} />
            <input
              placeholder="搜索课程、学校、专业或作者"
              value={marketQuery}
              onChange={(event) => setMarketQuery(event.target.value)}
            />
          </label>
          <select value={marketSchool} onChange={(event) => setMarketSchool(event.target.value)}>
            {["全部学校", "北京某大学", "上海某高校"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select value={marketMajor} onChange={(event) => setMarketMajor(event.target.value)}>
            {["全部专业", "计算机科学", "临床医学", "经济管理"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        {filteredMarket.length === 0 ? (
          <div className="market-empty">
            <Search size={32} />
            <h3>没有找到匹配的笔记</h3>
            <p>换个关键词或者清空筛选试试。</p>
          </div>
        ) : (
          <div className="market-list">
            {filteredMarket.map((note) => {
              const purchased = purchasedIds.includes(note.id);
              return (
                <article key={note.id} className={purchased ? "is-purchased" : ""}>
                  <div className="market-card-top">
                    <span className="market-card-meta">
                      {note.school} · {note.major}
                    </span>
                    <h3>{note.title}</h3>
                    <p>{note.excerpt}</p>
                  </div>
                  <div className="market-card-tags">
                    {note.tags.slice(0, 3).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <div className="market-card-foot">
                    <small>{note.author}</small>
                    <strong>{note.price} 积分</strong>
                  </div>
                  {purchased ? (
                    <button className="line-button" onClick={onOpenPurchased}>
                      <Check size={15} /> 已购买
                    </button>
                  ) : (
                    <button className="primary-action" onClick={() => onPurchase(note)}>
                      立即购买
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

const ledgerEntries = [
  ["开通会员奖励", "+6000", "2026-05-18 10:15:53"],
  ["平台赠送", "+30000", "2026-04-03 00:18:12"],
  ["购买医学统计学考前重点包", "-520", "2026-05-26 14:52:09"],
  ["注册奖励", "+1000", "2026-04-02 11:35:34"],
] as const;

function CreditsPanel({
  credits,
  onClose,
  onRecharge,
}: {
  credits: number;
  onClose: () => void;
  onRecharge: () => void;
}) {
  const [ledgerTab, setLedgerTab] = useState<"all" | "in" | "out">("all");

  const filteredLedger = ledgerEntries.filter(([, amount]) => {
    if (ledgerTab === "in") return amount.startsWith("+");
    if (ledgerTab === "out") return amount.startsWith("-");
    return true;
  });

  return (
    <div className="credits-popover-backdrop" onClick={onClose} role="presentation">
      <section
        className="credits-popover"
        role="dialog"
        aria-label="积分明细"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="modal-close credits-popover-close" onClick={onClose} aria-label="关闭">
          <X size={16} />
        </button>
        <header className="credits-popover-head">
          <div>
            <p>可用积分</p>
            <strong>{credits}</strong>
          </div>
          <button type="button" className="line-button credits-recharge-btn" onClick={onRecharge}>
            <CircleDollarSign size={15} />
            充值
          </button>
        </header>
        <div className="credits-popover-breakdown">
          <div className="points-row total">
            <span>积分合计</span>
            <strong>{credits + 36980}</strong>
          </div>
          <div className="points-row">
            <span>会员积分</span>
            <strong>6000</strong>
          </div>
          <div className="points-row">
            <span>任务积分</span>
            <strong>1400</strong>
          </div>
          <div className="points-row">
            <span>充值积分</span>
            <strong>{Math.max(credits - 420, 0)}</strong>
          </div>
          <div className="points-row">
            <span>赠送积分</span>
            <strong>30000</strong>
          </div>
          <div className="expire-line">本月将过期积分 0</div>
        </div>
        <div className="credits-popover-ledger">
          <div className="credits-ledger-head">
            <h3>收支明细</h3>
            <div className="wallet-tabs">
              <button
                type="button"
                className={ledgerTab === "all" ? "active" : ""}
                onClick={() => setLedgerTab("all")}
              >
                全部
              </button>
              <button
                type="button"
                className={ledgerTab === "in" ? "active" : ""}
                onClick={() => setLedgerTab("in")}
              >
                获取
              </button>
              <button
                type="button"
                className={ledgerTab === "out" ? "active" : ""}
                onClick={() => setLedgerTab("out")}
              >
                支出
              </button>
            </div>
          </div>
          <div className="credits-ledger-list">
            {filteredLedger.length ? (
              filteredLedger.map(([name, amount, date]) => (
                <div className="ledger-line" key={name}>
                  <span title={name}>{name}</span>
                  <strong className={amount.startsWith("+") ? "plus" : "minus"}>{amount}</strong>
                  <time>{date}</time>
                </div>
              ))
            ) : (
              <p className="credits-ledger-empty">暂无记录</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function AgentPanel({ recordState }: { recordState: RecordState; setNoteTab: (tab: NoteTab) => void; setView: (view: View) => void }) {
  const subtitle =
    recordState === "recording"
      ? "正在为你记录课堂内容"
      : recordState === "metadata"
      ? "等待你补全课堂信息"
      : recordState === "generating"
      ? "AI 笔记生成中"
      : "你的 AI 学习搭子，随时陪你聊";

  const quickAsks = [
    "今天讲了什么？",
    "帮我出 5 道复习题",
    "把这一节讲给我听",
  ];

  return (
    <aside className="xiaozhi-panel">
      <section className="agent-chat-card">
        <div className="agent-chat-head">
          <div>
            <strong>小智</strong>
            <span>{subtitle}</span>
          </div>
          <div className="agent-avatar" aria-hidden="true">
            <XiaozhiMiniAvatar />
          </div>
        </div>

        {/* 默认初始化状态 · 开场白 + 引导 chip */}
        <div className="agent-welcome">
          <div className="agent-welcome-bubble">
            <p className="aw-hello">Hi，我是小智 👋</p>
            <p>
              你的 AI 学习搭子。上完课、做完题，把整理的事情交给我，
              你可以随时来这里追问任何一句没听懂的话。
            </p>
          </div>
          <div className="agent-welcome-tips">
            <span className="aw-tip-label">不知道问啥？试试：</span>
            {quickAsks.map((q) => (
              <button key={q} type="button" className="aw-chip">
                {q}
              </button>
            ))}
          </div>
        </div>

        <div className="agent-input">
          <input placeholder="问小智任何一句听不懂的话…" />
          <button aria-label="发送">
            <Send size={16} />
          </button>
        </div>
      </section>
    </aside>
  );
}

function MetadataModal({
  lessonMeta,
  onClose,
  onSubmit,
  setLessonMeta,
}: {
  lessonMeta: LessonMeta;
  onClose: () => void;
  onSubmit: () => void;
  setLessonMeta: (value: LessonMeta) => void;
}) {
  const metaFields: Array<[keyof LessonMeta, string, string]> = [
    ["course", "课程", "如：高等数学"],
    ["teacher", "老师", "如：张老师"],
    ["school", "学校", "如：北京某大学"],
    ["classroom", "教室", "如：A203"],
  ];

  return (
    <div className="modal-backdrop">
      <section className="compact-modal wide">
        <button className="modal-close" onClick={onClose} aria-label="跳过课堂信息"><X size={16} /></button>
        <h2>课堂信息确认</h2>
        <p>是否已录入学校、教室、老师和课程？这些信息不是必填，跳过后也会继续生成笔记。</p>
        <div className="meta-form compact">
          {metaFields.map(([key, label, placeholder]) => (
            <label key={key}>
              <span>{label}</span>
              <input placeholder={placeholder} value={lessonMeta[key]} onChange={(event) => setLessonMeta({ ...lessonMeta, [key]: event.target.value })} />
            </label>
          ))}
        </div>
        <div className="meta-actions">
          <button className="secondary-action" onClick={onClose}>跳过，直接生成</button>
          <button className="primary-action" onClick={onSubmit}>保存并生成笔记</button>
        </div>
      </section>
    </div>
  );
}

function LoginModal({
  code,
  isCodeStep,
  onClose,
  onSubmit,
  phone,
  setCode,
  setPhone,
}: {
  code: string;
  isCodeStep: boolean;
  onClose: () => void;
  onSubmit: () => void;
  phone: string;
  setCode: (value: string) => void;
  setPhone: (value: string) => void;
}) {
  const [tab, setTab] = useState<"phone" | "email">("phone");
  const [agreed, setAgreed] = useState(true);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (!isCodeStep) { setCountdown(60); return; }
  }, [isCodeStep]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  return (
    <div className="modal-backdrop">
      <section className="login-card">
        <button className="modal-close" onClick={onClose}>
          <X size={16} />
        </button>

        {/* 左侧 · 学生版 hero */}
        <aside className="login-hero">
          <header className="login-hero-brand">
            <span className="login-brand-mark">百</span>
            <strong>百智</strong>
            <span className="login-brand-pill">学生版</span>
          </header>
          <h2>
            欢迎来到<br />
            <em>百智 · 学生版</em>
          </h2>
          <p>能听 · 能记 · 能写，专为同学打造的 AI 学习工作台</p>
          <div className="login-hero-decor" aria-hidden="true">
            <span className="ld-orb" />
            <span className="ld-ring" />
            <span className="ld-mic">
              <Mic size={22} />
            </span>
            <span className="ld-bars">
              <i /><i /><i /><i /><i />
            </span>
          </div>
        </aside>

        {/* 右侧 · 登录表单 */}
        <div className="login-form-side">
          <h3>欢迎登录</h3>
          <p className="login-sub">新用户将自动注册并赠送 200 积分 🎁</p>

          <div className="login-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "phone"}
              className={tab === "phone" ? "active" : ""}
              onClick={() => setTab("phone")}
            >
              手机号登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "email"}
              className={tab === "email" ? "active" : ""}
              onClick={() => setTab("email")}
            >
              邮箱登录
            </button>
          </div>

          <div className="login-field">
            <input
              placeholder={tab === "phone" ? "请输入手机号" : "请输入邮箱"}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          {isCodeStep && (
            <>
              <div className="login-code-hint">
                Mock 验证码：<strong>000000</strong>
              </div>
              <div className="login-field with-action">
                <input
                  placeholder="请输入验证码"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  maxLength={6}
                />
                <button
                  type="button"
                  className="field-action"
                  disabled={countdown > 0}
                  onClick={() => setCountdown(60)}
                >
                  {countdown > 0 ? `${countdown}s 后重发` : "重新发送"}
                </button>
              </div>
            </>
          )}

          <label className="login-agreement">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
            />
            <span>
              我已阅读并同意 <a href="#">《用户服务协议》</a> 和 <a href="#">《隐私政策》</a>
            </span>
          </label>

          <button className="login-submit" onClick={onSubmit} disabled={!agreed}>
            {isCodeStep ? "登 录" : "获取验证码"}
          </button>
        </div>
      </section>
    </div>
  );
}

function PermissionModal({ onAuthorize, onClose, permission }: { onAuthorize: () => void; onClose: () => void; permission: PermissionState }) {
  return (
    <div className="modal-backdrop">
      <section className="compact-modal wide">
        <button className="modal-close" onClick={onClose}>
          <X size={16} />
        </button>
        <ShieldCheck className="modal-symbol" size={42} />
        <h2>录音权限</h2>
        <p>需要使用你的麦克风录音。音频只会用来生成你的个人笔记，不会上传到任何外部位置。</p>
        <div className="permission-row">
          <span><Mic size={18} /> 麦克风</span>
          <span><AudioLines size={18} /> 系统声音</span>
        </div>
        <button className="primary-action full" onClick={onAuthorize}>{permission === "requesting" ? "授权中…" : "允许并开始录音"}</button>
      </section>
    </div>
  );
}

function CertificationModal({ student, setStudent, onClose, onSubmit }: { student: StudentProfile; setStudent: (value: StudentProfile) => void; onClose: () => void; onSubmit: () => void }) {
  const [photoName, setPhotoName] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const photoUrlRef = useRef<string | null>(null);

  const clearPhoto = () => {
    if (photoUrlRef.current) {
      URL.revokeObjectURL(photoUrlRef.current);
      photoUrlRef.current = null;
    }
    setPhotoName("");
    setPhotoPreview(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const pickPhoto = () => {
    photoInputRef.current?.click();
  };

  const handlePhotoChange = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    clearPhoto();
    const url = URL.createObjectURL(file);
    photoUrlRef.current = url;
    setPhotoName(file.name);
    setPhotoPreview(url);
  };

  useEffect(() => {
    return () => {
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    };
  }, []);

  const submit = () => {
    setSubmitting(true);
    window.setTimeout(() => {
      setSubmitting(false);
      onSubmit();
    }, 650);
  };

  return (
    <div className="modal-backdrop">
      <section className="compact-modal wide">
        <button className="modal-close" onClick={onClose}><X size={16} /></button>
        <h2>学生身份认证</h2>
        <p>认证后可以在校园知识广场发布笔记。信息只用于同学间互信。</p>
        <input placeholder="学校" value={student.school} onChange={(event) => setStudent({ ...student, school: event.target.value })} />
        <input placeholder="专业" value={student.major} onChange={(event) => setStudent({ ...student, major: event.target.value })} />
        <input placeholder="班级" value={student.className} onChange={(event) => setStudent({ ...student, className: event.target.value })} />
        <input
          ref={photoInputRef}
          hidden
          type="file"
          accept="image/*"
          onChange={(event) => {
            handlePhotoChange(event.target.files);
            event.target.value = "";
          }}
        />
        <button
          className={`student-card-upload ${photoName ? "is-uploaded" : ""}`}
          onClick={pickPhoto}
          type="button"
        >
          {photoPreview ? (
            <img className="student-card-thumb" src={photoPreview} alt="学生证预览" />
          ) : photoName ? (
            <Check size={17} />
          ) : (
            <Upload size={17} />
          )}
          <span>
            <strong>{photoName ? "学生证照片已选择" : "上传学生证照片"}</strong>
            <small>{photoName || "点击从相册选择照片"}</small>
          </span>
        </button>
        {photoName && (
          <button className="line-button full" type="button" onClick={pickPhoto}>
            重新选择
          </button>
        )}
        <button className="primary-action full" onClick={submit} disabled={submitting}>
          {submitting ? "认证中…" : "提交认证"}
        </button>
      </section>
    </div>
  );
}

function PurchaseModal({
  credits,
  note,
  onClose,
  onConfirm,
  onRecharge,
  onGoToNotes,
  status,
}: {
  credits: number;
  note: (typeof marketplaceNotes)[number];
  onClose: () => void;
  onConfirm: () => void;
  onRecharge: () => void;
  onGoToNotes: () => void;
  status: "idle" | "success" | "insufficient";
}) {
  if (status === "success") {
    return (
      <div className="modal-backdrop">
        <section className="compact-modal">
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
          <div className="success-symbol"><Check size={26} /></div>
          <h2>购买成功</h2>
          <p>「{note.title}」已加入你的笔记库。</p>
          <button className="primary-action full" onClick={onGoToNotes}>去笔记里查看</button>
          <button className="line-button full" onClick={onClose}>继续逛广场</button>
        </section>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <section className="compact-modal">
        <button className="modal-close" onClick={onClose}><X size={16} /></button>
        <h2>购买这份笔记</h2>
        <p>{note.title}</p>
        <div className="purchase-box">
          <span>当前余额 {credits} 积分</span>
          <strong>{note.price} 积分</strong>
        </div>
        {status === "insufficient" && <div className="inline-error"><AlertCircle size={15} /> 余额不足，先充点积分吧</div>}
        <button className="primary-action full" onClick={onConfirm}>确认购买</button>
        <button className="line-button full" onClick={onRecharge}>充值 200 积分（演示）</button>
      </section>
    </div>
  );
}

function ConfirmModal({ body, confirmText, onCancel, onConfirm, title }: { body: string; confirmText: string; onCancel: () => void; onConfirm: () => void; title: string }) {
  return (
    <div className="modal-backdrop">
      <section className="compact-modal">
        <h2>{title}</h2>
        <p>{body}</p>
        <button className="line-button full" onClick={onCancel}>取消</button>
        <button className="primary-action full" onClick={onConfirm}>{confirmText}</button>
      </section>
    </div>
  );
}

function PublishModal({
  lessonMeta,
  onClose,
  onConfirm,
}: {
  lessonMeta: LessonMeta;
  onClose: () => void;
  onConfirm: (payload: { meta: LessonMeta; price: number }) => void;
}) {
  const [price, setPrice] = useState(30);
  const [draftMeta, setDraftMeta] = useState<LessonMeta>({
    school: lessonMeta.school || "北京某大学",
    classroom: lessonMeta.classroom || "A203",
    teacher: lessonMeta.teacher || "授课老师",
    course: lessonMeta.course || "多元函数极值",
  });
  const [scope, setScope] = useState<"public" | "school">("school");
  const [allowPreview, setAllowPreview] = useState(true);
  const assetTypeOptions = ["音频文件", "转译文本", "智能总结", "测试题集", "复习建议"] as const;
  type AssetType = typeof assetTypeOptions[number];
  const [assetTypes, setAssetTypes] = useState<AssetType[]>(["转译文本", "智能总结", "测试题集"]);

  const toggleAssetType = (type: AssetType) => {
    setAssetTypes((prev) => prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]);
  };

  const presets = [10, 20, 30, 50];
  const metaFields: Array<[keyof LessonMeta, string]> = [
    ["school", "学校"],
    ["classroom", "教室"],
    ["teacher", "授课老师"],
    ["course", "课程名称"],
  ];

  return (
    <div className="modal-backdrop">
      <section className="compact-modal wide">
        <button className="modal-close" onClick={onClose}><X size={16} /></button>
        <h2>发布到知识广场</h2>
        <p>确认笔记信息和积分价值后，会生成一张学习卡片放入知识广场。</p>

        <div className="publish-section">
          <label className="publish-section-title">课堂属性</label>
          <div className="publish-meta-grid">
            {metaFields.map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  value={draftMeta[key]}
                  onChange={(event) => setDraftMeta({ ...draftMeta, [key]: event.target.value })}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="publish-section">
          <label className="publish-section-title">设置积分价格</label>
          <div className="preset-grid four">
            {presets.map((value) => (
              <button
                key={value}
                className={price === value ? "active" : ""}
                onClick={() => setPrice(value)}
              >
                <strong>{value}</strong>
                <span>积分</span>
              </button>
            ))}
          </div>
          <input
            type="number"
            value={price}
            min={1}
            max={999}
            onChange={(event) => setPrice(Number(event.target.value) || 0)}
            placeholder="自定义价格"
          />
        </div>

        <div className="publish-section">
          <label className="publish-section-title">可见范围</label>
          <div className="segmented">
            <button className={scope === "school" ? "active" : ""} onClick={() => setScope("school")}>
              本校同学
            </button>
            <button className={scope === "public" ? "active" : ""} onClick={() => setScope("public")}>
              全平台公开
            </button>
          </div>
        </div>

        <div className="publish-section">
          <label className="publish-section-title">发布内容</label>
          <div className="publish-asset-grid">
            {assetTypeOptions.map((type) => (
              <label key={type} className={`publish-asset-item ${assetTypes.includes(type) ? "active" : ""}`}>
                <input
                  type="checkbox"
                  checked={assetTypes.includes(type)}
                  onChange={() => toggleAssetType(type)}
                />
                <span>{type}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="publish-toggle">
          <input type="checkbox" checked={allowPreview} onChange={(event) => setAllowPreview(event.target.checked)} />
          <div>
            <strong>允许免费试读前 3 段</strong>
            <span>同学可以预览部分内容再决定是否购买</span>
          </div>
        </label>

        <button className="primary-action full" disabled={price < 1 || assetTypes.length === 0} onClick={() => onConfirm({ meta: draftMeta, price })}>
          确认发布
        </button>
      </section>
    </div>
  );
}

function RechargeModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (amount: number) => void }) {
  const [selected, setSelected] = useState(500);
  const packages: Array<{ amount: number; bonus: number; price: string }> = [
    { amount: 100, bonus: 0, price: "¥ 10" },
    { amount: 500, bonus: 50, price: "¥ 50" },
    { amount: 1000, bonus: 150, price: "¥ 100" },
    { amount: 3000, bonus: 600, price: "¥ 300" },
  ];

  return (
    <div className="modal-backdrop">
      <section className="compact-modal wide">
        <button className="modal-close" onClick={onClose}><X size={16} /></button>
        <h2>积分充值</h2>
        <p>选择充值套餐，购买广场笔记或解锁会员特权。</p>

        <div className="recharge-grid">
          {packages.map((pkg) => (
            <button
              key={pkg.amount}
              className={`recharge-pkg ${selected === pkg.amount ? "active" : ""}`}
              onClick={() => setSelected(pkg.amount)}
            >
              <strong>
                {pkg.amount}
                {pkg.bonus > 0 && <em>+{pkg.bonus}</em>}
              </strong>
              <span>{pkg.price}</span>
            </button>
          ))}
        </div>

        <button className="primary-action full" onClick={() => {
          const pkg = packages.find((p) => p.amount === selected);
          onConfirm((pkg?.amount ?? 0) + (pkg?.bonus ?? 0));
        }}>
          确认支付（演示）
        </button>
      </section>
    </div>
  );
}

function FloatingToast({ children }: { children: React.ReactNode }) {
  return <div className="floating-toast">{children}</div>;
}

export default App;
