const errorHandler = (err, req, res, next) => {
    // Log the full error for debugging purposes
    console.error(err.stack);

    // Set a default status code if none is set
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode);

    // --- THE FIX IS HERE ---
    // We manually pass the user object from the session to the error view.
    // This is necessary because the global res.locals middleware is skipped
    // when an error is passed to next().
    res.render('error', { 
        title: 'Server Error', 
        message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message,
        user: req.session.user || null // Pass user data to the error page
    });
};

module.exports = errorHandler;