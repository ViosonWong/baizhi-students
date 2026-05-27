import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AudioLines,
  BadgeCheck,
  BookOpenCheck,
  BrainCircuit,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileAudio,
  FileText,
  GraduationCap,
  ImagePlus,
  LibraryBig,
  ListChecks,
  LockKeyhole,
  Map,
  Mic,
  Pause,
  Play,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Store,
  Trash2,
  Upload,
  WalletCards,
  Wand2,
  X,
} from "lucide-react";

type View = "home" | "classroom" | "notes" | "market" | "wallet";
type RecordState = "idle" | "recording" | "paused" | "metadata" | "generating" | "done";
type PermissionState = "not_requested" | "requesting" | "granted";
type NoteTab = "transcript" | "summary" | "exam";
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

type StudentProfile = {
  school: string;
  major: string;
  className: string;
  verified: boolean;
};

const noteFiles = [
  {
    title: "高数第 8 讲：多元函数极值",
    type: "录音文件",
    folder: "2026 春季学期 / 高等数学",
    duration: "34:24",
    status: "AI 总结中",
    price: 30,
  },
  {
    title: "数据结构：图的遍历",
    type: "录音文件",
    folder: "计算机科学 / 数据结构",
    duration: "42:08",
    status: "上传至云端",
    price: 18,
  },
  {
    title: "宏观经济学：通胀与就业",
    type: "录音文件",
    folder: "经济管理 / 宏观经济学",
    duration: "28:16",
    status: "转码中",
    price: 24,
  },
  {
    title: "英语听力：学术讲座精听",
    type: "录音文件",
    folder: "外语学院 / 英语听力",
    duration: "12:09",
    status: "暂停中",
    price: 12,
  },
  {
    title: "线性代数：矩阵特征值",
    type: "录音文件",
    folder: "2026 春季学期 / 线性代数",
    duration: "08:42",
    status: "录音中",
    price: 16,
  },
  {
    title: "计算机网络：TCP 拥塞控制",
    type: "转译文本",
    folder: "计算机科学 / 计算机网络",
    duration: "39:20",
    status: "已入库",
    price: 20,
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

const legacyPhotoMocks = ["板书", "课件", "例题"];

function statusClassName(status: string) {
  if (status === "录音中") return "is-recording";
  if (status === "暂停中") return "is-paused";
  if (status === "转码中") return "is-transcoding";
  if (status === "上传至云端") return "is-uploading";
  if (status === "AI 总结中") return "is-summarizing";
  return "is-ready";
}

const marketplaceNotes = [
  {
    id: "m1",
    title: "高数第 8 讲：多元函数极值",
    school: "北京某大学",
    major: "计算机科学",
    author: "林同学",
    price: 30,
    score: "4.9",
    sold: 126,
  },
  {
    id: "m2",
    title: "医学统计学考前重点包",
    school: "北京某大学",
    major: "临床医学",
    author: "周同学",
    price: 520,
    score: "4.8",
    sold: 42,
  },
  {
    id: "m3",
    title: "宏观经济学期中复习清单",
    school: "上海某高校",
    major: "经济管理",
    author: "沈同学",
    price: 24,
    score: "4.7",
    sold: 67,
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
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
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
  const [metaTouched, setMetaTouched] = useState(false);
  const [photos, setPhotos] = useState<ClassPhoto[]>([]);
  const [noteTab, setNoteTab] = useState<NoteTab>("transcript");
  const [showCertify, setShowCertify] = useState(false);
  const [marketSchool, setMarketSchool] = useState("全部学校");
  const [marketMajor, setMarketMajor] = useState("全部专业");
  const [marketQuery, setMarketQuery] = useState("");
  const [credits, setCredits] = useState(420);
  const [purchaseTarget, setPurchaseTarget] = useState<(typeof marketplaceNotes)[number] | null>(null);
  const [purchaseStatus, setPurchaseStatus] = useState<"idle" | "success" | "insufficient">("idle");
  const [toast, setToast] = useState("");
  const [recordSeconds, setRecordSeconds] = useState(0);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const photosRef = useRef<ClassPhoto[]>([]);

  const isMetaValid = Object.values(lessonMeta).every(Boolean);
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

  const filteredMarket = marketplaceNotes.filter((item) => {
    const schoolOk = marketSchool === "全部学校" || item.school === marketSchool;
    const majorOk = marketMajor === "全部专业" || item.major === marketMajor;
    const queryOk = !marketQuery || `${item.title}${item.school}${item.major}${item.author}`.toLowerCase().includes(marketQuery.toLowerCase());
    return schoolOk && majorOk && queryOk;
  });

  const beginRecord = () => {
    if (!isLoggedIn) {
      setShowLogin(true);
      return;
    }
    if (permission !== "granted") {
      setShowPermission(true);
      return;
    }
    if (recordState === "idle" || recordState === "done") {
      setRecordSeconds(0);
    }
    setRecordState("recording");
  };

  const authorize = () => {
    setPermission("requesting");
    window.setTimeout(() => {
      setPermission("granted");
      setShowPermission(false);
      if (recordState === "idle" || recordState === "done") {
        setRecordSeconds(0);
      }
      setRecordState("recording");
    }, 1000);
  };

  const finishRecord = () => {
    if (isMetaValid) {
      setRecordState("generating");
      window.setTimeout(() => {
        setRecordState("done");
        setView("notes");
        setNoteTab("summary");
      }, 900);
      return;
    }
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

  const completeMetadata = () => {
    setMetaTouched(true);
    if (!isMetaValid) return;
    setRecordState("generating");
    window.setTimeout(() => {
      setRecordState("done");
      setView("notes");
      setNoteTab("summary");
    }, 900);
  };

  const submitLogin = () => {
    if (loginStep === "phone") {
      setLoginStep("code");
      return;
    }
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
  };

  const openPurchase = (note: (typeof marketplaceNotes)[number]) => {
    if (!isLoggedIn) {
      setShowLogin(true);
      return;
    }
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
    setPurchaseStatus("success");
  };
  const pageTitle = view === "home" ? "学习工作台" : view === "classroom" ? "今日课堂" : view === "notes" ? "AI 笔记资产库" : view === "market" ? "校园知识广场" : "积分钱包";

  return (
    <main className="student-app">
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
          isMetaValid={isMetaValid}
          lessonMeta={lessonMeta}
          metaTouched={metaTouched}
          setLessonMeta={setLessonMeta}
          onClose={() => setRecordState("recording")}
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
          title="放弃本次录音？"
          body="放弃后会清空当前音频、转写片段和临时照片。已入库的历史文件不受影响。"
          confirmText="确认放弃"
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
          onClose={() => setPurchaseTarget(null)}
          onConfirm={confirmPurchase}
          onRecharge={() => {
            setCredits((value) => value + 200);
            setPurchaseStatus("idle");
          }}
        />
      )}

      <aside className="thin-nav">
        <button className="brand-dot" onClick={() => setView("home")} aria-label="百智学生版首页">
          <BrainCircuit size={22} />
        </button>
        <NavButton active={view === "home"} icon={<BookOpenCheck />} label="首页" onClick={() => setView("home")} />
        <NavButton active={view === "classroom"} icon={<Mic />} label="今日课堂" onClick={() => setView("classroom")} />
        <NavButton active={view === "notes"} icon={<LibraryBig />} label="AI 笔记" onClick={() => setView("notes")} />
        <NavButton active={view === "market"} icon={<Store />} label="校园知识广场" onClick={() => setView("market")} />
        <NavButton active={view === "wallet"} icon={<WalletCards />} label="积分钱包" onClick={() => setView("wallet")} />
        <button className="account-entry" onClick={() => (isLoggedIn ? setShowCertify(true) : setShowLogin(true))}>
          <span className="avatar-dot">{isLoggedIn ? "我" : <LockKeyhole size={17} />}</span>
          <strong>{isLoggedIn ? "138****8000" : "立即登录"}</strong>
        </button>
      </aside>

      <section className="main-stage">
        <header className="student-topbar">
          <div className="brand-lockup">
            <p>百智学生版</p>
            <h1>{pageTitle}</h1>
          </div>
        </header>

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
            onPhoto={() => photoInputRef.current?.click()}
          />
        )}
        {view === "notes" && (
          <NotesLibrary
            noteTab={noteTab}
            setNoteTab={setNoteTab}
            onPublish={() => {
              if (!student.verified) {
                setShowCertify(true);
                return;
              }
              setToast("已生成发布草稿，可继续补充价格与预览范围");
              window.setTimeout(() => setToast(""), 1800);
            }}
          />
        )}
        {view === "market" && (
          <MarketView
            filteredMarket={filteredMarket}
            marketMajor={marketMajor}
            marketQuery={marketQuery}
            marketSchool={marketSchool}
            setMarketMajor={setMarketMajor}
            setMarketQuery={setMarketQuery}
            setMarketSchool={setMarketSchool}
            onPurchase={openPurchase}
          />
        )}
        {view === "wallet" && (
          <WalletView
            credits={credits}
            onRecharge={() => {
              setToast("前往百智平台购买");
              window.setTimeout(() => setToast(""), 1800);
            }}
          />
        )}
      </section>

      <AgentPanel recordState={recordState} setNoteTab={setNoteTab} setView={setView} />
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

function HomeDashboard({ beginRecord, setView }: { beginRecord: () => void; setView: (view: View) => void }) {
  const hardwareScenes = [
    {
      title: "课堂拾音终端",
      desc: "全程收录授课、提问与板书时刻，下课即生成可复习的课堂资产。",
      action: "开始课堂记录",
      handler: beginRecord,
    },
    {
      title: "随身灵感笔",
      desc: "灵感、账目、待办随口落库，小智自动归类成今天要处理的事项。",
      action: "查看灵感库",
      handler: () => setView("notes"),
    },
    {
      title: "错题同步笔",
      desc: "课后做题秒级同步，错题、解析和知识点无感进入你的个人题库。",
      action: "进入题库",
      handler: () => setView("notes"),
    },
  ];
  const studyMethods = [
    ["费曼学习法", "把知识讲给别人听，讲不清的地方就是复习入口。"],
    ["康奈尔 5R", "记录、简化、背诵、思考、复习，把课堂笔记变成长期记忆。"],
    ["番茄钟学习法", "25 分钟专注 + 5 分钟休息，用节奏对抗拖延。"],
    ["SQ3R 阅读法", "浏览、提问、阅读、复述、复习，让教材从厚变薄。"],
    ["模仿学习法", "先复刻优秀解题路径，再抽象成自己的方法库。"],
    ["提问学习法", "把知识点改写成问题，让小智陪你追问到底。"],
  ];

  return (
    <section className="home-dashboard">
      <div className="home-hero-module">
        <div className="home-hero-mark">
          <span>BAIZHI</span>
          <strong>学生版</strong>
        </div>
        <div className="home-slogan">
          <span>BAIZHI STUDENT EDITION</span>
          <h2>把课堂变成你的第二大脑</h2>
          <p>声音、照片、灵感与错题会自动沉淀为可复习、可追问、可流通的个人学习资产。</p>
        </div>
      </div>

      <div className="home-lower-grid">
        <section className="home-module hardware-module">
          <div className="home-module-head">
            <span>Recording Hardware</span>
            <h3>三种学习记录场景</h3>
          </div>
          <div className="hardware-scenes">
          {hardwareScenes.map((scene, index) => (
            <article className="hardware-row" key={scene.title}>
              <div className="hardware-index">{String(index + 1).padStart(2, "0")}</div>
              <div>
                <h3>{scene.title}</h3>
                <p>{scene.desc}</p>
              </div>
              <button className="hardware-arrow" onClick={scene.handler} aria-label={scene.action}>
                <ChevronRight size={15} />
              </button>
            </article>
          ))}
          </div>
          <button className="home-mic-button" onClick={beginRecord}>
            <Mic size={18} />
            开始记录今天的学习
          </button>
        </section>

        <section className="home-module methods-module">
          <div className="home-module-head">
            <span>Study Cards</span>
            <h3>小智推荐的学习方法</h3>
          </div>
          <div className="study-method-wall">
            {studyMethods.map(([title, desc], index) => (
              <article className="method-card" key={title}>
                <div className="method-dots"><span /><span /><span /></div>
                <h3>{title}</h3>
                <p>{desc}</p>
                <i>{index % 2 === 0 ? "→" : "↗"}</i>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function ClassroomView({
  beginRecord,
  finishRecord,
  lessonMeta,
  onDiscard,
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
          <div className="record-empty-orbit">
            <Mic size={34} />
          </div>
          <div>
            <h3>开启一节新的课堂记录</h3>
            <p>上课时专心听讲就好，剩下的交给小智。课堂声音、板书照片和重点片段会被整理成可复习、可追问的 AI 笔记。</p>
          </div>
          <button className="primary-action record-start-button" onClick={beginRecord}>
            <Mic size={17} />
            <span className="record-wave" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            开始录音
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

          <div className="wave-line">
            {Array.from({ length: 64 }).map((_, index) => (
              <span key={index} style={{ animationDelay: `${index * 0.025}s`, height: `${8 + ((index * 19) % 34)}px` }} />
            ))}
          </div>

          <div className="recorder-actions">
            <button className="text-danger" onClick={onDiscard}>
              <Trash2 size={17} />
              放弃录音
            </button>
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
  setNoteTab,
}: {
  noteTab: NoteTab;
  onPublish: () => void;
  setNoteTab: (value: NoteTab) => void;
}) {
  return (
    <div className="notes-grid">
      <section className="glass-card file-list-card">
        <div className="section-head">
          <div>
            <p>全部录音</p>
            <h2>课堂文件</h2>
          </div>
          <span className="file-count-pill">{noteFiles.length} 条</span>
        </div>
        <div className="file-list">
          {noteFiles.map((file, index) => (
            <article className={index === 0 ? "selected" : ""} key={file.title}>
              <div className="file-icon">{file.type === "录音文件" ? <FileAudio size={18} /> : <FileText size={18} />}</div>
              <div>
                <strong>{file.title}</strong>
                <p>{file.folder}</p>
              </div>
              <span className="file-type">{file.type}</span>
              <small className={`file-status ${statusClassName(file.status)}`}>{file.status}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="glass-card note-detail-card">
        <div className="note-detail-head">
          <div>
            <p>高数第 8 讲</p>
            <h2>多元函数极值</h2>
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
          {[
            ["transcript", "转译文本"],
            ["summary", "智能总结"],
            ["exam", "考试预测"],
          ].map(([key, label]) => (
            <button className={noteTab === key ? "active" : ""} key={key} onClick={() => setNoteTab(key as NoteTab)}>
              {label}
            </button>
          ))}
        </div>
        <NoteContent tab={noteTab} />
      </section>
    </div>
  );
}

function NoteContent({ tab }: { tab: NoteTab }) {
  if (tab === "transcript") {
    return (
      <div className="speaker-list">
        <div className="transcript-meta">
          <span>ASR 转写完成</span>
          <span>6 段说话人识别</span>
          <span>平均置信度 96%</span>
        </div>
        {transcriptLines.map((line) => (
          <article key={line.time}>
            <div className="speaker-head">
              <div>
                <strong>{line.speaker}</strong>
                <span>{line.role}</span>
              </div>
              <time>{line.time}</time>
            </div>
            <p>{line.text}</p>
            <div className="transcript-tags">
              <span>{line.event}</span>
              <span>置信度 {line.confidence}</span>
            </div>
          </article>
        ))}
      </div>
    );
  }
  if (tab === "exam") {
    return <div className="note-content">高概率考点：给定函数求驻点并判断极值类型；中概率考点：约束条件下的最值计算。</div>;
  }
  return <SummaryNote />;
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
  onPurchase,
  setMarketMajor,
  setMarketQuery,
  setMarketSchool,
}: {
  filteredMarket: typeof marketplaceNotes;
  marketMajor: string;
  marketQuery: string;
  marketSchool: string;
  onPurchase: (note: (typeof marketplaceNotes)[number]) => void;
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
            <input placeholder="搜索课程、学校、专业或作者" value={marketQuery} onChange={(event) => setMarketQuery(event.target.value)} />
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
        <div className="market-list">
          {filteredMarket.map((note) => (
            <article key={note.id}>
              <div>
                <span>{note.school} · {note.major}</span>
                <h3>{note.title}</h3>
                <p>{note.author} · 评分 {note.score} · 已购 {note.sold}</p>
              </div>
              <strong>{note.price} 积分</strong>
              <button className="primary-action" onClick={() => onPurchase(note)}>
                积分购买
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function WalletView({ credits, onRecharge }: { credits: number; onRecharge: () => void }) {
  return (
    <section className="wallet-page">
      <div className="glass-card wallet-summary">
        <div>
          <p>积分</p>
          <h2>{credits}</h2>
        </div>
        <button className="primary-action" onClick={onRecharge}>
          <CircleDollarSign size={16} />
          积分充值
        </button>
      </div>
      <div className="glass-card points-card">
        <div className="points-row total"><span>积分</span><strong>{credits + 36980}</strong></div>
        <div className="points-row"><span>会员积分</span><strong>6000</strong></div>
        <div className="points-row"><span>任务积分</span><strong>1400</strong></div>
        <div className="points-row"><span>充值积分</span><strong>{credits - 420}</strong></div>
        <div className="points-row"><span>赠送积分</span><strong>30000</strong></div>
        <div className="expire-line">本月将过期积分 0</div>
      </div>
      <div className="glass-card wallet-detail">
        <div className="section-head">
          <div><p>积分明细</p><h2>收支记录</h2></div>
          <div className="wallet-tabs"><button className="active">全部</button><button>获取</button><button>支出</button></div>
        </div>
        {[
          ["开通会员奖励", "+6000", "2026-05-18 10:15:53"],
          ["平台赠送", "+30000", "2026-04-03 00:18:12"],
          ["购买医学统计学考前重点包", "-520", "2026-05-26 14:52:09"],
          ["注册奖励", "+1000", "2026-04-02 11:35:34"],
        ].map(([name, amount, date]) => (
          <div className="ledger-line" key={name}>
            <span>{name}</span>
            <strong className={amount.startsWith("+") ? "plus" : "minus"}>{amount}</strong>
            <time>{date}</time>
          </div>
        ))}
      </div>
    </section>
  );
}

function AgentPanel({ recordState, setNoteTab, setView }: { recordState: RecordState; setNoteTab: (tab: NoteTab) => void; setView: (view: View) => void }) {
  return (
    <aside className="xiaozhi-panel">
      <section className="agent-chat-card">
        <div className="agent-chat-head">
          <div>
            <strong>小智 Agent</strong>
            <span>{recordState === "recording" ? "正在执行课堂记录任务链" : "准备帮你开启下一节课"}</span>
          </div>
          <Wand2 size={18} />
        </div>
        <div className="agent-task-chain">
          {[
            ["登录", "done"],
            ["授权录音", recordState === "idle" ? "todo" : "done"],
            ["实时转写", recordState === "recording" || recordState === "paused" ? "doing" : recordState === "idle" ? "todo" : "done"],
            ["补全属性", recordState === "metadata" ? "doing" : recordState === "done" ? "done" : "todo"],
            ["生成笔记", recordState === "done" ? "done" : "todo"],
          ].map(([label, state]) => (
            <div className={`task-dot ${state}`} key={label}>
              <span />
              {label}
            </div>
          ))}
        </div>
        <div className="chat-stream">
          <div className="chat-row agent">
            <span>小智</span>
            <p>你好，我是小智。你可以先直接开始录音，结束后我会提醒你补全课堂属性，并把音频、照片和转写内容合并入库。</p>
          </div>
          <div className="chat-row user">
            <span>你</span>
            <p>录音时可以先不填课程信息吗？</p>
          </div>
          <div className="chat-row agent">
            <span>小智</span>
            <p>可以。录音完成后我会弹出属性补全窗，学校、教室、老师和课程名称会用于归档与发布。</p>
          </div>
        </div>
        <div className="agent-suggestions">
          <button onClick={() => { setView("notes"); setNoteTab("exam"); }}>考试预测</button>
          <button onClick={() => setView("market")}>去广场找笔记</button>
        </div>
        <div className="agent-input">
          <input placeholder="问小智：帮我解释这个知识点..." />
          <button>
            <Send size={16} />
          </button>
        </div>
      </section>
    </aside>
  );
}

function MetadataModal({
  isMetaValid,
  lessonMeta,
  metaTouched,
  onClose,
  onSubmit,
  setLessonMeta,
}: {
  isMetaValid: boolean;
  lessonMeta: LessonMeta;
  metaTouched: boolean;
  onClose: () => void;
  onSubmit: () => void;
  setLessonMeta: (value: LessonMeta) => void;
}) {
  const metaFields: Array<[keyof LessonMeta, string, string]> = [
    ["school", "学校", "如：北京某大学"],
    ["classroom", "教室", "如：A203 / 腾讯会议"],
    ["teacher", "授课老师", "如：张老师"],
    ["course", "课程名称", "如：高等数学"],
  ];

  return (
    <div className="modal-backdrop">
      <section className="compact-modal wide">
        <button className="modal-close" onClick={onClose}><X size={16} /></button>
        <h2>补全课堂属性</h2>
        <p>这些信息会写入音频属性，用于本地归档、AI 总结上下文和发布到知识广场。</p>
        <div className="meta-form compact">
          {metaFields.map(([key, label, placeholder]) => (
            <label className={metaTouched && !lessonMeta[key] ? "field-error" : ""} key={key}>
              <span>{label}</span>
              <input placeholder={placeholder} value={lessonMeta[key]} onChange={(event) => setLessonMeta({ ...lessonMeta, [key]: event.target.value })} />
            </label>
          ))}
        </div>
        {metaTouched && !isMetaValid && <div className="inline-error"><AlertCircle size={15} /> 请补全四项课堂属性后再入库。</div>}
        <button className="primary-action full" onClick={onSubmit}>保存并生成 AI 笔记</button>
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
  return (
    <div className="modal-backdrop">
      <section className="compact-modal">
        <button className="modal-close" onClick={onClose}>
          <X size={16} />
        </button>
        <h2>手机号登录</h2>
        <p>登录后可录音入库、发布笔记、购买校园资料。</p>
        <input placeholder="请输入手机号" value={phone} onChange={(event) => setPhone(event.target.value)} />
        {isCodeStep && <input placeholder="验证码 123456" value={code} onChange={(event) => setCode(event.target.value)} />}
        <button className="primary-action full" onClick={onSubmit}>{isCodeStep ? "登录" : "获取验证码"}</button>
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
        <h2>录音权限说明</h2>
        <p>本次录音会同时采集麦克风人声和电脑内部声音。请授权麦克风与系统音频，音频仅用于转写、总结和本地知识库入库。</p>
        <div className="permission-row">
          <span><Mic size={18} /> 麦克风</span>
          <span><AudioLines size={18} /> 系统音频</span>
        </div>
        <button className="primary-action full" onClick={onAuthorize}>{permission === "requesting" ? "等待授权中" : "开始授权"}</button>
      </section>
    </div>
  );
}

function CertificationModal({ student, setStudent, onClose, onSubmit }: { student: StudentProfile; setStudent: (value: StudentProfile) => void; onClose: () => void; onSubmit: () => void }) {
  return (
    <div className="modal-backdrop">
      <section className="compact-modal wide">
        <button className="modal-close" onClick={onClose}><X size={16} /></button>
        <h2>学生身份认证</h2>
        <p>认证后可发布到校园知识广场，并自动把学校信息带入录音属性。</p>
        <input placeholder="学校名称" value={student.school} onChange={(event) => setStudent({ ...student, school: event.target.value })} />
        <input placeholder="专业" value={student.major} onChange={(event) => setStudent({ ...student, major: event.target.value })} />
        <input placeholder="班级" value={student.className} onChange={(event) => setStudent({ ...student, className: event.target.value })} />
        <button className="line-button full"><Upload size={16} /> 上传学生证照片 Mock</button>
        <button className="primary-action full" onClick={onSubmit}>提交认证</button>
      </section>
    </div>
  );
}

function PurchaseModal({ credits, note, onClose, onConfirm, onRecharge, status }: { credits: number; note: (typeof marketplaceNotes)[number]; onClose: () => void; onConfirm: () => void; onRecharge: () => void; status: "idle" | "success" | "insufficient" }) {
  return (
    <div className="modal-backdrop">
      <section className="compact-modal">
        <button className="modal-close" onClick={onClose}><X size={16} /></button>
        <h2>积分购买</h2>
        <p>{note.title}</p>
        <div className="purchase-box">
          <span>当前余额 {credits}</span>
          <strong>{note.price} 积分</strong>
        </div>
        {status === "insufficient" && <div className="inline-error"><AlertCircle size={15} /> 余额不足，请先充值或选择低价笔记。</div>}
        {status === "success" && <div className="success-line"><Check size={15} /> 购买成功，已加入 AI 笔记资产库。</div>}
        <button className="primary-action full" onClick={onConfirm}>确认购买</button>
        <button className="line-button full" onClick={onRecharge}>模拟充值 200 积分</button>
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

function FloatingToast({ children }: { children: React.ReactNode }) {
  return <div className="floating-toast">{children}</div>;
}

export default App;
