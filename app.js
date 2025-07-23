require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const expressLayouts = require('express-ejs-layouts');
const rateLimit = require('express-rate-limit');
const pg = require('pg');
const cookieParser = require('cookie-parser');
const connectPgSimple = require('connect-pg-simple')(session);
const csrf = require('csurf');
const errorHandler = require('./src/middleware/errorHandler');

// Add this line at the top to handle BigInt conversion to JSON
BigInt.prototype.toJSON = function() { return this.toString(); };

const app = express();
const PORT = process.env.PORT || 3000;

// Trust the proxy only when in a real production environment
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// --- VIEW ENGINE & STATIC FILES ---
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));
app.set('layout', 'layout');
app.use(express.static(path.join(__dirname, 'src/public')));

// --- BODY PARSERS ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- SECURITY & SESSION ---
app.use(helmet());
app.use(cookieParser());

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(
  session({
    store: new connectPgSimple({
      pool: pgPool,
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    },
  })
);

// --- RATE LIMITING ---
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
});
app.use(limiter);

// --- CSRF PROTECTION ---
// THE FIX: Using a separate cookie for the CSRF secret is more reliable
const csrfProtection = csrf({ cookie: true });
app.use(csrfProtection);

// --- GLOBAL LOCALS MIDDLEWARE ---
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.csrfToken = req.csrfToken(); // This now works correctly with the cookie method
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

// --- ROUTE REGISTRATION ---
const { isAuthenticated, isApproved } = require('./src/middleware/auth');
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const clusterRoutes = require('./src/routes/clusterRoutes');
const plantRoutes = require('./src/routes/plantRoutes');
const itemRoutes = require('./src/routes/itemRoutes');
const itemGroupRoutes = require('./src/routes/itemGroupRoutes');
const inventoryRoutes = require('./src/routes/inventoryRoutes');
const consumptionRoutes = require('./src/routes/consumptionRoutes');
const approvalRoutes = require('./src/routes/approvalRoutes');
const recoveryRoutes = require('./src/routes/recoveryRoutes');
const logRoutes = require('./src/routes/logRoutes');
const clusterUserRoutes = require('./src/routes/clusterUserRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');

// Public routes
app.use('/', authRoutes);

// Protected routes
app.use('/users', isAuthenticated, isApproved, userRoutes);
app.use('/clusters', isAuthenticated, isApproved, clusterRoutes);
app.use('/plants', isAuthenticated, isApproved, plantRoutes);
app.use('/items', isAuthenticated, isApproved, itemRoutes);
app.use('/item-groups', isAuthenticated, isApproved, itemGroupRoutes);
app.use('/inventory', isAuthenticated, isApproved, inventoryRoutes);
app.use('/approvals', isAuthenticated, isApproved, approvalRoutes);
app.use('/consumption', isAuthenticated, isApproved, consumptionRoutes);
app.use('/recovery', isAuthenticated, isApproved, recoveryRoutes);
app.use('/admin/logs', isAuthenticated, isApproved, logRoutes);
app.use('/cluster/users', isAuthenticated, isApproved, clusterUserRoutes);
app.use('/dashboard', isAuthenticated, isApproved, dashboardRoutes);


// --- CORE APP ROUTES, 404, AND ERROR HANDLING ---
app.get('/', (req, res) => {
  res.redirect(req.session.user ? '/dashboard' : '/login');
});

// 404 handler
app.use((req, res, next) => {
    res.status(404).render('404', { 
        title: 'Page Not Found' 
    });
});

app.use(errorHandler);

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});