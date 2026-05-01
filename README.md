# BEL-CARE MedAccess


Zimbabwe Healthcare Network Platform - Connecting patients with hospitals across Zimbabwe.

## Features

- 🏥 **Hospital Discovery** - Find hospitals near you with health scores
- 🚨 **Emergency Mode** - Quick access to emergency-ready facilities
- 💬 **Real-time Chat** - Socket.io powered messaging with hospitals
- 🗺️ **Interactive Map** - Leaflet-based map with routing & directions
- 🔍 **Smart Search** - Fuzzy search for hospitals and services
- 🌐 **Multi-language** - English, Shona, and Ndebele support
- 📱 **Responsive Design** - Works on desktop and mobile

## Tech Stack

### Backend
- Node.js + Express
- PostgreSQL (Neon)
- Socket.io for real-time
- JWT authentication
- bcryptjs for password hashing

### Frontend
- Vanilla JavaScript (ES6+)
- Vite build tool
- Leaflet maps
- Fuse.js fuzzy search
- Socket.io client

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database (Neon recommended)

### Installation

```bash
# Clone and navigate to project
cd bel-care-medaccess

# Install all dependencies
npm run install:all

# Or install separately
cd backend && npm install
cd ../frontend && npm install
```

### Configuration

1. Copy the example environment file:
```bash
cp backend/.env.example backend/.env
```

2. Update `.env` with your database credentials:
```
DATABASE_URL=postgresql://user:pass@host/neondb?sslmode=require
JWT_SECRET=your_secret_key
FRONTEND_URL=http://localhost:5173
PORT=5000
```

3. Set up the database:
```bash
# Run schema
psql $DATABASE_URL -f backend/db/schema.sql

# Seed sample data
psql $DATABASE_URL -f backend/db/seed.sql
```

### Running the App

```bash
# Start backend (port 5000)
npm run dev:backend

# Start frontend (port 5173)
npm run dev:frontend
```

Visit `http://localhost:5173` to see the app.

## Default Accounts

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@belcare.com | SuperAdmin123! |
| Hospital Admin | hospital1@belcare.com | Hospital123! |
| Hospital Admin | hospital2@belcare.com | Hospital123! |

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login

### Hospitals
- `GET /api/hospitals` - List all approved hospitals
- `GET /api/hospitals/:id` - Get hospital details
- `PUT /api/hospitals/:id/availability` - Update availability (hospital_admin)

### Messages
- `GET /api/messages/conversation/:hospitalId` - Get conversation
- `POST /api/messages/send` - Send message

### Requests
- `POST /api/requests` - Create service request
- `GET /api/requests/hospital/:id` - Get hospital requests (hospital_admin)
- `PUT /api/requests/:id/status` - Update request status

### Admin (super_admin only)
- `GET /api/admin/hospitals` - All hospitals
- `PUT /api/admin/hospitals/:id/approve` - Approve hospital
- `GET /api/admin/analytics` - Dashboard analytics

## Deployment

### Vercel
The project includes `vercel.json` for Vercel deployment:

```bash
# Deploy to Vercel
vercel --prod
```

Set environment variables in Vercel dashboard:
- `DATABASE_URL`
- `JWT_SECRET`
- `FRONTEND_URL`

## Project Structure

```
bel-care-medaccess/
├── backend/
│   ├── db/
│   │   ├── pool.js       # Database connection
│   │   ├── schema.sql    # Database schema
│   │   └── seed.sql      # Sample data
│   ├── middleware/
│   │   └── auth.js       # JWT middleware
│   ├── routes/
│   │   ├── auth.js       # Auth routes
│   │   ├── hospitals.js  # Hospital routes
│   │   ├── admin.js      # Admin routes
│   │   ├── messages.js   # Message routes
│   │   └── requests.js   # Request routes
│   ├── socket/
│   │   └── index.js      # Socket.io handlers
│   ├── server.js         # Express server
│   └── package.json
├── frontend/
│   ├── components/
│   │   ├── MapComponent.js
│   │   └── SearchComponent.js
│   ├── utils/
│   │   ├── api.js
│   │   ├── auth.js
│   │   └── socket.js
│   ├── index.html
│   ├── main.js
│   ├── style.css
│   ├── vite.config.js
│   └── package.json
├── .gitignore
├── package.json
├── vercel.json
└── README.md
```

## License

MIT License - Created for Zimbabwe's healthcare system.
