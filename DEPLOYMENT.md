# 百智学生版静态部署说明

当前版本是纯静态单页应用，不需要接入后端服务即可上线。正式入口是 `index.html`，页面交互流程和演示数据都在前端 HTML 内。

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

- 这是前端演示版，数据不会真实写入数据库。
- 登录验证码、充值、购买、发布等都是本地演示流程。
- 页面使用了 Google Fonts；如果目标用户网络无法访问 Google Fonts，会自动回退到系统字体。
