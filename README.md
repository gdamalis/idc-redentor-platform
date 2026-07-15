# Iglesia de Cristo Redentor Website

🚀 **Built with Next.js, Tailwind CSS, and Contentful**  
This is the first custom-made website for our church community, designed to be modern, easy to maintain, and welcoming to both members and visitors.

## 📂 Project Overview

This project serves as the official website for _Iglesia de Cristo Redentor_, providing essential information about our community, teachings, and events.

### 🌟 Features

- **Multi-language support** using `next-intl`
- **Headless CMS integration** with Contentful for dynamic content management
- **Modern UI** using Tailwind CSS
- **SEO Optimized** for better discoverability

---

## 🚀 Getting Started

### ✅ Prerequisites

Pre-requisites:

- [Node.js](https://nodejs.org/) `22.x` (see `.nvmrc` — 22.14.0)
- [pnpm](https://pnpm.io/) `10.x` (`corepack enable` uses the version pinned in `package.json`)
- A Contentful API Key and other details (ask @gdamalis)

> **Monorepo:** this repo is a **pnpm + Turborepo** workspace and the website lives under **`apps/web/`**. Run the commands below from the **repo root** — they proxy through Turbo to `apps/web`.

### 🏃‍♂️ Running the Project Locally

1. **Clone the repository**
   ```bash
   git clone git@github.com:gdamalis/idc-redentor-platform.git
   cd idc-redentor-platform
   ```
2. **Copy the Environment Variables**
   Create a local env file from the example (it now lives under `apps/web/`):

   ```bash
   cp apps/web/.env.example apps/web/.env.local
   ```

   Edit `apps/web/.env.local` and enter the details provided to connect to Contentful

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
