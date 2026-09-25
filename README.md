# CS2D - 2D 反恐精英多人对战

一个基于 HTML5 Canvas + Socket.io 的2D版CSGO网页射击游戏，可以和异地朋友一起联机对战。

## 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 启动服务器
```bash
npm start
```

服务器默认运行在 `http://localhost:3000`

### 3. 开始游戏
- 打开浏览器访问 `http://localhost:3000`
- 输入昵称，点击「创建房间」生成房间码
- 把6位房间码发给朋友，朋友输入房间码点击「加入房间」即可一起玩

## 部署到公网

要让异地朋友也能加入，你需要把服务器部署到一台有公网IP的服务器上。推荐方案：

### 方案A：Railway / Render / Vercel（免费/低成本）
1. 把代码推送到 GitHub
2. 在 Railway 或 Render 上新建项目，连接 GitHub 仓库
3. 启动命令设为 `npm start`，端口设为 `3000`
4. 部署后把生成的网址发给朋友即可

### 方案B：自己的云服务器（阿里云/腾讯云等）
```bash
# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 上传代码后
cd cs2d
npm install
npm start
```

确保防火墙开放 3000 端口，朋友访问 `http://你的服务器IP:3000` 即可。

### 方案C：内网穿透（临时测试用）
如果你有一台本机想临时分享给朋友，可以用 ngrok：
```bash
npx ngrok http 3000
```
把生成的 `https://xxx.ngrok.io` 链接发给朋友。

## 操作说明

| 按键 | 功能 |
|------|------|
| W A S D | 移动 |
| 鼠标 | 瞄准 |
| 鼠标左键 | 射击 |
| R | 换弹 |
| 1 | 切换手枪 |
| 2 | 切换步枪 |

## 游戏特性

- **房间系统**：6位房间码，最多10人同房间
- **死亡竞赛**：击杀得1分，3秒后自动重生
- **武器系统**：
  - 手枪（USP-S）：12发弹匣，伤害35，射速较慢
  - 步枪（AK-47）：30发弹匣，伤害25，射速较快
- **地图掩体**：多张墙壁掩体，可利用地形躲避
- **实时同步**：30tick服务器同步，流畅对战
- **击杀播报**：顶部实时显示击杀信息
- **计分板**：右上角显示所有人的击杀/死亡统计

## 技术栈

- **前端**：HTML5 Canvas 2D + Vanilla JavaScript
- **后端**：Node.js + Express + Socket.io
- **同步**：服务器权威模式，客户端预测移动，子弹和碰撞在服务器端计算

## 项目结构

```
cs2d/
├── server.js          # 游戏服务器（房间管理、物理同步）
├── package.json
├── public/
│   ├── index.html     # 主页面
│   ├── style.css      # 样式
│   └── game.js        # 客户端游戏逻辑
└── README.md
```
