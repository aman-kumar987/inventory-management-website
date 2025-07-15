require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const expressLayouts = require('express-ejs-layouts');
const rateLimit = require('express-rate-limit');
const pg = require('pg');
const connectPgSimple = require('connect-pg-simple')(session);
const csrf = require('csurf');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);

// --- 1. VIEW ENGINE & STATIC FILES ---
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));
app.set('layout', 'layout');
app.use(express.static(path.join(__dirname, 'src/public')));

// --- 2. BODY PARSERS ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 3. SECURITY & SESSION ---
app.use(helmet());

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

// --- 4. RATE LIMITING ---
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 200,
});
app.use(limiter);

// --- 5. CSRF PROTECTION (Apply globally except Excel import) ---
const csrfProtection = csrf({ cookie: false });

app.use((req, res, next) => {
  const isImportUpload =
    req.method === 'POST' && req.path === '/inventory/import';

  if (isImportUpload) return next(); // Skip CSRF for file upload

  csrfProtection(req, res, function (err) {
    if (err) return next(err);
    // Safely assign token only if middleware ran
    if (typeof req.csrfToken === 'function') {
      res.locals.csrfToken = req.csrfToken();
    }
    next();
  });
});

// --- 6. GLOBAL LOCALS MIDDLEWARE ---
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

// --- 7. ROUTE REGISTRATION ---
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

app.use('/', authRoutes);
app.use('/users', userRoutes);
app.use('/clusters', clusterRoutes);
app.use('/plants', plantRoutes);
app.use('/items', itemRoutes);
app.use('/item-groups', itemGroupRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/approvals', approvalRoutes);
app.use('/consumption', consumptionRoutes);
app.use('/recovery', recoveryRoutes);
app.use('/admin/logs', logRoutes);
app.use('/cluster/users', clusterUserRoutes);

// --- 8. CORE APP ROUTES ---
app.get('/', (req, res) => {
  res.redirect(req.session.user ? '/dashboard' : '/login');
});

app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('dashboard/index', { title: 'Dashboard' });
});

// --- 9. ERROR HANDLING (MUST BE LAST) ---
app.use(errorHandler);

// --- 10. START SERVER ---
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
