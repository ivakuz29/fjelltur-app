const express = require('express');
const path = require('path');
const session = require('express-session');

const authRoutes = require('./routes/authRoutes');
const pageRoutes = require('./routes/pageRoutes');
const tripRoutes = require('./routes/tripRoutes');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(session({
  secret: 'hemmelig-n\u00F8kkel-123',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 }
}));

app.use(pageRoutes);
app.use(authRoutes);
app.use(tripRoutes);

module.exports = app;
