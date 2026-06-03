# 百智学生版静态部署说明

当前基础页面仍可作为纯静态单页应用上线。若要启用真实的小智 Agent，需要额外部署 `api/coze-chat.js` 这类服务端代理，并在服务端配置扣子访问令牌。

目标域名：

- `https://www.100waytoai.com/`
- `https://100waytoai.com/`

## 部署文件

至少上传这些文件到网站根目录：

- `index.html`
- `asr-recorder.js`
- `favicon.svg`
- `site.webmanifest`
- `robots.txt`
- `baizhi-students-home-v3.html`（最新页面副本，`index.html` 与它保持一致）

## 推荐方式：静态托管平台

Vercel、Netlify、Cloudflare Pages、GitHub Pages 都可以直接部署这个目录。

1. 将当前目录作为项目根目录导入平台。
2. 构建命令留空。
3. 发布目录填写 `.`。
4. 绑定你的自定义域名。
5. 到域名 DNS 服务商处按平台提示添加 `CNAME` 或 `A` 记录。
6. 等平台签发 HTTPS 证书后访问域名检查页面。

本仓库已包含：

- `vercel.json`：Vercel 路由回退和缓存配置。
- `netlify.toml`、`_redirects` 与 `_headers`：Netlify / Cloudflare Pages 路由回退和缓存配置。

如果启用小智 Agent 或本地 ASR，优先使用 Vercel 部署，因为当前 `api/*.js` 已按 Vercel Serverless Functions 编写。Netlify、Cloudflare Pages 或传统服务器需要将同样逻辑迁移到对应函数服务或现有后端中。

## 本地 ASR 配置

录音入口已接入 `asr-recorder.js`，前端统一请求 `/api/asr`。服务端代理默认转发到：

```bash
ASR_API_URL=http://127.0.0.1:8000/asr
```

本仓库已提供 `local-asr/faster_whisper_server.py`，可用 faster-whisper 启动本地模型服务：

```bash
cd local-asr
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn faster_whisper_server:app --host 127.0.0.1 --port 8000
```

可按机器性能调整模型：

```bash
FASTER_WHISPER_MODEL=base
FASTER_WHISPER_DEVICE=auto
FASTER_WHISPER_COMPUTE_TYPE=auto
```

本地 ASR 服务接收 `multipart/form-data`，字段名为 `file`，返回：

```json
{
  "text": "转写文本",
  "segments": []
}
```

如果模型服务需要鉴权，可配置 `ASR_API_TOKEN`；上传体积上限可用 `ASR_MAX_AUDIO_BYTES` 调整。

### 线上服务器部署

当前 `www.100waytoai.com` 解析到 `39.105.86.25`，线上 Caddy 可直接把 `/api/asr` 反代到同机 faster-whisper：

```text
https://www.100waytoai.com/api/asr -> http://127.0.0.1:8000/asr
```

拿到 SSH 权限后可执行：

```bash
SERVER_HOST=39.105.86.25 SERVER_USER=root ./deploy/deploy-asr-to-server.sh
SERVER_HOST=39.105.86.25 SERVER_USER=root ./deploy/deploy-static-site.sh
```

如果使用仓库里的 Docker Caddy 配置，`deploy/Caddyfile.100waytoai.docker` 已包含 `/api/asr` 反代规则。更新配置后重载 Caddy：

```bash
docker compose restart caddy
```

### 阿里云 NLS 实时语音识别

实时录音链路为：

```text
用户浏览器 WebSocket
-> 百智服务器 /api/asr/realtime
-> 阿里云 NLS WebSocket 实时语音识别
-> 百智服务器保存转写文本
-> 网页实时显示字幕并串联小智总结
```

前端会采集 16k PCM 音频帧，实时发送到 `/api/asr/realtime`。服务端容器负责获取阿里云 NLS Token、发送 `StartTranscription` / 音频二进制帧 / `StopTranscription`，并把最终文本保存到：

```bash
/opt/100waytoai/asr-realtime-sessions
```

部署前需要在阿里云智能语音交互控制台创建项目并拿到 AppKey。生产环境推荐配置 AccessKey，由服务端动态获取 Token：

```bash
ALIYUN_NLS_APPKEY=你的项目AppKey
ALIYUN_ACCESS_KEY_ID=你的AccessKeyId
ALIYUN_ACCESS_KEY_SECRET=你的AccessKeySecret
```

测试阶段也可以直接配置 24 小时临时 Token：

```bash
ALIYUN_NLS_APPKEY=你的项目AppKey
ALIYUN_NLS_TOKEN=控制台临时Token
```

部署到当前线上服务器：

```bash
SERVER_KEY=/path/to/key \
SERVER_HOST=39.105.86.25 \
SERVER_USER=root \
ALIYUN_NLS_APPKEY=你的项目AppKey \
ALIYUN_ACCESS_KEY_ID=你的AccessKeyId \
ALIYUN_ACCESS_KEY_SECRET=你的AccessKeySecret \
./deploy/deploy-realtime-asr-to-server.sh
```

如果 NLS 项目使用上海网关，保持默认：

```bash
ALIYUN_NLS_WS_ENDPOINT=wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1
ALIYUN_NLS_META_ENDPOINT=https://nls-meta.cn-shanghai.aliyuncs.com
ALIYUN_NLS_META_REGION=cn-shanghai
```

如果改用其他地域，按阿里云 NLS 文档替换网关和 Meta Endpoint。

## 传统服务器 / Nginx

将文件上传到服务器目录，例如：

```bash
/opt/100waytoai/baizhi-static
```

Caddy 可参考 `deploy/Caddyfile.100waytoai.example`。当前线上 Docker Caddy 将 `/opt/100waytoai/baizhi-static` 挂载为 `/srv/baizhi-students`。

Nginx 可参考 `deploy/nginx.conf.example`，把 `server_name` 改成你的域名，把 `root` 改成实际目录。配置后重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

DNS 通常配置为：

- 根域名 `@`：添加 `A` 记录指向服务器公网 IP。
- `www`：添加 `CNAME` 指向根域名，或添加 `A` 记录指向同一个公网 IP。

HTTPS 建议使用平台自动证书，或在服务器上使用 Certbot / 宝塔 / 服务器面板签发证书。

## 上线前检查

- 域名能访问到 `index.html`。
- HTTPS 证书正常。
- 浏览器控制台没有资源 404。
- 手机端和桌面端都能打开。
- 登录、录音授权弹窗、开始录音、停止并转写、生成笔记、购买、充值、发布等流程能正常点击。

## 当前限制

- 基础页面仍是前端演示版，数据不会真实写入数据库。
- 小智 Agent API 代理已经加入，但需要部署服务端函数并配置 `COZE_API_TOKEN` 后才会真实工作。
- 登录验证码、充值、购买、发布等都是本地演示流程。
- 页面使用了 Google Fonts；如果目标用户网络无法访问 Google Fonts，会自动回退到系统字体。
