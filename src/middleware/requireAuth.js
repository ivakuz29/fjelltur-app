function requireAuth(req, res, next) {
  if (!req.session.bruker) {
    res.redirect('/');
    return;
  }

  next();
}

module.exports = requireAuth;
