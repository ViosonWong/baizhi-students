# 百智学生版静态部署说明

当前基础页面仍可作为纯静态单页应用上线。若要启用真实的小智 Agent，需要额外部署 `api/coze-chat.js` 这类服务端代理，并在服务端配置扣子访问令牌。

目标域名：

- `https://www.100waytoai.com/`
- `https://100waytoai.com/`

## 部署文件

至少上传这些文件到网站根目录：

- `index.html`
- `favicon.svg`
- `site.webmanifest`
- `robots.txt`

如果你希望保留预览副本，也可以同时上传 `baizhi-students-preview.html`。

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

如果启用小智 Agent，优先使用 Vercel 部署，因为当前 `api/*.js` 已按 Vercel Serverless Functions 编写。Netlify、Cloudflare Pages 或传统服务器需要将同样逻辑迁移到对应函数服务或现有后端中。

## 传统服务器 / Nginx

将文件上传到服务器目录，例如：

```bash
/var/www/baizhi-students
```

Caddy 可参考 `deploy/Caddyfile.100waytoai.example`，默认站点目录为 `/var/www/baizhi-students`。

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
- 登录、录音授权弹窗、生成笔记、购买、充值、发布等演示流程能正常点击。

## 当前限制

- 基础页面仍是前端演示版，数据不会真实写入数据库。
- 小智 Agent API 代理已经加入，但需要部署服务端函数并配置 `COZE_API_TOKEN` 后才会真实工作。
- 登录验证码、充值、购买、发布等都是本地演示流程。
- 页面使用了 Google Fonts；如果目标用户网络无法访问 Google Fonts，会自动回退到系统字体。
