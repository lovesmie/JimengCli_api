# Jimeng CLI API Wrapper

[🌍 English Version](./README_EN.md) | [🇨🇳 中文版](./README.md)

This project aims to transform the underlying CLI commands of Bytedance's Jimeng (Dreamina) into an API interface compliant with the OpenAI standard. This allows for seamless integration into any existing workflow (including support for seedance2.0 and VIP capabilities).

## ⚠️ Disclaimer & Copyright (Must Read)

1. **License**: The core wrapper code of this project (including routes and the dashboard) is open-sourced under the **MIT License**.
2. **Official Component Isolation**: This project **DOES NOT** include any closed-source CLI executables or commercial assets belonging to Jimeng or ByteDance.
3. **Self-Deployment of CLI**: After pulling this codebase, you must obtain the `jimeng-cli` binary from the official channels yourself. **We are not responsible for any account bans, data issues, or legal disputes arising from your use of the official CLI.**

## 🚀 Quick Start Guide (Beginner Friendly)

To get this API running, it fundamentally relies on the **"Official Jimeng CLI"**.

### 💻 Windows One-Click Deployment

**Batch Scripts**:
*   **`start.bat`**: **One-click run script**. It automatically detects and installs Node.js, **pulls the latest Jimeng CLI (`dreamina.exe`) from the official server**, places it in the `bin` directory, initializes the database, and starts the API service. Just double-click!
*   **`pack.bat`**: **One-click build & package**. Double-click this to compile and compress a `jimeng-deploy.zip` that filters out source code, making it easy to share a ready-to-run package with others.

**Steps**:
1. **Get Code**: Download/unzip this project or use `git clone`.
2. **Run**: Double-click **`start.bat`**.
3. **Access Dashboard**: Open `http://localhost:3000` in your browser.
4. **Admin Login**: **Default password is `admin`**. Please change it immediately!

---

### 🐧 Linux Server Deployment (For Geeks & Production)
If deploying on Ubuntu/CentOS:
1. **Environment**: Ensure Node.js (v18+) and npm are installed.
2. **Download CLI**: Run official script:
   ```bash
   curl -fsSL https://jimeng.jianying.com/cli | bash
   ```
3. **Start Project**:
   ```bash
   npm install
   npx prisma db push
   npm run build
   npm run start
   ```

## ⚠️ Important Limitations & Personal Statement

**[Official Jimeng Restrictions]**
1. **VIP Account Required**: Due to official policies, you must bind a Jimeng account that has **VIP membership** to utilize advanced models like seedance2.0.

**[Developer Statement]**
1. This repository was created **solely to solve the pain point of integrating Jimeng API into personal workflows, intended for personal learning, research, and workflow automation.**
2. **Do not use illegally**. Any serious consequences or financial losses caused by illegal abuse, commercial profiteering, or violation of official Jimeng terms of service are **entirely unrelated to the author of this repository**. If you do not agree, delete this code immediately.

## 📖 Core Documentation Navigation

1. **👉 [Admin Manual EN](./docs/后台管理使用手册_EN.md)**
   > 👈 Learn how to securely bind your VIP account, distribute API tokens, and protect against credential theft.
2. **👉 [API Integration Docs EN](./docs/API集成文档_EN.md)**
   > 👈 Learn how to seamlessly integrate using standard OpenAI protocols by simply replacing the Base URL and API Key.

---

## 📁 Directory Structure

* `src/`: Backend API core.
* `frontend/`: Vue 3 Dashboard source code.
* `data/`: (**DO NOT COMMIT**) Local SQLite database and user credentials.
* `bin/`: (**DO NOT COMMIT**) Official Jimeng CLI binaries.
* `docs/`: Guides and manuals.

## 🔄 Changelog

**v1.0.1 (2026-04-20)**
- 🐛 **Bug Fix**: Fixed a multimodal routing bug in the OpenAI standard video generation API. When only images (without audio/video files) were uploaded and a multimodal model like `seedance2.0` was specified, the router incorrectly fell back to the standard multiframe/single-image mode (resulting in `3.0 fast`). The logic now strictly adheres to the requested model, enforcing the multimodal generation channel regardless of the attachment types, greatly improving API compatibility and scheduling accuracy.

## 🤝 Community & Support

Welcome to join our QQ Group for technical discussions, API integrations, and workflow automation setups:
* **QQ Group**: `691588657` (Chinese language group)

## 📄 License
Released under the [MIT License](LICENSE).
*Author: XiaoYue <43854695@qq.com>*
