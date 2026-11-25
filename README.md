# Iglesia de Cristo Redentor Platform

🚀 **Built with Next.js, Tailwind CSS, MongoDB, and Vercel Blob**  
This is the custom-made web platform for our church community — combining the public bilingual website (`apps/web`) and the internal Ministry Admin Panel (`apps/admin`) — designed to be modern, easy to maintain, and welcoming to both members and visitors.

## 📂 Project Overview

This monorepo serves the official website (`apps/web`) and Ministry Admin Panel (`apps/admin`) for _Iglesia de Cristo Redentor_, providing essential information about our community, teachings, sermons, and events.

### 🌟 Features

- **Multi-language support** using `next-intl` (`es-AR` primary, `en-US` secondary)
- **Built-in content platform** backed by MongoDB + Vercel Blob and authored in the Ministry Admin Panel (`apps/admin`)
- **Modern UI** using Tailwind CSS and shared `@idcr/ui` components
- **SEO Optimized** for better discoverability

---

## 🚀 Getting Started

### ✅ Prerequisites

Pre-requisites:

- [Node.js](https://nodejs.org/) `22.x` (see `.nvmrc` — 22.14.0)
- [pnpm](https://pnpm.io/) `10.x` (`corepack enable` uses the version pinned in `package.json`)
- MongoDB, Resend/SendGrid, and (for `apps/admin`) Firebase + Vercel Blob credentials (ask @gdamalis)

> **Monorepo:** this repo is a **pnpm + Turborepo** workspace with **`apps/web/`** (public website), **`apps/admin/`** (Ministry Admin Panel), and shared packages under **`packages/`** (`@idcr/config`, `@idcr/ui`, `@idcr/content`). Run the commands below from the **repo root** — they proxy through Turbo.

### 🏃‍♂️ Running the Project Locally

1. **Clone the repository**
   ```bash
   git clone git@github.com:gdamalis/idc-redentor-platform.git
   cd idc-redentor-platform
   ```
2. **Copy the Environment Variables**
   Create local env files from the app examples:

   ```bash
   cp apps/web/.env.example apps/web/.env.local
   cp apps/admin/.env.example apps/admin/.env.local
   ```

   Edit `apps/web/.env.local` (and `apps/admin/.env.local` if running the admin panel) and enter the required credentials (see `CLAUDE.md` / `AGENTS.md`).

3. **Install dependencies** (from the repo root)

   ```bash
   pnpm install
   ```

4. **Start the development server** (from the repo root)

   ```bash
   pnpm dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🚢 Deployment

### 📦 Hosting

This project is optimized for **Vercel**, but can also be deployed to **Netlify** or **any Node.js-friendly hosting service**.

### 🔄 How to Perform a Release?

TBD

---

# Contributing

We welcome contributions! Follow these steps to contribute:

1. Create a feature branch from main: `git checkout -b feature/your-feature`
2. Make changes & commit with a meaningful message: `git commit -m "feat: Add new feature X"`
3. Push changes to your branch: `git push origin feature/your-feature`
4. Create a Pull Request (PR) using the provided template.
5. Get reviewed and approved before merging.

## ✅ Contribution Guidelines

- Follow [Conventional Commits](https://www.conventionalcommits.org/)
- Use clear and concise commit messages
- Follow best practices for Next.js and Tailwind CSS

# Contributors

Gabriel Damalis - gabrieldamalis@gmail.com

💡 Want to contribute? Open an issue or submit a PR!

### 🎉 Thank you for supporting the Iglesia de Cristo Redentor website!
