# Triage Dashboard Deployment Guide

## Running Locally

1. Install dependencies:
```bash
cd triage-dashboard
npm install
```

2. Start the development server:
```bash
npm run dev
```

This will start:
- Frontend (Vite): http://localhost:5173
- Backend API: http://localhost:3001

The app will run in demo mode with simulated data. To connect to real hardware, ensure the Flask backend is running at `http://localhost:5000`.

## Deploying to Vercel

### Prerequisites
- A Vercel account (sign up at https://vercel.com)
- Vercel CLI installed (optional, for CLI deployment)

### Method 1: Deploy via Vercel Dashboard (Recommended)

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket)

2. Go to https://vercel.com/new

3. Import your repository

4. Configure the project:
   - **Framework Preset**: Vite
   - **Root Directory**: `triage-dashboard`
   - **Build Command**: `npm run vercel-build` (auto-detected)
   - **Output Directory**: `dist` (auto-detected)

5. Add environment variables (optional):
   - `FLASK_BACKEND`: URL of your Flask hardware backend (if hosted separately)

6. Click "Deploy"

### Method 2: Deploy via Vercel CLI

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. Navigate to the triage-dashboard folder:
```bash
cd triage-dashboard
```

4. Deploy:
```bash
vercel
```

Follow the prompts:
- Set up and deploy? **Y**
- Which scope? Select your account
- Link to existing project? **N**
- What's your project's name? **triage-dashboard**
- In which directory is your code located? **.**
- Want to override the settings? **N**

5. For production deployment:
```bash
vercel --prod
```

### Post-Deployment

After deployment, Vercel will provide you with:
- **Preview URL**: For testing (e.g., `https://triage-dashboard-xxx.vercel.app`)
- **Production URL**: Your live app (e.g., `https://triage-dashboard.vercel.app`)

### Custom Domain (Optional)

1. Go to your project settings in Vercel Dashboard
2. Navigate to "Domains"
3. Add your custom domain
4. Follow DNS configuration instructions

### Environment Variables

If you need to connect to a hosted Flask backend:

1. Go to Project Settings → Environment Variables
2. Add: `FLASK_BACKEND` = `https://your-flask-backend-url.com`
3. Redeploy the project

### Notes

- The app runs in **demo mode** by default with simulated sensor data
- To connect real hardware, you'll need to host the Flask backend separately and configure the `FLASK_BACKEND` environment variable
- All API routes are handled by the serverless function at `/api`
- The frontend is served as static files from the `/dist` directory

### Troubleshooting

**Build fails:**
- Check that all dependencies are in `package.json`
- Ensure Node.js version is compatible (18.x or higher recommended)

**API routes not working:**
- Verify the `/api` folder exists with `index.js`
- Check Vercel function logs in the dashboard

**Environment variables not working:**
- Redeploy after adding environment variables
- Check variable names match exactly

### Continuous Deployment

Once connected to Git, Vercel automatically:
- Deploys every push to `main` branch to production
- Creates preview deployments for pull requests
- Provides deployment status in your Git commits
