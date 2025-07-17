# Inventory Management Website

## Overview
This is a full-featured Inventory Management System for organizations with multiple plants and clusters. It supports user roles, inventory tracking, consumption logging, approval workflows, and more. The system is built with Node.js, Express, Prisma ORM, PostgreSQL, and EJS for server-side rendering.

## Features
- **User Authentication & Roles:** Super Admin, Cluster Manager, User, Viewer
- **Inventory Management:** Add, edit, soft delete, and track items and item groups
- **Consumption Tracking:** Log and manage item consumption per plant
- **Approval Workflows:** Scrap approval requests and user registration approvals
- **Plant & Cluster Management:** Organize users and inventory by plant and cluster
- **Activity Logging:** Track user actions and changes
- **Dashboard:** Role-based dashboard with summary cards and filters
- **Responsive UI:** Built with EJS, Tailwind CSS, and modern JS
- **Email Notifications:** (Planned) For approvals and user actions

## Tech Stack
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL (managed via Prisma ORM)
- **Frontend:** EJS templates, Tailwind CSS, Tom Select, Chart.js (optional for dashboard)
- **Session & Security:** express-session, helmet, csurf, rate limiting

## Project Structure
```
src/
  config/         # DB, mailer, CSRF config
  controllers/    # Route controllers (auth, inventory, approval, etc.)
  middleware/     # Auth, RBAC, error handling
  routes/         # Express route definitions
  services/       # Business logic, email, logging
  utils/          # Constants, helpers
  validators/     # Input validation
  prisma/         # Prisma schema
  public/         # Static assets (css, js, uploads)
  views/          # EJS templates (partials, layouts, pages)
.env              # Environment variables
app.js            # Main app entry point
```

## Setup & Installation
1. **Clone the repository:**
   ```bash
   git clone https://github.com/aman-kumar987/inventory-management-website.git
   cd inventory-management-website
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Configure environment variables:**
   - Copy `.env.example` to `.env` and fill in your database and session secrets.
4. **Set up the database:**
   ```bash
   npx prisma migrate dev --name init
   npx prisma generate
   ```
5. **Start the development server:**
   ```bash
   npm run dev
   ```

## Usage
- Access the app at `http://localhost:3000`
- Log in as a Super Admin to manage clusters, plants, users, and inventory
- Use the dashboard for quick stats and navigation
- Submit and process approval requests as per your role

## Contributing
Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License
This project is licensed under the MIT License.
