(function initXiaoZhi() {
  var API_URL  = '/api/coze-chat';
  var CONV_KEY = 'xz_conversations';
  var MAX_HIST = 30;
  var OVERLAY_ID = 'xz-root-overlay';

  var S = {
    convs:[], currentId:null, messages:[],
    selectedNotes:[], webSearch:false, streaming:false,
    showHistory:false, showNoteSelector:false, showUpload:false,
    noteTab:'classroom', abortCtrl:null, uploadFiles:[],
  };

  function loadConvs(){try{S.convs=JSON.parse(localStorage.getItem(CONV_KEY)||'[]');}catch(e){S.convs=[];}}
  function saveConvs(){try{localStorage.setItem(CONV_KEY,JSON.stringify(S.convs.slice(0,MAX_HIST)));}catch(e){}}
  function saveCurrentConv(){
    if(!S.currentId||!S.messages.length)return;
    var idx=S.convs.findIndex(function(c){return c.id===S.currentId;});
    var conv={id:S.currentId,title:(S.messages[0]&&S.messages[0].content?S.messages[0].content.slice(0,28):'新对话'),updatedAt:Date.now(),messages:S.messages,selectedNotes:S.selectedNotes};
    if(idx>=0)S.convs[idx]=conv;else S.convs.unshift(conv);
    saveConvs();
  }

  var NOTES=[
    {id:'n1',title:'高数第8讲：多元函数极值',type:'classroom',date:'今天'},
    {id:'n2',title:'医学统计学考前重点包',type:'classroom',date:'昨天'},
    {id:'n3',title:'线性代数期末复习总结',type:'classroom',date:'上周'},
    {id:'n4',title:'宏观经济学期中复习单',type:'mine',date:'3天前'},
    {id:'n5',title:'英语四级写作模板整理',type:'mine',date:'上周'},
  ];
  try{
    var asrNotes=JSON.parse(localStorage.getItem('baizhi_asr_notes')||'[]');
    if(Array.isArray(asrNotes)){
      NOTES=asrNotes.concat(NOTES.filter(function(n){return !asrNotes.some(function(a){return a.id===n.id;});}));
    }
  }catch(e){}
  window.BaizhiXiaoZhi={
    addAsrNote:function(note){
      if(!note||!note.id)return;
      NOTES=NOTES.filter(function(n){return n.id!==note.id;});
      NOTES.unshift({
        id:note.id,title:note.title||'课堂录音转写',type:'classroom',date:'刚刚',
        transcript:note.transcript||note.content||'',content:note.content||note.transcript||'',segments:note.segments||[]
      });
      if(S.selectedNotes.indexOf(note.id)<0)S.selectedNotes.unshift(note.id);
      S.noteTab='classroom';
      if(document.getElementById(OVERLAY_ID))render();
    }
  };
  window.addEventListener('baizhi:asr-note',function(e){
    if(window.BaizhiXiaoZhi&&e.detail)window.BaizhiXiaoZhi.addAsrNote(e.detail);
  });

  var MOCK={
    '帮我找一下相关笔记':'根据你当前的课堂笔记，我找到以下相关内容：\n\n**《高数第8讲：多元函数极值》**\n- 极值的必要条件：$f_x=0, f_y=0$\n- Hessian 矩阵判别法：$\\Delta=AC-B^2$\n- $\\Delta>0, A<0$ → 极大值；$\\Delta>0, A>0$ → 极小值 [1]\n\n**《线性代数期末复习总结》**\n- 特征值与特征向量的关系\n- 矩阵相似对角化 [2]',
    '帮我总结这份笔记的重点':'以下是本节课堂笔记的核心重点：\n\n**一、多元函数极值**\n- **极值定义**：若 $(x_0,y_0)$ 是极值点，则偏导数均为 0\n- **驻点条件**：极值点必为驻点\n\n**二、Hessian 判别法**\n- 计算 $A=f_{xx},\\ B=f_{xy},\\ C=f_{yy}$\n- $\\Delta=AC-B^2>0$：$A<0$ 极大，$A>0$ 极小\n- $\\Delta<0$：鞍点\n\n**三、拉格朗日乘子法**\n- 用于求约束条件下的极值\n- 构造辅助函数 $L=f+\\lambda g$',
    '根据笔记帮我出5道复习题':'根据《高数第8讲》笔记，为你出了以下5道题：\n\n**第1题（基础）**\n求 $f(x,y)=x^2+xy+y^2-2x-y$ 的极值。\n\n**第2题（判断）**\n若 $f(x,y)$ 在点 $(1,2)$ 处有极值，则 $f_x(1,2)$ 等于？\n\n**第3题（计算）**\n用 Hessian 法判断 $f(x,y)=x^3-y^3+3x^2+3y^2-9x$ 的极值点。\n\n**第4题（应用）**\n在约束 $x+y=1$ 下，求 $f(x,y)=x^2+y^2$ 的最小值。\n\n**第5题（综合）**\n成本函数 $C=2x^2+y^2-xy$，求最小成本时 $x,y$ 的值。',
    '帮我批改这道题的解题过程':'请把你的解题过程发给我，我来帮你逐步批改。\n\n**批改要点：**\n- 检查驻点求解是否正确\n- 验证 Hessian 矩阵计算步骤\n- 判断极值类型的结论是否准确\n- 最终答案书写格式是否规范\n\n你可以直接把解题步骤粘贴过来，或者拍照上传',
    '根据笔记给我制定复习计划':'根据你当前笔记，为你制定了一份**7天复习计划**：\n\n**Day 1-2：基础回顾**\n- 多元函数定义与偏导数计算\n- 每天练习10道偏导数题\n\n**Day 3-4：核心方法**\n- Hessian 矩阵判别法\n- 拉格朗日乘子法套路\n- 整理错题本\n\n**Day 5：综合应用**\n- 混合类型题目训练\n- 攻克鞍点和 $\\Delta=0$ 特殊情形\n\n**Day 6：模拟考试**\n- 用5道题做自测，限时40分钟\n\n**Day 7：查漏补缺**\n- 复习错题，重做1遍\n- 总结常见失分点',
  };

  var QUICK=[
    {label:'找笔记',   q:'帮我找一下相关笔记'},
    {label:'总结',     q:'帮我总结这份笔记的重点'},
    {label:'出题',     q:'根据笔记帮我出5道复习题'},
    {label:'批改',     q:'帮我批改这道题的解题过程'},
    {label:'复习建议', q:'根据笔记给我制定复习计划'},
  ];

  function genId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
  function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function fmtTime(ts){if(!ts)return'';var d=Date.now()-ts;if(d<60000)return'刚刚';if(d<3600000)return Math.floor(d/60000)+'分钟前';if(d<86400000)return Math.floor(d/3600000)+'小时前';return Math.floor(d/86400000)+'天前';}
  function fmtSize(b){if(b<1024)return b+'B';if(b<1048576)return(b/1024).toFixed(1)+'KB';return(b/1048576).toFixed(1)+'MB';}
  function mdRender(t){if(!t)return'';return t.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\*(.*?)\*/g,'<em>$1</em>').replace(/`([^`\n]+)`/g,'<code class="xz-code-inline">$1</code>').replace(/^### (.+)$/gm,'<p class="xz-h3">$1</p>').replace(/^## (.+)$/gm,'<p class="xz-h4">$1</p>').replace(/\[(\d+)\]/g,'<sup class="xz-cite-ref">[$1]</sup>').replace(/^[-•*] (.+)$/gm,'<li>$1</li>').replace(/(<li>[\s\S]*?<\/li>)/g,function(m){return'<ul class="xz-md-list">'+m+'</ul>';}).replace(/\n\n+/g,'<br><br>').replace(/\n/g,'<br>');}
  function scrollBot(){var e=document.getElementById('xz-stream');if(e)e.scrollTop=e.scrollHeight;}
  function autoResize(el){if(!el)return;el.style.height='auto';el.style.height=Math.min(el.scrollHeight,120)+'px';}

  function newConv(){if(S.abortCtrl)S.abortCtrl.abort();S.currentId=null;S.messages=[];S.selectedNotes=[];S.streaming=false;S.showHistory=false;render();setTimeout(function(){var e=document.getElementById('xz-input');if(e)e.focus();},60);}
  function openConv(id){var c=S.convs.find(function(x){return x.id===id;});if(!c)return;S.currentId=id;S.messages=c.messages||[];S.selectedNotes=c.selectedNotes||[];S.showHistory=false;S.streaming=false;render();setTimeout(scrollBot,60);}
  function deleteConv(id){S.convs=S.convs.filter(function(c){return c.id!==id;});if(S.currentId===id){S.currentId=null;S.messages=[];S.selectedNotes=[];}saveConvs();render();}


  var OVERLAY_STYLE='position:absolute;top:12px;left:0;right:0;bottom:28px;z-index:5;display:flex;flex-direction:column;padding:clamp(14px,3.5%,24px);background:var(--surface);border-radius:var(--r-2xl);border:1px solid var(--line);box-shadow:var(--shadow-card);overflow:hidden;';

  async function sendMessage(text){
    text=text.trim();if(!text||S.streaming)return;
    if(!S.currentId)S.currentId=genId();
    if(MOCK[text]){
      var um={role:'user',id:genId(),ts:Date.now(),content:text};
      var am={role:'assistant',id:genId(),ts:Date.now(),content:'',streaming:true};
      S.messages.push(um,am);S.streaming=true;S.showNoteSelector=false;
      render();scrollBot();
      var txt=MOCK[text],i=0;
      function typeNext(){
        if(i>=txt.length){am.streaming=false;S.streaming=false;saveCurrentConv();render();scrollBot();return;}
        am.content+=txt[i++];patchMsg(am);
        setTimeout(typeNext,Math.random()>.92?28:8);
      }
      typeNext();return;
    }
    var userMsg={role:'user',id:genId(),ts:Date.now(),content:text};
    var aiMsg={role:'assistant',id:genId(),ts:Date.now(),content:'',streaming:true};
    S.messages.push(userMsg,aiMsg);S.streaming=true;S.showNoteSelector=false;
    render();scrollBot();
    S.abortCtrl=new AbortController();
    try{
      var selectedNoteTitles=[],noteContext=S.selectedNotes.map(function(id){var n=NOTES.find(function(x){return x.id===id;});if(!n)return'';selectedNoteTitles.push(n.title);return '【'+n.title+'】\n'+(n.content||n.transcript||'');}).filter(Boolean).join('\n\n');
      var resp=await fetch(API_URL,{method:'POST',signal:S.abortCtrl.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({studentId:'baizhi_student_web',conversationId:S.cozeConversationId||'',message:text,selectedNoteIds:S.selectedNotes,selectedNoteTitles:selectedNoteTitles,noteContext:noteContext,webSearchEnabled:S.webSearch,taskMode:S.selectedNotes.length?'note_context':'auto'})});
      if(!resp.ok)throw new Error('HTTP '+resp.status);
      var data=await resp.json();
      S.cozeConversationId=data.conversationId||S.cozeConversationId||'';
      aiMsg.content=data.answer||data.text||data.content||'小智暂时没有返回内容。';
      patchMsg(aiMsg);
    }catch(err){if(err.name!=='AbortError'){aiMsg.content=aiMsg.content||('抱歉，请求失败：'+err.message);aiMsg.error=true;}}
    finally{aiMsg.streaming=false;S.streaming=false;saveCurrentConv();render();scrollBot();}
  }

  function patchMsg(msg){var el=document.getElementById('xz-msg-'+msg.id);if(!el)return;var b=el.querySelector('.xz-msg-bubble');if(b)b.innerHTML=msg.content?mdRender(msg.content)+'<span class="xz-cursor"></span>':'<span class="xz-thinking"><span></span><span></span><span></span></span>';scrollBot();}

  function renderCitations(cites){if(!cites||!cites.length)return'';return'<div class="xz-citations"><div class="xz-cite-label">引用来源</div>'+cites.map(function(c,i){return'<div class="xz-cite-item"><span class="xz-cite-num">'+(i+1)+'</span><div class="xz-cite-body"><div class="xz-cite-title">'+esc(c.title||c.source||'未知来源')+'</div>'+(c.excerpt?'<div class="xz-cite-excerpt">'+esc(c.excerpt)+'</div>':'')+'</div></div>';}).join('')+'</div>';}

  function renderMsg(msg){
    if(msg.role==='user')return'<div class="xz-msg xz-msg-user" id="xz-msg-'+msg.id+'"><div class="xz-msg-bubble">'+esc(msg.content)+'</div></div>';
    var bub=(msg.streaming&&!msg.content)?'<span class="xz-thinking"><span></span><span></span><span></span></span>':mdRender(msg.content)+(msg.streaming?'<span class="xz-cursor"></span>':'');
    return'<div class="xz-msg xz-msg-ai" id="xz-msg-'+msg.id+'"><div class="xz-ai-avatar">智</div><div class="xz-ai-body"><div class="xz-msg-bubble">'+bub+'</div>'+(!msg.streaming&&msg.citations?renderCitations(msg.citations):'')+( msg.error?'<div class="xz-msg-error">请求失败，请重试</div>':'')+'</div></div>';
  }

  function renderNoteList(type){var list=NOTES.filter(function(n){return n.type===type;});if(!list.length)return'<div class="xz-ns-empty">暂无笔记</div>';return list.map(function(n){var sel=S.selectedNotes.indexOf(n.id)>=0;return'<div class="xz-ns-item'+(sel?' xz-ns-selected':'')+'" data-note-id="'+n.id+'"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg><span>'+esc(n.title)+'</span>'+(sel?'<span class="xz-ns-check">✓</span>':'')+'</div>';}).join('');}

  function renderUpload(){var items=S.uploadFiles.map(function(f,i){return'<div class="xz-up-file"><div class="xz-up-file-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div class="xz-up-file-info"><div class="xz-up-file-name">'+esc(f.name)+'</div><div class="xz-up-file-size">'+fmtSize(f.size)+'</div></div><button class="xz-up-file-del" data-file-idx="'+i+'">×</button></div>';}).join('');return'<div class="xz-up-overlay" id="xz-up-overlay"><div class="xz-up-modal"><div class="xz-up-head"><span>上传文件</span><button class="xz-icon-btn" id="xz-up-close"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div class="xz-up-drop" id="xz-up-drop"><input type="file" id="xz-file-input" multiple style="display:none" accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><p>拖拽文件到这里，或 <label for="xz-file-input" class="xz-up-browse">点击选择</label></p><span>支持 PDF、Word、TXT、Markdown、图片</span></div>'+(S.uploadFiles.length?'<div class="xz-up-list">'+items+'</div>':'')+'<div class="xz-up-foot"><span class="xz-up-hint">'+(S.uploadFiles.length?S.uploadFiles.length+'个文件待上传':'文件将作为对话上下文')+'</span><button class="xz-up-submit'+(S.uploadFiles.length?'':' xz-up-submit-disabled')+'" id="xz-up-submit" '+(S.uploadFiles.length?'':'disabled')+'>上传并引用</button></div></div></div>';}

  function render(){
    var ov=document.getElementById(OVERLAY_ID);if(!ov)return;

    /* context chips */
    var ctxHtml='';
    if(S.selectedNotes.length){ctxHtml='<div class="xz-context-chips"><span class="xz-context-label">上下文：</span>'+S.selectedNotes.map(function(id){var n=NOTES.find(function(x){return x.id===id;});if(!n)return'';return'<div class="xz-context-chip"><span>'+esc(n.title.slice(0,14))+(n.title.length>14?'…':'')+'</span><button class="xz-chip-del" data-del-note="'+n.id+'">×</button></div>';}).join('')+'</div>';}

    /* history overlay */
    var histHtml='';
    if(S.showHistory){var items=!S.convs.length?'<div class="xz-history-empty">暂无历史对话</div>':S.convs.map(function(c){return'<div class="xz-history-item'+(c.id===S.currentId?' xz-history-current':'')+'" data-open-conv="'+c.id+'"><div class="xz-history-title">'+esc(c.title||'未命名对话')+'</div><div class="xz-history-meta">'+fmtTime(c.updatedAt)+'</div><button class="xz-history-del" data-del-conv="'+c.id+'" title="删除"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>';}).join('');histHtml='<div class="xz-history"><div class="xz-history-head"><span>历史对话</span><button class="xz-icon-btn" id="xz-hist-close"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div class="xz-history-list">'+items+'</div></div>';}

    /* note selector */
    var nsHtml='';
    if(S.showNoteSelector){nsHtml='<div class="xz-note-selector" id="xz-ns"><div class="xz-ns-tabs"><button class="xz-ns-tab'+(S.noteTab==='classroom'?' xz-ns-tab-active':'')+'" data-ns-tab="classroom">课堂笔记</button><button class="xz-ns-tab'+(S.noteTab==='mine'?' xz-ns-tab-active':'')+'" data-ns-tab="mine">我的笔记</button></div><div class="xz-ns-list">'+renderNoteList(S.noteTab)+'</div></div>';}

    /* stream */
    var streamHtml;
    if(!S.messages.length){
      streamHtml='<div class="agent-welcome"><div class="agent-welcome-bubble"><p class="aw-hello">Hi，我是小智 👋</p><p>你的 AI 学习搭子。上完课、做完题，把整理的事情交给我，你可以随时来这里追问任何一句没听懂的话。</p></div><div class="agent-welcome-tips"><span class="aw-tip-label">不知道问啥？试试：</span>'+QUICK.map(function(q){return'<button class="aw-chip xz-quick-btn" data-q="'+esc(q.q)+'">'+q.label+'</button>';}).join('')+'</div></div>';
    }else{streamHtml=S.messages.map(renderMsg).join('');}

    /* web toggle */
    var webToggle=S.webSearch?'<button class="xz-input-tool xz-tool-active" id="xz-web-toggle" title="关闭联网搜索"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><span>联网</span></button>':'<button class="xz-input-tool" id="xz-web-toggle" title="开启联网搜索"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></button>';

    var nbClass='xz-input-tool'+(S.selectedNotes.length?' xz-tool-note-active':'');
    var nbBadge=S.selectedNotes.length?'<span class="xz-note-badge">'+S.selectedNotes.length+'</span>':'';
    var sendIcon=S.streaming?'<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>':'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

    ov.innerHTML=
      '<div class="agent-chat-head">'
        +'<div><strong>小智</strong><span> '+(S.streaming?'思考中…':'你的 AI 学习搭子，随时陪你聊')+'</span></div>'
        +'<div style="display:flex;align-items:center;gap:5px">'
          +'<button class="xz-icon-btn'+(S.showHistory?' xz-btn-active':'')+'" id="xz-hist-btn" title="历史对话"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><polyline points="12 7 12 12 15 15"/></svg></button>'
          +'<button class="xz-icon-btn" id="xz-new-btn" title="新建对话"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>'
        +'</div>'
      +'</div>'
      +histHtml
      +'<div class="xz-stream" id="xz-stream">'+streamHtml+'</div>'
      +ctxHtml
      +'<div class="xz-input-area">'
        +'<div class="xz-input-row">'
          +'<button class="xz-input-tool" id="xz-up-btn" title="上传文件"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>'
          +'<button class="'+nbClass+'" id="xz-note-btn" title="引用笔记" style="position:relative">'+nbBadge+'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg></button>'
          +'<textarea class="xz-textarea" id="xz-input" placeholder="问小智任何一句听不懂的话…" rows="1"></textarea>'
          +webToggle
          +'<button class="xz-send-btn" id="xz-send-btn"'+(S.streaming?' disabled':'')+'>'+sendIcon+'</button>'
        +'</div>'
        +nsHtml
      +'</div>'
      +(S.showUpload?renderUpload():'');

    bindEvents(ov);scrollBot();
  }

  function bindEvents(ov){
    function q(id,ev,fn){var e=document.getElementById(id);if(e)e.addEventListener(ev,fn);}
    q('xz-new-btn','click',newConv);
    q('xz-hist-btn','click',function(){S.showHistory=!S.showHistory;render();});
    q('xz-hist-close','click',function(){S.showHistory=false;render();});
    ov.querySelectorAll('[data-open-conv]').forEach(function(el){el.addEventListener('click',function(e){if(e.target.closest('[data-del-conv]'))return;openConv(el.dataset.openConv);});});
    ov.querySelectorAll('[data-del-conv]').forEach(function(el){el.addEventListener('click',function(e){e.stopPropagation();deleteConv(el.dataset.delConv);});});
    q('xz-web-toggle','click',function(){S.webSearch=!S.webSearch;render();setTimeout(function(){var e=document.getElementById('xz-input');if(e)e.focus();},50);});
    q('xz-note-btn','click',function(e){e.stopPropagation();S.showNoteSelector=!S.showNoteSelector;render();});
    ov.querySelectorAll('[data-ns-tab]').forEach(function(tab){tab.addEventListener('click',function(){S.noteTab=tab.dataset.nsTab;render();});});
    ov.querySelectorAll('[data-note-id]').forEach(function(el){el.addEventListener('click',function(){var id=el.dataset.noteId,idx=S.selectedNotes.indexOf(id);if(idx>=0)S.selectedNotes.splice(idx,1);else S.selectedNotes.push(id);S.showNoteSelector=false;render();});});
    ov.querySelectorAll('[data-del-note]').forEach(function(el){el.addEventListener('click',function(){S.selectedNotes=S.selectedNotes.filter(function(n){return n!==el.dataset.delNote;});render();});});
    ov.querySelectorAll('.xz-quick-btn[data-q]').forEach(function(btn){btn.addEventListener('click',function(){var inp=document.getElementById('xz-input');if(inp){inp.value=btn.dataset.q;inp.focus();autoResize(inp);}});});
    var ta=document.getElementById('xz-input');
    if(ta){ta.addEventListener('input',function(){autoResize(ta);});ta.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();doSend();}});}
    q('xz-send-btn','click',doSend);
    q('xz-up-btn','click',function(e){e.stopPropagation();S.showUpload=true;render();});
    q('xz-up-close','click',function(){S.showUpload=false;render();});
    q('xz-up-overlay','click',function(e){if(e.target===document.getElementById('xz-up-overlay')){S.showUpload=false;render();}});
    var fi=document.getElementById('xz-file-input');if(fi)fi.addEventListener('change',function(){addFiles(Array.from(fi.files));});
    var drop=document.getElementById('xz-up-drop');
    if(drop){drop.addEventListener('dragover',function(e){e.preventDefault();drop.classList.add('xz-up-dragover');});drop.addEventListener('dragleave',function(){drop.classList.remove('xz-up-dragover');});drop.addEventListener('drop',function(e){e.preventDefault();drop.classList.remove('xz-up-dragover');addFiles(Array.from(e.dataTransfer.files));});}
    ov.querySelectorAll('[data-file-idx]').forEach(function(el){el.addEventListener('click',function(){S.uploadFiles.splice(parseInt(el.dataset.fileIdx),1);render();});});
    q('xz-up-submit','click',function(){if(!S.uploadFiles.length)return;var names=S.uploadFiles.map(function(f){return f.name;}).join('、');S.showUpload=false;S.uploadFiles=[];if(!S.currentId)S.currentId=genId();var msg={role:'user',id:genId(),ts:Date.now(),content:'[已上传文件：'+names+']'};S.messages.push(msg);saveCurrentConv();render();scrollBot();});
    if(S.showNoteSelector){setTimeout(function(){document.addEventListener('click',function h(e){if(!e.target.closest('.xz-input-area')){S.showNoteSelector=false;render();}document.removeEventListener('click',h);});},0);}
  }

  function addFiles(files){files.forEach(function(f){if(!S.uploadFiles.find(function(x){return x.name===f.name;}))S.uploadFiles.push(f);});render();}
  function doSend(){var inp=document.getElementById('xz-input');if(!inp)return;var text=inp.value.trim();if(!text)return;inp.value='';autoResize(inp);sendMessage(text);}

  /* ── Boot: inject overlay ONCE, React never touches it ── */
  function boot(){
    var panel=document.querySelector('.xiaozhi-panel');
    if(!panel){setTimeout(boot,150);return;}
    if(document.getElementById(OVERLAY_ID))return; /* already mounted */
    panel.style.position='relative';
    loadConvs();
    var ov=document.createElement('section');
    ov.id=OVERLAY_ID;
    ov.style.cssText=OVERLAY_STYLE;
    panel.appendChild(ov);
    render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,300);});
  else setTimeout(boot,300);
})();
